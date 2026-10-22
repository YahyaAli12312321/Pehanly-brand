'use strict';

const { z } = require('zod');

const { config } = require('../config/env');

const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

function isHttpUrl(value) {
  try {
    const url = new URL(value);

    return HTTP_PROTOCOLS.has(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/*
 * App-relative path ("/shop/new") or absolute http(s) URL.
 * Rejects javascript:, data:, protocol-relative ("//host") and backslash tricks.
 */
function isSafeLink(value) {
  if (typeof value !== 'string') return false;

  if (value.startsWith('/')) {
    return /^\/(?!\/)[^\s\\]*$/.test(value);
  }

  return isHttpUrl(value);
}

/** http(s) URL only (zod's .url() also accepts javascript:, data:, ftp:, ...). */
const httpUrl = (max = 500) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(isHttpUrl, 'Must be a valid http(s) URL');

/*
 * Media URL. When Cloudinary is configured the URL must point at THIS
 * account's delivery host (https://res.cloudinary.com/<cloudName>/...), so a
 * client cannot attach arbitrary external images to catalog / request data.
 * Without Cloudinary (local development) any http(s) URL is accepted.
 */
function isTrustedMediaUrl(value, cloudinary = config.cloudinary) {
  if (!isHttpUrl(value)) return false;
  if (!cloudinary.configured) return true;

  const url = new URL(value);

  return (
    url.protocol === 'https:' &&
    url.hostname === 'res.cloudinary.com' &&
    url.pathname.startsWith(`/${cloudinary.cloudName}/`)
  );
}

const mediaUrl = (max = 500) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => isTrustedMediaUrl(value), 'Must be a file uploaded through the media endpoint');

/** Link target for buttons and banners. */
const safeLink = (max = 500) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(isSafeLink, 'Must be an http(s) URL or an app path starting with "/"');

module.exports = {
  httpUrl,
  mediaUrl,
  safeLink,
  isTrustedMediaUrl,
  isHttpUrl,
  isSafeLink,
};
