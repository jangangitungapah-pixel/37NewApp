import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { formatIdr } from '../../../shared/utils/formatters.js';

const METRIC_OPTIONS = {
  BOOKINGS: 'bookings',
  REVENUE: 'revenue',
  CASH: 'cash',
};

/**
 * Lightweight, dependency-free SVG trend chart for bounded daily/bucketed analytics.
 */
export function MetricTrendChart({ points = [], isOwner = false }) {
  const [metric, setMetric] = useState(METRIC_OPTIONS.BOOKINGS);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const safeMetric = !isOwner && metric !== METRIC_OPTIONS.BOOKINGS ? METRIC_OPTIONS.BOOKINGS : metric;

  const { maxVal, bars, activePoint } = useMemo(() => {
    const getValue = (point) => {
      if (safeMetric === METRIC_OPTIONS.REVENUE) {
        return Number(point.settledRevenueMinor || 0);
      }
      if (safeMetric === METRIC_OPTIONS.CASH) {
        return Math.max(0, Number(point.netCashMinor || 0));
      }
      return Number(point.blockingBookings || 0);
    };

    const computedMax = Math.max(1, ...points.map(getValue));
    const width = 640;
    const height = 160;
    const padX = 12;
    const usableW = width - padX * 2;
    const step = points.length > 0 ? usableW / points.length : usableW;
    const barW = Math.max(4, Math.min(24, step * 0.68));

    const mappedBars = points.map((point, idx) => {
      const value = getValue(point);
      const ratio = computedMax > 0 ? value / computedMax : 0;
      const barHeight = value > 0 ? Math.max(4, Math.round(ratio * (height - 24))) : 2;
      const x = padX + idx * step + (step - barW) / 2;
      const y = height - 8 - barHeight;
      return {
        ...point,
        idx,
        value,
        x,
        y,
        width: barW,
        height: barHeight,
      };
    });

    const chosen =
      selectedIndex >= 0 && selectedIndex < mappedBars.length
        ? mappedBars[selectedIndex]
        : mappedBars[mappedBars.length - 1] || null;

    return { maxVal: computedMax, bars: mappedBars, activePoint: chosen };
  }, [points, safeMetric, selectedIndex]);

  const firstLabel = points[0]?.shortLabel || '-';
  const midLabel = points.length > 2 ? points[Math.floor(points.length / 2)]?.shortLabel : '';
  const lastLabel = points[points.length - 1]?.shortLabel || '-';

  return (
    <section className="panel" style={{ display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart3 size={18} color="var(--accent-brass)" aria-hidden="true" />
          <h2 style={{ margin: 0, fontSize: '16px' }}>Tren Aktivitas Harian</h2>
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }} role="group" aria-label="Pilih metrik grafik">
          <button
            type="button"
            className={`btn btn-sm ${safeMetric === METRIC_OPTIONS.BOOKINGS ? 'btn-primary' : ''}`}
            onClick={() => setMetric(METRIC_OPTIONS.BOOKINGS)}
          >
            Booking Aktif
          </button>
          {isOwner && (
            <>
              <button
                type="button"
                className={`btn btn-sm ${safeMetric === METRIC_OPTIONS.REVENUE ? 'btn-primary' : ''}`}
                onClick={() => setMetric(METRIC_OPTIONS.REVENUE)}
              >
                Recognized Revenue
              </button>
              <button
                type="button"
                className={`btn btn-sm ${safeMetric === METRIC_OPTIONS.CASH ? 'btn-primary' : ''}`}
                onClick={() => setMetric(METRIC_OPTIONS.CASH)}
              >
                Net Cash Masuk
              </button>
            </>
          )}
        </div>
      </div>

      {points.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
          Belum ada data rentang tanggal untuk ditampilkan.
        </p>
      ) : (
        <>
          <div
            style={{
              width: '100%',
              background: 'var(--bg-input)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              padding: '10px',
            }}
          >
            <svg
              viewBox="0 0 640 164"
              width="100%"
              height="164"
              role="img"
              aria-label={`Grafik batang tren ${safeMetric === METRIC_OPTIONS.BOOKINGS ? 'jumlah booking aktif' : 'nilai finansial'} pada rentang terpilih`}
              style={{ display: 'block', overflow: 'visible' }}
            >
              <line x1="12" y1="20" x2="628" y2="20" stroke="var(--border-subtle)" strokeDasharray="3 3" />
              <line x1="12" y1="88" x2="628" y2="88" stroke="var(--border-subtle)" strokeDasharray="3 3" />
              <line x1="12" y1="156" x2="628" y2="156" stroke="var(--border-subtle)" />

              {bars.map((bar) => {
                const isSelected = activePoint?.dateKey === bar.dateKey;
                const fillColor =
                  bar.value === 0
                    ? 'var(--border-subtle)'
                    : isSelected
                      ? 'var(--accent-brass)'
                      : safeMetric === METRIC_OPTIONS.BOOKINGS
                        ? '#38bdf8'
                        : '#22c55e';
                const tooltipValue =
                  safeMetric === METRIC_OPTIONS.BOOKINGS
                    ? `${bar.value} booking (${bar.bookedMinutes} mnt)`
                    : formatIdr(bar.value);

                return (
                  <g key={bar.dateKey}>
                    <rect
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={bar.height}
                      rx={3}
                      fill={fillColor}
                      opacity={isSelected ? 1 : 0.85}
                      tabIndex={0}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setSelectedIndex(bar.idx)}
                      onFocus={() => setSelectedIndex(bar.idx)}
                      onClick={() => setSelectedIndex(bar.idx)}
                    >
                      <title>{`${bar.shortLabel} (${bar.dateKey}): ${tooltipValue}`}</title>
                    </rect>
                  </g>
                );
              })}
            </svg>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: 'var(--text-muted)',
                padding: '4px 6px 0',
              }}
              className="mono"
            >
              <span>{firstLabel}</span>
              {midLabel && <span>{midLabel}</span>}
              <span>{lastLabel}</span>
            </div>
          </div>

          {activePoint && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
                fontSize: '13px',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span>
                Detail Titik: <strong className="mono">{activePoint.dateKey}</strong> ({activePoint.shortLabel})
              </span>
              <span className="mono" style={{ color: 'var(--accent-brass)' }}>
                {activePoint.blockingBookings} booking aktif · {Math.round(activePoint.bookedMinutes / 60 * 10) / 10} jam terpakai
                {isOwner &&
                  ` · Revenue Settled ${formatIdr(activePoint.settledRevenueMinor || 0)} · Net Cash ${formatIdr(
                    activePoint.netCashMinor || 0,
                  )}`}
              </span>
              <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Puncak skala: {safeMetric === METRIC_OPTIONS.BOOKINGS ? `${maxVal} booking` : formatIdr(maxVal)}
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
