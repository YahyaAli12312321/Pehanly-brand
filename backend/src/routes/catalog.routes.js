'use strict';

const router = require('express').Router();

const controller = require('../controllers/catalog.controller');
const validators = require('../validators/catalog.validators');
const validate = require('../middleware/validate');

/* Public, read-only storefront catalog: /api/v1/catalog/... */

router.get('/categories', validate({ query: validators.categoriesQuery }), controller.categories);

router.get('/products', validate({ query: validators.productsQuery }), controller.products);

router.get('/products/:slug', validate({ params: validators.slugParams }), controller.product);

module.exports = router;
