"use client";

import { useState, type ReactNode } from "react";

type Side = "top" | "bottom";
type Align = "start" | "center" | "end";

/** Wraps any element with a hover tooltip. CSS-only on hover (no JS
 *  positioning needed for the simple cases) but the component also
 *  exposes show/hide via mouse + focus events so it's keyboard
 *  accessible. Anchoring is configurable so the bubble never falls
 *  off-screen for elements near the edges of the layout. */
export function Tooltip({
  children,
  label,
  side = "top",
  align = "center",
  width = 220,
  className = "",
}: {
  children: ReactNode;
  /** Bubble content. String renders as a single paragraph; ReactNode
   *  lets callers add a heading + body. */
  label: ReactNode;
  side?: Side;
  align?: Align;
  width?: number;
  /** Extra classes for the wrapper, e.g. for setting display:inline-flex. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const sideClass =
    side === "top"
      ? "bottom-full mb-2"
      : "top-full mt-2";
  const alignClass =
    align === "start"
      ? "left-0"
      : align === "end"
      ? "right-0"
      : "left-1/2 -translate-x-1/2";

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute z-50 ${sideClass} ${alignClass} rounded-lg border border-white/15 bg-slate-950/95 px-3 py-2 text-left text-[11px] leading-snug text-white shadow-xl backdrop-blur`}
          style={{ width }}
        >
          {label}
        </span>
      )}
    </span>
  );
}

/** Tooltip with a separate title + body for richer content. */
export function TitledTooltip({
  children,
  title,
  body,
  side = "top",
  align = "center",
  width = 220,
  accent = "amber",
  className = "",
}: {
  children: ReactNode;
  title: string;
  body: ReactNode;
  side?: Side;
  align?: Align;
  width?: number;
  accent?: "amber" | "emerald" | "indigo" | "rose";
  className?: string;
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-200"
      : accent === "indigo"
      ? "text-indigo-200"
      : accent === "rose"
      ? "text-rose-200"
      : "text-amber-200";
  return (
    <Tooltip
      side={side}
      align={align}
      width={width}
      className={className}
      label={
        <>
          <div className={`mb-1 text-xs font-semibold ${accentClass}`}>
            {title}
          </div>
          <div className="text-white/85">{body}</div>
        </>
      }
    >
      {children}
    </Tooltip>
  );
}
