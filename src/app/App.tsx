import { Toaster } from 'sonner';
import { IdleLockProvider } from '@features/idle-screen-lock';
import { ClockDriftBanner } from '@shared/ui/ClockDriftBanner';
import { ErrorBoundary } from '@shared/ui/ErrorBoundary';
import { OfflineBanner } from '@shared/ui/OfflineBanner';
import { AppConfigProvider } from './AppConfigProvider';
import { Providers } from './providers';
import { Router } from './router';

export function App() {
  return (
    <ErrorBoundary>
      <AppConfigProvider>
        <OfflineBanner />
        <Toaster
          richColors
          position="top-right"
          closeButton
          toastOptions={{
            classNames: {
              toast: 'rounded-xl border-border font-sans shadow-lg',
              title: 'font-medium',
              description: 'text-muted-foreground',
            },
          }}
        />
        <Providers>
          <ClockDriftBanner />
          <IdleLockProvider>
            <Router />
          </IdleLockProvider>
        </Providers>
      </AppConfigProvider>
    </ErrorBoundary>
  );
}
