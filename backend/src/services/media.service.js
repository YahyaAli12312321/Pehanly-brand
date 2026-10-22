'use strict';

/*
|--------------------------------------------------------------------------
| Media service (Cloudinary + MongoDB registry)
|--------------------------------------------------------------------------
|
| upload   validate -> Cloudinary -> Media row. If the Media row cannot be
|          written the Cloudinary asset is destroyed again (no orphan).
| remove   refused while the file is referenced anywhere (409 MEDIA_IN_USE);
|          customers can only remove their own uploads.
| cleanup  deletes unreferenced uploads older than N hours (uploaded but never
|          attached to a product / banner / request).
|
| Public IDs are server-generated UUIDs under pehanly/<env>/<folder>; the
| client file name never reaches Cloudinary.
|--------------------------------------------------------------------------
*/

const crypto = require('crypto');

const { config } = require('../config/env');
const logger = require('../config/logger');
const { getClient, isConfigured } = require('../config/cloudinary');
const Media = require('../models/Media');
const ApiError = require('../utils/ApiError');
const { sniffFileType } = require('../utils/fileSniff');
const { MEDIA_PURPOSES } = require('../constants/Media');
const { hasPermission } = require('../constants/Permissions');
const mediaReferences = require('./mediaReference.service');
const audit = require('./audit.service');

function assertConfigured() {
  if (!isConfigured()) {
    throw new ApiError(
      503,
      'Media storage is not configured',
      'MEDIA_STORAGE_NOT_CONFIGURED',
    );
  }
}

function isStaffMediaManager(user) {
  return (
    user?.role === 'admin' ||
    (user?.role === 'staff' && hasPermission(user.permissions, 'media.manage'))
  );
}

function assertCanUpload(user, purposeConfig) {
  if (!user) {
    throw ApiError.unauthorized();
  }

  if (purposeConfig.access === 'staff' && !isStaffMediaManager(user)) {
    throw ApiError.forbidden(
      'You do not have permission to upload this kind of file',
      'PERMISSION_DENIED',
    );
  }
}

function safeOriginalName(name) {
  return String(name || '')
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .slice(0, 120) || undefined;
}

function folderFor(purposeConfig) {
  return `pehanly/${config.env}/${purposeConfig.folder}`;
}

/* Delivery helpers: automatic format and quality for images. */
function optimizedUrl(url, resourceType) {
  if (resourceType !== 'image' || !url.includes('/upload/')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto/');
}

function thumbUrl(url, resourceType) {
  if (resourceType !== 'image' || !url.includes('/upload/')) return null;
  return url.replace('/upload/', '/upload/c_fill,w_400,h_400,f_auto,q_auto/');
}

function toView(media) {
  const m = typeof media.toObject === 'function' ? media.toObject() : media;

  return {
    id: String(m._id),
    publicId: m.publicId,
    url: m.url,
    optimizedUrl: optimizedUrl(m.url, m.resourceType),
    thumbUrl: thumbUrl(m.url, m.resourceType),
    resourceType: m.resourceType,
    format: m.format,
    bytes: m.bytes,
    width: m.width,
    height: m.height,
    purpose: m.purpose,
    originalName: m.originalName,
    createdAt: m.createdAt,
  };
}

function uploadBuffer(client, buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = client.uploader.upload_stream(options, (error, result) =>
      error ? reject(error) : resolve(result),
    );

    stream.end(buffer);
  });
}

async function destroyAsset(client, publicId, resourceType) {
  return client.uploader.destroy(publicId, {
    resource_type: resourceType,
    invalidate: true,
  });
}

/**
 * @param {object} args
 * @param {Buffer} args.buffer       file bytes (multer memory storage)
 * @param {string} args.originalName client file name (display only)
 * @param {string} args.purpose      key of MEDIA_PURPOSES
 * @param {object} args.user         req.user
 */
