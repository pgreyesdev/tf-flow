"use client";

import { useEffect, useRef } from "react";

/**
 * Número que cuenta desde cero cuando entra en pantalla. El servidor ya pinta el valor final, así
 * que sin JavaScript o con el movimiento reducido se ve tal cual. Los lectores de pantalla leen el
 * texto final, nunca los números intermedios.
 */
export function CountUp({
  value,
  decimals = 0,
  suffix = "",
  duration = 1400,
  className,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const format = (n: number) =>
    `${n.toLocaleString("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
  const final = format(value);

  useEffect(() => {
    const element = ref.current;
    if (
      !element ||
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) {
          return;
        }
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - t, 4);
          element.textContent = format(value * eased);
          if (t < 1) {
            frame = requestAnimationFrame(tick);
          }
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      element.textContent = final;
    };
    // `format` depende solo de estas props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, suffix, duration]);

  return (
    <span className={className}>
      <span className="sr-only">{final}</span>
      <span ref={ref} aria-hidden="true" className="tabular">
        {final}
      </span>
    </span>
  );
}
