import { Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@shared/ui/button';
import { useAgentStore } from '../model/agentStore';

export function AgentButton() {
  const { t } = useTranslation('featMgmt');
  const toggle = useAgentStore((s) => s.toggle);
  const hasUnread = useAgentStore((s) => s.hasUnread);

  const agentEnabled = import.meta.env['VITE_AGENT_ENABLED'] as string | undefined;
  if (agentEnabled === 'false') return null;

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={toggle}
      aria-label={t('agentChat.openAssistantAria')}
      className="fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
    >
      {hasUnread && (
        <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-75" />
      )}
      <Bot className="size-6" />
    </Button>
  );
}
