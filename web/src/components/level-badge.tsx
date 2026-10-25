import { CircleCheck, OctagonAlert, TriangleAlert } from "lucide-react";

import type { Level } from "@/lib/api/schemas";
import { LEVEL_INFO } from "@/lib/levels";
import { cx } from "@/lib/ui";

const ICONS = { low: CircleCheck, medium: TriangleAlert, high: OctagonAlert } as const;

/** Colores sólidos con texto oscuro: se leen igual sobre cualquier cielo. */
export const LEVEL_CHIP: Record<Level, string> = {
  low: "bg-low text-low-ink",
  medium: "bg-medium text-medium-ink",
  high: "bg-high text-high-ink",
};

export const LEVEL_TEXT: Record<Level, string> = {
  low: "text-low",
  medium: "text-medium",
  high: "text-high",
};

export function LevelIcon({ level, className }: { level: Level; className?: string }) {
  const Icon = ICONS[level];
  return <Icon aria-hidden="true" strokeWidth={2.2} className={cx("size-4 shrink-0", className)} />;
}

export function LevelBadge({ level, size = "md" }: { level: Level; size?: "md" | "lg" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full font-bold",
        size === "lg" ? "px-3.5 py-1.5 text-base" : "px-2.5 py-0.5 text-sm",
        LEVEL_CHIP[level],
      )}
    >
      <LevelIcon level={level} className={size === "lg" ? "size-5" : undefined} />
      {LEVEL_INFO[level].label}
    </span>
  );
}
