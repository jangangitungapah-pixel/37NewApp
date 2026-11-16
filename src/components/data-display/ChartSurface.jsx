import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../app/providers/themeContext.js';
import { cn } from '../../lib/utils/cn.js';
import { Skeleton } from '../ui/Skeleton.jsx';

const LIGHT_CHART_THEME = {
  textColor: '#566070',
  titleColor: '#171c26',
  borderColor: '#dfe3ea',
  splitLineColor: '#eceff4',
  tooltipBg: '#ffffff',
  tooltipBorder: '#dfe3ea',
  palette: ['#b87314', '#2563eb', '#15803d', '#9333ea', '#d97706'],
};

const DARK_CHART_THEME = {
  textColor: '#98a3b8',
  titleColor: '#eef2f7',
  borderColor: '#242b38',
  splitLineColor: '#1c222e',
  tooltipBg: '#161b26',
  tooltipBorder: '#2a3242',
  palette: ['#f2992c', '#38bdf8', '#22c55e', '#c084fc', '#f59e0b'],
};

let echartsInitPromise = null;

async function loadModularECharts() {
  if (!echartsInitPromise) {
    echartsInitPromise = Promise.all([
      import('echarts/core'),
      import('echarts/charts'),
      import('echarts/components'),
      import('echarts/renderers'),
    ]).then(([core, charts, components, renderers]) => {
      core.use([
        charts.LineChart,
        charts.BarChart,
        charts.PieChart,
        components.GridComponent,
        components.TooltipComponent,
        components.LegendComponent,
        renderers.CanvasRenderer,
      ]);
      return core;
    });
  }
  return echartsInitPromise;
}

/**
 * Modular, lazy-loaded Apache ECharts wrapper automatically synchronized
 * with the active Light/Dark theme, responsive ResizeObserver, and reduced-motion preference.
 */
export function ChartSurface({
  option,
  height = 280,
  ariaLabel = 'Grafik analitik',
  className,
  onReady,
}) {
  const containerRef = useRef(null);
  const instanceRef = useRef(null);
  const { resolvedTheme } = useTheme();
  const [ready, setReady] = useState(false);

  const paletteConfig = useMemo(
    () => (resolvedTheme === 'dark' ? DARK_CHART_THEME : LIGHT_CHART_THEME),
    [resolvedTheme]
  );

  const resolvedOption = useMemo(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    return {
      color: paletteConfig.palette,
      animation: !prefersReducedMotion,
      textStyle: {
        fontFamily: "'Geist Sans', 'Inter', system-ui, sans-serif",
        color: paletteConfig.textColor,
      },
      tooltip: {
        backgroundColor: paletteConfig.tooltipBg,
        borderColor: paletteConfig.tooltipBorder,
        borderWidth: 1,
        textStyle: {
          color: paletteConfig.titleColor,
          fontSize: 12,
        },
        ...(option?.tooltip || {}),
      },
      legend: option?.legend
        ? {
            textStyle: { color: paletteConfig.textColor },
            ...option.legend,
          }
        : undefined,
      ...option,
    };
  }, [option, paletteConfig]);

  useEffect(() => {
    let active = true;
    let resizeObserver = null;

    loadModularECharts().then((echartsCore) => {
      if (!active || !containerRef.current) return;
      const chart = echartsCore.init(containerRef.current);
      instanceRef.current = chart;
      setReady(true);
      onReady?.(chart);

      if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'function') {
        resizeObserver = new window.ResizeObserver(() => {
          chart.resize();
        });
        resizeObserver.observe(containerRef.current);
      }
    });

    return () => {
      active = false;
      resizeObserver?.disconnect();
      instanceRef.current?.dispose?.();
      instanceRef.current = null;
    };
  }, [onReady]);

  useEffect(() => {
    if (!ready || !instanceRef.current) return;
    instanceRef.current.setOption(resolvedOption, { notMerge: true });
  }, [ready, resolvedOption]);

  return (
    <div
      className={cn('relative w-full overflow-hidden rounded-xl', className)}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    >
      {!ready && <Skeleton className="absolute inset-0 rounded-xl" />}
      <div
        ref={containerRef}
        role="img"
        aria-label={ariaLabel}
        className="h-full w-full"
      />
    </div>
  );
}
