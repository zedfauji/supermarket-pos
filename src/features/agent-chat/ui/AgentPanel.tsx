import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStaffStore } from '@entities/staff/model/store';
import { Badge } from '@shared/ui/badge';
import { Button } from '@shared/ui/button';
import { useAgentStore } from '../model/agentStore';
import { useAgent } from '../model/useAgent';
import { CommandChips } from './CommandChips';
import { ConfirmActionCard } from './ConfirmActionCard';
import { FileDropZone } from './FileDropZone';
import { ImportPreviewTable } from './ImportPreviewTable';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';

export function AgentPanel() {
  const { t } = useTranslation('featMgmt');
  const {
    isOpen,
    messages,
    isTyping,
    close,
    sendMessage,
    handleFileImport,
    pendingImportProducts,
    confirmImport,
    pendingConfirmation,
    confirmAction,
    cancelAction,
  } = useAgent();
  const setPendingImportProducts = useAgentStore((s) => s.setPendingImportProducts);

  const userRole = useStaffStore((s) => s.currentStaff?.role ?? 'bartender');
  const bottomRef = useRef<HTMLDivElement>(null);

  const agentEnabled = import.meta.env['VITE_AGENT_ENABLED'] as string | undefined;

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, isOpen]);

  if (agentEnabled === 'false') return null;

  const handleFileDrop = (file: File) => {
    void handleFileImport(file);
  };

  return (
    <div
      role="dialog"
      aria-label={t('agentChat.assistantAria')}
      aria-modal="false"
      className={`fixed right-0 top-0 z-50 flex h-screen w-full flex-col bg-background shadow-2xl transition-transform ease-in-out md:w-[380px] ${
        isOpen ? 'translate-x-0 duration-500' : 'translate-x-full duration-300'
      }`}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{t('agentChat.assistantTitle')}</span>
          <Badge variant="secondary" className="text-xs">
            {userRole}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={close}
          aria-label={t('agentChat.closeAssistantAria')}
          className="size-8"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Messages area */}
      <div className="flex flex-1 flex-col overflow-y-auto py-2">
        {messages.length === 0 && (
          <CommandChips onSelect={(text) => { void sendMessage(text); }} userRole={userRole} />
        )}
        {messages.map((msg, idx) => (
          <MessageBubble key={idx} message={msg} />
        ))}
        {isTyping && (
          <div className="flex justify-start px-3 py-1">
            <div className="rounded-2xl border border-border bg-card">
              <TypingIndicator />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Destructive action confirmation */}
      {pendingConfirmation !== null && (
        <div className="shrink-0 px-3 pb-2">
          <ConfirmActionCard
            pending={pendingConfirmation}
            onConfirm={() => { void confirmAction(pendingConfirmation.token); }}
            onCancel={() => { void cancelAction(pendingConfirmation.token); }}
            isLoading={isTyping}
          />
        </div>
      )}

      {/* Import preview */}
      {pendingImportProducts !== null && pendingImportProducts.length > 0 && (
        <div className="shrink-0 px-3 pb-2">
          <ImportPreviewTable
            products={pendingImportProducts}
            onConfirm={() => { void confirmImport(); }}
            onCancel={() => { setPendingImportProducts(null); }}
            isLoading={isTyping}
          />
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0">
        <FileDropZone
          onSend={(text) => { void sendMessage(text); }}
          onFileDrop={handleFileDrop}
          disabled={isTyping}
        />
      </div>
    </div>
  );
}
