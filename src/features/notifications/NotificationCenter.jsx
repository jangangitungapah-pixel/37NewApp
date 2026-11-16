import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCheck, ExternalLink, Inbox } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthSession } from '../../app/providers/authSessionContext.js';
import {
  markAllNotificationsReadUseCase,
  markNotificationReadUseCase,
} from '../../application/use-cases/notificationUseCases.js';
import { subscribeMyNotifications } from '../../data/repositories/notificationRepository.js';
import { ROLES } from '../../domain/enums/roles.js';
import {
  countUnreadNotifications,
  filterNotificationsByReadState,
} from '../../domain/validators/notificationValidators.js';
import { useRegistrySubscription } from '../../shared/hooks/useRegistrySubscription.js';

function formatNotifTime(dateVal) {
  if (!(dateVal instanceof Date) || Number.isNaN(dateVal.getTime())) {
    return 'Baru saja';
  }
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dateVal);
}

export function NotificationCenter() {
  const { member, isOnline } = useAuthSession();
  const navigate = useNavigate();
  const wrapperRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('all'); // 'all' | 'unread'
  const [actionError, setActionError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);

  const subscribeFn = useCallback(
    ({ onData, onError }) => {
      if (!member?.businessId || !member?.uid) return () => {};
      return subscribeMyNotifications({
        businessId: member.businessId,
        recipientUid: member.uid,
        limitCount: 30,
        onData,
        onError,
      });
    },
    [member?.businessId, member?.uid],
  );

  const {
    data: notifications,
    loading,
    fromCache,
    error: subError,
  } = useRegistrySubscription(
    'phase05:notifications:inbox',
    member?.businessId && member?.uid ? subscribeFn : null,
    [],
  );

  const unreadCount = useMemo(() => countUnreadNotifications(notifications), [notifications]);
  const visibleItems = useMemo(
    () => filterNotificationsByReadState(notifications, tab),
    [notifications, tab],
  );

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    const onPointerDown = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  async function handleSelectNotification(item) {
    setActionError('');
    try {
      if (item.readAt == null && isOnline) {
        await markNotificationReadUseCase({ member, notification: item, isOnline });
      }
      setOpen(false);
      if (item.actionPath) {
        navigate(item.actionPath);
      }
    } catch (err) {
      setActionError(err.message || 'Gagal menandai notifikasi dibaca.');
    }
  }

  async function handleMarkAllRead() {
    setActionError('');
    setMarkingAll(true);
    try {
      await markAllNotificationsReadUseCase({ member, notifications, isOnline });
    } catch (err) {
      setActionError(err.message || 'Gagal menandai semua notifikasi.');
    } finally {
      setMarkingAll(false);
    }
  }

  const timelineRoute = member?.role === ROLES.OWNER ? '/owner/activity' : '/operator/activity';

  return (
    <div className="notif-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className="btn notif-bell-btn"
        aria-label={`Notifikasi (${unreadCount} belum dibaca)`}
        aria-expanded={open}
        onClick={() => {
          setActionError('');
          setOpen((prev) => !prev);
        }}
      >
        <Bell size={16} aria-hidden="true" />
        {unreadCount > 0 && <span className="notif-badge-pill">{unreadCount}</span>}
      </button>

      {open && (
        <section className="notif-popover" aria-label="Pusat Notifikasi">
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'grid', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <strong style={{ fontSize: '14px' }}>Notifikasi ({unreadCount} baru)</strong>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!isOnline || markingAll}
                  onClick={handleMarkAllRead}
                >
                  <CheckCheck size={13} aria-hidden="true" />
                  <span>{markingAll ? 'Menyimpan...' : 'Tandai Dibaca'}</span>
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className={`tab-btn ${tab === 'all' ? 'active' : ''}`}
                style={{ minHeight: '30px', padding: '4px 10px', fontSize: '12px' }}
                onClick={() => setTab('all')}
              >
                Semua ({notifications.length})
              </button>
              <button
                type="button"
                className={`tab-btn ${tab === 'unread' ? 'active' : ''}`}
                style={{ minHeight: '30px', padding: '4px 10px', fontSize: '12px' }}
                onClick={() => setTab('unread')}
              >
                Belum Dibaca ({unreadCount})
              </button>
            </div>

            {(subError || actionError || fromCache) && (
              <div style={{ fontSize: '11px', color: 'var(--status-warning)' }}>
                {actionError ||
                  subError?.message ||
                  'Notifikasi ditampilkan dari cache lokal (offline).'}
              </div>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: '1 1 auto' }}>
            {loading ? (
              <div style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>
                Memuat notifikasi...
              </div>
            ) : visibleItems.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', display: 'grid', gap: '6px', justifyItems: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                <Inbox size={22} aria-hidden="true" />
                <span>
                  {tab === 'unread' ? 'Semua notifikasi sudah dibaca.' : 'Belum ada notifikasi in-app.'}
                </span>
              </div>
            ) : (
              visibleItems.map((item) => (
                <button
                  key={item.notificationId}
                  type="button"
                  className={`notif-item ${item.readAt == null ? 'unread' : ''}`}
                  onClick={() => handleSelectNotification(item)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '13px' }}>{item.title}</strong>
                    <span className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
                      {formatNotifTime(item.createdAt)}
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                    {item.message}
                  </span>
                </button>
              ))
            )}
          </div>

          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-input)' }}>
            <button
              type="button"
              className="btn btn-sm"
              style={{ width: '100%' }}
              onClick={() => {
                setOpen(false);
                navigate(timelineRoute);
              }}
            >
              <span>Buka Timeline Aktivitas Realtime</span>
              <ExternalLink size={13} aria-hidden="true" />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
