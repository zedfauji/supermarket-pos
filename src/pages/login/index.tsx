import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { EmployeeSelector } from '@widgets/EmployeeSelector/EmployeeSelector';
import { LogoImage } from '@widgets/LogoImage';
import { PINLoginForm } from '@widgets/PINLoginForm/PINLoginForm';
import { useLoginUiStore } from '@entities/staff/model/loginUiStore';
import { useStaffStore } from '@entities/staff/model/store';
import { ErrorBoundary } from '@shared/ui';

export default function LoginPage() {
  const { t } = useTranslation('pages');
  const selectedStaff = useLoginUiStore(s => s.selectedStaff);
  const isAuthenticated = useStaffStore(s => s.isAuthenticated);

  if (isAuthenticated) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <div className="flex h-16 items-center">
        <LogoImage alt={t('common.logoAlt')} className="h-16" />
      </div>
      <ErrorBoundary>{!selectedStaff ? <EmployeeSelector /> : <PINLoginForm />}</ErrorBoundary>
    </div>
  );
}
