"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

type ConfirmTone = "danger" | "warning" | "neutral";

type ConfirmRequest = {
  title: string;
  body: ReactNode;
  /** Default "Onayla". */
  confirmLabel?: string;
  /** Default "Vazgeç". */
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type Pending = ConfirmRequest & {
  resolve: (ok: boolean) => void;
};

/** Hook that returns a `confirm(opts) => Promise<boolean>` and the
 *  matching dialog element to render. Usage:
 *
 *    const { confirm, dialog } = useConfirm();
 *    ...
 *    if (await confirm({ title: "Sil?", body: "Geri alınamaz." })) doIt();
 *    ...
 *    return <>...{dialog}</>;
 *
 *  The dialog is rendered into the calling component's tree, so it
 *  inherits the page's font, theme, and z-index stack — no portal
 *  trickery needed for our use cases. */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback((opts: ConfirmRequest): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const dialog = pending ? (
    <ConfirmDialog
      request={pending}
      onResolve={(ok) => {
        pending.resolve(ok);
        setPending(null);
      }}
    />
  ) : null;

  return { confirm, dialog };
}

function ConfirmDialog({
  request,
  onResolve,
}: {
  request: ConfirmRequest;
  onResolve: (ok: boolean) => void;
}) {
  const tone: ConfirmTone = request.tone ?? "neutral";
  const confirmLabel = request.confirmLabel ?? "Onayla";
  const cancelLabel = request.cancelLabel ?? "Vazgeç";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onResolve(false);
      else if (e.key === "Enter") onResolve(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onResolve]);

  const confirmClass =
    tone === "danger"
      ? "bg-rose-500 hover:bg-rose-400 text-white"
      : tone === "warning"
      ? "bg-amber-500 hover:bg-amber-400 text-slate-900"
      : "bg-emerald-500 hover:bg-emerald-400 text-white";

  const accentBar =
    tone === "danger"
      ? "bg-rose-500"
      : tone === "warning"
      ? "bg-amber-500"
      : "bg-emerald-500";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      onClick={() => onResolve(false)}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <div className={`h-1 ${accentBar}`} />
        <div className="p-6">
          <div className="mb-3 flex items-start justify-between gap-3">
            <h3 className="text-lg font-semibold text-white">
              {request.title}
            </h3>
            <button
              type="button"
              onClick={() => onResolve(false)}
              aria-label="Kapat"
              className="rounded-md p-1 text-lg text-white/40 transition hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="text-sm leading-relaxed text-white/80">
            {request.body}
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => onResolve(false)}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-600"
              autoFocus
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => onResolve(true)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${confirmClass}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
