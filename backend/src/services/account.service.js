'use strict';

/*
 * Customer self-service: profile, password, sessions, addresses, avatar.
 * Works for any signed-in user (customers mostly; staff/admin may edit their own profile too).
 * The authenticated user id always comes from the session, never from the request body.
 */

const bcrypt = require('bcryptjs');

const { config } = require('../config/env');
const User = require('../models/User');
const Media = require('../models/Media');
const ApiError = require('../utils/ApiError');
const { normalizePhone } = require('../utils/identity');
const emailService = require('./email.service');

const MAX_ADDRESSES = 10;

async function loadUser(userId, select = '') {
  const user = await User.findById(userId).select(select);

  if (!user || !user.isActive) throw ApiError.unauthorized('Session expired', 'SESSION_EXPIRED');

  return user;
}

/* ------------------------------------------------------------------ profile */

async function getProfile(userId) {
  return (await loadUser(userId)).toJSON();
}

async function updateProfile(userId, { name, phone }) {
  const user = await loadUser(userId);

  if (name !== undefined) user.name = name;

  if (phone !== undefined) {
    const normalized = normalizePhone(phone);

    if (!normalized) throw ApiError.validation([{ field: 'phone', message: 'Enter a valid phone number' }]);

    if (normalized !== user.phone) {
      const clash = await User.exists({ phone: normalized, _id: { $ne: user._id } });

      if (clash) throw ApiError.conflict('An account with this phone number already exists', 'ACCOUNT_EXISTS');

      user.phone = normalized;
    }
  }

  await user.save();

  return user.toJSON();
}

/* ----------------------------------------------------------------- password */

/**
 * Verifies the current password, stores the new one and bumps tokenVersion so every OTHER
 * session stops working. Returns the user so the controller can issue a fresh cookie for this one.
 */
async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await loadUser(userId, '+passwordHash +tokenVersion');

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);

  if (!ok) throw ApiError.badRequest('Current password is incorrect', 'INVALID_CURRENT_PASSWORD');

  user.passwordHash = await bcrypt.hash(newPassword, config.auth.bcryptRounds);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  await user.save();
  await emailService.sendPasswordChanged({ to: user.email, name: user.name });

  return user;
}

/** Signs out every device (including old cookies) and returns the user for a fresh cookie. */
async function logoutOtherSessions(userId) {
  const user = await loadUser(userId, '+tokenVersion');

  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();

  return user;
}

/* ---------------------------------------------------------------- addresses */

function plainAddresses(user) {
  return user.addresses.map((address) => address.toObject());
}

/** Exactly one default when any address exists; none when the list is empty. */
function normalizeDefaults(user, preferredId) {
  if (!user.addresses.length) return;

  const preferred = preferredId
    ? user.addresses.find((address) => String(address._id) === String(preferredId))
    : null;

  const chosen = preferred || user.addresses.find((address) => address.isDefault) || user.addresses[0];

  user.addresses.forEach((address) => {
    address.isDefault = address === chosen;
  });
}

function cleanAddressInput(input) {
  const out = { ...input };

  if (out.phone !== undefined) {
    const normalized = normalizePhone(out.phone);

    if (!normalized) throw ApiError.validation([{ field: 'phone', message: 'Enter a valid phone number' }]);

    out.phone = normalized;
  }

  return out;
}

async function listAddresses(userId) {
  return plainAddresses(await loadUser(userId));
}

async function addAddress(userId, input) {
  const user = await loadUser(userId);

  if (user.addresses.length >= MAX_ADDRESSES) {
    throw ApiError.conflict(`You can save up to ${MAX_ADDRESSES} addresses`, 'ADDRESS_LIMIT_REACHED');
  }

  const data = cleanAddressInput(input);

  user.addresses.push({ ...data, isDefault: Boolean(data.isDefault) });

  const added = user.addresses[user.addresses.length - 1];

  normalizeDefaults(user, data.isDefault || user.addresses.length === 1 ? added._id : null);
  await user.save();

  return plainAddresses(user);
}

async function updateAddress(userId, addressId, input) {
  const user = await loadUser(userId);
  const address = user.addresses.id(addressId);

  if (!address) throw ApiError.notFound('Address not found', 'ADDRESS_NOT_FOUND');

  const data = cleanAddressInput(input);
  const makeDefault = data.isDefault === true;

  Object.entries(data).forEach(([key, value]) => {
    if (key !== 'isDefault') address.set(key, value);
  });

  if (data.isDefault === false && address.isDefault) {
    // Cannot leave the account without a default; keep this one.
    address.isDefault = true;
  }

  normalizeDefaults(user, makeDefault ? address._id : null);
  await user.save();

  return plainAddresses(user);
}

async function deleteAddress(userId, addressId) {
  const user = await loadUser(userId);
  const address = user.addresses.id(addressId);

  if (!address) throw ApiError.notFound('Address not found', 'ADDRESS_NOT_FOUND');

  address.deleteOne();
  normalizeDefaults(user);
  await user.save();

  return plainAddresses(user);
}

/* ------------------------------------------------------------------- avatar */

async function setAvatar(userId, mediaId) {
  const user = await loadUser(userId);

  const media = await Media.findOne({ _id: mediaId, uploadedBy: user._id, purpose: 'avatar' }).lean();

  if (!media) {
    throw ApiError.notFound('Avatar upload not found. Upload the image with purpose "avatar" first.', 'MEDIA_NOT_FOUND');
  }

  user.avatar = { url: media.url, publicId: media.publicId, alt: user.name };
  await user.save();

  return user.toJSON();
}

async function removeAvatar(userId) {
  const user = await loadUser(userId);

  user.avatar = undefined;
  await user.save();

  return user.toJSON();
}

module.exports = {
  MAX_ADDRESSES,
  getProfile,
  updateProfile,
  changePassword,
  logoutOtherSessions,
  listAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setAvatar,
  removeAvatar,
  normalizeDefaults,
};
