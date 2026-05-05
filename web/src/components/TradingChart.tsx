import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type CandlestickData,
  type LineData,
  type HistogramData,
} from 'lightweight-charts';
import type { Candle } from '../lib/useBinanceFeed';

type TradingChartProps = {
  history: Candle[];
  ticking: Candle | null;
  interval?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  indicators?: { ma20: boolean; volume: boolean };
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

function calculateMA20(candles: Candle[]): (LineData | null)[] {
  return candles.map((_, idx) => {
    if (idx < 19) return null;
    const sum = candles.slice(idx - 19, idx + 1).reduce((acc, c) => acc + c.close, 0);
    const ma20 = sum / 20;
    return {
      time: candles[idx]!.time as UTCTimestamp,
      value: ma20,
    };
  });
}

// Map real Binance volume to histogram series. Color based on candle direction.
function volumeData(candles: Candle[]): HistogramData[] {
  return candles.map((c) => ({
    time: c.time as UTCTimestamp,
    value: c.volume,
    // Green if close >= open (up candle), red otherwise
    color: c.close >= c.open ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
  }));
}

// lightweight-charts v5 — createChart + chart.addSeries(CandlestickSeries, ...)
// 초기 로드는 setData, 이후 실시간 틱은 update() 로 마지막 캔들을 갱신한다.
// update() 는 동일 시각이면 replace, 이후 시각이면 append 로 동작.
// Stage 17: interval reactive + MA20 line series + Volume histogram series
export function TradingChart({
  history,
  ticking,
  interval = '1m',
  indicators = { ma20: false, volume: true },
}: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // Type-safe series refs: avoid generic constraints by using flexible union
  const seriesRef = useRef<ISeriesApi<'Candlestick' | 'Bar' | 'Area' | 'Line' | 'Histogram' | 'Baseline'> | null>(null);
  const ma20SeriesRef = useRef<ISeriesApi<'Candlestick' | 'Bar' | 'Area' | 'Line' | 'Histogram' | 'Baseline'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Candlestick' | 'Bar' | 'Area' | 'Line' | 'Histogram' | 'Baseline'> | null>(null);
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

    const candlestick = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });

    // Volume histogram series — 차트 하단 분리 scale
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: 'rgba(52, 211, 153, 0.2)',
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    seriesRef.current = candlestick;
    volumeSeriesRef.current = volumeSeries;
    ma20SeriesRef.current = null;

    return () => {
      if (ma20SeriesRef.current) {
        chart.removeSeries(ma20SeriesRef.current);
        ma20SeriesRef.current = null;
      }
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      lastTimeRef.current = 0;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!series || !chart || history.length === 0) return;

    series.setData(toSeriesData(history));

    // Volume histogram
    if (volumeSeries) {
      volumeSeries.setData(volumeData(history));
    }

    lastTimeRef.current = history[history.length - 1]?.time ?? 0;
    chart.timeScale().fitContent();
  }, [history]);

  // MA20 line series 추가/제거 (indicators.ma20 에 따라)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || history.length === 0) return;

    if (indicators.ma20) {
      // MA20 추가
      if (!ma20SeriesRef.current) {
        const ma20Series = chart.addSeries(LineSeries, {
          color: 'rgba(167, 139, 250, 0.7)',
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        });
        ma20SeriesRef.current = ma20Series;
        const ma20Values = calculateMA20(history).filter(Boolean) as LineData[];
        ma20Series.setData(ma20Values);
      }
    } else {
      // MA20 제거
      if (ma20SeriesRef.current) {
        chart.removeSeries(ma20SeriesRef.current);
        ma20SeriesRef.current = null;
      }
    }
  }, [indicators.ma20, history]);

  useEffect(() => {
    const series = seriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
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
    // Volume histogram real-time update
    if (volumeSeries && indicators.volume) {
      volumeSeries.update({
        time: ticking.time as UTCTimestamp,
        value: ticking.volume,
        color: ticking.close >= ticking.open ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
      });
    }
    lastTimeRef.current = ticking.time;
  }, [ticking, indicators.volume]);

  return <div ref={containerRef} className="h-full w-full" />;
}
