/** Clases compartidas de los botones y enlaces con aspecto de botón. */
const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-base font-bold transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50";

export const buttonStyles = {
  primary: `${base} bg-white text-night hover:bg-white/85`,
  secondary: `${base} glass text-ink hover:bg-glass-strong`,
  ghost: `${base} text-ink hover:bg-glass`,
} as const;

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
