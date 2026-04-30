/**
 * Refund Policy page
 * Clear conditions: Recharge (1K/5K/10K) one-time non-refundable,
 * Premium ($39.99) 7-day unused refund window, used = non-refundable
 */
import { useTranslation } from 'react-i18next';

export function RefundPage() {
  const { t } = useTranslation();

  return (
    <div className="text-white">
      <h1 className="mb-6 text-2xl font-black tracking-tight">
        {t('legal.refund.title')}
      </h1>

      <div className="space-y-6 text-sm leading-relaxed text-white/80">
        {/* Section 1 */}
        <section>
          <h2 className="mb-3 font-bold text-white/95">
            {t('legal.refund.section1.title')}
          </h2>
          <p>{t('legal.refund.section1.body')}</p>
        </section>

        {/* Section 2 */}
        <section>
          <h2 className="mb-3 font-bold text-white/95">
            {t('legal.refund.section2.title')}
          </h2>
          <p>{t('legal.refund.section2.body')}</p>
        </section>

        {/* Section 3 */}
        <section>
          <h2 className="mb-3 font-bold text-white/95">
            {t('legal.refund.section3.title')}
          </h2>
          <p>{t('legal.refund.section3.body')}</p>
        </section>

        {/* Section 4 */}
        <section>
          <h2 className="mb-3 font-bold text-white/95">
            {t('legal.refund.section4.title')}
          </h2>
          <p>{t('legal.refund.section4.body')}</p>
        </section>

        {/* Section 5 */}
        <section>
          <h2 className="mb-3 font-bold text-white/95">
            {t('legal.refund.section5.title')}
          </h2>
          <p>{t('legal.refund.section5.body')}</p>
        </section>
      </div>

      <div className="mt-8 border-t border-white/10 pt-4 text-xs text-white/50">
        {t('legal.refund.lastUpdated')}
      </div>
    </div>
  );
}
