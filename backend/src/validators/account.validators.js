'use strict';

const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const password = z.string().min(8, 'Use at least 8 characters').max(72, 'Use at most 72 characters');

const atLeastOne = (body) => Object.keys(body).length > 0;

exports.updateProfileBody = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().min(7).max(20).optional(),
  })
  .strict()
  .refine(atLeastOne, 'At least one field is required');

exports.changePasswordBody = z
  .object({
    currentPassword: z.string().min(1).max(72),
    newPassword: password,
  })
  .strict()
  .refine((body) => body.currentPassword !== body.newPassword, {
    message: 'The new password must be different from the current one',
    path: ['newPassword'],
  });

const addressFields = {
  label: z.string().trim().min(1).max(40),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(20),
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().max(200),
  city: z.string().trim().min(2).max(80),
  province: z.string().trim().max(80),
  postalCode: z.string().trim().max(20),
  country: z.string().trim().min(2).max(80),
  isDefault: z.boolean(),
};

exports.addressBody = z
  .object({
    label: addressFields.label.optional(),
    fullName: addressFields.fullName,
    phone: addressFields.phone,
    addressLine1: addressFields.addressLine1,
    addressLine2: addressFields.addressLine2.optional(),
    city: addressFields.city,
    province: addressFields.province.optional(),
    postalCode: addressFields.postalCode.optional(),
    country: addressFields.country.optional(),
    isDefault: addressFields.isDefault.optional(),
  })
  .strict();

exports.updateAddressBody = z
  .object({
    label: addressFields.label.optional(),
    fullName: addressFields.fullName.optional(),
    phone: addressFields.phone.optional(),
    addressLine1: addressFields.addressLine1.optional(),
    addressLine2: addressFields.addressLine2.optional(),
    city: addressFields.city.optional(),
    province: addressFields.province.optional(),
    postalCode: addressFields.postalCode.optional(),
    country: addressFields.country.optional(),
    isDefault: addressFields.isDefault.optional(),
  })
  .strict()
  .refine(atLeastOne, 'At least one field is required');

exports.addressIdParams = z.object({ addressId: objectId }).strict();

/* The avatar must be a file this user uploaded through POST /media with purpose "avatar". */
exports.avatarBody = z.object({ mediaId: objectId }).strict();
