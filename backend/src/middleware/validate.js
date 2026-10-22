'use strict';
const ApiError = require('../utils/ApiError');

const PARTS = ['params', 'query', 'body'];

/**
 * Runs when a route is DEFINED (app boot), not per request. A route that passes an
 * undefined schema (typically a validator import/export name mismatch) fails fast
 * with a clear message instead of silently skipping validation.
 */
function assertSchemas(schemas) {
  if (!schemas || typeof schemas !== 'object' || Array.isArray(schemas)) {
    throw new TypeError('validate() requires an object like { params, query, body }');
  }

  const keys = Object.keys(schemas);

  if (keys.length === 0) {
    throw new TypeError('validate() needs at least one of: params, query, body');
  }

  for (const key of keys) {
    if (!PARTS.includes(key)) {
      throw new TypeError(`validate(): unknown key "${key}" (allowed: ${PARTS.join(', ')})`);
    }

    const schema = schemas[key];

    if (!schema || typeof schema.safeParse !== 'function') {
      throw new TypeError(
        `validate(): the "${key}" schema is undefined or not a zod schema. ` +
          'Check the validator import/export name used by this route.',
      );
    }
  }
}

/**
 * validate({ body, query, params }) with zod schemas.
 * Parsed (typed, stripped) values land on req.validated; controllers use those, never raw req.*.
 *
 * Exported as the module itself AND as `.validate`, so both import styles work:
 *   const validate = require('../middleware/validate');
 *   const { validate } = require('../middleware/validate');
 */
function validate(schemas) {
  assertSchemas(schemas);

  const middleware = (req, _res, next) => {
    const out = {};
    const errors = [];

    for (const part of PARTS) {
      if (!schemas[part]) continue;

      const result = schemas[part].safeParse(req[part] ?? {});

      if (result.success) out[part] = result.data;
      else {
        errors.push(
          ...result.error.issues.map((i) => ({
            field: [part === 'body' ? '' : part, ...i.path].filter(Boolean).join('.'),
            message: i.message,
          })),
        );
      }
    }

    if (errors.length) return next(ApiError.validation(errors));

    req.validated = out;
    return next();
  };

  // Introspection only (scripts/generate-postman.js); no runtime effect.
  middleware.__schemas = schemas;

  return middleware;
}

module.exports = validate;
module.exports.validate = validate;
