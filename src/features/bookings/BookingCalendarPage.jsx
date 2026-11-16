import { useCallback, useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
} from 'lucide-react';
import { useAuthSession } from '../../app/providers/authSessionContext.js';
import { subscribeBusinessSettings } from '../../data/repositories/businessProfileRepository.js';
import { subscribeServices } from '../../data/repositories/serviceRepository.js';
import { subscribeStudiosForMember } from '../../data/repositories/studioRepository.js';
import {
  subscribeActiveSlotsForStudioDay,
  subscribeBookingsInRange,
} from '../../data/repositories/bookingRepository.js';
import {
  BOOKING_STATUS,
  ROLES,
  SETTING_IDS,
  STUDIO_STATUS,
} from '../../domain/enums/roles.js';
import {
  addDaysToDateKey,
  buildCalendarTimeRows,
  buildStartTimeOptions,
  formatDateKeyLabel,
  getTodayDateKey,
  getWeekDateKeys,
} from '../../domain/calculations/slotGenerator.js';
import {
  canOperateStudioBooking,
  filterAccessibleStudios,
} from '../../domain/policies/accessPolicy.js';
import { parseTimeToMinutes } from '../../domain/validators/masterDataValidators.js';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { StatusAlert } from '../../shared/components/StatusFeedback.jsx';
import { useRegistrySubscription } from '../../shared/hooks/useRegistrySubscription.js';
import { formatIdr, formatOperatingHours } from '../../shared/utils/formatters.js';
import { BookingDetailModal } from './BookingDetailModal.jsx';
import { CreateBookingModal } from './CreateBookingModal.jsx';
import { getBookingStatusMeta } from './bookingStatusUi.js';

