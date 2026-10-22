'use strict';

/**
 * enumList({ PENDING: 'pending', DELIVERED: 'delivered' })
 *
 * Returns a frozen ARRAY of the values. It works everywhere an array is needed
 * (zod z.enum(), Mongoose `enum`, .includes, spread) AND exposes each key as a
 * non-enumerable property, so code can also write ORDER_STATUSES.DELIVERED.
 *
 * Object.values / Object.keys / spread only ever see the array items.
 */
function enumList(entries) {
  const list = Object.values(entries);

  for (const [name, value] of Object.entries(entries)) {
    Object.defineProperty(list, name, {
      value,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }

  return Object.freeze(list);
}

module.exports = { enumList };
