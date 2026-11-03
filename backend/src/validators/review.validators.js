'use strict';

const { z } = require('zod');

const {
  REVIEW_STATUSES,
} = require('../constants/Review');

const objectId = z
  .string()
  .trim()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    'Invalid MongoDB ObjectId',
  );

/*
|--------------------------------------------------------------------------
| Params
|--------------------------------------------------------------------------
*/

const productIdParams =
  z.object({
    productId: objectId,
  }).strict();

const reviewIdParams =
  z.object({
    id: objectId,
  }).strict();

/*
|--------------------------------------------------------------------------
| Customer - Create Review
|--------------------------------------------------------------------------
*/

const createReviewBody =
  z.object({
    rating: z.coerce
      .number()
      .int()
      .min(1)
      .max(5),

    title: z
      .string()
      .trim()
      .min(
        2,
        'Review title is required',
      )
      .max(160),

    comment: z
      .string()
      .trim()
      .min(
        3,
        'Review comment is required',
      )
      .max(3000),
  }).strict();

/*
|--------------------------------------------------------------------------
| Public Product Reviews
|--------------------------------------------------------------------------
*/

const publicReviewsQuery =
  z.object({
    page: z.coerce
      .number()
      .int()
      .min(1)
      .default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10),

    rating: z.coerce
      .number()
      .int()
      .min(1)
      .max(5)
      .optional(),

    sort: z
      .enum([
        'newest',
        'oldest',
        'highest',
        'lowest',
      ])
      .default('newest'),
  }).strict();

/*
|--------------------------------------------------------------------------
| My Reviews
|--------------------------------------------------------------------------
*/

const myReviewsQuery =
  z.object({
    status: z
      .enum(
        Object.values(
          REVIEW_STATUSES,
        ),
      )
      .optional(),

    page: z.coerce
      .number()
      .int()
      .min(1)
      .default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10),
  }).strict();

/*
|--------------------------------------------------------------------------
| Admin Listing
|--------------------------------------------------------------------------
*/

const adminReviewsQuery =
  z.object({
    search: z
      .string()
      .trim()
      .max(160)
      .optional(),

    status: z
      .enum(
        Object.values(
          REVIEW_STATUSES,
        ),
      )
      .optional(),

    rating: z.coerce
      .number()
      .int()
      .min(1)
      .max(5)
      .optional(),

    productId:
      objectId.optional(),

    page: z.coerce
      .number()
      .int()
      .min(1)
      .default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20),
  }).strict();

/*
|--------------------------------------------------------------------------
| Reject
|--------------------------------------------------------------------------
*/

const rejectReviewBody =
  z.object({
    reason: z
      .string()
      .trim()
      .max(1000)
      .optional(),
  }).strict();

/*
|--------------------------------------------------------------------------
| Official Brand Reply
|--------------------------------------------------------------------------
*/

const replyReviewBody =
  z.object({
    message: z
      .string()
      .trim()
      .min(
        1,
        'Official brand reply is required',
      )
      .max(3000),
  }).strict();

module.exports = {
  productIdParams,
  reviewIdParams,

  createReviewBody,

  publicReviewsQuery,
  myReviewsQuery,
  adminReviewsQuery,

  rejectReviewBody,
  replyReviewBody,
};