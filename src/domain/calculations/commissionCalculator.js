import { COMMISSION_BASIS, COMMISSION_METHOD } from '../enums/roles.js';
import { requireSafeInt } from '../validators/masterDataValidators.js';

/**
 * Resolves the effective operator commission rule (service override takes precedence
 * over business default setting) and computes an integer IDR commission snapshot.
 *
 * @param {{
 *   service?: {
 *     commissionMethod?: string,
 *     commissionValue?: number,
 *   } | null,
 *   commissionSetting?: {
 *     defaultMethod?: string,
 *     defaultRatePercent?: number,
 *     defaultFixedAmountMinor?: number,
 *     basis?: string,
 *   } | null,
 *   grossAmountMinor: number,
 *   netAmountMinor: number,
 * }} params
 */
export function calculateOperatorCommission({
  service = null,
  commissionSetting = null,
  grossAmountMinor,
  netAmountMinor,
}) {
  const gross = requireSafeInt(grossAmountMinor, 'grossAmountMinor', { min: 0 });
  const net = requireSafeInt(netAmountMinor, 'netAmountMinor', { min: 0 });

  const basis =
    commissionSetting?.basis === COMMISSION_BASIS.SUBTOTAL
      ? COMMISSION_BASIS.SUBTOTAL
      : COMMISSION_BASIS.SETTLED_AMOUNT;

  const basisAmountMinor = basis === COMMISSION_BASIS.SUBTOTAL ? gross : net;

  const hasServiceOverride =
    service?.commissionMethod && service.commissionMethod !== COMMISSION_METHOD.INHERIT;

  const method = hasServiceOverride
    ? service.commissionMethod
    : commissionSetting?.defaultMethod || COMMISSION_METHOD.NONE;

  let rateOrValue = 0;
  let amountMinor = 0;

  if (method === COMMISSION_METHOD.PERCENTAGE) {
    const rawPercent = hasServiceOverride
      ? service.commissionValue ?? 0
      : commissionSetting?.defaultRatePercent ?? 0;
    rateOrValue = requireSafeInt(Number(rawPercent), 'commissionPercent', { min: 0, max: 100 });
    amountMinor = Math.round((basisAmountMinor * rateOrValue) / 100);
  } else if (method === COMMISSION_METHOD.FIXED_PER_BOOKING) {
    const rawFixed = hasServiceOverride
      ? service.commissionValue ?? 0
      : commissionSetting?.defaultFixedAmountMinor ?? 0;
    rateOrValue = requireSafeInt(Number(rawFixed), 'commissionFixedMinor', { min: 0 });
    amountMinor = rateOrValue;
  }

  return Object.freeze({
    currency: 'IDR',
    method,
    rateOrValue,
    source: hasServiceOverride ? 'service_override' : 'business_default',
    basis,
    basisAmountMinor,
    amountMinor,
  });
}
