'use strict';
const path = require('path');

// Load <project root>/.env regardless of the directory the process was started from.
// Variables already present in the real environment are never overridden.
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const { z } = require('zod');
const { resolveMongoUri } = require('./mongoUri');

const boolish = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  // Filled in by resolveMongoUri(): MONGODB_URI normally, MONGODB_TEST_URI when NODE_ENV=test.
  MONGODB_URI: z
    .string()
    .min(1, 'MONGODB_URI is required')
    .regex(/^mongodb(\+srv)?:\/\//, 'MONGODB_URI must start with mongodb:// or mongodb+srv://'),
  MONGO_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  MONGO_MAX_POOL_SIZE: z.coerce.number().int().positive().default(20),
  // Startup only: extra attempts when the first connection fails for a transient reason (DNS, network).
  MONGO_CONNECT_RETRIES: z.coerce.number().int().min(0).max(20).default(4),
  MONGO_CONNECT_RETRY_DELAY_MS: z.coerce.number().int().min(100).max(60000).default(3000),
  MONGO_AUTO_INDEX: boolish.optional(),

  CORS_ORIGINS: z.string().min(1, 'CORS_ORIGINS is required'),
  CLIENT_URL: z.string().url('CLIENT_URL must be a valid URL'),

  BODY_LIMIT: z.string().regex(/^\d+(kb|mb)$/i, 'BODY_LIMIT like 100kb or 1mb').default('100kb'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),

  // Business time zone: day boundaries in analytics / dashboard and Node's local time.
  BUSINESS_TIMEZONE: z.string().default('Asia/Karachi'),

  // Auth (HttpOnly cookie session)
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  // Lifetime of a session when the user ticks "Remember me" at sign-in.
  REMEMBER_ME_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().optional(),
  PASSWORD_RESET_MINUTES: z.coerce.number().int().min(5).max(180).default(30),

  // Admin push notifications. All three or none; config/firebase.js reads them from process.env.
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),

  // Media storage. All three or none; REQUIRED in production (uploads are a core feature).
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // JazzCash (hosted checkout). Sandbox by default; "live" must be chosen explicitly.
  JAZZCASH_ENV: z.enum(['sandbox', 'live']).default('sandbox'),
  JAZZCASH_MERCHANT_ID: z.string().optional(),
  JAZZCASH_PASSWORD: z.string().optional(),
  JAZZCASH_INTEGRITY_SALT: z.string().optional(),
  JAZZCASH_RETURN_URL: z.string().url().optional(),
  // Required when JAZZCASH_ENV=live (the production endpoint comes from your JazzCash onboarding pack).
  JAZZCASH_CHECKOUT_URL: z.string().url().optional(),

  // Outgoing e-mail (password reset, password-changed notice). SMTP_HOST + EMAIL_FROM together or none.
  // SMTP_USER / SMTP_PASS together or none (some relays allow unauthenticated local sending).
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: boolish.optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  // Where the storefront shows the "choose a new password" page; the token is appended as ?token=
  PASSWORD_RESET_URL: z.string().url().optional(),
  // Admin dashboard page that accepts ?token=... for back-office (admin/staff) accounts. Optional.
  ADMIN_PASSWORD_RESET_URL: z.string().url().optional(),

  // Optional KeyDB/Redis. Cache and queue are SEPARATE instances/databases (see README).
  CACHE_URL: z.string().optional(),
  QUEUE_URL: z.string().optional(),
});

function fail(lines) {
  // Logger depends on env, so write to stderr directly. Values are never printed.
  process.stderr.write(`Invalid environment configuration:\n${lines.join('\n')}\n`);
  process.exit(1);
}

/** A blank line such as `PORT=` or `MONGO_AUTO_INDEX=` means "not set": defaults must apply. */
function dropBlankValues(source) {
  const out = {};

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && value.trim() === '') continue;
    out[key] = value;
  }

  return out;
}

