import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '@shared/lib/i18n';
import { logError } from '@shared/lib/telemetry';
import { POSButton } from '@shared/ui/POSButton';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    void logError(error, { component: errorInfo.componentStack?.split('\n')[1]?.trim() });
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      // Class component — cannot use the useTranslation() hook. Uses the
      // imported i18n singleton's .t() directly (same pattern as non-component
      // consumers documented in @shared/lib/i18n/index.ts).
      return (
        <div className="p-6 bg-destructive/10 rounded-lg border border-destructive/20 text-center">
          <h2 className="text-lg font-bold text-destructive mb-2">
            {i18n.t('common:errorBoundary.title')}
          </h2>
          <p className="text-sm text-destructive/80 mb-4">{this.state.error?.message}</p>
          <POSButton
            touchSize="large"
            variant="default"
            onClick={() => {
              this.setState({ hasError: false });
            }}
          >
            {i18n.t('common:actions.tryAgain')}
          </POSButton>
        </div>
      );
    }

    return this.props.children;
  }
}
