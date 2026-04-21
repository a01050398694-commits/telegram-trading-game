import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type CandlestickData,
} from 'lightweight-charts';
import type { Candle } from '../lib/useBinanceFeed';

type TradingChartProps = {
  history: Candle[];
  ticking: Candle | null;
};

function toSeriesData(candles: Candle[]): CandlestickData[] {
  return candles.map((c) => ({
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
}

// lightweight-charts v5 — createChart + chart.addSeries(CandlestickSeries, ...)
// 초기 로드는 setData, 이후 실시간 틱은 update() 로 마지막 캔들을 갱신한다.
// update() 는 동일 시각이면 replace, 이후 시각이면 append 로 동작.
export function TradingChart({ history, ticking }: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.06)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.06)' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: 'rgba(148, 163, 184, 0.12)',
      },
      rightPriceScale: {
        borderColor: 'rgba(148, 163, 184, 0.12)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(148, 163, 184, 0.3)', width: 1, style: 3 },
        horzLine: { color: 'rgba(148, 163, 184, 0.3)', width: 1, style: 3 },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      lastTimeRef.current = 0;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || history.length === 0) return;
    series.setData(toSeriesData(history));
    lastTimeRef.current = history[history.length - 1]?.time ?? 0;
    chart.timeScale().fitContent();
  }, [history]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !ticking) return;
    // 과거 시각 데이터는 lightweight-charts 가 거부 — 가드.
    if (ticking.time < lastTimeRef.current) return;
    series.update({
      time: ticking.time as UTCTimestamp,
      open: ticking.open,
      high: ticking.high,
      low: ticking.low,
      close: ticking.close,
    });
    lastTimeRef.current = ticking.time;
  }, [ticking]);

  return <div ref={containerRef} className="h-full w-full" />;
}
