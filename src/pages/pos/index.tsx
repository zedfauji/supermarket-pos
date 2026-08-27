import { useTranslation } from 'react-i18next';
import { CheckoutPanel } from '@widgets/CheckoutPanel/ui/CheckoutPanel';
import { LogoImage } from '@widgets/LogoImage';
import { SectionHeader } from '@shared/ui';

export default function PosPage() {
  const { t } = useTranslation('pages');
  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="border-b px-4 py-3">
        <SectionHeader
          title={t('pos.title')}
          backTo="/home"
          action={<LogoImage alt={t('common.logoAlt')} className="h-12" />}
          className="border-none pb-0"
        />
      </div>
      <main className="min-h-0 flex-1">
        <CheckoutPanel />
      </main>
    </div>
  );
}
