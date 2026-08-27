import { Mic, MicOff, Send } from 'lucide-react';
import { useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from '@shared/lib/logger';
import { Button } from '@shared/ui/button';

interface FileDropZoneProps {
  onSend: (text: string) => void;
  onFileDrop: (file: File) => void;
  disabled: boolean;
}

const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/csv',
  'application/pdf',
];

// SpeechRecognition is a browser API — not in TS lib by default
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  const win = window as unknown as Record<string, unknown>;
  const Ctor = win['SpeechRecognition'] ?? win['webkitSpeechRecognition'];
  if (typeof Ctor === 'function') {
    return Ctor as new () => SpeechRecognitionInstance;
  }
  return null;
}

export function FileDropZone({ onSend, onFileDrop, disabled }: FileDropZoneProps) {
  const { t } = useTranslation('featMgmt');
  const [text, setText] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (ACCEPTED_TYPES.includes(file.type)) {
        onFileDrop(file);
      } else {
        logger.warn('agent.fileDrop.unsupportedType', { fileType: file.type });
      }
    },
    [onFileDrop]
  );

  const toggleVoice = useCallback(() => {
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) {
      logger.warn('agent.voice.notSupported', {});
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    // eslint-disable-next-line i18next/no-literal-string -- BCP-47 speech-recognition locale code, not UI copy
    recognition.lang = 'es-MX';
    recognition.interimResults = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      setText((prev) => prev + transcript);
    };

    recognition.onerror = () => {
      logger.warn('agent.voice.recognitionError', {});
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }, [isListening]);

  return (
    <div
      data-testid="agent-file-dropzone"
      className={`relative border-t border-border p-2 transition-colors ${
        isDragOver ? 'border-2 border-dashed border-primary bg-primary/5' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary/10">
          <span className="text-sm text-primary">{t('agentChat.dropFileHere')}</span>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={t('agentChat.messagePlaceholder')}
          rows={1}
          className="min-h-[40px] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          style={{ maxHeight: '120px', overflowY: 'auto' }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleVoice}
          disabled={disabled}
          aria-label={
            isListening ? t('agentChat.stopVoiceRecordingAria') : t('agentChat.startVoiceRecordingAria')
          }
          className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          {isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          aria-label={t('agentChat.sendMessageAria')}
          className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
