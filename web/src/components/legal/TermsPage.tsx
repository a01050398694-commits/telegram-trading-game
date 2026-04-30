/**
 * Terms of Service page
 * Education-focused: paper trading, 18+, no gambling, no refunds on virtual money
 */
import { useTranslation } from 'react-i18next';

export function TermsPage() {
  const { t } = useTranslation();

  return (
    <div className="text-white">
      <h1 className="mb-6 text-2xl font-black tracking-tight">
        {t('legal.terms.title')}
      </h1>

      <div className="space-y-6 text-sm leading-relaxed text-white/80">
        {/* Section 1 */}
        <section>
          <h2 className="mb-3 font-bold text-white/95">
            {t('legal.terms.section1.title')}
          </h2>
          <p>{t('legal.terms.section1.body')}</p>
        </section>

        {/* Section 2 */}
        <section>
          <h2 className="mb-3 font-bold text-white/95">
            {t('legal.terms.section2.title')}
          </h2>
          <p>{t('legal.terms.section2.body')}</p>
        </section>

        {/* Section 3 */}
        <section>
          <h2 className="mb-3 font-bold text-white/95">
            {t('legal.terms.section3.title')}
          </h2>
          <p>{t('legal.terms.section3.body')}</p>
        </section>

        {/* Section 4 */}
        <section>
          <h2 className="mb-3 font-bold text-white/95">
            {t('legal.terms.section4.title')}
          </h2>
          <p>{t('legal.terms.section4.body')}</p>
        </section>

        {/* Section 5 */}
        <section>
          <h2 className="mb-3 font-bold text-white/95">
            {t('legal.terms.section5.title')}
          </h2>
          <p>{t('legal.terms.section5.body')}</p>
        </section>

        {/* Section 6 */}
        <section>
          <h2 className="mb-3 font-bold text-white/95">
            {t('legal.terms.section6.title')}
          </h2>
          <p>{t('legal.terms.section6.body')}</p>
        </section>
      </div>

      <div className="mt-8 border-t border-white/10 pt-4 text-xs text-white/50">
        {t('legal.terms.lastUpdated')}
      </div>
    </div>
  );
}
