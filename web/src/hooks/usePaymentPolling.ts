/**
 * Payment polling hook
 * Monitors localStorage for pending payment state, polls balance/is_premium changes
 * 10min timeout → separate timeout toast
 */
import { useEffect, useState, useCallback } from 'react';
import { fetchUserStatus } from '../lib/api';

const PAYMENT_POLL_INTERVAL = 5000; // 5s
const PAYMENT_TIMEOUT = 10 * 60 * 1000; // 10min

interface PaymentPollingState {
  isPending: boolean;
  confirmed: boolean;
  timedOut: boolean;
}

export function usePaymentPolling(
  telegramUserId: number | null,
  onConfirmed?: () => void,
  onTimeout?: () => void,
) {
  const [state, setState] = useState<PaymentPollingState>({
    isPending: false,
    confirmed: false,
    timedOut: false,
  });

  // Check if payment was started
  const checkPaymentStarted = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem('payment.pending.startedAt');
    if (!stored) return false;

    const startedAt = parseInt(stored, 10);
    const elapsed = Date.now() - startedAt;

    // Timeout check
    if (elapsed > PAYMENT_TIMEOUT) {
      localStorage.removeItem('payment.pending.startedAt');
      setState((prev) => ({ ...prev, timedOut: true }));
      onTimeout?.();
      return false;
    }

    return true;
  }, [onTimeout]);

  // Start payment
  const startPayment = useCallback((): void => {
    localStorage.setItem('payment.pending.startedAt', Date.now().toString());
    setState({ isPending: true, confirmed: false, timedOut: false });
  }, []);

  // Clear payment state
  const clearPayment = useCallback((): void => {
    localStorage.removeItem('payment.pending.startedAt');
    setState({ isPending: false, confirmed: false, timedOut: false });
  }, []);

  // Poll for balance/premium changes
  useEffect(() => {
    if (!telegramUserId || !checkPaymentStarted()) {
      return;
    }

    let lastBalance: string | null = null;
    let lastIsPremium: boolean | null = null;
    let pollTimer: number | null = null;

    const doPoll = async () => {
      try {
        const status = await fetchUserStatus(telegramUserId);
        const balance = status.balance?.toString() ?? null;
        const isPremium = status.isPremium ?? false;

        // First check — store baseline
        if (lastBalance === null) {
          lastBalance = balance;
          lastIsPremium = isPremium;
          return;
        }

        // Detect change → confirm payment
        if (balance !== lastBalance || isPremium !== lastIsPremium) {
          setState({ isPending: false, confirmed: true, timedOut: false });
          clearPayment();
          onConfirmed?.();
          return;
        }
      } catch (err) {
        // Silent error — continue polling
      }
    };

    // Poll every 5s
    pollTimer = window.setInterval(() => void doPoll(), PAYMENT_POLL_INTERVAL);

    // Initial check
    void doPoll();

    return () => {
      if (pollTimer !== null) clearInterval(pollTimer);
    };
  }, [telegramUserId, checkPaymentStarted, onConfirmed, clearPayment]);

  return {
    ...state,
    startPayment,
    clearPayment,
  };
}
