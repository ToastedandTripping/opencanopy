"use client";

import { useEffect, useRef, useState } from "react";
import { useLoadingContext } from "@/contexts/LoadingContext";
import { getLayer } from "@/lib/layers";

/**
 * StatusToast — single dismissible error notification for hard layer failures.
 *
 * Shown only when at least one layer is in "error" status (B.4 precedence:
 * toast = error only). Auto-dismisses after 6 seconds. Manual dismiss resets
 * the dismissed set so a new error will surface again.
 *
 * Design: black/70 backdrop-blur, white/10 border, rounded-xl — matches the
 * MapLegend and LoadingBar on-brand aesthetic.
 *
 * aria-live="polite" so screen readers announce it without interrupting speech.
 */
export function StatusToast() {
  const { layerStatuses } = useLoadingContext();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Collect error layer IDs that haven't been dismissed
  const errorIds: string[] = [];
  for (const [id, status] of layerStatuses) {
    if (status === "error" && !dismissed.has(id)) {
      errorIds.push(id);
    }
  }

  const hasErrors = errorIds.length > 0;

  // Show/hide with a brief delay on appearance to avoid flash on transient errors
  useEffect(() => {
    if (hasErrors) {
      setVisible(true);
      // Auto-dismiss after 6s
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        setDismissed((prev) => {
          const next = new Set(prev);
          errorIds.forEach((id) => next.add(id));
          return next;
        });
        setVisible(false);
      }, 6000);
    } else {
      setVisible(false);
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasErrors, errorIds.join(",")]);

  // Clear dismissed set when errors are resolved (layer re-enabled or status changes)
  useEffect(() => {
    setDismissed((prev) => {
      if (prev.size === 0) return prev;
      const stillError = new Set<string>();
      for (const [id, status] of layerStatuses) {
        if (status === "error") stillError.add(id);
      }
      const next = new Set([...prev].filter((id) => stillError.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [layerStatuses]);

  const handleDismiss = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setDismissed((prev) => {
      const next = new Set(prev);
      errorIds.forEach((id) => next.add(id));
      return next;
    });
    setVisible(false);
  };

  if (!visible || !hasErrors) return null;

  const labels = errorIds
    .map((id) => getLayer(id)?.label ?? id)
    .join(", ");

  return (
    <div
      role="status"
      aria-live="polite"
      className="
        absolute bottom-28 right-3 z-40
        md:bottom-28
        flex items-start gap-2
        bg-black/70 backdrop-blur-md border border-white/10 rounded-xl
        px-3 py-2.5 max-w-[240px]
        pointer-events-auto
      "
    >
      {/* Warning icon */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        className="w-3.5 h-3.5 text-amber-500/80 shrink-0 mt-0.5"
      >
        <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>

      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-white/90 leading-snug">
          Couldn&apos;t reach BC data
        </p>
        {labels && (
          <p className="text-[10px] text-zinc-400 leading-snug mt-0.5 truncate">
            {labels}
          </p>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        className="w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-white transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-sm mt-0.5"
        aria-label="Dismiss error"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="w-2.5 h-2.5"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
