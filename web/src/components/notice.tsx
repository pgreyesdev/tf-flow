import { CircleAlert, Info } from "lucide-react";

import { cx } from "@/lib/ui";

export function Notice({
  tone,
  title,
  children,
}: {
  tone: "info" | "error";
  title: string;
  children: React.ReactNode;
}) {
  const Icon = tone === "error" ? CircleAlert : Info;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "flex gap-3 rounded-2xl border p-4 sm:p-5",
        tone === "error" ? "border-high/40 bg-high-soft" : "border-accent/30 bg-accent-soft",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cx("mt-0.5 size-5 shrink-0", tone === "error" ? "text-high" : "text-accent")}
      />
      <div>
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5 text-muted">{children}</div>
      </div>
    </div>
  );
}
