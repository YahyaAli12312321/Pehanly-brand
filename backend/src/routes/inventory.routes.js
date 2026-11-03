'use strict';
const router = require('express').Router();
const c = require('../controllers/inventory.controller');
const v = require('../validators/inventory.validators');
const validate = require('../middleware/validate');

router.get('/', validate({ query: v.listQuery }), c.list);
router.get('/summary', c.summary);
router.get('/:sku/history', validate({ params: v.skuParams, query: v.historyQuery }), c.history);
router.post('/:sku/adjust', validate({ params: v.skuParams, body: v.adjustBody }), c.adjust);

module.exports = router;
