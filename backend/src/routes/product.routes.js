'use strict';
const router = require('express').Router();
const c = require('../controllers/product.controller');
const v = require('../validators/product.validators');
const validate = require('../middleware/validate');

router.get('/', validate({ query: v.listQuery }), c.list);
router.get('/summary', c.summary);
router.post('/bulk', validate({ body: v.bulkBody }), c.bulk);
router.post('/', validate({ body: v.createProductBody }), c.create);
router.get('/:id', validate({ params: v.idParams }), c.get);
router.patch('/:id', validate({ params: v.idParams, body: v.updateProductBody }), c.update);
router.patch('/:id/status', validate({ params: v.idParams, body: v.statusBody }), c.setStatus);
router.post('/:id/variants', validate({ params: v.idParams, body: v.createVariantBody }), c.createVariant);
router.patch('/:id/variants/:variantId', validate({ params: v.variantParams, body: v.updateVariantBody }), c.updateVariant);

module.exports = router;
