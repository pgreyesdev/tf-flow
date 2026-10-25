import { cx } from "@/lib/ui";

/** Marca de TF-FLOW: tres trazos que fluyen, como carriles que se ordenan. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cx("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M7 21c4-6 8 2 12-4s4-5 6-5"
        className="stroke-accent"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M7 14c3-3 6-1 9-2"
        className="stroke-on-primary"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        opacity=".85"
      />
      <path
        d="M14 25c3-2 6-1 11-5"
        className="stroke-on-primary"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        opacity=".55"
      />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className="text-lg font-bold tracking-tight">
        TF<span className="text-accent">·</span>FLOW
      </span>
    </span>
  );
}
