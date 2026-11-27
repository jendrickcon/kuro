"use client";

import type { RefObject } from "react";

export function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="mt-2 rounded-lg border border-[var(--kuro-danger-border)] bg-[var(--kuro-danger-bg)] px-3 py-2 text-sm font-medium text-[var(--kuro-danger-ink)]"
    >
      {message}
    </p>
  );
}

export interface RecoverableErrorCardProps {
  message: string;
  retryable: boolean;
  containerRef?: RefObject<HTMLDivElement | null>;
  onRetry: () => void;
  onEdit: () => void;
  onTrySample?: () => void;
}

export function RecoverableErrorCard({
  message,
  retryable,
  containerRef,
  onRetry,
  onEdit,
  onTrySample,
}: RecoverableErrorCardProps) {
  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="alert"
      data-kuro-recovery-slot="form-error"
      className="rounded-2xl border-2 border-[var(--kuro-danger-border)] bg-[var(--kuro-danger-bg)] p-4 text-[var(--kuro-danger-ink)] focus:outline-none"
    >
      <p className="font-display text-sm font-extrabold">Could not create conversation</p>
      <p className="mt-1 text-sm">{message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {retryable ? (
          <button
            type="button"
            onClick={onRetry}
            className="kuro-interactive min-h-11 rounded-xl bg-[var(--kuro-danger-ink)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Try again
          </button>
        ) : null}
        <button
          type="button"
          onClick={onEdit}
          className="kuro-interactive min-h-11 rounded-xl border border-[var(--kuro-danger-border)] bg-[var(--kuro-surface)] px-4 py-2 text-sm font-semibold text-[var(--kuro-danger-ink)] hover:bg-[var(--kuro-surface-muted)]"
        >
          Edit notes
        </button>
        {onTrySample ? (
          <button
            type="button"
            onClick={onTrySample}
            className="kuro-interactive min-h-11 rounded-xl border border-[var(--kuro-danger-border)] bg-[var(--kuro-surface)] px-4 py-2 text-sm font-semibold text-[var(--kuro-danger-ink)] hover:bg-[var(--kuro-surface-muted)]"
          >
            Try a sample episode
          </button>
        ) : null}
      </div>
    </div>
  );
}
