'use strict';
const router = require('express').Router();
const c = require('../controllers/category.controller');
const v = require('../validators/category.validators');
const validate = require('../middleware/validate');

router.get('/', validate({ query: v.listQuery }), c.list);
router.get('/summary', c.summary);
router.get('/audiences', c.audiences);
router.post('/', validate({ body: v.createBody }), c.create);
router.get('/:id', validate({ params: v.idParams }), c.get);
router.patch('/:id', validate({ params: v.idParams, body: v.updateBody }), c.update);
router.patch('/:id/status', validate({ params: v.idParams, body: v.statusBody }), c.setStatus);

module.exports = router;