export function BookingCalendarPage() {
  const { member, business, isOnline } = useAuthSession();
  const tz = business?.timezone || 'Asia/Jakarta';
  const todayKey = getTodayDateKey(tz);

  const [viewMode, setViewMode] = useState('week'); // 'week' | 'day'
  const [anchorDateKey, setAnchorDateKey] = useState(todayKey);
  const [selectedStudioFilter, setSelectedStudioFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active_all'); // 'active_all' | 'all' | specific status

  const [createPrefill, setCreatePrefill] = useState(null); // { studioId, dateKey, startTime } | null
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [feedback, setFeedback] = useState({ variant: '', title: '', message: '' });

  const assignedKey = (member?.assignedStudioIds || []).join(',');

  // 1. Studios scoped by role
  const subscribeStudios = useCallback(
    ({ onData, onError }) => {
      if (!member?.businessId) return () => {};
      return subscribeStudiosForMember({
        businessId: member.businessId,
        member,
        onData,
        onError,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [member?.businessId, member?.role, assignedKey],
  );
  const { data: rawStudios } = useRegistrySubscription(
    'phase03:calendar:studios',
    member?.businessId ? subscribeStudios : null,
    [],
  );
  const accessibleStudios = useMemo(
    () => filterAccessibleStudios(member, rawStudios),
    [member, rawStudios],
  );
  const activeStudios = useMemo(
    () => accessibleStudios.filter((s) => s.status === STUDIO_STATUS.ACTIVE),
    [accessibleStudios],
  );

  // 2. Active Services catalog
  const subscribeServiceCatalog = useCallback(
    ({ onData, onError }) => {
      if (!member?.businessId) return () => {};
      return subscribeServices({ businessId: member.businessId, onData, onError });
    },
    [member?.businessId],
  );
  const { data: services } = useRegistrySubscription(
    'phase03:calendar:services',
    member?.businessId ? subscribeServiceCatalog : null,
    [],
  );

  // 3. Settings (schedule, pricing, commission, bookingPolicy)
  const subscribeSettings = useCallback(
    ({ onData, onError }) => {
      if (!member?.businessId) return () => {};
      return subscribeBusinessSettings({ businessId: member.businessId, onData, onError });
    },
    [member?.businessId],
  );
  const { data: settingsMap } = useRegistrySubscription(
    'phase03:calendar:settings',
    member?.businessId ? subscribeSettings : null,
    {},
  );

  // Resolve date window
  const weekDateKeys = useMemo(() => getWeekDateKeys(anchorDateKey), [anchorDateKey]);
  const visibleDateKeys = useMemo(
    () => (viewMode === 'week' ? weekDateKeys : [anchorDateKey]),
    [viewMode, weekDateKeys, anchorDateKey],
  );
  const rangeStartKey = visibleDateKeys[0];
  const rangeEndKey = visibleDateKeys[visibleDateKeys.length - 1];

  const effectiveStudioFilter = useMemo(() => {
    if (
      selectedStudioFilter !== 'all' &&
      accessibleStudios.some((s) => s.studioId === selectedStudioFilter)
    ) {
      return selectedStudioFilter;
    }
    return 'all';
  }, [accessibleStudios, selectedStudioFilter]);

  // 4. Realtime Bookings Subscription in window
  const subscribeBookings = useCallback(
    ({ onData, onError }) => {
      if (!member?.businessId) return () => {};
      return subscribeBookingsInRange({
        businessId: member.businessId,
        member,
        studioId: effectiveStudioFilter,
        startDateKey: rangeStartKey,
        endDateKey: rangeEndKey,
        onData,
        onError,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [member?.businessId, member?.role, assignedKey, effectiveStudioFilter, rangeStartKey, rangeEndKey],
  );

  const {
    data: rawBookings,
    loading: bookingsLoading,
    fromCache,
    possiblyTruncated,
    metadata: bookingQueryMetadata,
    error: bookingsError,
  } = useRegistrySubscription(
    'phase03:calendar:bookings',
    member?.businessId ? subscribeBookings : null,
    [],
  );

  // Focused studio for quick mobile slot pills
  const focusedStudio = useMemo(() => {
    if (effectiveStudioFilter !== 'all') {
      return activeStudios.find((s) => s.studioId === effectiveStudioFilter) || null;
    }
    return activeStudios[0] || null;
  }, [activeStudios, effectiveStudioFilter]);

  const subscribeFocusedSlots = useCallback(
    ({ onData, onError }) => {
      if (!member?.businessId || !focusedStudio?.studioId) return () => {};
      return subscribeActiveSlotsForStudioDay({
        businessId: member.businessId,
        studioId: focusedStudio.studioId,
        dateKey: anchorDateKey,
        onData,
        onError,
      });
    },
    [member?.businessId, focusedStudio?.studioId, anchorDateKey],
  );
  const { data: focusedDaySlots } = useRegistrySubscription(
    'phase03:calendar:focused-slots',
    member?.businessId && focusedStudio?.studioId ? subscribeFocusedSlots : null,
    [],
  );
  const focusedOccupiedBuckets = useMemo(
    () => new Set(focusedDaySlots.map((slot) => slot.bucketIndex)),
    [focusedDaySlots],
  );

  const filteredBookings = useMemo(() => {
    return rawBookings.filter((b) => {
      if (statusFilter === 'active_all') {
        return ![BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW, BOOKING_STATUS.REJECTED].includes(b.status);
      }
      if (statusFilter === 'all') {
        return true;
      }
      return b.status === statusFilter;
    });
  }, [rawBookings, statusFilter]);

  // Operating hours rows covering business/focused studio hours
  const scheduleHours = useMemo(() => {
    const selectedObj =
      effectiveStudioFilter !== 'all'
        ? accessibleStudios.find((s) => s.studioId === effectiveStudioFilter)
        : null;
    return (
      selectedObj?.operatingHours ||
      settingsMap?.[SETTING_IDS.SCHEDULE]?.operatingHours ||
      { openTime: '10:00', closeTime: '22:00' }
    );
  }, [accessibleStudios, effectiveStudioFilter, settingsMap]);

  const timeRows = useMemo(
    () => buildCalendarTimeRows({ operatingHours: scheduleHours, stepMinutes: 30 }),
    [scheduleHours],
  );

  const mobileQuickStartOptions = useMemo(() => {
    if (!focusedStudio) return [];
    return buildStartTimeOptions({
      operatingHours: focusedStudio.operatingHours,
      slotGranularityMinutes: focusedStudio.slotGranularityMinutes || 15,
    });
  }, [focusedStudio]);

  const canCreateBooking = Boolean(
    activeStudios.some((s) => canOperateStudioBooking(member, s.studioId)),
  );

  // Group bookings for desktop cell rendering: starts inside [row.minutes, row.minutes + 30)
  function getBookingsStartingInRow(dateKey, rowMinutes, studioIdMatch = null) {
    return filteredBookings.filter((b) => {
      if (b.dateKey !== dateKey) return false;
      if (studioIdMatch && b.studioId !== studioIdMatch) return false;
      const startMins = parseTimeToMinutes(b.startTime, 'startTime');
      return startMins >= rowMinutes && startMins < rowMinutes + 30;
    });
  }

  function handleNavigate(delta) {
    const stepDays = viewMode === 'week' ? 7 * delta : delta;
    setAnchorDateKey((prev) => addDaysToDateKey(prev, stepDays));
  }

  const mobileDayBookings = useMemo(
    () =>
      filteredBookings
        .filter((b) => b.dateKey === anchorDateKey)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [filteredBookings, anchorDateKey],
  );

  // Desktop columns: 7 days in Week mode; active Studios in Day mode when 'all', else selected date
  const desktopColumns = useMemo(() => {
    if (viewMode === 'week') {
      return weekDateKeys.map((dKey) => {
        const meta = formatDateKeyLabel(dKey);
        return {
          key: dKey,
          dateKey: dKey,
          studioId: focusedStudio?.studioId || '',
          studioFilterMatch: null,
          title: meta.shortLabel,
          subtitle: dKey,
          isToday: dKey === todayKey,
        };
      });
    }
    if (effectiveStudioFilter === 'all' && activeStudios.length > 0) {
      return activeStudios.map((studio) => ({
        key: studio.studioId,
        dateKey: anchorDateKey,
        studioId: studio.studioId,
        studioFilterMatch: studio.studioId,
        title: studio.name,
        subtitle: formatOperatingHours(studio.operatingHours),
        isToday: anchorDateKey === todayKey,
      }));
    }
    const meta = formatDateKeyLabel(anchorDateKey);
    return [
      {
        key: anchorDateKey,
        dateKey: anchorDateKey,
        studioId: focusedStudio?.studioId || '',
        studioFilterMatch: null,
        title: meta.fullLabel,
        subtitle: focusedStudio ? focusedStudio.name : 'Jadwal Harian',
        isToday: anchorDateKey === todayKey,
      },
    ];
  }, [viewMode, weekDateKeys, effectiveStudioFilter, activeStudios, anchorDateKey, focusedStudio, todayKey]);

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Kalender & Booking Studio</h1>
          <p className="page-subtitle">
            Jadwal realtime dalam zona waktu <span className="mono">{tz}</span> · Reservasi slot transaksi untuk alur resmi aplikasi.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          disabled={!canCreateBooking}
          onClick={() =>
            setCreatePrefill({
              studioId: focusedStudio?.studioId || '',
              dateKey: anchorDateKey,
              startTime: '10:00',
            })
          }
        >
          <CalendarPlus size={16} aria-hidden="true" />
          <span>Booking Baru</span>
        </button>
      </header>

      {feedback.message && (
        <StatusAlert
          variant={feedback.variant}
          title={feedback.title}
          message={feedback.message}
        />
      )}

      {bookingsError && (
        <StatusAlert
          variant="danger"
          title="Gagal Memuat Jadwal"
          message={bookingsError.message}
        />
      )}

      {fromCache && (
        <StatusAlert
          variant="warning"
          title="Menampilkan Data Cache Lokal"
          message="Jadwal berasal dari cache lokal perangkat. Pastikan tersambung sebelum mengubah booking."
        />
      )}

      {possiblyTruncated && (
        <StatusAlert
          variant="warning"
          title="Jadwal yang Ditampilkan Mungkin Belum Lengkap"
          message={bookingQueryMetadata?.truncatedChunks
            ? `Sedikitnya satu dari ${bookingQueryMetadata.chunkCount} kelompok studio mencapai batas ${bookingQueryMetadata.limitPerChunk} booking. Persempit filter studio atau rentang tanggal sebelum mengambil keputusan operasional.`
            : `Query kalender mencapai batas ${bookingQueryMetadata?.limit || 150} booking. Persempit filter studio atau rentang tanggal sebelum mengambil keputusan operasional.`}
        />
      )}

      {!isOnline && (
        <StatusAlert
          variant="danger"
          title="Mode Offline"
          message="Kalender tetap dapat dilihat dari cache jika tersedia, tetapi pembuatan, reschedule, dan pembatalan booking diblokir saat offline."
        />
      )}

      {member?.role === ROLES.OPERATOR && accessibleStudios.length === 0 && (
        <StatusAlert
          variant="warning"
          title="Belum Ada Studio Ditugaskan"
          message="Akun Operator Anda belum ditugaskan ke studio mana pun oleh Owner."
        />
      )}

      {/* Calendar Controls Bar */}
      <section className="panel" style={{ padding: '14px', display: 'grid', gap: '12px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <div className="tabs" style={{ borderBottom: 0, paddingBottom: 0 }}>
              <button
                type="button"
                className={`tab-btn ${viewMode === 'week' ? 'active' : ''}`}
                onClick={() => setViewMode('week')}
              >
                <CalendarIcon size={14} aria-hidden="true" />
                <span>Mingguan</span>
              </button>
              <button
                type="button"
                className={`tab-btn ${viewMode === 'day' ? 'active' : ''}`}
                onClick={() => setViewMode('day')}
              >
                <Clock size={14} aria-hidden="true" />
                <span>Harian</span>
              </button>
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Periode sebelumnya"
              onClick={() => handleNavigate(-1)}
            >
              <ChevronLeft size={15} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAnchorDateKey(todayKey)}
            >
              Hari Ini
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Periode berikutnya"
              onClick={() => handleNavigate(1)}
            >
              <ChevronRight size={15} aria-hidden="true" />
            </Button>

            <Input
              type="date"
              aria-label="Pilih tanggal acuan"
              className="w-auto min-w-36"
              value={anchorDateKey}
              onChange={(event) => {
                if (event.target.value) setAnchorDateKey(event.target.value);
              }}
            />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <Filter size={14} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
            <SelectField
              aria-label="Filter studio"
              className="min-w-40"
              value={effectiveStudioFilter}
              onValueChange={setSelectedStudioFilter}
              options={[
                { value: 'all', label: `Semua Studio (${accessibleStudios.length})` },
                ...accessibleStudios.map((studio) => ({ value: studio.studioId, label: studio.name })),
              ]}
            />

            <SelectField
              aria-label="Filter status booking"
              className="min-w-52"
              value={statusFilter}
              onValueChange={setStatusFilter}
              options={[
                { value: 'active_all', label: 'Aktif & Terjadwal' },
                { value: 'all', label: 'Semua Status' },
                { value: BOOKING_STATUS.PENDING_CONFIRMATION, label: 'Pending Konfirmasi' },
                { value: BOOKING_STATUS.CONFIRMED, label: 'Terkonfirmasi' },
                { value: BOOKING_STATUS.IN_PROGRESS, label: 'Legacy: In Progress' },
                { value: BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT, label: 'Menunggu Settlement' },
                { value: BOOKING_STATUS.SETTLEMENT_REVIEW, label: 'Review Settlement' },
                { value: BOOKING_STATUS.SETTLED, label: 'Settled / Lunas' },
                { value: BOOKING_STATUS.REJECTED, label: 'Ditolak' },
                { value: BOOKING_STATUS.CANCELLED, label: 'Dibatalkan' },
                { value: BOOKING_STATUS.NO_SHOW, label: 'No-Show' },
              ]}
            />
          </div>
        </div>
      </section>

      {/* DESKTOP CALENDAR GRID (Date/Studio columns x Operating Hours rows) */}
      <section className="calendar-desktop-view" aria-label="Grid Kalender Desktop">
        <div className="calendar-grid-scroll">
          <table className="calendar-grid-table">
            <thead>
              <tr>
                <th className="calendar-grid-time-col">Jam WIB</th>
                {desktopColumns.map((col) => (
                  <th
                    key={col.key}
                    className={`calendar-col-header ${col.isToday ? 'today' : ''}`}
                  >
                    <div style={{ fontWeight: 700 }}>{col.title}</div>
                    <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {col.subtitle}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeRows.map((row) => (
                <tr key={row.timeHHmm}>
                  <th scope="row" className="calendar-grid-time-col mono">
                    {row.timeHHmm}
                  </th>
                  {desktopColumns.map((col) => {
                    const cellBookings = getBookingsStartingInRow(
                      col.dateKey,
                      row.minutes,
                      col.studioFilterMatch,
                    );
                    const targetStudioId = col.studioId || focusedStudio?.studioId || '';
                    return (
                      <td
                        key={`${col.key}_${row.timeHHmm}`}
                        className={`calendar-cell ${canCreateBooking && cellBookings.length === 0 ? 'calendar-cell-free' : ''}`}
                      >
                        <div className="grid gap-1">
                          {cellBookings.length === 0 && canCreateBooking && targetStudioId && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="min-h-12 w-full whitespace-normal text-xs text-muted-foreground hover:text-foreground"
                              aria-label={`Buat booking ${col.dateKey} pukul ${row.timeHHmm} di studio ${targetStudioId}`}
                              onClick={() => setCreatePrefill({
                                studioId: targetStudioId,
                                dateKey: col.dateKey,
                                startTime: row.timeHHmm,
                              })}
                            >
                              + Booking
                            </Button>
                          )}
                          {cellBookings.map((b) => {
                            const meta = getBookingStatusMeta(b.status);
                            return (
                              <button
                                key={b.bookingId}
                                type="button"
                                className={`booking-chip status-${b.status}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedBookingId(b.bookingId);
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                                  <span className="mono" style={{ fontWeight: 700, fontSize: '11px' }}>
                                    {b.startTime}–{b.endTime}
                                  </span>
                                  <span style={{ fontSize: '10px', color: 'var(--accent-brass)' }}>
                                    {b.studioSnapshot?.code || ''}
                                  </span>
                                </div>
                                <strong style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {b.customerSnapshot?.name}
                                </strong>
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                  {b.serviceSnapshot?.name} · {meta.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* MOBILE OPERATIONAL AGENDA (Designed specifically for small screens) */}
      <section className="calendar-mobile-view" aria-label="Agenda Kalender Mobile">
        <div className="mobile-date-strip">
          {weekDateKeys.map((dKey) => {
            const label = formatDateKeyLabel(dKey);
            const count = filteredBookings.filter((b) => b.dateKey === dKey).length;
            return (
              <button
                key={dKey}
                type="button"
                className={`mobile-date-pill ${dKey === anchorDateKey ? 'active' : ''}`}
                onClick={() => setAnchorDateKey(dKey)}
              >
                <span style={{ fontSize: '11px', fontWeight: 700 }}>{label.shortLabel}</span>
                <span className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  {count} booking
                </span>
              </button>
            );
          })}
        </div>

        {focusedStudio && canCreateBooking && (
          <div className="panel" style={{ padding: '12px', display: 'grid', gap: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Quick Slot · {focusedStudio.name} ({formatDateKeyLabel(anchorDateKey).shortLabel})
            </div>
            <div className="slot-chips-wrap">
              {mobileQuickStartOptions.map((opt) => {
                const isOccupied = focusedOccupiedBuckets.has(opt.bucketIndex);
                return (
                  <button
                    key={opt.timeHHmm}
                    type="button"
                    disabled={isOccupied}
                    className={`slot-chip ${isOccupied ? 'occupied' : 'free'}`}
                    onClick={() =>
                      setCreatePrefill({
                        studioId: focusedStudio.studioId,
                        dateKey: anchorDateKey,
                        startTime: opt.timeHHmm,
                      })
                    }
                  >
                    {opt.timeHHmm}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: '10px' }}>
          {bookingsLoading ? (
            <div className="panel" style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>
              Memuat jadwal hari ini...
            </div>
          ) : mobileDayBookings.length === 0 ? (
            <div className="empty-state">
              <strong style={{ fontSize: '15px' }}>Tidak Ada Booking</strong>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Tap salah satu Quick Slot atau tombol Booking Baru untuk membuat jadwal.
              </span>
            </div>
          ) : (
            mobileDayBookings.map((b) => {
              const meta = getBookingStatusMeta(b.status);
              return (
                <button
                  key={b.bookingId}
                  type="button"
                  className="panel"
                  style={{
                    textAlign: 'left',
                    padding: '14px',
                    display: 'grid',
                    gap: '6px',
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedBookingId(b.bookingId)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span className="mono" style={{ fontWeight: 700, fontSize: '13px', color: 'var(--accent-brass)' }}>
                      {b.startTime}–{b.endTime} WIB ({b.durationMinutes}m)
                    </span>
                    <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
                  </div>
                  <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>
                    {b.customerSnapshot?.name}
                  </strong>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {b.studioSnapshot?.name} · {b.serviceSnapshot?.name} · {formatIdr(b.priceSnapshot?.totalMinor)}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      {createPrefill && (
        <CreateBookingModal
          key={`${createPrefill.studioId}_${createPrefill.dateKey}_${createPrefill.startTime}`}
          onClose={() => setCreatePrefill(null)}
          member={member}
          business={business}
          isOnline={isOnline}
          studios={accessibleStudios}
          services={services}
          settingsMap={settingsMap}
          prefillStudioId={createPrefill.studioId}
          prefillDateKey={createPrefill.dateKey}
          prefillStartTime={createPrefill.startTime}
          onCreated={(created) =>
            setFeedback({
              variant: 'success',
              title: 'Booking Berhasil Dibuat',
              message: `${created.customerSnapshot.name} pada ${created.dateKey} ${created.startTime}–${created.endTime} WIB (${created.slotIds.length} slot terkunci).`,
            })
          }
        />
      )}

      {(() => {
        const selectedBooking = selectedBookingId
          ? rawBookings.find((b) => b.bookingId === selectedBookingId) || null
          : null;
        if (!selectedBooking) return null;
        return (
          <BookingDetailModal
            key={`${selectedBooking.bookingId}_${selectedBooking.rescheduleCount}_${selectedBooking.status}`}
            booking={selectedBooking}
            onClose={() => setSelectedBookingId(null)}
            member={member}
            business={business}
            isOnline={isOnline}
            studios={accessibleStudios}
            services={services}
            settingsMap={settingsMap}
            onMutated={(msg) =>
              setFeedback({
                variant: 'success',
                title: 'Booking Diperbarui',
                message: msg,
              })
            }
          />
        );
      })()}
    </div>
  );
}
