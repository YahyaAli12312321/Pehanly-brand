'use strict';

const multer = require('multer');

const ApiError = require('../utils/ApiError');
const { MAX_UPLOAD_BYTES } = require('../constants/Media');

/*
 * Single-file memory upload. Hard multipart limits protect the server before
 * any purpose-specific rule runs (one file, no extra file fields, bounded
 * field count).
 */
const parser = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
    fields: 5,
    parts: 8,
  },
}).single('file');

function uploadSingleFile(req, res, next) {
  parser(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new ApiError(413, 'File is too large', 'FILE_TOO_LARGE'));
      }

      return next(ApiError.badRequest('Invalid upload request', 'INVALID_UPLOAD'));
    }

    return next(error);
  });
}

uploadSingleFile.__multipart = true; // introspection only

module.exports = { uploadSingleFile };
