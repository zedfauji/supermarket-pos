import { useTranslation } from 'react-i18next';
import { useLoginUiStore } from '@entities/staff/model/loginUiStore';
import { useStaffList } from '@entities/staff/model/queries';
import type { Staff } from '@entities/staff/model/types';
import { LoadingSpinner } from '@shared/ui/LoadingSpinner';
import { Button } from '@shared/ui/button';

export function EmployeeSelector() {
  const { t } = useTranslation('wPanels');
  const { data: staff, isLoading, error, resultError } = useStaffList();
  const hasError = Boolean(error || resultError);
  const errorMessage = resultError?.message ?? error?.message ?? t('employeeSelector.unknownError');
  const setSelectedStaff = useLoginUiStore(s => s.setSelectedStaff);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="text-center text-destructive p-8">
        {t('employeeSelector.failedToLoadStaff')} {errorMessage}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-sm">
      <h2 className="font-heading text-2xl font-semibold tracking-tight text-center">
        {t('employeeSelector.whoAreYou')}
      </h2>
      <div className="flex flex-col gap-2">
        {(staff ?? []).map((member: Staff) => (
          <Button
            key={member.id}
            type="button"
            variant="outline"
            onClick={() => {
              setSelectedStaff(member);
            }}
            className="flex h-auto items-center justify-start gap-3 rounded-lg border border-border bg-card p-4 text-left hover:bg-accent transition-colors"
          >
            <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
              {member.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-semibold">{member.name}</div>
              <div className="text-sm text-muted-foreground capitalize">{member.role}</div>
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