function loadEnv(source = process.env) {
  const cleaned = dropBlankValues(source);

  let mongoUri;

  try {
    mongoUri = resolveMongoUri(cleaned);
  } catch (error) {
    fail([`  - ${error.message}`]);
  }

  const parsed = schema.safeParse({ ...cleaned, MONGODB_URI: mongoUri });
  if (!parsed.success) fail(parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`));
  const e = parsed.data;

  const corsOrigins = e.CORS_ORIGINS.split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
  const isProd = e.NODE_ENV === 'production';

  if (corsOrigins.length === 0) fail(['  - CORS_ORIGINS must contain at least one origin']);
  if (corsOrigins.includes('*')) fail(['  - CORS_ORIGINS must not contain "*" (credentials are used)']);

  for (const origin of corsOrigins) {
    let parsedOrigin = null;

    try {
      parsedOrigin = new URL(origin);
    } catch {
      parsedOrigin = null;
    }

    // Browsers send the Origin header without a path, and cors.js compares it exactly.
    if (!parsedOrigin || parsedOrigin.origin !== origin) {
      fail([`  - CORS_ORIGINS entry "${origin}" must be a bare origin such as https://example.com (scheme, host, optional port; no path)`]);
    }
  }

  if (isProd && corsOrigins.some((o) => !o.startsWith('https://'))) {
    fail(['  - CORS_ORIGINS must be explicit https origins in production']);
  }

  if (isProd && /change-?me/i.test(e.JWT_SECRET)) {
    fail(['  - JWT_SECRET is still a placeholder value; generate a long random secret for production']);
  }

  const firebaseKeys = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
  const firebaseSet = firebaseKeys.filter((key) => e[key]);

  if (firebaseSet.length > 0 && firebaseSet.length < firebaseKeys.length) {
    fail([
      `  - Firebase is partially configured; set all of ${firebaseKeys.join(', ')} or none ` +
        '(missing: ' + firebaseKeys.filter((key) => !e[key]).join(', ') + ')',
    ]);
  }

  const cloudinaryKeys = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const cloudinarySet = cloudinaryKeys.filter((key) => e[key]);

  if (cloudinarySet.length > 0 && cloudinarySet.length < cloudinaryKeys.length) {
    fail([
      `  - Cloudinary is partially configured; set all of ${cloudinaryKeys.join(', ')} or none ` +
        '(missing: ' + cloudinaryKeys.filter((key) => !e[key]).join(', ') + ')',
    ]);
  }

  if (isProd && cloudinarySet.length === 0) {
    fail([`  - ${cloudinaryKeys.join(', ')} are required in production (media uploads)`]);
  }

  const jazzKeys = ['JAZZCASH_MERCHANT_ID', 'JAZZCASH_PASSWORD', 'JAZZCASH_INTEGRITY_SALT', 'JAZZCASH_RETURN_URL'];
  const jazzSet = jazzKeys.filter((key) => e[key]);

  if (jazzSet.length > 0 && jazzSet.length < jazzKeys.length) {
    fail([
      `  - JazzCash is partially configured; set all of ${jazzKeys.join(', ')} or none ` +
        '(missing: ' + jazzKeys.filter((key) => !e[key]).join(', ') + ')',
    ]);
  }

  if (e.JAZZCASH_ENV === 'live' && jazzSet.length === jazzKeys.length && !e.JAZZCASH_CHECKOUT_URL) {
    fail(['  - JAZZCASH_CHECKOUT_URL is required when JAZZCASH_ENV=live']);
  }

  const mailKeys = ['SMTP_HOST', 'EMAIL_FROM'];
  const mailSet = mailKeys.filter((key) => e[key]);

  if (mailSet.length > 0 && mailSet.length < mailKeys.length) {
    fail([`  - E-mail is partially configured; set both ${mailKeys.join(' and ')} or neither`]);
  }

  if (Boolean(e.SMTP_USER) !== Boolean(e.SMTP_PASS)) {
    fail(['  - SMTP_USER and SMTP_PASS must be set together or not at all']);
  }

  // Day boundaries (startOfDay / endOfDay) use Node's local time: pin it to the business zone.
  process.env.TZ = e.BUSINESS_TIMEZONE;

  return Object.freeze({
    timezone: e.BUSINESS_TIMEZONE,
    env: e.NODE_ENV,
    isProd,
    isTest: e.NODE_ENV === 'test',
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    trustProxy: e.TRUST_PROXY,
    mongo: {
      uri: e.MONGODB_URI,
      serverSelectionTimeoutMS: e.MONGO_SERVER_SELECTION_TIMEOUT_MS,
      maxPoolSize: e.MONGO_MAX_POOL_SIZE,
      connectRetries: e.MONGO_CONNECT_RETRIES,
      connectRetryDelayMs: e.MONGO_CONNECT_RETRY_DELAY_MS,
      autoIndex: e.MONGO_AUTO_INDEX === undefined ? !isProd : e.MONGO_AUTO_INDEX,
    },
    cors: { origins: Object.freeze(corsOrigins) },
    clientUrl: e.CLIENT_URL.replace(/\/$/, ''),
    limits: { body: e.BODY_LIMIT, rateWindowMs: e.RATE_LIMIT_WINDOW_MS, rateMax: e.RATE_LIMIT_MAX },
    shutdownTimeoutMs: e.SHUTDOWN_TIMEOUT_MS,
    cloudinary: {
      configured: cloudinarySet.length === 3,
      cloudName: e.CLOUDINARY_CLOUD_NAME,
      apiKey: e.CLOUDINARY_API_KEY,
      apiSecret: e.CLOUDINARY_API_SECRET,
    },
    jazzcash: {
      configured: jazzSet.length === jazzKeys.length,
      env: e.JAZZCASH_ENV,
      merchantId: e.JAZZCASH_MERCHANT_ID,
      password: e.JAZZCASH_PASSWORD,
      integritySalt: e.JAZZCASH_INTEGRITY_SALT,
      returnUrl: e.JAZZCASH_RETURN_URL,
      checkoutUrl: e.JAZZCASH_CHECKOUT_URL,
    },
    mail: {
      configured: mailSet.length === 2,
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE === undefined ? e.SMTP_PORT === 465 : e.SMTP_SECURE,
      user: e.SMTP_USER,
      pass: e.SMTP_PASS,
      from: e.EMAIL_FROM,
      adminPasswordResetUrl: e.ADMIN_PASSWORD_RESET_URL ? e.ADMIN_PASSWORD_RESET_URL.replace(/\/$/, '') : undefined,
      passwordResetUrl: (e.PASSWORD_RESET_URL || `${e.CLIENT_URL.replace(/\/$/, '')}/reset-password`).replace(/\/$/, ''),
    },
    redis: {
      cacheUrl: e.CACHE_URL,
      queueUrl: e.QUEUE_URL,
    },
    auth: {
      jwtSecret: e.JWT_SECRET,
      sessionDays: e.SESSION_DAYS,
      rememberDays: e.REMEMBER_ME_DAYS,
      cookieName: 'pl_session',
      cookieSameSite: e.COOKIE_SAMESITE,
      cookieDomain: e.COOKIE_DOMAIN || undefined,
      cookieSecure: isProd || e.COOKIE_SAMESITE === 'none',
      bcryptRounds: e.NODE_ENV === 'test' ? 4 : 12,
      resetMinutes: e.PASSWORD_RESET_MINUTES,
    },
  });
}

module.exports = { config: loadEnv(), loadEnv };
