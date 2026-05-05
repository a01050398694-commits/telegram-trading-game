import { useTranslation } from 'react-i18next';
import { formatUSD, formatMoney } from '../lib/format';
import type { ServerOrder } from '../lib/api';

type OpenOrdersCardProps = {
  orders: ServerOrder[];
  onCancelOrder: (orderId: string) => Promise<void>;
  onCancelAll: () => Promise<void>;
  pending?: boolean;
};

const statusColorMap: Record<string, string> = {
  pending: 'text-amber-400',
  filled: 'text-emerald-400',
  cancelled: 'text-slate-400',
  triggered: 'text-amber-400',
  expired: 'text-slate-400',
};

const statusLabelMap: Record<string, string> = {
  pending: 'Pending',
  filled: 'Filled',
  cancelled: 'Cancelled',
  triggered: 'Triggered',
  expired: 'Expired',
};

export function OpenOrdersCard({
  orders,
  onCancelOrder,
  onCancelAll,
  pending = false,
}: OpenOrdersCardProps) {
  const { t } = useTranslation();

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--color-surface-2)] p-4 text-center">
        <p className="text-sm text-slate-400">{t('orders.noOrders')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--color-surface-2)] p-3 space-y-2 max-h-[200px] overflow-y-auto">
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border-hairline)]">
        <span className="text-[11px] font-bold text-slate-400">
          {t('orders.open')} ({orders.length})
        </span>
        {orders.length > 0 && (
          <button
            type="button"
            onClick={() => void onCancelAll()}
            disabled={pending}
            className="text-[11px] font-bold text-rose-400 hover:text-rose-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {t('orders.cancelAll')}
          </button>
        )}
      </div>

      <div className="space-y-1">
        {orders.map((order) => (
          <div key={order.id} className="flex items-start justify-between gap-2 py-1.5 px-2 bg-slate-800/30 rounded-lg">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold text-white">
                {order.type.toUpperCase()} {order.side.toUpperCase()} {order.size} @ ${formatUSD(order.price)}
              </div>
              <div className={`text-[9px] font-bold mt-0.5 ${statusColorMap[order.status] || 'text-slate-400'}`}>
                {statusLabelMap[order.status] || order.status}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void onCancelOrder(order.id)}
              disabled={pending || order.status !== 'pending'}
              className="flex-shrink-0 text-rose-400 hover:text-rose-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-bold text-lg leading-none"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
