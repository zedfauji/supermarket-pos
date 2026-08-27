import { useTranslation } from 'react-i18next';

import { POSButton } from './POSButton';

export type DateRangePickerProps = {
  fromStr: string;
  toStr: string;
  onChange: (fromStr: string, toStr: string) => void;
};

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${String(y)}-${m}-${day}`;
}

type Preset = { label: string; from: () => string; to: () => string };

const PRESETS: Preset[] = [
  {
    label: 'Today',
    from: () => toDateStr(new Date()),
    to: () => toDateStr(new Date()),
  },
  {
    label: 'Yesterday',
    from: () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return toDateStr(d);
    },
    to: () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return toDateStr(d);
    },
  },
  {
    label: 'Last 7 Days',
    from: () => {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return toDateStr(d);
    },
    to: () => toDateStr(new Date()),
  },
  {
    label: 'This Month',
    from: () => {
      const d = new Date();
      d.setDate(1);
      return toDateStr(d);
    },
    to: () => toDateStr(new Date()),
  },
];

export function DateRangePicker({ fromStr, toStr, onChange }: DateRangePickerProps) {
  const { t } = useTranslation('common');
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(preset => (
        <POSButton
          key={preset.label}
          variant="outline"
          touchSize="default"
          onClick={() => {
            onChange(preset.from(), preset.to());
          }}
        >
          {preset.label}
        </POSButton>
      ))}
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('dateRangePicker.from')}</span>
        <input
          type="date"
          value={fromStr}
          onChange={e => {
            onChange(e.target.value, toStr);
          }}
          className="h-11 rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('dateRangePicker.to')}</span>
        <input
          type="date"
          value={toStr}
          onChange={e => {
            onChange(fromStr, e.target.value);
          }}
          className="h-11 rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
    </div>
  );
}
