import {
  NOTIFICATION_CHANNEL,
  NOTIFICATION_TYPE,
  SCHEMA_VERSIONS,
} from '../enums/roles.js';
import { requireSafeInt } from './masterDataValidators.js';
import {
  DomainValidationError,
  optionalStringOrNull,
  requireNonEmptyString,
} from './schemaValidators.js';

const VALID_NOTIFICATION_TYPES = new Set(Object.values(NOTIFICATION_TYPE));
const VALID_ENTITY_TYPES = new Set(['booking', 'settlement', 'member']);

/**
 * Builds deterministic notification document ID so retried operations never duplicate alerts.
 * @param {{ type: string, eventKey: string, recipientUid: string }} params
 * @returns {string}
 */
export function buildNotificationId({ type, eventKey, recipientUid }) {
  const safeType = requireNonEmptyString(type, 'type');
  const safeKey = requireNonEmptyString(eventKey, 'eventKey');
  const safeRecipient = requireNonEmptyString(recipientUid, 'recipientUid');
  return `${safeType}__${safeKey}__${safeRecipient}`;
}

/**
 * Validates and normalizes `businesses/{businessId}/notifications/{notificationId}`.
 * Never trusts global wildcard recipients.
 * @param {Record<string, unknown>} raw
 */
export function validateNotificationDoc(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DomainValidationError('Dokumen notifikasi tidak valid.');
  }

  const type = requireNonEmptyString(raw.type, 'type');
  if (!VALID_NOTIFICATION_TYPES.has(type)) {
    throw new DomainValidationError(`Tipe notifikasi tidak dikenal: ${type}`, 'type');
  }

  const channel = raw.channel || NOTIFICATION_CHANNEL.IN_APP;
  if (channel !== NOTIFICATION_CHANNEL.IN_APP) {
    throw new DomainValidationError(`Channel notifikasi tidak didukung: ${channel}`, 'channel');
  }

  const recipientUid = requireNonEmptyString(raw.recipientUid, 'recipientUid');
  if (recipientUid === '*' || recipientUid === 'all') {
    throw new DomainValidationError('recipientUid harus menunjuk UID anggota spesifik.', 'recipientUid');
  }

  const entityType = requireNonEmptyString(raw.entityType, 'entityType');
  if (!VALID_ENTITY_TYPES.has(entityType)) {
    throw new DomainValidationError(`entityType notifikasi tidak valid: ${entityType}`, 'entityType');
  }

  const title = requireNonEmptyString(raw.title, 'title').slice(0, 120);
  const message = requireNonEmptyString(raw.message, 'message').slice(0, 300);
  const actionPath = optionalStringOrNull(raw.actionPath, 'actionPath');
  if (actionPath && !/^\/(owner|operator)(\/|$)/.test(actionPath)) {
    throw new DomainValidationError('actionPath notifikasi wajib berupa rute portal internal.', 'actionPath');
  }

  return {
    notificationId: requireNonEmptyString(raw.notificationId, 'notificationId'),
    businessId: requireNonEmptyString(raw.businessId, 'businessId'),
    studioId: optionalStringOrNull(raw.studioId, 'studioId'),
    recipientUid,
    eventId: requireNonEmptyString(raw.eventId, 'eventId'),
    type,
    channel,
    entityType,
    entityId: requireNonEmptyString(raw.entityId, 'entityId'),
    title,
    message,
    actionPath,
    readAt: raw.readAt ?? null,
    createdBy: requireNonEmptyString(raw.createdBy, 'createdBy'),
    createdAt: raw.createdAt ?? null,
    schemaVersion: requireSafeInt(
      raw.schemaVersion ?? SCHEMA_VERSIONS.NOTIFICATION,
      'schemaVersion',
      { min: 1 },
    ),
  };
}

export function countUnreadNotifications(notifications = []) {
  if (!Array.isArray(notifications)) {
    return 0;
  }
  return notifications.reduce((acc, item) => (item && item.readAt == null ? acc + 1 : acc), 0);
}

export function filterNotificationsByReadState(notifications = [], filter = 'all') {
  if (!Array.isArray(notifications)) {
    return [];
  }
  if (filter === 'unread') {
    return notifications.filter((item) => item && item.readAt == null);
  }
  return notifications;
}
