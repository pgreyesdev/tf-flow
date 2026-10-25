/** Clases compartidas de los botones y enlaces con aspecto de botón. */
const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-base font-semibold transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60";

export const buttonStyles = {
  primary: `${base} bg-accent text-on-accent hover:bg-accent-hover`,
  secondary: `${base} border border-border-strong bg-surface text-foreground hover:bg-surface-muted`,
  ghost: `${base} text-foreground hover:bg-surface-muted`,
} as const;

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
