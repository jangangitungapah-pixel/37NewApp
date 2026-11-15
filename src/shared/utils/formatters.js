const idrFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

/**
 * Formats integer rupiah minor amount into readable IDR currency.
 * @param {number | null | undefined} amountMinor
 * @returns {string}
 */
export function formatIdr(amountMinor) {
  if (typeof amountMinor !== 'number' || !Number.isFinite(amountMinor)) {
    return 'Rp 0';
  }
  return idrFormatter.format(amountMinor);
}

/**
 * Formats daily operating hours object `{ openTime, closeTime }`.
 * @param {{ openTime?: string, closeTime?: string } | null | undefined} hours
 * @returns {string}
 */
export function formatOperatingHours(hours) {
  if (!hours?.openTime || !hours?.closeTime) {
    return '10:00 – 22:00';
  }
  return `${hours.openTime} – ${hours.closeTime}`;
}

/**
 * Parses comma-separated durations string ("60, 120, 180") into sorted unique integers.
 * @param {string} rawText
 * @returns {number[]}
 */
export function parseDurationOptionsInput(rawText) {
  if (typeof rawText !== 'string') {
    return [];
  }
  return Array.from(
    new Set(
      rawText
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((num) => Number.isInteger(num) && num >= 15 && num <= 1440),
    ),
  ).sort((a, b) => a - b);
}
