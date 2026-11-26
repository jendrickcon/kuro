"use client";

import type { RefObject } from "react";

export function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900"
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
      className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-red-950 focus:outline-none"
    >
      <p className="text-sm font-bold">Could not create conversation</p>
      <p className="mt-1 text-sm text-red-900">{message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {retryable ? (
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold text-white hover:bg-red-900"
          >
            Try again
          </button>
        ) : null}
        <button
          type="button"
          onClick={onEdit}
          className="min-h-11 rounded-lg border border-red-400 bg-white px-4 py-2 text-sm font-semibold text-red-950 hover:bg-red-100"
        >
          Edit input
        </button>
        {onTrySample ? (
          <button
            type="button"
            onClick={onTrySample}
            className="min-h-11 rounded-lg border border-red-400 bg-white px-4 py-2 text-sm font-semibold text-red-950 hover:bg-red-100"
          >
            Try sample episode
          </button>
        ) : null}
      </div>
    </div>
  );
}
