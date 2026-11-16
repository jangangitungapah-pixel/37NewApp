import {
  BASE_SLOT_BUCKET_MINUTES,
  BOOKING_SLOT_KIND,
} from '../enums/roles.js';
import { DomainValidationError } from '../validators/schemaValidators.js';
import {
  parseTimeToMinutes,
  requireSafeInt,
  validateOperatingHours,
} from '../validators/masterDataValidators.js';

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Checks whether `dateKey` is a valid calendar YYYY-MM-DD string.
 * @param {unknown} dateKey
 * @returns {boolean}
 */
export function isValidDateKey(dateKey) {
  if (typeof dateKey !== 'string') {
    return false;
  }
  const match = DATE_KEY_PATTERN.exec(dateKey.trim());
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/**
 * Formats integer minutes since midnight (0..1439) to HH:mm.
 * @param {number} totalMinutes
 * @returns {string}
 */
export function minutesToHHmm(totalMinutes) {
  const safe = requireSafeInt(totalMinutes, 'minutes', { min: 0, max: 1440 });
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getZonedDateTimeParts(date, timeZone = 'Asia/Jakarta') {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = Number(part.value);
    }
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour === 24 ? 0 : map.hour,
    minute: map.minute,
    second: map.second,
  };
}

/**
 * Formats a JS Date into local `YYYY-MM-DD` in the target IANA timezone.
 * @param {Date} date
 * @param {string} [timeZone]
 * @returns {string}
 */
