import { Toaster } from 'sonner';
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
        <Toaster richColors position="top-right" />
        <Providers>
          <ClockDriftBanner />
          <Router />
        </Providers>
      </AppConfigProvider>
    </ErrorBoundary>
  );
}
