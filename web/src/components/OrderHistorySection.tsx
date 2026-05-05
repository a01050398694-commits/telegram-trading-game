import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatUSD } from '../lib/format';
import type { ServerOrder } from '../lib/api';

type OrderHistorySectionProps = {
  orders: ServerOrder[];
  loading?: boolean;
  error?: string | null;
};

const statusColorMap: Record<string, string> = {
  filled: 'text-emerald-400',
  cancelled: 'text-slate-400',
  triggered: 'text-amber-400',
  expired: 'text-slate-400',
};

export function OrderHistorySection({ orders, loading = false, error = null }: OrderHistorySectionProps) {
  const { t } = useTranslation();
  const [filterStatus, setFilterStatus] = useState<'all' | 'filled' | 'cancelled' | 'triggered'>('all');

  const filtered =
    filterStatus === 'all'
      ? orders
      : orders.filter((o) => o.status === filterStatus);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">
          {t('orders.history')}
        </span>
      </div>

      {/* Filter chips */}
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {(['all', 'filled', 'cancelled', 'triggered'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`flex-shrink-0 px-3 py-1 text-[10px] font-bold rounded-full transition-colors ${
              filterStatus === status
                ? 'bg-amber-500/20 text-amber-400 border border-amber-400/50'
                : 'bg-slate-700/30 text-slate-400 border border-slate-700/50'
            }`}
          >
            {status === 'all' ? 'All' : status === 'filled' ? 'Filled' : status === 'cancelled' ? 'Cancelled' : 'Triggered'}
          </button>
        ))}
      </div>

      {loading && <span className="text-[10px] text-slate-500">{t('common.loading')}</span>}

      {error && (
        <div className="mb-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] text-rose-300">
          {error}
        </div>
      )}

      {filtered.length === 0 && !loading && (
        <div className="py-6 text-center text-[11px] text-slate-500">
          {t('orders.noOrders')}
        </div>
      )}

      <div className="max-h-[250px] overflow-y-auto space-y-1">
        {filtered.map((order) => (
          <div
            key={order.id}
            className="flex items-start justify-between gap-2 py-1.5 px-2 bg-slate-800/20 rounded-lg border border-slate-700/30"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold text-white">
                {order.type.toUpperCase()} {order.side.toUpperCase()} {order.size} @ ${formatUSD(order.price)}
              </div>
              <div className={`text-[9px] mt-0.5 font-semibold ${statusColorMap[order.status] || 'text-slate-400'}`}>
                {new Date(order.createdAt).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