export function formatDateKeyInTimeZone(date = new Date(), timeZone = 'Asia/Jakarta') {
  const parts = getZonedDateTimeParts(date, timeZone);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(
    parts.day,
  ).padStart(2, '0')}`;
}

/**
 * Returns local `YYYY-MM-DD` for "today" in the given IANA timezone.
 * @param {string} [timeZone]
 * @param {Date} [now]
 * @returns {string}
 */
export function getTodayDateKey(timeZone = 'Asia/Jakarta', now = new Date()) {
  return formatDateKeyInTimeZone(now, timeZone);
}

/**
 * Shifts a `YYYY-MM-DD` dateKey by `deltaDays` calendar days.
 * @param {string} dateKey
 * @param {number} deltaDays
 * @returns {string}
 */
export function addDaysToDateKey(dateKey, deltaDays) {
  if (!isValidDateKey(dateKey)) {
    throw new DomainValidationError(`Tanggal tidak valid: ${dateKey}`, 'dateKey');
  }
  const [y, m, d] = dateKey.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = utcDate.getUTCFullYear();
  const mm = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utcDate.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Returns 7 consecutive `YYYY-MM-DD` strings (Monday..Sunday) for the week containing `anchorDateKey`.
 * @param {string} anchorDateKey
 * @returns {string[]}
 */
export function getWeekDateKeys(anchorDateKey) {
  if (!isValidDateKey(anchorDateKey)) {
    throw new DomainValidationError(`Tanggal acuan minggu tidak valid: ${anchorDateKey}`, 'dateKey');
  }
  const [y, m, d] = anchorDateKey.split('-').map(Number);
  const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sun..6 = Sat
  const mondayOffset = utcDay === 0 ? -6 : 1 - utcDay;
  const mondayKey = addDaysToDateKey(anchorDateKey, mondayOffset);
  return Array.from({ length: 7 }, (_, i) => addDaysToDateKey(mondayKey, i));
}

/**
 * Formats a `YYYY-MM-DD` dateKey cleanly for Indonesian headers ("Sen, 16 Nov").
 * @param {string} dateKey
 * @returns {{ shortLabel: string, fullLabel: string }}
 */
export function formatDateKeyLabel(dateKey) {
  if (!isValidDateKey(dateKey)) {
    return { shortLabel: dateKey || '—', fullLabel: dateKey || '—' };
  }
  const [y, m, d] = dateKey.split('-').map(Number);
  const middayUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const shortLabel = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(middayUtc);
  const fullLabel = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(middayUtc);
  return { shortLabel, fullLabel };
}

/**
 * Converts a local calendar `(dateKey, timeHHmm)` in `timeZone` into an exact UTC Date instant.
 * Independent of host OS / browser timezone.
 *
 * @param {string} dateKey
 * @param {string} timeHHmm
 * @param {string} [timeZone]
 * @returns {Date}
 */
export function zonedDateTimeToDate(dateKey, timeHHmm, timeZone = 'Asia/Jakarta') {
  if (!isValidDateKey(dateKey)) {
    throw new DomainValidationError(`Format tanggal harus YYYY-MM-DD: ${dateKey}`, 'dateKey');
  }
  const totalMins = parseTimeToMinutes(timeHHmm, 'startTime');
  const [y, m, d] = dateKey.split('-').map(Number);
  const hh = Math.floor(totalMins / 60);
  const mm = totalMins % 60;

  const targetUtcAsIfNaive = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  let guess = new Date(targetUtcAsIfNaive);

  for (let pass = 0; pass < 2; pass += 1) {
    const actual = getZonedDateTimeParts(guess, timeZone);
    const actualAsIfNaive = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      0,
    );
    const diffMs = targetUtcAsIfNaive - actualAsIfNaive;
    if (diffMs === 0) {
      break;
    }
    guess = new Date(guess.getTime() + diffMs);
  }

  return guess;
}

/**
 * Generates canonical deterministic 15-minute slot ID:
 * `${studioId}__${dateKey}__${bucketIndexPadded}`
 *
 * @param {string} studioId
 * @param {string} dateKey
 * @param {number} bucketIndex
 * @returns {string}
 */
export function formatSlotId(studioId, dateKey, bucketIndex) {
  if (!studioId || typeof studioId !== 'string') {
    throw new DomainValidationError('studioId wajib untuk membuat ID slot.', 'studioId');
  }
  if (!isValidDateKey(dateKey)) {
    throw new DomainValidationError(`dateKey tidak valid: ${dateKey}`, 'dateKey');
  }
  const idx = requireSafeInt(bucketIndex, 'bucketIndex', { min: 0, max: 95 });
  return `${studioId.trim()}__${dateKey.trim()}__${String(idx).padStart(2, '0')}`;
}

/**
 * Generates selectable start times inside studio operating hours at `slotGranularityMinutes`.
 * @param {{
 *   operatingHours: { openTime: string, closeTime: string },
 *   slotGranularityMinutes?: number,
 * }} params
 * @returns {Array<{ timeHHmm: string, minutes: number, bucketIndex: number }>}
 */
export function buildStartTimeOptions({ operatingHours, slotGranularityMinutes = 15 }) {
  const hours = validateOperatingHours(operatingHours || { openTime: '10:00', closeTime: '22:00' });
  const openMins = parseTimeToMinutes(hours.openTime, 'openTime');
  const closeMins = parseTimeToMinutes(hours.closeTime, 'closeTime');
  const step = [15, 30, 60].includes(Number(slotGranularityMinutes))
    ? Number(slotGranularityMinutes)
    : 15;

  const options = [];
  for (let mins = openMins; mins + 15 <= closeMins; mins += step) {
    options.push({
      timeHHmm: minutesToHHmm(mins),
      minutes: mins,
      bucketIndex: Math.floor(mins / BASE_SLOT_BUCKET_MINUTES),
    });
  }
  return options;
}

/**
 * Builds visual time row labels for calendar desktop grid covering operatingHours.
 */
export function buildCalendarTimeRows({ operatingHours, stepMinutes = 30 }) {
  const hours = validateOperatingHours(operatingHours || { openTime: '10:00', closeTime: '22:00' });
  const openMins = parseTimeToMinutes(hours.openTime, 'openTime');
  const closeMins = parseTimeToMinutes(hours.closeTime, 'closeTime');
  const step = [15, 30, 60].includes(Number(stepMinutes)) ? Number(stepMinutes) : 30;

  const rows = [];
  for (let mins = openMins; mins < closeMins; mins += step) {
    rows.push({
      timeHHmm: minutesToHHmm(mins),
      minutes: mins,
      bucketIndex: Math.floor(mins / BASE_SLOT_BUCKET_MINUTES),
    });
  }
  return rows;
}

/**
 * Computes and validates the complete atomic slot reservation plan for a booking.
 * Always locks contiguous 15-minute buckets (`BASE_SLOT_BUCKET_MINUTES = 15`) plus
 * optional trailing turnover buffer capped at studio close time.
 *
 * @param {{
 *   studioId: string,
 *   dateKey: string,
 *   startTime: string,
 *   durationMinutes: number,
 *   bufferMinutes?: number,
 *   timezone?: string,
 *   operatingHours: { openTime: string, closeTime: string },
 *   slotGranularityMinutes?: number,
 * }} params
 */
export function computeBookingSlotPlan({
  studioId,
  dateKey,
  startTime,
  durationMinutes,
  bufferMinutes = 0,
  timezone = 'Asia/Jakarta',
  operatingHours,
  slotGranularityMinutes = 15,
}) {
  if (!studioId || typeof studioId !== 'string') {
    throw new DomainValidationError('Studio wajib dipilih.', 'studioId');
  }
  if (!isValidDateKey(dateKey)) {
    throw new DomainValidationError('Tanggal booking wajib berformat YYYY-MM-DD yang valid.', 'dateKey');
  }

  const hours = validateOperatingHours(operatingHours);
  const openMins = parseTimeToMinutes(hours.openTime, 'openTime');
  const closeMins = parseTimeToMinutes(hours.closeTime, 'closeTime');
  const startMins = parseTimeToMinutes(startTime, 'startTime');

  const granularity = [15, 30, 60].includes(Number(slotGranularityMinutes))
    ? Number(slotGranularityMinutes)
    : 15;

  const duration = requireSafeInt(Number(durationMinutes), 'durationMinutes', {
    min: 15,
    max: 1440,
  });

  if (duration % BASE_SLOT_BUCKET_MINUTES !== 0) {
    throw new DomainValidationError(
      'Durasi booking harus kelipatan 15 menit.',
      'durationMinutes',
    );
  }

  if ((startMins - openMins) % granularity !== 0) {
    throw new DomainValidationError(
      `Jam mulai harus sesuai granularitas studio (${granularity} menit sejak ${hours.openTime}).`,
      'startTime',
    );
  }

  const endMins = startMins + duration;
  if (startMins < openMins) {
    throw new DomainValidationError(
      `Jam mulai (${minutesToHHmm(startMins)}) mendahului jam buka studio (${hours.openTime}).`,
      'startTime',
    );
  }
  if (endMins > closeMins) {
    throw new DomainValidationError(
      `Sesi berakhir (${minutesToHHmm(endMins)}) melewati jam tutup studio (${hours.closeTime}).`,
      'durationMinutes',
    );
  }

  const normalizedBuffer = requireSafeInt(Number(bufferMinutes || 0), 'bufferMinutes', {
    min: 0,
    max: 120,
  });

  const startAt = zonedDateTimeToDate(dateKey, minutesToHHmm(startMins), timezone);
  const endAt = new Date(startAt.getTime() + duration * 60 * 1000);
  const endTime = minutesToHHmm(endMins);

  const sessionStartBucket = Math.floor(startMins / BASE_SLOT_BUCKET_MINUTES);
  const sessionBucketCount = duration / BASE_SLOT_BUCKET_MINUTES;

  const sessionSlots = [];
  for (let i = 0; i < sessionBucketCount; i += 1) {
    const bucketIndex = sessionStartBucket + i;
    const slotStartAt = new Date(startAt.getTime() + i * BASE_SLOT_BUCKET_MINUTES * 60 * 1000);
    const slotEndAt = new Date(slotStartAt.getTime() + BASE_SLOT_BUCKET_MINUTES * 60 * 1000);
    sessionSlots.push({
      slotId: formatSlotId(studioId, dateKey, bucketIndex),
      bucketIndex,
      slotTime: minutesToHHmm(bucketIndex * BASE_SLOT_BUCKET_MINUTES),
      kind: BOOKING_SLOT_KIND.SESSION,
      slotStartAt,
      slotEndAt,
    });
  }

  const bufferSlots = [];
  if (normalizedBuffer > 0 && endMins < closeMins) {
    const cappedBufferEndMins = Math.min(closeMins, endMins + normalizedBuffer);
    const bufferStartBucket = sessionStartBucket + sessionBucketCount;
    const bufferEndBucketExclusive = Math.min(
      96,
      Math.ceil(cappedBufferEndMins / BASE_SLOT_BUCKET_MINUTES),
    );
    for (let bucketIndex = bufferStartBucket; bucketIndex < bufferEndBucketExclusive; bucketIndex += 1) {
      const offsetMins = bucketIndex * BASE_SLOT_BUCKET_MINUTES - startMins;
      const slotStartAt = new Date(startAt.getTime() + offsetMins * 60 * 1000);
      const slotEndAt = new Date(slotStartAt.getTime() + BASE_SLOT_BUCKET_MINUTES * 60 * 1000);
      bufferSlots.push({
        slotId: formatSlotId(studioId, dateKey, bucketIndex),
        bucketIndex,
        slotTime: minutesToHHmm(bucketIndex * BASE_SLOT_BUCKET_MINUTES),
        kind: BOOKING_SLOT_KIND.BUFFER,
        slotStartAt,
        slotEndAt,
      });
    }
  }

  const allSlots = [...sessionSlots, ...bufferSlots];
  if (allSlots.length === 0 || allSlots.length > 96) {
    throw new DomainValidationError('Jumlah slot reservasi di luar batas harian (1–96 bucket).');
  }

  return {
    studioId,
    dateKey,
    timezone,
    startTime: minutesToHHmm(startMins),
    endTime,
    durationMinutes: duration,
    bufferMinutes: normalizedBuffer,
    startMinutes: startMins,
    endMinutes: endMins,
    startAt,
    endAt,
    sessionSlots,
    bufferSlots,
    allSlots,
    slotIds: allSlots.map((slot) => slot.slotId),
  };
}
