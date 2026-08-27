import { useTranslation } from 'react-i18next';
import { HomeDashboard } from '@widgets/HomeDashboard';
import { LogoImage } from '@widgets/LogoImage';

export default function HomePage() {
  const { t } = useTranslation('pages');
  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-16 items-center justify-center border-b px-4">
        <div className="flex h-12 items-center">
          <LogoImage alt={t('common.logoAlt')} className="h-12" />
        </div>
      </header>
      <div className="flex flex-1 overflow-auto">
        <HomeDashboard />
      </div>
    </div>
  );
}
