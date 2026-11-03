'use strict';

class ApiError extends Error {
  /**
   * @param {number} statusCode HTTP status
   * @param {string} message safe, client-facing message
   * @param {string} code stable machine-readable code
   * @param {Array<{field?:string,message:string}>} [errors] safe field errors
   */
  constructor(statusCode, message, code = 'ERROR', errors) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
  static badRequest(message = 'Bad request', code = 'BAD_REQUEST', errors) { return new ApiError(400, message, code, errors); }
  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') { return new ApiError(401, message, code); }
  static forbidden(message = 'You do not have permission to perform this action', code = 'FORBIDDEN') { return new ApiError(403, message, code); }
  static notFound(message = 'Resource not found', code = 'NOT_FOUND') { return new ApiError(404, message, code); }
  static conflict(message = 'Conflict', code = 'CONFLICT') { return new ApiError(409, message, code); }
  static validation(errors, message = 'Validation failed') { return new ApiError(422, message, 'VALIDATION_ERROR', errors); }
}

module.exports = ApiError;