async function upload({ buffer, originalName, purpose, user, req }) {
  const purposeConfig = MEDIA_PURPOSES[purpose];

  if (!purposeConfig) {
    throw ApiError.badRequest('Unknown upload purpose', 'INVALID_UPLOAD_PURPOSE');
  }

  assertCanUpload(user, purposeConfig);

  if (!buffer || buffer.length === 0) {
    throw ApiError.badRequest('No file was uploaded', 'FILE_REQUIRED');
  }

  if (buffer.length > purposeConfig.maxBytes) {
    throw new ApiError(
      413,
      `File is too large (limit ${Math.round(purposeConfig.maxBytes / (1024 * 1024))} MB for this upload)`,
      'FILE_TOO_LARGE',
    );
  }

  const detected = sniffFileType(buffer);

  if (!detected || !purposeConfig.kinds.includes(detected.kind)) {
    throw new ApiError(
      415,
      'Unsupported file type. Allowed: JPEG, PNG, WebP' +
        (purposeConfig.kinds.includes('document') ? ', PDF' : ''),
      'UNSUPPORTED_FILE_TYPE',
    );
  }

  assertConfigured();

  const client = getClient();
  const folder = folderFor(purposeConfig);
  const resourceType = detected.kind === 'image' ? 'image' : 'raw';

  const options = {
    folder,
    public_id: crypto.randomUUID(),
    resource_type: resourceType,
    overwrite: false,
    unique_filename: false,
    use_filename: false,
    invalidate: true,
  };

  if (resourceType === 'image') {
    // Store a bounded, compressed master; originals can be huge camera files.
    options.transformation = [
      { width: 2400, height: 2400, crop: 'limit', quality: 'auto' },
    ];
  }

  let result;

  try {
    result = await uploadBuffer(client, buffer, options);
  } catch (error) {
    logger.error({ err: error?.message }, 'Cloudinary upload failed');
    throw new ApiError(502, 'Media upload failed, please try again', 'MEDIA_UPLOAD_FAILED');
  }

  try {
    const media = await Media.create({
      publicId: result.public_id,
      resourceType,
      url: result.secure_url,
      purpose,
      folder,
      format: result.format || detected.ext,
      mimeType: detected.mime,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      originalName: safeOriginalName(originalName),
      uploadedBy: user.id || user._id,
      uploadedByRole: user.role,
    });

    return toView(media);
  } catch (error) {
    // Do not leave an unregistered asset behind.
    try {
      await destroyAsset(client, result.public_id, resourceType);
    } catch (cleanupError) {
      logger.error(
        { err: cleanupError?.message, publicId: result.public_id },
        'Failed to remove Cloudinary asset after database error',
      );
    }

    throw error;
  }
}

async function remove({ id, user, req }) {
  assertConfigured();

  const media = await Media.findById(id);

  if (!media) {
    throw ApiError.notFound('File not found', 'MEDIA_NOT_FOUND');
  }

  const isOwner = String(media.uploadedBy) === String(user.id || user._id);

  if (!isOwner && !isStaffMediaManager(user)) {
    // Do not reveal that the file exists.
    throw ApiError.notFound('File not found', 'MEDIA_NOT_FOUND');
  }

  const reference = await mediaReferences.isReferenced(media.publicId);

  if (reference.referenced) {
    throw ApiError.conflict(
      'This file is still in use and cannot be deleted',
      'MEDIA_IN_USE',
    );
  }

  const client = getClient();

  try {
    await destroyAsset(client, media.publicId, media.resourceType);
  } catch (error) {
    logger.error({ err: error?.message, publicId: media.publicId }, 'Cloudinary delete failed');
    throw new ApiError(502, 'Could not delete the file, please try again', 'MEDIA_DELETE_FAILED');
  }

  await Media.deleteOne({ _id: media._id });

  if (user.role === 'admin' || user.role === 'staff') {
    await audit.record(user, 'media.deleted', 'Media', media._id, {
      purpose: media.purpose,
      publicId: media.publicId,
    }, req);
  }
}

async function listMine({ user, page, limit, purpose }) {
  const filter = { uploadedBy: user.id || user._id };
  if (purpose) filter.purpose = purpose;

  const [items, total] = await Promise.all([
    Media.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Media.countDocuments(filter),
  ]);

  return {
    items: items.map(toView),
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
}

async function listAll({ page, limit, purpose, uploadedBy }) {
  const filter = {};
  if (purpose) filter.purpose = purpose;
  if (uploadedBy) filter.uploadedBy = uploadedBy;

  const [items, total] = await Promise.all([
    Media.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Media.countDocuments(filter),
  ]);

  return {
    items: items.map(toView),
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/**
 * Deletes uploads that were never attached anywhere. Safe to run repeatedly
 * (cron / scheduled job). Returns counts for the audit trail.
 */
async function cleanupOrphans({ olderThanHours = 24, batchSize = 200 } = {}) {
  assertConfigured();

  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const candidates = await Media.find({ createdAt: { $lt: cutoff } })
    .sort({ createdAt: 1 })
    .limit(batchSize);

  const client = getClient();
  let deleted = 0;
  let skippedInUse = 0;
  let failed = 0;

  for (const media of candidates) {
    const reference = await mediaReferences.isReferenced(media.publicId);

    if (reference.referenced) {
      skippedInUse += 1;
      continue;
    }

    try {
      await destroyAsset(client, media.publicId, media.resourceType);
      await Media.deleteOne({ _id: media._id });
      deleted += 1;
    } catch (error) {
      failed += 1;
      logger.error({ err: error?.message, publicId: media.publicId }, 'Orphan cleanup failed for asset');
    }
  }

  return { scanned: candidates.length, deleted, skippedInUse, failed };
}

module.exports = {
  upload,
  remove,
  listMine,
  listAll,
  cleanupOrphans,
  toView,
  _optimizedUrl: optimizedUrl,
};
