import { cx } from "@/lib/ui";

/** Marca de TF-FLOW: tres trazos que fluyen, como carriles que se ordenan. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cx("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="10" className="fill-white" />
      <path
        d="M7 21c4-6 8 2 12-4s4-5 6-5"
        className="stroke-sky-600"
        strokeWidth="2.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M7 14c3-3 6-1 9-2"
        className="stroke-night"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        opacity=".8"
      />
      <path
        d="M14 25c3-2 6-1 11-5"
        className="stroke-night"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        opacity=".45"
      />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-lg font-extrabold tracking-tight">TF-FLOW</span>
    </span>
  );
}
