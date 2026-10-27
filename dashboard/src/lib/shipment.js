/**
 * Shipment form rules for the order drawer. They mirror the backend's deliveryPolicy.assessShipment so the admin
 * gets the exact reason up front; the backend still re-checks everything (it stays the authority).
 *   Karachi (local rider): rider name + rider phone. No courier waybill / tracking URL is ever required.
 *   Elsewhere (courier):   logistics partner + tracking waybill. Tracking URL is optional.
 */
export const RIDER_PHONE = /^[+0-9][0-9 ()-]{6,19}$/;

const t = (v) => String(v ?? '').trim();
const FIELDS = {
  local_rider: ['riderName', 'riderPhone'],
  courier: ['courierName', 'trackingNumber', 'trackingUrl'],
};

export const isKarachiCity = (city) => /^karachi(\s|$)/i.test(t(city));

/** The method actually in force: an explicit choice, else Karachi -> local rider, otherwise courier. */
export const effectiveMethod = (ship, city) => ship?.deliveryMethod || (isKarachiCity(city) ? 'local_rider' : 'courier');

/** What is still missing for this method, as backend-style labels plus the form field each belongs to. */
export function missingForShipping(ship, method) {
  const missing = [];
  if (method === 'local_rider') {
    if (!t(ship.riderName)) missing.push({ field: 'riderName', label: 'rider name', error: "Enter the rider's name" });
    if (!RIDER_PHONE.test(t(ship.riderPhone))) missing.push({ field: 'riderPhone', label: 'rider phone number', error: t(ship.riderPhone) ? 'Enter a valid rider phone number' : "Enter the rider's phone number" });
  } else {
    if (!t(ship.courierName)) missing.push({ field: 'courierName', label: 'logistics partner', error: 'Enter the logistics partner' });
    if (!t(ship.trackingNumber)) missing.push({ field: 'trackingNumber', label: 'tracking waybill / consignment number', error: 'Enter the waybill / consignment number' });
  }
  return missing;
}

/** Same wording the backend uses for SHIPMENT_REQUIRED. */
export const shipmentRequiredMessage = (missing) => `Add ${missing.map((m) => m.label).join(' and ')} before marking the order as shipped`;

/** True when the form holds values that are not what the order already has saved (for the method in force). */
export function isShipmentDirty(ship, saved, method) {
  const s = saved || {};
  if (t(ship.deliveryMethod || method) !== t(s.deliveryMethod || method)) return true;
  return FIELDS[method].some((k) => t(ship[k]) !== t(s[k]));
}
