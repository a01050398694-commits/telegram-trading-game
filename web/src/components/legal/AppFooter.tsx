/**
 * App footer with business info and legal links
 */
import { useTranslation } from 'react-i18next';
import { setLegalPage, type LegalPageKey } from '../../lib/legalRoute';

export function AppFooter() {
  const { t } = useTranslation();

  const handleLegalClick = (page: LegalPageKey) => {
    setLegalPage(page);
  };

  return (
    <div className="border-t border-white/10 bg-slate-950/40 px-4 py-4 text-center">
      <div className="mb-3 text-xs font-bold text-white/60">
        Trading Academy
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-[10px] text-white/40">
        <button
          type="button"
          onClick={() => handleLegalClick('terms')}
          className="text-blue-400 hover:text-blue-300 underline"
        >
          {t('legal.links.terms')}
        </button>
        <span>·</span>
        <button
          type="button"
          onClick={() => handleLegalClick('privacy')}
          className="text-blue-400 hover:text-blue-300 underline"
        >
          {t('legal.links.privacy')}
        </button>
        <span>·</span>
        <button
          type="button"
          onClick={() => handleLegalClick('refund')}
          className="text-blue-400 hover:text-blue-300 underline"
        >
          {t('legal.links.refund')}
        </button>
      </div>
      <div className="text-[9px] text-white/30">
        © 2026 Trading Academy. All rights reserved.
      </div>
    </div>
  );
}
