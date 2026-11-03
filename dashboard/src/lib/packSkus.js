/**
 * Picking SKUs for a wholesale pack from products that already exist.
 *
 * A pack never creates SKUs or variants - it references the existing SKU records (so nothing is duplicated). "All SKUs" here
 * selects every orderable SKU of a product that is not already in the pack; the SKU codes themselves are generated once, when the
 * product is created (components/products/variantDraft.js -> generateAllSkus), and reused as they are.
 */

const wholesaleReady = (product) => product?.wholesale?.isEnabled === true || product?.salesChannel === "wholesale" || product?.salesChannel === "both";

/** Why a SKU can't go into a wholesale pack, or null when it can. */
export function packSkuBlocker(product, variant, size) {
  if (!wholesaleReady(product)) return "Wholesale is not enabled for this product";
  if (variant?.isEnabled === false) return "This colour is disabled";
  if (size?.isEnabled === false) return "This SKU is disabled";
  if (!(Number(size?.wholesalePrice) > 0)) return "No wholesale price set";
  return null;
}

const skuLabel = (product, variant, size) => `${product.name} · ${variant.color?.name || "Colour"} / ${size.size} (${size.sku})`;

/**
 * SKUs of a product (optionally one colour) that can be added: { add:[{sku,label}], duplicates, blocked:[{label,reason}] }.
 * `inPack` is the set of SKU ids already in the pack.
 */
export function collectPackSkus(product, inPack, variantId) {
  const out = { add: [], duplicates: 0, blocked: [] };
  for (const variant of product?.variants || []) {
    if (variantId && variant._id !== variantId) continue;
    for (const size of variant.sizes || []) {
      const label = skuLabel(product, variant, size);
      const reason = packSkuBlocker(product, variant, size);
      if (reason) out.blocked.push({ label, reason });
      else if (inPack.has(size._id)) out.duplicates += 1;
      else out.add.push({ sku: size._id, label, quantity: 1 });
    }
  }
  return out;
}
