import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { activateWithKey, importOfflineToken } from '@shared/lib/license/actions';
import { Input, Label, POSButton } from '@shared/ui';
import { Button } from '@shared/ui/button';
import { Textarea } from '@shared/ui/textarea';

interface Props {
  onDone?: (() => void) | undefined;
}

/**
 * Two paths to a licensed terminal: type the tenant's license key (online activation)
 * or paste a portal-issued offline token. Shared by the boot gate and Settings → License.
 */
export function LicenseActivationForm({ onDone }: Props) {
  const { t } = useTranslation('featMgmt');
  const [key, setKey] = useState('');
  const [token, setToken] = useState('');
  const [showOffline, setShowOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activate = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await activateWithKey(key);
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      if (res.error.code === 'NETWORK_OFFLINE') setShowOffline(true);
      return;
    }
    toast.success(
      t('activateLicense.activated', { tenant: res.data.tenant_name, plan: res.data.plan })
    );
    onDone?.();
  };

  const importToken = async () => {
    setBusy(true);
    setError(null);
    const res = await importOfflineToken(token);
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.success(
      t('activateLicense.imported', { date: new Date(res.data.lease_until).toLocaleDateString() })
    );
    onDone?.();
  };

  return (
    <div className="space-y-4" data-testid="license-activation-form">
      <form onSubmit={e => void activate(e)} className="space-y-2">
        <Label htmlFor="license-key">{t('activateLicense.keyLabel')}</Label>
        <div className="flex gap-2">
          <Input
            id="license-key"
            autoComplete="off"
            spellCheck={false}
            placeholder={t('activateLicense.keyPlaceholder')}
            className="font-mono uppercase tracking-wider"
            value={key}
            onChange={e => {
              setKey(e.target.value.toUpperCase());
            }}
          />
          <POSButton
            type="submit"
            touchSize="large"
            disabled={busy || key.replace(/[^0-9A-F]/gi, '').length !== 16}
          >
            {busy ? t('activateLicense.activating') : t('activateLicense.activate')}
          </POSButton>
        </div>
      </form>

      {error && (
        <p role="alert" className="text-sm text-destructive" data-testid="license-activation-error">
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="link"
        className="h-auto px-0 text-sm text-muted-foreground"
        onClick={() => {
          setShowOffline(v => !v);
        }}
      >
        {t('activateLicense.orOffline')}
      </Button>

      {showOffline && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t('activateLicense.offlineHint')}</p>
          <Label htmlFor="license-offline-token">{t('activateLicense.tokenLabel')}</Label>
          <Textarea
            id="license-offline-token"
            rows={5}
            spellCheck={false}
            className="font-mono text-xs"
            placeholder={t('activateLicense.tokenPlaceholder')}
            value={token}
            onChange={e => {
              setToken(e.target.value);
            }}
          />
          <POSButton
            type="button"
            variant="secondary"
            touchSize="large"
            disabled={busy || !token.includes('.')}
            onClick={() => void importToken()}
          >
            {t('activateLicense.import')}
          </POSButton>
        </div>
      )}
    </div>
  );
}
