/**
 * Legal page overlay container
 * Fixed inset-0 z-50, body scroll lock, Esc + backdrop close
 */
import { useEffect } from 'react';
import { useLegalPage } from '../../lib/legalRoute';

interface LegalLayoutProps {
  children: React.ReactNode;
  onClose: () => void;
}

export function LegalLayout({ children, onClose }: LegalLayoutProps) {
  useEffect(() => {
    // Lock body scroll
    document.body.style.overflow = 'hidden';

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-white/10 bg-slate-950/80 px-4 py-3 backdrop-blur">
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-xs font-bold text-white/60 hover:bg-white/5 hover:text-white transition"
        >
          ✕ Close
        </button>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto max-w-2xl px-4 py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
