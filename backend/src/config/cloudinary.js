'use strict';

/*
|--------------------------------------------------------------------------
| Cloudinary client
|--------------------------------------------------------------------------
|
| Credentials come ONLY from environment variables
| (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET).
| The API secret is never logged, stored in MongoDB or sent to a client.
|--------------------------------------------------------------------------
*/

const { v2: cloudinary } = require('cloudinary');

const { config } = require('./env');

let configured = false;

function isConfigured() {
  return config.cloudinary.configured;
}

function getClient() {
  if (!isConfigured()) {
    return null;
  }

  if (!configured) {
    cloudinary.config({
      cloud_name: config.cloudinary.cloudName,
      api_key: config.cloudinary.apiKey,
      api_secret: config.cloudinary.apiSecret,
      secure: true,
    });

    configured = true;
  }

  return cloudinary;
}

module.exports = {
  isConfigured,
  getClient,
};
