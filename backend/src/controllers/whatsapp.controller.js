'use strict';

const response = require('../utils/apiResponse');
const whatsapp = require('../services/whatsapp/whatsapp.service');
const { WHATSAPP_EVENTS, WHATSAPP_STATUSES } = require('../constants/WhatsApp');

exports.list = async (req, res) => response.success(res, { data: await whatsapp.list(req.validated.query) });

/** Provider mode + the event / status catalogue for the dashboard filters. Never includes credentials. */
exports.config = async (_req, res) =>
  response.success(res, { data: { ...whatsapp.publicConfig(), events: Object.values(WHATSAPP_EVENTS), statuses: Object.values(WHATSAPP_STATUSES) } });

exports.getOne = async (req, res) => response.success(res, { data: await whatsapp.get(req.validated.params.id) });

exports.retry = async (req, res) => {
  const message = await whatsapp.retryMessage(req.validated.params.id);
  return response.success(res, { message: message?.status === 'sent' ? 'Notification re-sent' : 'Retry attempted', data: whatsapp.view(message) });
};

exports.test = async (req, res) => {
  const message = await whatsapp.sendTest({ ...req.validated.body, actor: req.user });
  return response.success(res, { message: 'Test notification processed', data: whatsapp.view(message) });
};
