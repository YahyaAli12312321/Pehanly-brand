'use strict';

const bcrypt = require('bcryptjs');

const { config } = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');
const { ROLES, PERMISSIONS, ROLE_TEMPLATES } = require('../constants/Permissions');
const { normalizeEmail, normalizePhone } = require('../utils/identity');

const PUBLIC_FIELDS =
  'name email phone role permissions isActive lastLoginAt createdAt updatedAt';

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findStaffOrThrow(id) {
  const user = await User.findOne({ _id: id, role: ROLES.STAFF });

  if (!user) {
    throw ApiError.notFound('Staff member not found', 'STAFF_NOT_FOUND');
  }

  return user;
}

function catalog() {
  return {
    permissions: PERMISSIONS,
    templates: ROLE_TEMPLATES,
  };
}

async function list({ search, status, page, limit }) {
  const filter = { role: { $in: [ROLES.ADMIN, ROLES.STAFF] } };

  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;

  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .select(PUBLIC_FIELDS)
      .sort({ role: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return {
    items,
    meta: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

async function create(input, actor, req) {
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);

  if (!phone) {
    throw ApiError.validation([
      { field: 'phone', message: 'Enter a valid phone number' },
    ]);
  }

  const clash = await User.findOne({ $or: [{ email }, { phone }] }).select('email');

  if (clash) {
    throw ApiError.conflict('An account with this email or phone already exists', 'ACCOUNT_EXISTS');
  }

  const passwordHash = await bcrypt.hash(input.password, config.auth.bcryptRounds);

  let user;

  try {
    user = await User.create({
      name: input.name,
      email,
      phone,
      passwordHash,
      role: ROLES.STAFF,
      permissions: input.permissions || [],
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw ApiError.conflict('An account with this email or phone already exists', 'ACCOUNT_EXISTS');
    }
    throw error;
  }

  await audit.record(actor, 'staff.created', 'User', user._id, {
    permissions: user.permissions,
  }, req);

  return User.findById(user._id).select(PUBLIC_FIELDS).lean();
}

async function update(id, input, actor, req) {
  const user = await findStaffOrThrow(id);
  const permissionsChanged =
    input.permissions !== undefined &&
    [...input.permissions].sort().join() !== [...user.permissions].sort().join();

  if (input.name !== undefined) user.name = input.name;
  if (input.permissions !== undefined) user.permissions = input.permissions;

  await user.save();

  await audit.record(actor, 'staff.updated', 'User', user._id, {
    permissionsChanged,
    permissions: user.permissions,
  }, req);

  return User.findById(user._id).select(PUBLIC_FIELDS).lean();
}

async function setStatus(id, isActive, actor, req) {
  const user = await User.findOne({ _id: id, role: ROLES.STAFF }).select('+tokenVersion');

  if (!user) {
    throw ApiError.notFound('Staff member not found', 'STAFF_NOT_FOUND');
  }

  if (user.isActive !== isActive) {
    user.isActive = isActive;
    // Deactivation must end live sessions immediately.
    if (!isActive) user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    await audit.record(
      actor,
      isActive ? 'staff.reactivated' : 'staff.deactivated',
      'User',
      user._id,
      {},
      req,
    );
  }

  return User.findById(user._id).select(PUBLIC_FIELDS).lean();
}

async function resetPassword(id, password, actor, req) {
  const user = await User.findOne({ _id: id, role: ROLES.STAFF }).select('+tokenVersion');

  if (!user) {
    throw ApiError.notFound('Staff member not found', 'STAFF_NOT_FOUND');
  }

  user.passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();

  await audit.record(actor, 'staff.password_reset', 'User', user._id, {}, req);
}

module.exports = {
  catalog,
  list,
  create,
  update,
  setStatus,
  resetPassword,
};
