'use strict';

const auditLogService = require('../services/auditLog.service');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await auditLogService.list(req.validated.query);

  return success(res, { data: items, meta });
});
