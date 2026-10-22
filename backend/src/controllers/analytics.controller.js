'use strict';

const analyticsService =
  require('../services/analytics.service');

const response =
  require('../utils/apiResponse');

/*
|--------------------------------------------------------------------------
| Analytics Dashboard
|--------------------------------------------------------------------------
*/

async function getAnalyticsDashboard(
  req,
  res,
) {
  const data =
    await analyticsService.getAnalyticsDashboard(
      req.validated.query,
    );

  return response.success(
    res,
    {
      data,
    },
  );
}

module.exports = {
  getAnalyticsDashboard,
};