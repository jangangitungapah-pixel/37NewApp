import { PRICING_MODEL } from '../enums/roles.js';
import { DomainValidationError } from '../validators/schemaValidators.js';
import { requireSafeInt } from '../validators/masterDataValidators.js';

/**
 * Computes a deterministic integer-IDR price snapshot for a service & duration.
 * Never produces floating-point money outputs; integer rounding is explicit.
 *
 * @param {{
 *   service: {
 *     serviceId: string,
 *     name: string,
 *     pricingModel: string,
 *     durationOptions: number[],
 *     basePriceMinor: number,
 *     durationPricesMinor?: Record<string, number>,
 *     configVersion?: number,
 *   },
 *   durationMinutes: number,
 *   discountMinor?: number,
 *   taxPercent?: number,
 * }} params
 */
export function calculateServicePrice({
  service,
  durationMinutes,
  discountMinor = 0,
  taxPercent = 0,
}) {
  if (!service || typeof service !== 'object') {
    throw new DomainValidationError('Service wajib dipilih untuk perhitungan harga.', 'service');
  }

  const duration = requireSafeInt(Number(durationMinutes), 'durationMinutes', {
    min: 15,
    max: 1440,
  });

  if (
    Array.isArray(service.durationOptions) &&
    service.durationOptions.length > 0 &&
    !service.durationOptions.includes(duration)
  ) {
    throw new DomainValidationError(
      `Durasi ${duration} menit tidak tersedia pada service "${service.name}".`,
      'durationMinutes',
    );
  }

  const baseRate = requireSafeInt(service.basePriceMinor, 'basePriceMinor', { min: 0 });
  const overrideVal = service.durationPricesMinor?.[String(duration)];

  let baseSubtotalMinor;
  if (Number.isSafeInteger(overrideVal) && overrideVal >= 0) {
    baseSubtotalMinor = overrideVal;
  } else if (service.pricingModel === PRICING_MODEL.HOURLY) {
    baseSubtotalMinor = Math.round((baseRate * duration) / 60);
  } else {
    baseSubtotalMinor = baseRate;
  }

  const normalizedDiscount = requireSafeInt(Number(discountMinor || 0), 'discountMinor', {
    min: 0,
    max: baseSubtotalMinor,
  });

  const normalizedTaxPercent = requireSafeInt(Number(taxPercent || 0), 'taxPercent', {
    min: 0,
    max: 100,
  });

  const netBeforeTaxMinor = baseSubtotalMinor - normalizedDiscount;
  const taxMinor = Math.round((netBeforeTaxMinor * normalizedTaxPercent) / 100);
  const totalMinor = netBeforeTaxMinor + taxMinor;

  return Object.freeze({
    currency: 'IDR',
    serviceId: service.serviceId,
    serviceName: service.name,
    configVersion: service.configVersion || 1,
    pricingModel: service.pricingModel,
    durationMinutes: duration,
    baseSubtotalMinor,
    discountMinor: normalizedDiscount,
    netBeforeTaxMinor,
    taxPercent: normalizedTaxPercent,
    taxMinor,
    totalMinor,
  });
}
