import { useTranslation } from 'react-i18next';

import { PRESETS, type Preset } from './DateRangePicker.presets';
import { POSButton } from './POSButton';

export type DateRangePickerProps = {
  fromStr: string;
  toStr: string;
  onChange: (fromStr: string, toStr: string) => void;
  /** Optional preset override. Defaults to the backward-looking PRESETS (Reports' own
   *  call sites keep compiling and behaving identically). The promotion wizard passes
   *  PROMOTION_DATE_PRESETS instead (D-07's forward-looking-validity requirement). */
  presets?: Preset[];
};

export function DateRangePicker({
  fromStr,
  toStr,
  onChange,
  presets = PRESETS,
}: DateRangePickerProps) {
  const { t } = useTranslation('common');
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map(preset => (
        <POSButton
          key={preset.labelKey}
          variant="outline"
          touchSize="default"
          onClick={() => {
            onChange(preset.from(), preset.to());
          }}
        >
          {t(preset.labelKey)}
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
