import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

type HistoryData = {
  date: string;
  pnl: number;
};

export function PnLChart({ data }: { data: HistoryData[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-32 w-full items-center justify-center text-[11px] text-slate-500">
        최근 7일간의 기록이 없습니다
      </div>
    );
  }

  // 데이터 가공 (MM-DD)
  const chartData = data.map(d => ({
    name: d.date.split('-').slice(1).join('/'),
    pnl: d.pnl
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const val = payload[0].value;
      const color = val >= 0 ? '#34d399' : '#f87171';
      return (
        <div className="rounded-lg border border-white/10 bg-black/80 px-3 py-2 backdrop-blur-md">
          <p className="mb-1 text-[10px] font-bold text-slate-400">{label}</p>
          <p className="font-mono text-[13px] font-bold" style={{ color }}>
            {val >= 0 ? '+' : ''}${val.toLocaleString()}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
          <defs>
            <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
          <XAxis 
            dataKey="name" 
            tick={{ fontSize: 9, fill: '#64748b' }} 
            tickLine={false}
            axisLine={false}
            dy={5}
          />
          <YAxis 
            tick={{ fontSize: 9, fill: '#64748b' }} 
            tickLine={false}
            axisLine={false}
            tickFormatter={(val) => `$${val}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area 
            type="monotone" 
            dataKey="pnl" 
            stroke="#818cf8" 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorPnl)" 
            animationDuration={1500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
