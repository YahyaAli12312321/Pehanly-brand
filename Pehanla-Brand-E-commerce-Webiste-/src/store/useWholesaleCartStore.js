import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { toQty } from '../utils/wholesaleCart';

/**
 * Separate wholesale cart (never mixed with the retail bag).
 * Persists ONLY product refs, SKU ids and quantities - no prices (the backend prices every preview and
 * request), no credentials, no personal data.
 *
 * line (manual): { id, type:'manual', productId, slug, name, image, ordered, alloc:{[skuId]:qty}, confirmed }
 * line (pack):   { id, type:'pack', packId, slug, name, image, items:[{sku, quantity, productName, colorName, size}] }
 * line (flexible pack): a pack line plus { mode:'flexible', packSize } - `items` is then the buyer's own colour/size choice (it must add up
 *                to packSize). It stays ONE line; the backend re-validates the choice on preview and on request.
 */
const KEY = 'pehanly-wholesale-cart-v1';

const safeStorage = () => {
  try {
    window.localStorage.setItem('__w__', '1');
    window.localStorage.removeItem('__w__');
    return window.localStorage;
  } catch {
    const mem = new Map();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  }
};

export const useWholesaleCartStore = create(
  persist(
    (set) => ({
      lines: [],
      addManual: (product, ordered) =>
        set((s) => (s.lines.some((l) => l.id === `m-${product.id}`) ? s : {
          lines: [...s.lines, { id: `m-${product.id}`, type: 'manual', productId: product.id, slug: product.slug, name: product.name, image: product.image, ordered: toQty(ordered), alloc: {}, confirmed: false }],
        })),
      addPack: (pack) =>
        set((s) => (s.lines.some((l) => l.id === `p-${pack._id || pack.id}`) ? s : {
          lines: [...s.lines, {
            id: `p-${pack._id || pack.id}`, type: 'pack', packId: pack._id || pack.id, slug: pack.slug, name: pack.name, image: pack.image?.url,
            items: (pack.items || []).map((i) => ({ sku: String(i.sku?._id || i.sku), quantity: i.quantity, productName: i.productName, colorName: i.colorName, size: i.size })),
          }],
        })),
      /** Flexible pack: add (or replace) the line with the buyer's choice. `items` = [{sku, quantity, productName, colorName, size}]. */
      setFlexiblePack: (pack, items) =>
        set((s) => {
          const id = `p-${pack._id || pack.id}`;
          const line = {
            id, type: 'pack', mode: 'flexible', packId: pack._id || pack.id, slug: pack.slug, name: pack.name, image: pack.image?.url,
            packSize: Number(pack.packSize ?? pack.computed?.packSize) || 0,
            items: items.map((i) => ({ sku: String(i.sku), quantity: i.quantity, productName: i.productName, colorName: i.colorName, size: i.size })),
          };
          return { lines: s.lines.some((l) => l.id === id) ? s.lines.map((l) => (l.id === id ? line : l)) : [...s.lines, line] };
        }),
      setOrdered: (id, ordered) =>
        set((s) => ({ lines: s.lines.map((l) => (l.id === id ? { ...l, ordered: toQty(ordered), confirmed: false } : l)) })),
      setAlloc: (id, skuId, qty) =>
        set((s) => ({
          lines: s.lines.map((l) => {
            if (l.id !== id) return l;
            const alloc = { ...l.alloc };
            if (toQty(qty) > 0) alloc[skuId] = toQty(qty); else delete alloc[skuId];
            return { ...l, alloc, confirmed: false };
          }),
        })),
      resetAlloc: (id) => set((s) => ({ lines: s.lines.map((l) => (l.id === id ? { ...l, alloc: {}, confirmed: false } : l)) })),
      confirm: (id) => set((s) => ({ lines: s.lines.map((l) => (l.id === id ? { ...l, confirmed: true } : l)) })),
      remove: (id) => set((s) => ({ lines: s.lines.filter((l) => l.id !== id) })),
      clear: () => set({ lines: [] }),
    }),
    { name: KEY, version: 1, storage: createJSONStorage(safeStorage), partialize: (s) => ({ lines: s.lines }) },
  ),
);
