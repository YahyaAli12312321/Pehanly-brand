import { describe, it, expect } from 'vitest';
import { effectiveMethod, isKarachiCity, isShipmentDirty, missingForShipping, shipmentRequiredMessage } from './shipment';

describe('shipment rules (mirror the backend)', () => {
  it('Karachi defaults to local rider, other cities to courier', () => {
    expect(effectiveMethod({}, 'Karachi')).toBe('local_rider');
    expect(effectiveMethod({}, 'karachi east')).toBe('local_rider');
    expect(effectiveMethod({}, 'Lahore')).toBe('courier');
    expect(effectiveMethod({ deliveryMethod: 'courier' }, 'Karachi')).toBe('courier');
    expect(isKarachiCity('New Karachi')).toBe(false);
  });

  it('local rider needs a name and a valid phone, never courier fields', () => {
    expect(missingForShipping({}, 'local_rider').map((m) => m.label)).toEqual(['rider name', 'rider phone number']);
    expect(missingForShipping({ riderName: 'Junaid', riderPhone: '0300 1234567' }, 'local_rider')).toEqual([]);
    expect(missingForShipping({ riderName: 'Junaid', riderPhone: 'call me' }, 'local_rider').map((m) => m.field)).toEqual(['riderPhone']);
    expect(missingForShipping({ riderName: ' ', riderPhone: '03001234567' }, 'local_rider').map((m) => m.field)).toEqual(['riderName']);
  });

  it('courier needs partner + waybill; tracking URL is optional', () => {
    expect(missingForShipping({}, 'courier').map((m) => m.label)).toEqual(['logistics partner', 'tracking waybill / consignment number']);
    expect(missingForShipping({ courierName: 'TCS', trackingNumber: 'CN1' }, 'courier')).toEqual([]);
  });

  it('message matches the backend wording', () => {
    expect(shipmentRequiredMessage(missingForShipping({}, 'local_rider'))).toBe('Add rider name and rider phone number before marking the order as shipped');
  });

  it('dirty = typed values differ from what is saved on the order', () => {
    const saved = { deliveryMethod: 'local_rider', riderName: 'Junaid', riderPhone: '03001234567' };
    expect(isShipmentDirty({ riderName: 'Junaid', riderPhone: '03001234567', deliveryMethod: 'local_rider' }, saved, 'local_rider')).toBe(false);
    expect(isShipmentDirty({ riderName: 'Junaid ', riderPhone: '03001234567' }, saved, 'local_rider')).toBe(false);
    expect(isShipmentDirty({ riderName: 'Bilal', riderPhone: '03001234567' }, saved, 'local_rider')).toBe(true);
    expect(isShipmentDirty({ riderName: 'Junaid', riderPhone: '03001234567' }, undefined, 'local_rider')).toBe(true);
    expect(isShipmentDirty({}, undefined, 'courier')).toBe(false);
  });
});
