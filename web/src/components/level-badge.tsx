import { CircleCheck, OctagonAlert, TriangleAlert } from "lucide-react";

import type { Level } from "@/lib/api/schemas";
import { LEVEL_INFO } from "@/lib/levels";
import { cx } from "@/lib/ui";

const ICONS = { low: CircleCheck, medium: TriangleAlert, high: OctagonAlert } as const;

const TONES: Record<Level, string> = {
  low: "bg-low-soft text-low",
  medium: "bg-medium-soft text-medium",
  high: "bg-high-soft text-high",
};

export function LevelIcon({ level, className }: { level: Level; className?: string }) {
  const Icon = ICONS[level];
  return <Icon aria-hidden="true" strokeWidth={2} className={cx("size-4 shrink-0", className)} />;
}

export function LevelBadge({ level, size = "md" }: { level: Level; size?: "md" | "lg" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full font-semibold",
        size === "lg" ? "px-3.5 py-1.5 text-base" : "px-2.5 py-1 text-sm",
        TONES[level],
      )}
    >
      <LevelIcon level={level} className={size === "lg" ? "size-5" : undefined} />
      {LEVEL_INFO[level].label}
    </span>
  );
}
