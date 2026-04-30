/**
 * Privacy Policy page
 * GDPR/PIPA/CCPA compliant disclosure of data collection and processing
 */
import { useTranslation } from 'react-i18next';

export function PrivacyPage() {
  const { t } = useTranslation();

  return (
    <div className="text-white">
      <h1 className="mb-6 text-2xl font-black tracking-tight">
        {t('legal.privacy.title')}
      </h1>

      <div className="space-y-6 text-sm leading-relaxed text-white/80">
        {/* Section 1 */}
        <section>
          <h2 className="mb-3 font-bold text-white/95">
            {t('legal.privacy.section1.title')}
          </h2>
          <p>{t('legal.privacy.section1.body')}</p>
        </section>

        {/* Section 2 */}
        <section>
          <h2 className="mb-3 font-bold text-white/95">
            {t('legal.privacy.section2.title')}
          </h2>
          <p>{t('legal.privacy.section2.body')}</p>
        </section>

        {/* Section 3 */}
        <section>
          <h2 className="mb-3 font-bold text-white/95">
            {t('legal.privacy.section3.title')}
          </h2>
          <p>{t('legal.privacy.section3.body')}</p>
        </section>

        {/* Section 4 */}
        <section>
          <h2 className="mb-3 font-bold text-white/95">
            {t('legal.privacy.section4.title')}
          </h2>
          <p>{t('legal.privacy.section4.body')}</p>
        </section>

        {/* Section 5 */}
        <section>
          <h2 className="mb-3 font-bold text-white/95">
            {t('legal.privacy.section5.title')}
          </h2>
          <p>{t('legal.privacy.section5.body')}</p>
        </section>

        {/* Section 6 */}
        <section>
          <h2 className="mb-3 font-bold text-white/95">
            {t('legal.privacy.section6.title')}
          </h2>
          <p>{t('legal.privacy.section6.body')}</p>
        </section>
      </div>

      <div className="mt-8 border-t border-white/10 pt-4 text-xs text-white/50">
        {t('legal.privacy.lastUpdated')}
      </div>
    </div>
  );
}
