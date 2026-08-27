import { Button } from '@shared/ui/button';

interface CommandChipsProps {
  onSelect: (text: string) => void;
  userRole: string;
}

const CHIPS_BY_ROLE: Record<string, string[]> = {
  bartender: ['Ver menú', 'Ventas de hoy', 'Agregar producto'],
  cashier: ['Ver menú', 'Ventas de hoy', 'Agregar producto'],
  manager: ['Reporte de hoy', 'Diagnóstico', 'Ver errores recientes', '¿Cuántos productos hay?'],
  admin: ['Reporte de hoy', 'Diagnóstico', 'Ver errores recientes', '¿Cuántos productos hay?'],
};

function getChipsForRole(role: string): string[] {
  return CHIPS_BY_ROLE[role] ?? CHIPS_BY_ROLE['bartender'] ?? [];
}

export function CommandChips({ onSelect, userRole }: CommandChipsProps) {
  const chips = getChipsForRole(userRole);

  return (
    <div className="flex flex-wrap gap-2 px-3 py-2">
      {chips.map((chip) => (
        <Button
          key={chip}
          type="button"
          variant="outline"
          onClick={() => { onSelect(chip); }}
          className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {chip}
        </Button>
      ))}
    </div>
  );
}
