'use strict';

/** Forwards rejected promises from async route handlers to the error middleware. */
module.exports = (fn) => {
  const wrapped = (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  // Lets tooling (scripts/generate-postman.js) inspect the real handler. No runtime effect.
  wrapped.__handler = fn;
  return wrapped;
};
