/**
 * Business information footer
 * Company details, contact, and legal identifiers
 */
import { useTranslation } from 'react-i18next';
import { setLegalPage, type LegalPageKey } from '../../lib/legalRoute';

export function BusinessInfo() {
  const { t } = useTranslation();

  const handleLegalClick = (page: LegalPageKey) => {
    setLegalPage(page);
  };

  return (
    <div className="bg-slate-900/40 rounded-lg border border-white/10 p-4 text-xs text-white/60">
      <div className="space-y-2 mb-4">
        <div>
          <span className="font-semibold text-white/80">{t('legal.businessInfo.companyName')}</span>
          <span className="ml-2">{t('legal.businessInfo.companyValue')}</span>
        </div>
        <div>
          <span className="font-semibold text-white/80">{t('legal.businessInfo.representative')}</span>
          <span className="ml-2">{t('legal.businessInfo.representativeValue')}</span>
        </div>
        <div>
          <span className="font-semibold text-white/80">{t('legal.businessInfo.businessNumber')}</span>
          <span className="ml-2">{t('legal.businessInfo.businessNumberValue')}</span>
        </div>
        <div>
          <span className="font-semibold text-white/80">{t('legal.businessInfo.ecommerceLicense')}</span>
          <span className="ml-2">{t('legal.businessInfo.ecommerceLicenseValue')}</span>
        </div>
        <div>
          <span className="font-semibold text-white/80">{t('legal.businessInfo.address')}</span>
          <span className="ml-2">{t('legal.businessInfo.addressValue')}</span>
        </div>
        <div>
          <span className="font-semibold text-white/80">{t('legal.businessInfo.contact')}</span>
          <span className="ml-2">{t('errors.supportHandle')}</span>
        </div>
      </div>

      <div className="border-t border-white/10 pt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => handleLegalClick('terms')}
          className="text-blue-400 hover:text-blue-300 underline"
        >
          {t('legal.links.terms')}
        </button>
        <span className="text-white/30">·</span>
        <button
          type="button"
          onClick={() => handleLegalClick('privacy')}
          className="text-blue-400 hover:text-blue-300 underline"
        >
          {t('legal.links.privacy')}
        </button>
        <span className="text-white/30">·</span>
        <button
          type="button"
          onClick={() => handleLegalClick('refund')}
          className="text-blue-400 hover:text-blue-300 underline"
        >
          {t('legal.links.refund')}
        </button>
      </div>

      <div className="mt-3 text-[10px] text-white/40">
        © 2026 Trading Academy. All rights reserved.
      </div>
    </div>
  );
}
