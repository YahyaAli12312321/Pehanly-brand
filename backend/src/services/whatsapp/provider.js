'use strict';

const { config } = require('../../config/env');
const mock = require('./providers/mock.provider');
const meta = require('./providers/meta.provider');

/** The active provider, chosen by WHATSAPP_PROVIDER. Business code never imports a provider directly. */
function getProvider() {
  switch (config.whatsapp.provider) {
    case 'meta': return meta;
    case 'off': return null;
    default: return mock;
  }
}

module.exports = { getProvider };
