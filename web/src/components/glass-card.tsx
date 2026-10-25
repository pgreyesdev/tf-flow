import type { LucideIcon } from "lucide-react";

import { cx } from "@/lib/ui";

interface GlassCardProps {
  title: string;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
}

/** Tarjeta de cristal con un título pequeño, como las de una app del tiempo. */
export function GlassCard({ title, icon: Icon, className, children }: GlassCardProps) {
  return (
    <section className={cx("glass p-4 sm:p-5", className)}>
      <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-ink-soft uppercase">
        {Icon && <Icon aria-hidden="true" className="size-3.5" />}
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}
