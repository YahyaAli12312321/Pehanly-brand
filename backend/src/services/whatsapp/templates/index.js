'use strict';

const { WHATSAPP_EVENTS } = require('../../../constants/WhatsApp');

const registry = Object.assign(
  {},
  require('./order.templates'),
  require('./shipment.templates'),
  require('./inventory.templates'),
  require('./wholesale.templates'),
  require('./manufacturing.templates'),
  require('./printing.templates'),
  require('./quote.templates'),
  require('./summary.templates'),
);

/** Renders the message text for an event. Throws if an event has no template (caught by the unit test below). */
function render(event, variables = {}) {
  const fn = registry[event];
  if (!fn) throw new Error(`No WhatsApp template for event "${event}"`);
  return fn(variables);
}

const missingTemplates = () => Object.values(WHATSAPP_EVENTS).filter((e) => !registry[e]);

module.exports = { render, registry, missingTemplates };
