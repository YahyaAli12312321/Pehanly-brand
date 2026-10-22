'use strict';

const mongoose = require('mongoose');

const Wholesale = require('../models/Wholesale');
const Sku = require('../models/Sku');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');

const ApiError = require('../utils/ApiError');

const {
  WHOLESALE_REQUEST_STATUSES,
  WHOLESALE_REQUEST_TYPES,
} = require('../constants/Wholesale');

const {
  nextWholesaleRequestNumber,
} = require('./wholesaleNumber.service');

const adminNotificationEvents = require('./adminNotificationEvents.service');
const settingsService = require('./settings.service');
  /*
  |--------------------------------------------------------------------------
  | Helpers
  |--------------------------------------------------------------------------
  */

  function calculateRequestedVolume(items) {
    return items.reduce(
      (total, item) => total + item.quantity,
      0,
    );
  }

  const round2 = (n) => Math.round(n * 100) / 100;

  /** Highest configured volume tier reached by the combined product quantity (or null). */
  function pickTier(product, quantity) {
    const tiers = (product?.wholesale?.tiers || [])
      .filter((t) => quantity >= t.minQuantity)
      .sort((a, b) => b.minQuantity - a.minQuantity);
    const top = tiers[0];
    if (top && top.quoteOnly) {
      const priced = tiers.find((t) => !t.quoteOnly);
      return { ...(priced || {}), quote: true };
    }
    return top || null;
  }

  /**
   * Unit price for the reached tier. A quote-only tier prices at the best priced tier below it
   * (the quote itself is negotiated), so the estimate never invents a number.
   */
  function tierUnitPrice(tier, skuPrice) {
    if (!tier) return skuPrice;
    if (tier.unitPrice) return round2(tier.unitPrice);
    if (tier.discountPercent) return round2(skuPrice * (1 - tier.discountPercent / 100));
    return skuPrice;
  }

  /**
   * subtotal + merchant-configured freight/tax. A charge that is not configured is reported as
   * null (pending quote) and is never guessed or defaulted to a number.
   */
  async function priceWithCharges(items, session = null) {
    const base = calculatePricing(items);
    const settings = await settingsService.getSettings(session);
    const freightRaw = settings?.wholesale?.freightFlat;
    const taxRaw = settings?.wholesale?.taxPercent;
    const freight = Number.isFinite(freightRaw) ? round2(freightRaw) : null;
    const tax = Number.isFinite(taxRaw) ? round2((base.subtotal * taxRaw) / 100) : null;
    return {
      subtotal: base.subtotal,
      ...(freight !== null ? { freight } : {}),
      ...(tax !== null ? { tax } : {}),
      estimatedTotal: round2(base.subtotal + (freight || 0) + (tax || 0)),
      pending: [freight === null ? 'freight' : null, taxRaw === undefined || taxRaw === null ? 'tax' : null].filter(Boolean),
      taxPercent: Number.isFinite(taxRaw) ? taxRaw : null,
    };
  }


  /** Spread a fixed pack price across the validated lines (last line absorbs rounding). */
  function repriceToPack(items, packPrice) {
    const calc = items.reduce((n, i) => n + i.lineTotal, 0);
    if (!packPrice || !calc) return items;
    const factor = packPrice / calc;
    let running = 0;
    return items.map((item, idx) => {
      const unit = round2(item.wholesalePrice * factor);
      const lineTotal = idx === items.length - 1 ? round2(packPrice - running) : round2(unit * item.quantity);
      running += lineTotal;
      return { ...item, wholesalePrice: unit, lineTotal };
    });
  }

  /** Per product: do the SKU rows add up to the ordered quantity the customer declared? */
  function checkAllocation(items, ordered) {
    if (!ordered?.length) return { checked: false, mismatches: [] };
    const allocated = new Map();
    for (const i of items) allocated.set(String(i.product), (allocated.get(String(i.product)) || 0) + i.quantity);
    const mismatches = [];
    for (const o of ordered) {
      const have = allocated.get(String(o.product)) || 0;
      if (have !== o.ordered) mismatches.push({ product: String(o.product), ordered: o.ordered, allocated: have, remaining: o.ordered - have });
    }
    for (const [product, have] of allocated) {
      if (!ordered.some((o) => String(o.product) === product)) mismatches.push({ product, ordered: 0, allocated: have, remaining: -have });
    }
    return { checked: true, mismatches };
  }

  /** Wholesale prices are for signed-in buyers; guests still see contents, pieces, assortment and size curve. */
  function redactPackPricing(pack) {
    const { packPrice, compareAtValue, ...rest } = pack;
    const { calculatedPrice, packPrice: pp, perPiece, ...computed } = rest.computed || {};
    return { ...rest, computed: { ...computed, pricingHidden: true } };
  }

  /** Live, backend-computed view of a pack: availability, totals, assortment, size curve, prices. */
  async function presentPack(pack) {
    const base = { ...pack, totalPieces: (pack.items || []).reduce((n, i) => n + i.quantity, 0) };
    try {
      let items = await buildValidatedItems((pack.items || []).map((i) => ({ sku: i.sku, quantity: i.quantity })), null, { enforceMoq: false });
      const calculatedPrice = round2(items.reduce((n, i) => n + i.lineTotal, 0));
      const price = pack.packPrice > 0 ? round2(pack.packPrice) : calculatedPrice;
      if (pack.packPrice > 0) items = repriceToPack(items, price);
      const tally = (key) => {
        const m = new Map();
        for (const i of items) m.set(i[key] || '—', (m.get(i[key] || '—') || 0) + i.quantity);
        return [...m].map(([k, quantity]) => ({ [key === 'colorName' ? 'colorName' : 'size']: k, quantity }));
      };
      return {
        ...base,
        items: items.map((i) => ({ sku: i.sku, product: i.product, variant: i.variant, quantity: i.quantity, productName: i.productName, colorName: i.colorName, size: i.size, skuCode: i.skuCode })),
        computed: {
          available: true,
          totalPieces: base.totalPieces,
          calculatedPrice,
          packPrice: price,
          perPiece: base.totalPieces ? round2(price / base.totalPieces) : null,
          assortment: tally('colorName'),
          sizeCurve: tally('size'),
          products: [...new Set(items.map((i) => i.productName))],
        },
      };
    } catch (err) {
      return { ...base, computed: { available: false, reason: err.code || 'PACK_UNAVAILABLE', totalPieces: base.totalPieces } };
    }
  }

  function calculatePricing(items) {
    const subtotal = items.reduce(
      (sum, item) => sum + item.lineTotal,
      0,
    );

    return {
      subtotal,
      estimatedTotal: subtotal,
    };
  }

  function ensureUniqueSkus(items) {
    const seen = new Set();

    for (const item of items) {
      const key = String(item.sku);

      if (seen.has(key)) {
        throw ApiError.badRequest(
          'Duplicate SKUs are not allowed',
          'DUPLICATE_WHOLESALE_SKU',
        );
      }

      seen.add(key);
    }
  }

  function escapeRegex(value) {
    return String(value).replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );
  }

  function buildPaginationMeta({
    page,
    limit,
    total,
  }) {
    return {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Validate Wholesale Items
  |--------------------------------------------------------------------------
  |
  | Rules:
  | - SKU must exist.
  | - SKU must be enabled.
  | - Product must be wholesale enabled.
  | - Retail-only products cannot enter Wholesale.
  | - Wholesale price must exist.
  | - Retail price is NEVER used as fallback.
  | - MOQ applies at Product level across all selected SKUs.
  |--------------------------------------------------------------------------
  */

  async function buildValidatedItems(
    requestedItems,
    session = null,
    { enforceMoq = true } = {},
  ) {
    ensureUniqueSkus(requestedItems);

    const skuIds = requestedItems.map(
      (item) => item.sku,
    );

    const skuQuery = Sku.find({
      _id: {
        $in: skuIds,
      },
    });

    if (session) {
      skuQuery.session(session);
    }

    const skus = await skuQuery.lean();

    if (skus.length !== skuIds.length) {
      throw ApiError.badRequest(
        'One or more wholesale SKUs are invalid',
        'INVALID_WHOLESALE_SKU',
      );
    }

    const skuMap = new Map(
      skus.map((sku) => [
        String(sku._id),
        sku,
      ]),
    );

    const productIds = [
      ...new Set(
        skus.map((sku) =>
          String(sku.product),
        ),
      ),
    ];

    const variantIds = [
      ...new Set(
        skus.map((sku) =>
          String(sku.variant),
        ),
      ),
    ];

    const productQuery = Product.find({
      _id: {
        $in: productIds,
      },
    });

    const variantQuery = ProductVariant.find({
      _id: {
        $in: variantIds,
      },
    });

    if (session) {
      productQuery.session(session);
      variantQuery.session(session);
    }

    const [products, variants] =
      await Promise.all([
        productQuery.lean(),
        variantQuery.lean(),
      ]);

    const productMap = new Map(
      products.map((product) => [
        String(product._id),
        product,
      ]),
    );

    const variantMap = new Map(
      variants.map((variant) => [
        String(variant._id),
        variant,
      ]),
    );

    /*
    |--------------------------------------------------------------------------
    | Calculate combined Product quantities
    |--------------------------------------------------------------------------
    |
    | Example:
    | Black M = 5
    | Black L = 5
    |
    | Product MOQ = 10
    |
    | Combined Product quantity = 10
    |--------------------------------------------------------------------------
    */

    const productQuantities = new Map();

    for (const requestedItem of requestedItems) {
      const sku = skuMap.get(
        String(requestedItem.sku),
      );

      if (!sku) {
        throw ApiError.badRequest(
          'Invalid wholesale SKU',
          'INVALID_WHOLESALE_SKU',
        );
      }

      const productKey =
        String(sku.product);

      const currentQuantity =
        productQuantities.get(productKey) || 0;

      productQuantities.set(
        productKey,
        currentQuantity +
          requestedItem.quantity,
      );
    }

    const result = [];

    for (const requestedItem of requestedItems) {
      const sku = skuMap.get(
        String(requestedItem.sku),
      );

      const product = productMap.get(
        String(sku.product),
      );

      const variant = variantMap.get(
        String(sku.variant),
      );

      if (!product || !variant) {
        throw ApiError.badRequest(
          'Wholesale product information is invalid',
          'INVALID_WHOLESALE_PRODUCT',
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Wholesale Eligibility
      |--------------------------------------------------------------------------
      |
      | This automatically keeps retail-only products
      | such as Ladies Shoes out of Wholesale.
      |--------------------------------------------------------------------------
      */

      if (!product.wholesale?.isEnabled) {
        throw ApiError.badRequest(
          `${product.name} is not available for wholesale`,
          'PRODUCT_NOT_WHOLESALE_ENABLED',
        );
      }

      if (!sku.isEnabled) {
        throw ApiError.badRequest(
          `${sku.sku} is not available`,
          'WHOLESALE_SKU_DISABLED',
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Wholesale Price
      |--------------------------------------------------------------------------
      |
      | Never fall back to retail price.
      |--------------------------------------------------------------------------
      */

      const wholesalePrice =
        Number(sku.wholesalePrice);

      if (
        !Number.isFinite(wholesalePrice) ||
        wholesalePrice <= 0
      ) {
        throw ApiError.badRequest(
          `Wholesale price is not configured for ${sku.sku}`,
          'WHOLESALE_PRICE_NOT_CONFIGURED',
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Product MOQ
      |--------------------------------------------------------------------------
      */

      const moq =
        Number(product.wholesale?.moq) || 0;

      const totalProductQuantity =
        productQuantities.get(
          String(product._id),
        ) || 0;

      if (
        enforceMoq &&
        moq > 0 &&
        totalProductQuantity < moq
      ) {
        throw ApiError.badRequest(
          `Minimum wholesale quantity for ${product.name} is ${moq}`,
          'WHOLESALE_MOQ_NOT_MET',
        );
      }

      const quantity =
        requestedItem.quantity;

      const tier = pickTier(product, totalProductQuantity);
      const unitPrice = tierUnitPrice(tier, wholesalePrice);

      const lineTotal = round2(unitPrice * quantity);

      /*
      |--------------------------------------------------------------------------
      | Snapshot
      |--------------------------------------------------------------------------
      |
      | Product/SKU names and price are snapshotted so future catalog
      | changes do not rewrite historical Wholesale requests.
      |--------------------------------------------------------------------------
      */

      result.push({
        product: product._id,
        variant: variant._id,
        sku: sku._id,

        productName: product.name,

        colorName:
          variant.color?.name ||
          variant.colorName ||
          undefined,

        size: sku.size,
        skuCode: sku.sku,

        wholesalePrice: unitPrice,
        ...(tier && (tier.discountPercent || tier.unitPrice) ? { baseWholesalePrice: wholesalePrice, ...(tier.discountPercent ? { tierDiscountPercent: tier.discountPercent } : {}) } : {}),
        ...(tier?.quote ? { _quoteOnly: true } : {}),

        quantity,
        lineTotal,
        ...(enforceMoq ? {} : { _moq: moq, _productQuantity: totalProductQuantity }),
      });
    }

    return result;
  }


  /*
  |--------------------------------------------------------------------------
  | Authoritative Preview (used by the wholesale cart / summary)
  |--------------------------------------------------------------------------
  | Same validation + pricing as a real request, except an unmet MOQ is
  | REPORTED per product instead of thrown, so the UI can show MOQ status.
  | Nothing is persisted.
  |--------------------------------------------------------------------------
  */

  async function previewItems(requestedItems, { packId, ordered } = {}) {
    let pack = null;
    if (packId) {
      pack = await Wholesale.findOne({ _id: packId, documentType: 'pack', isActive: true }).lean();
      if (!pack) throw ApiError.notFound('Wholesale pack not found', 'WHOLESALE_PACK_NOT_FOUND');
      requestedItems = pack.items.map((i) => ({ sku: i.sku, quantity: i.quantity }));
    }
    let items = await buildValidatedItems(requestedItems, null, { enforceMoq: false });
    if (pack?.packPrice > 0) items = repriceToPack(items, pack.packPrice);
    const pricing = await priceWithCharges(items);
    const allocation = checkAllocation(items, ordered);

    const byProduct = new Map();
    for (const item of items) {
      const key = String(item.product);
      const entry = byProduct.get(key) || {
        product: item.product,
        productName: item.productName,
        quantity: 0,
        moq: item._moq || 0,
        tierDiscountPercent: item.tierDiscountPercent || 0,
        quoteRequired: false,
      };
      entry.quantity += item.quantity;
      if (item._quoteOnly) entry.quoteRequired = true;
      byProduct.set(key, entry);
    }
    const products = [...byProduct.values()].map((p) => ({
      ...p,
      moqMet: !p.moq || p.quantity >= p.moq,
      moqShortfall: p.moq && p.quantity < p.moq ? p.moq - p.quantity : 0,
    }));

    return {
      quoteRequired: products.some((p) => p.quoteRequired),
      allocation: { ...allocation, matched: !allocation.mismatches.length },
      items: items.map(({ _moq, _productQuantity, _quoteOnly, ...rest }) => rest),
      products,
      units: items.reduce((n, i) => n + i.quantity, 0),
      moqMet: products.every((p) => p.moqMet),
      pricing,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Wholesale Catalog (authenticated: carries wholesale prices)
  |--------------------------------------------------------------------------
  */

  async function listWholesaleCatalog() {
    const products = await Product.find({
      status: 'active',
      'wholesale.isEnabled': true,
    })
      .select('name slug shortDescription generalImages category wholesale')
      .sort({ name: 1 })
      .limit(200)
      .lean();

    if (!products.length) return [];

    const ids = products.map((p) => p._id);
    const [variants, skus] = await Promise.all([
      ProductVariant.find({ product: { $in: ids }, isEnabled: true }).sort({ sortOrder: 1 }).lean(),
      Sku.find({ product: { $in: ids }, isEnabled: true, wholesalePrice: { $gt: 0 } }).sort({ sortOrder: 1 }).lean(),
    ]);

    const skusByVariant = new Map();
    for (const sku of skus) {
      const key = String(sku.variant);
      if (!skusByVariant.has(key)) skusByVariant.set(key, []);
      skusByVariant.get(key).push({
        id: sku._id,
        sku: sku.sku,
        size: sku.size,
        wholesalePrice: sku.wholesalePrice,
        retailPrice: sku.price,
        // Availability is shown as a boolean/level only; raw stock counts stay private.
        inStock: (sku.available || 0) > 0,
      });
    }

    const variantsByProduct = new Map();
    for (const variant of variants) {
      const sizes = skusByVariant.get(String(variant._id)) || [];
      if (!sizes.length) continue;
      const key = String(variant.product);
      if (!variantsByProduct.has(key)) variantsByProduct.set(key, []);
      variantsByProduct.get(key).push({
        id: variant._id,
        colorName: variant.color?.name,
        hexCode: variant.color?.hexCode,
        image: variant.images?.[0]?.url,
        sizes,
      });
    }

    return products
      .map((product) => {
        const allSkus = (variantsByProduct.get(String(product._id)) || []).flatMap((v) => v.sizes);
        const basePrice = allSkus.length ? Math.min(...allSkus.map((x) => x.wholesalePrice)) : null;
        const retailPrices = allSkus.map((x) => x.retailPrice).filter((n) => Number.isFinite(n) && n > 0);
        return { product, basePrice, retailPrice: retailPrices.length ? Math.min(...retailPrices) : null };
      })
      .map(({ product, basePrice, retailPrice }) => ({
        id: product._id,
        name: product.name,
        slug: product.slug,
        shortDescription: product.shortDescription,
        image: product.generalImages?.[0]?.url,
        category: product.category,
        moq: product.wholesale?.moq || 0,
        basePrice,
        retailPrice,
        // Display matrix computed from the lowest SKU price; real totals always come from /wholesale/preview.
        tiers: (product.wholesale?.tiers || []).map((t) => ({
          minQuantity: t.minQuantity,
          discountPercent: t.discountPercent,
          quoteOnly: Boolean(t.quoteOnly),
          unitPrice: t.quoteOnly || basePrice === null ? null : tierUnitPrice(t, basePrice),
        })),
        variants: variantsByProduct.get(String(product._id)) || [],
      }))
      .filter((p) => p.variants.length);
  }

  /*
  |--------------------------------------------------------------------------
  | Create Custom / Build Your Own Wholesale Request
  |--------------------------------------------------------------------------
  */

  async function createCustomRequest({
  userId = null,
  customer,
  items,
  ordered,
  partnershipProposal,
  customerNotes,
}) {
  const session =
    await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(
      async () => {
        const validatedItems =
          await buildValidatedItems(
            items,
            session,
          );

        const allocation = checkAllocation(validatedItems, ordered);
        if (allocation.mismatches.length) {
          throw ApiError.badRequest('Size/colour allocation does not match the ordered quantity', 'ALLOCATION_MISMATCH', allocation.mismatches);
        }

        const pricing = await priceWithCharges(
          validatedItems,
          session,
        );
        delete pricing.pending;
        delete pricing.taxPercent;

        const requestedVolume =
          calculateRequestedVolume(
            validatedItems,
          );

        const requestNumber =
          await nextWholesaleRequestNumber(
            session,
          );

        const [created] =
          await Wholesale.create(
            [
              {
                documentType:
                  'request',

                requestNumber,

                user:
                  userId,

                customer,

                requestType:
                  WHOLESALE_REQUEST_TYPES
                    .CUSTOM,

                sourcePack:
                  null,

                items:
                  validatedItems,

                requestedVolume,

                partnershipProposal,

                pricing,

                status:
                  WHOLESALE_REQUEST_STATUSES
                    .PENDING,

                customerNotes,
              },
            ],
            {
              session,
            },
          );

        result =
          created.toObject();
      },
    );

    /*
    |--------------------------------------------------------------------------
    | Post-Commit Admin Notification
    |--------------------------------------------------------------------------
    |
    | MongoDB transaction successful hone ke baad hi notification create hogi.
    |
    | Agar request creation rollback ho:
    | → notification nahi jayegi.
    |
    | Agar notification/FCM fail ho:
    | → valid wholesale request rollback nahi hogi.
    |--------------------------------------------------------------------------
    */

    if (result) {
      await adminNotificationEvents
        .newWholesaleRequest(
          result,
        );
    }

    return result;
  } finally {
    await session.endSession();
  }
}

  /*
  |--------------------------------------------------------------------------
  | Create Request From Ready Pack
  |--------------------------------------------------------------------------
  |
  | IMPORTANT:
  | We do not blindly trust the price/data stored when the Pack was created.
  |
  | Current SKU:
  | - eligibility
  | - wholesale price
  | - MOQ
  | - enabled state
  |
  | are revalidated when customer submits the request.
  |--------------------------------------------------------------------------
  */

 async function createPackRequest({
  packId,
  userId = null,
  customer,
  partnershipProposal,
  customerNotes,
}) {
  const session =
    await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(
      async () => {
        const pack =
          await Wholesale.findOne({
            _id:
              packId,

            documentType:
              'pack',

            isActive:
              true,
          }).session(
            session,
          );

        if (!pack) {
          throw ApiError.notFound(
            'Wholesale pack not found',
            'WHOLESALE_PACK_NOT_FOUND',
          );
        }

        const requestedItems =
          pack.items.map(
            (item) => ({
              sku:
                item.sku,

              quantity:
                item.quantity,
            }),
          );

        if (
          !requestedItems.length
        ) {
          throw ApiError.conflict(
            'Wholesale pack has no items',
            'WHOLESALE_PACK_EMPTY',
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Revalidate Pack Items
        |--------------------------------------------------------------------------
        |
        | Ready Pack ke stored price/data ko blindly trust nahi karte.
        |
        | Current:
        | - SKU availability/configuration
        | - Wholesale eligibility
        | - Wholesale pricing
        | - MOQ
        |
        | dobara validate hota hai.
        |--------------------------------------------------------------------------
        */

        let validatedItems =
          await buildValidatedItems(
            requestedItems,
            session,
          );
        if (pack.packPrice > 0) validatedItems = repriceToPack(validatedItems, pack.packPrice);

        const pricing = await priceWithCharges(
          validatedItems,
          session,
        );
        delete pricing.pending;
        delete pricing.taxPercent;

        const requestedVolume =
          calculateRequestedVolume(
            validatedItems,
          );

        const requestNumber =
          await nextWholesaleRequestNumber(
            session,
          );

        const [created] =
          await Wholesale.create(
            [
              {
                documentType:
                  'request',

                requestNumber,

                user:
                  userId,

                customer,

                requestType:
                  WHOLESALE_REQUEST_TYPES
                    .READY_PACK,

                sourcePack:
                  pack._id,

                items:
                  validatedItems,

                requestedVolume,

                partnershipProposal,

                pricing,

                status:
                  WHOLESALE_REQUEST_STATUSES
                    .PENDING,

                customerNotes,
              },
            ],
            {
              session,
            },
          );

        result =
          created.toObject();
      },
    );

    /*
    |--------------------------------------------------------------------------
    | Post-Commit Admin Notification
    |--------------------------------------------------------------------------
    |
    | Ready Pack request successfully commit hone ke baad hi admin
    | notification + FCM trigger hoga.
    |--------------------------------------------------------------------------
    */

    if (result) {
      await adminNotificationEvents
        .newWholesaleRequest(
          result,
        );
    }

    return result;
  } finally {
    await session.endSession();
  }
}

  /*
  |--------------------------------------------------------------------------
  | Public Ready Packs
  |--------------------------------------------------------------------------
  */

  async function listActivePacks({
    page = 1,
    limit = 20,
  }) {
    const filter = {
      documentType: 'pack',
      isActive: true,
    };

    const skip =
      (page - 1) * limit;

    const [packs, total] =
      await Promise.all([
        Wholesale.find(filter)
          .sort({
            sortOrder: 1,
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),

        Wholesale.countDocuments(
          filter,
        ),
      ]);

    const presented = await Promise.all(packs.map(presentPack));
    return {
      packs: presented.filter((p) => p.computed.available),

      meta: buildPaginationMeta({
        page,
        limit,
        total,
      }),
    };
  }

  async function getActivePackBySlug(slug) {
    const pack =
      await Wholesale.findOne({
        documentType: 'pack',
        slug,
        isActive: true,
      }).lean();

    if (!pack) {
      throw ApiError.notFound(
        'Wholesale pack not found',
        'WHOLESALE_PACK_NOT_FOUND',
      );
    }

    return presentPack(pack);
  }

  /*
  |--------------------------------------------------------------------------
  | Customer Wholesale Requests
  |--------------------------------------------------------------------------
  */

  async function listMyRequests({
    userId,
    status,
    page = 1,
    limit = 20,
  }) {
    const filter = {
      documentType: 'request',
      user: userId,
    };

    if (status) {
      filter.status = status;
    }

    const skip =
      (page - 1) * limit;

    const [requests, total] =
      await Promise.all([
        Wholesale.find(filter)
          .populate(
            'sourcePack',
            'name slug',
          )
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),

        Wholesale.countDocuments(
          filter,
        ),
      ]);

    return {
      requests,

      meta: buildPaginationMeta({
        page,
        limit,
        total,
      }),
    };
  }

  async function getMyRequest({
    requestId,
    userId,
  }) {
    const request =
      await Wholesale.findOne({
        _id: requestId,
        documentType: 'request',
        user: userId,
      })
        .populate(
          'sourcePack',
          'name slug',
        )
        .lean();

    if (!request) {
      throw ApiError.notFound(
        'Wholesale request not found',
        'WHOLESALE_REQUEST_NOT_FOUND',
      );
    }

    return request;
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Wholesale Request Listing
  |--------------------------------------------------------------------------
  |
  | Filters:
  | - search
  | - status
  | - requestType
  | - pagination
  |--------------------------------------------------------------------------
  */

  async function listAdminRequests({
    search,
    status,
    requestType,
    page = 1,
    limit = 10,
  }) {
    const filter = {
      documentType: 'request',
    };

    if (status) {
      filter.status = status;
    }

    if (requestType) {
      filter.requestType =
        requestType;
    }

    if (search) {
      const safeSearch =
        escapeRegex(search);

      const regex =
        new RegExp(
          safeSearch,
          'i',
        );

      filter.$or = [
        {
          requestNumber: regex,
        },
        {
          'customer.businessName':
            regex,
        },
        {
          'customer.name':
            regex,
        },
        {
          'customer.email':
            regex,
        },
        {
          'customer.phone':
            regex,
        },
        {
          'customer.taxNtn':
            regex,
        },
      ];
    }

    const skip =
      (page - 1) * limit;

    const [requests, total] =
      await Promise.all([
        Wholesale.find(filter)
          .populate(
            'user',
            'name email phone',
          )
          .populate(
            'sourcePack',
            'name slug',
          )
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),

        Wholesale.countDocuments(
          filter,
        ),
      ]);

    return {
      requests,

      meta: buildPaginationMeta({
        page,
        limit,
        total,
      }),
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Wholesale Request Detail
  |--------------------------------------------------------------------------
  */

  async function getAdminRequest(
    requestId,
  ) {
    const request =
      await Wholesale.findOne({
        _id: requestId,
        documentType: 'request',
      })
        .populate(
          'user',
          'name email phone',
        )
        .populate(
          'sourcePack',
          'name slug',
        )
        .populate(
          'reviewedBy',
          'name email',
        )
        .populate(
          'approvedBy',
          'name email',
        )
        .lean();

    if (!request) {
      throw ApiError.notFound(
        'Wholesale request not found',
        'WHOLESALE_REQUEST_NOT_FOUND',
      );
    }

    return request;
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Wholesale Dashboard Stats
  |--------------------------------------------------------------------------
  */

  async function getAdminStats() {
    const [
      totalInquiries,
      underReview,
      approvedPartners,
      volumeResult,
    ] = await Promise.all([
      Wholesale.countDocuments({
        documentType: 'request',
      }),

      Wholesale.countDocuments({
        documentType: 'request',

        status:
          WHOLESALE_REQUEST_STATUSES
            .UNDER_REVIEW,
      }),

      Wholesale.countDocuments({
        documentType: 'request',

        status: {
          $in: [
            WHOLESALE_REQUEST_STATUSES
              .APPROVED,

            WHOLESALE_REQUEST_STATUSES
              .QUOTED,

            WHOLESALE_REQUEST_STATUSES
              .ACCEPTED,

            WHOLESALE_REQUEST_STATUSES
              .CONVERTED_TO_ORDER,
          ],
        },
      }),

      Wholesale.aggregate([
        {
          $match: {
            documentType: 'request',

            status: {
              $nin: [
                WHOLESALE_REQUEST_STATUSES
                  .REJECTED,

                WHOLESALE_REQUEST_STATUSES
                  .CANCELLED,
              ],
            },
          },
        },
        {
          $group: {
            _id: null,

            totalRequestedVolume: {
              $sum: {
                $ifNull: [
                  '$requestedVolume',
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

    return {
      totalInquiries,
      underReview,
      approvedPartners,

      requestedVolume:
        volumeResult[0]
          ?.totalRequestedVolume || 0,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Review / Reject Wholesale Request
  |--------------------------------------------------------------------------
  |
  | Allowed:
  |
  | pending -> under_review
  | pending -> rejected
  | under_review -> rejected
  |--------------------------------------------------------------------------
  */

  async function reviewRequest({
    requestId,
    adminUserId,
    action,
    adminNotes,
  }) {
    const request =
      await Wholesale.findOne({
        _id: requestId,
        documentType: 'request',
      });

    if (!request) {
      throw ApiError.notFound(
        'Wholesale request not found',
        'WHOLESALE_REQUEST_NOT_FOUND',
      );
    }

    const reviewableStatuses = [
      WHOLESALE_REQUEST_STATUSES
        .PENDING,

      WHOLESALE_REQUEST_STATUSES
        .UNDER_REVIEW,
    ];

    if (
      !reviewableStatuses.includes(
        request.status,
      )
    ) {
      throw ApiError.conflict(
        'Wholesale request cannot be reviewed in its current status',
        'INVALID_WHOLESALE_REQUEST_STATUS',
      );
    }

    const now = new Date();

    if (action === 'review') {
      request.status =
        WHOLESALE_REQUEST_STATUSES
          .UNDER_REVIEW;

      request.reviewedBy =
        adminUserId;

      request.reviewedAt =
        request.reviewedAt || now;
    }

    if (action === 'reject') {
      request.status =
        WHOLESALE_REQUEST_STATUSES
          .REJECTED;

      request.reviewedBy =
        adminUserId;

      request.reviewedAt =
        request.reviewedAt || now;

      request.rejectedAt = now;
    }

    if (adminNotes !== undefined) {
      request.adminNotes =
        adminNotes;
    }

    await request.save();

    return request.toObject();
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Approve Wholesale Request
  |--------------------------------------------------------------------------
  |
  | IMPORTANT:
  | Rejected requests are intentionally NOT directly approvable.
  |
  | If we ever need to reopen a rejected request,
  | it should have its own explicit reopen workflow.
  |--------------------------------------------------------------------------
  */

  async function approveRequest({
    requestId,
    adminUserId,
    adminNotes,
    discountScheme,
  }) {
    const request =
      await Wholesale.findOne({
        _id: requestId,
        documentType: 'request',
      });

    if (!request) {
      throw ApiError.notFound(
        'Wholesale request not found',
        'WHOLESALE_REQUEST_NOT_FOUND',
      );
    }

    const approvableStatuses = [
      WHOLESALE_REQUEST_STATUSES
        .PENDING,

      WHOLESALE_REQUEST_STATUSES
        .UNDER_REVIEW,
    ];

    if (
      !approvableStatuses.includes(
        request.status,
      )
    ) {
      throw ApiError.conflict(
        'Wholesale request cannot be approved in its current status',
        'INVALID_WHOLESALE_APPROVAL_STATUS',
      );
    }

    const now = new Date();

    request.status =
      WHOLESALE_REQUEST_STATUSES
        .APPROVED;

    request.reviewedBy =
      request.reviewedBy ||
      adminUserId;

    request.reviewedAt =
      request.reviewedAt ||
      now;

    request.approvedBy =
      adminUserId;

    request.approvedAt = now;

    /*
    * Defensive cleanup in case legacy data
    * contains a rejection timestamp.
    */
    request.rejectedAt =
      undefined;

    if (adminNotes !== undefined) {
      request.adminNotes =
        adminNotes;
    }

    if (discountScheme !== undefined) {
      request.discountScheme =
        discountScheme;
    }

    await request.save();

    return request.toObject();
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Create Ready Pack
  |--------------------------------------------------------------------------
  */

  async function createPack(data) {
    ensureUniqueSkus(data.items);

    /*
    * Validate eligibility, SKU configuration,
    * MOQ and wholesale pricing before allowing
    * the Pack to be created.
    */
    const validatedItems =
      await buildValidatedItems(
        data.items,
      );

    const existing =
      await Wholesale.exists({
        documentType: 'pack',
        slug: data.slug,
      });

    if (existing) {
      throw ApiError.conflict(
        'Wholesale pack slug already exists',
        'WHOLESALE_PACK_SLUG_EXISTS',
      );
    }

    const pack =
      await Wholesale.create({
        documentType: 'pack',

        name: data.name,
        slug: data.slug,

        description:
          data.description,

        image:
          data.image,

        items:
          validatedItems.map(
            (item) => ({
              product:
                item.product,

              variant:
                item.variant,

              sku:
                item.sku,

              quantity:
                item.quantity,
            }),
          ),

        isActive:
          data.isActive,

        badge: data.badge,
        packPrice: data.packPrice ?? undefined,
        compareAtValue: data.compareAtValue ?? undefined,
        moq: data.moq ?? undefined,
        dispatchText: data.dispatchText,
        isFeatured: data.isFeatured,

        sortOrder:
          data.sortOrder,
      });

    return pack.toObject();
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Ready Pack Listing
  |--------------------------------------------------------------------------
  */

  async function listAdminPacks({
    page = 1,
    limit = 20,
  }) {
    const filter = {
      documentType: 'pack',
    };

    const skip =
      (page - 1) * limit;

    const [packs, total] =
      await Promise.all([
        Wholesale.find(filter)
          .sort({
            sortOrder: 1,
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),

        Wholesale.countDocuments(
          filter,
        ),
      ]);

    return {
      packs: await Promise.all(packs.map(presentPack)),

      meta: buildPaginationMeta({
        page,
        limit,
        total,
      }),
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Ready Pack Detail
  |--------------------------------------------------------------------------
  */

  async function getAdminPack(
    packId,
  ) {
    const pack =
      await Wholesale.findOne({
        _id: packId,
        documentType: 'pack',
      }).lean();

    if (!pack) {
      throw ApiError.notFound(
        'Wholesale pack not found',
        'WHOLESALE_PACK_NOT_FOUND',
      );
    }

    return presentPack(pack);
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Update Ready Pack
  |--------------------------------------------------------------------------
  */

  async function updatePack({
    packId,
    data,
  }) {
    const pack =
      await Wholesale.findOne({
        _id: packId,
        documentType: 'pack',
      });

    if (!pack) {
      throw ApiError.notFound(
        'Wholesale pack not found',
        'WHOLESALE_PACK_NOT_FOUND',
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Slug uniqueness
    |--------------------------------------------------------------------------
    */

    if (
      data.slug !== undefined &&
      data.slug !== pack.slug
    ) {
      const existing =
        await Wholesale.exists({
          _id: {
            $ne: pack._id,
          },

          documentType: 'pack',
          slug: data.slug,
        });

      if (existing) {
        throw ApiError.conflict(
          'Wholesale pack slug already exists',
          'WHOLESALE_PACK_SLUG_EXISTS',
        );
      }

      pack.slug =
        data.slug;
    }

    /*
    |--------------------------------------------------------------------------
    | Pack Items
    |--------------------------------------------------------------------------
    |
    | Revalidate every changed item.
    |--------------------------------------------------------------------------
    */

    if (data.items !== undefined) {
      ensureUniqueSkus(
        data.items,
      );

      const validatedItems =
        await buildValidatedItems(
          data.items,
        );

      pack.items =
        validatedItems.map(
          (item) => ({
            product:
              item.product,

            variant:
              item.variant,

            sku:
              item.sku,

            quantity:
              item.quantity,
          }),
        );
    }

    if (data.name !== undefined) {
      pack.name =
        data.name;
    }

    if (
      data.description !== undefined
    ) {
      pack.description =
        data.description;
    }

    if (data.image !== undefined) {
      pack.image =
        data.image;
    }

    if (data.isActive !== undefined) {
      pack.isActive =
        data.isActive;
    }

    if (data.sortOrder !== undefined) {
      pack.sortOrder =
        data.sortOrder;
    }

    for (const key of ['badge', 'dispatchText', 'isFeatured']) {
      if (data[key] !== undefined) pack[key] = data[key];
    }
    for (const key of ['packPrice', 'compareAtValue', 'moq']) {
      if (data[key] !== undefined) pack[key] = data[key] === null ? undefined : data[key];
    }

    await pack.save();

    return pack.toObject();
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Activate / Deactivate Ready Pack
  |--------------------------------------------------------------------------
  */

  async function setPackStatus({
    packId,
    isActive,
  }) {
    const pack =
      await Wholesale.findOne({
        _id: packId,
        documentType: 'pack',
      });

    if (!pack) {
      throw ApiError.notFound(
        'Wholesale pack not found',
        'WHOLESALE_PACK_NOT_FOUND',
      );
    }

    /*
    * When activating an existing pack,
    * revalidate its current SKU/product setup.
    *
    * This prevents an old Pack from becoming public
    * after its Product was made retail-only,
    * SKU was disabled, MOQ changed, etc.
    */
    if (isActive && !pack.isActive) {
      if (!pack.items?.length) {
        throw ApiError.conflict(
          'Wholesale pack has no items',
          'WHOLESALE_PACK_EMPTY',
        );
      }

      await buildValidatedItems(
        pack.items.map((item) => ({
          sku: item.sku,
          quantity: item.quantity,
        })),
      );
    }

    pack.isActive =
      isActive;

    await pack.save();

    return pack.toObject();
  }

  /*
  |--------------------------------------------------------------------------
  | Exports
  |--------------------------------------------------------------------------
  */

  module.exports = {
    /*
    * Shared/internal helper
    */
    buildValidatedItems,
    previewItems,
    listWholesaleCatalog,
    priceWithCharges,
    presentPack,
    redactPackPricing,
    checkAllocation,
    repriceToPack,

    /*
    * Customer Requests
    */
    createCustomRequest,
    createPackRequest,

    /*
    * Public Packs
    */
    listActivePacks,
    getActivePackBySlug,

    /*
    * Customer Request History
    */
    listMyRequests,
    getMyRequest,

    /*
    * Admin Requests
    */
    listAdminRequests,
    getAdminRequest,
    getAdminStats,

    reviewRequest,
    approveRequest,

    /*
    * Admin Ready Packs
    */
    createPack,
    listAdminPacks,
    getAdminPack,
    updatePack,
    setPackStatus,
  };