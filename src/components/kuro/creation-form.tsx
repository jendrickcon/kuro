"use client";

import type { FormEvent, RefObject } from "react";
import {
  INPUT_MAX_CHARS,
  INPUT_MIN_CHARS,
  type EpisodeLength,
  type Tone,
} from "@contracts/episode.schema";
import { FieldError } from "@/components/kuro/form-error";
import { KuromatePreview } from "@/components/kuro/kuromate-preview";
import { OptionSelector } from "@/components/kuro/option-selector";

const STUDY_EXAMPLE =
  "Explain opportunity cost using a college student choosing among studying, commuting, and part-time work.";
const QUIET_WARNING_CHARS = 2250;

export interface CreationFormProps {
  input: string;
  tone: Tone;
  length: EpisodeLength;
  hostCount: 2 | 3;
  isSubmitting: boolean;
  fieldError: string | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onInputChange: (value: string) => void;
  onToneChange: (tone: Tone) => void;
  onLengthChange: (length: EpisodeLength) => void;
  onHostCountChange: (hostCount: 2 | 3) => void;
  onSubmit: () => void;
  onTrySample: () => void;
  onBackHome?: () => void;
}

export function CreationForm({
  input,
  tone,
  length,
  hostCount,
  isSubmitting,
  fieldError,
  textareaRef,
  onInputChange,
  onToneChange,
  onLengthChange,
  onHostCountChange,
  onSubmit,
  onTrySample,
  onBackHome,
}: CreationFormProps) {
  const trimmedLen = input.trim().length;
  const isOverLimit = trimmedLen > INPUT_MAX_CHARS;
  const isApproachingLimit = !isOverLimit && trimmedLen >= QUIET_WARNING_CHARS;
  const describedBy = fieldError
    ? "kuro-topic-help kuro-char-count kuro-topic-error"
    : "kuro-topic-help kuro-char-count";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <section aria-label="Podcast generator" className="mx-auto w-full max-w-[920px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--kuro-ink)] sm:text-3xl">
            Create a new episode
          </h1>
          <p className="text-pretty-kuro text-xs text-[var(--kuro-ink-muted)] sm:text-sm">
            Paste study notes or enter a concept — choose your tone, episode length, and Kuromates.
          </p>
        </div>

        {onBackHome ? (
          <button
            type="button"
            onClick={onBackHome}
            className="kuro-interactive min-h-11 rounded-xl border border-[var(--kuro-border)] bg-[var(--kuro-surface)] px-3.5 py-2 text-xs font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)] sm:text-sm"
          >
            Back to Home
          </button>
        ) : null}
      </div>

      <KuromatePreview hostCount={hostCount} />

      <form onSubmit={handleSubmit} noValidate className="kuro-card space-y-4 p-4 sm:p-6">
        <div>
          <label
            htmlFor="kuro-topic-input"
            className="block text-sm font-bold text-[var(--kuro-ink)]"
          >
            Topic or pasted study material
          </label>
          <p id="kuro-topic-help" className="mt-1 text-xs text-[var(--kuro-ink-muted)]">
            Enter {INPUT_MIN_CHARS} to {INPUT_MAX_CHARS.toLocaleString()} characters — paste lecture
            notes, a reading excerpt, or a difficult study question.
          </p>

          <textarea
            ref={textareaRef}
            id="kuro-topic-input"
            rows={4}
            value={input}
            disabled={isSubmitting}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="Paste lecture notes or enter a study topic..."
            aria-invalid={Boolean(fieldError)}
            aria-describedby={describedBy}
            className={`mt-2 w-full rounded-xl border bg-[var(--kuro-surface)] px-3 py-2.5 text-base text-[var(--kuro-ink)] placeholder:text-[var(--kuro-ink-muted)]/75 disabled:bg-[var(--kuro-surface-muted)] ${
              fieldError
                ? "border-[var(--kuro-danger-border)]"
                : "border-[var(--kuro-border-strong)]"
            }`}
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => onInputChange(STUDY_EXAMPLE)}
                className="kuro-interactive min-h-11 rounded-xl border border-[var(--kuro-border)] bg-[var(--kuro-surface-muted)] px-3 py-2 text-left text-xs font-semibold text-[var(--kuro-ink)] hover:border-[var(--kuro-border-strong)] disabled:opacity-60"
              >
                Use study example: Opportunity cost
              </button>
              {input.length > 0 ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => onInputChange("")}
                  className="kuro-interactive min-h-11 rounded-xl border border-[var(--kuro-border)] bg-[var(--kuro-surface)] px-3 py-2 text-xs font-semibold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)] disabled:opacity-60"
                >
                  Clear
                </button>
              ) : null}
            </div>

            <span
              id="kuro-char-count"
              className={`font-mono-kuro text-xs font-semibold ${
                isOverLimit
                  ? "text-[var(--kuro-danger-ink)]"
                  : isApproachingLimit
                    ? "text-[var(--kuro-warn-ink)]"
                    : "text-[var(--kuro-ink-muted)]"
              }`}
            >
              {trimmedLen.toLocaleString()} / {INPUT_MAX_CHARS.toLocaleString()}
              {isApproachingLimit ? " (near limit)" : ""}
            </span>
          </div>

          <FieldError id="kuro-topic-error" message={fieldError} />
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <OptionSelector
            legend="Tone"
            options={[
              { value: "casual", label: "Casual" },
              { value: "serious", label: "Serious" },
            ]}
            selected={tone}
            disabled={isSubmitting}
            onSelect={onToneChange}
          />
          <OptionSelector
            legend="Kuromates"
            options={[
              { value: 2, label: "2 Kuromates" },
              { value: 3, label: "3 Kuromates" },
            ]}
            selected={hostCount}
            disabled={isSubmitting}
            onSelect={onHostCountChange}
          />
          <div className="sm:col-span-2">
            <OptionSelector
              legend="Length"
              options={[
                { value: "quick", label: "Quick", hint: "~8–10 turns" },
                { value: "detailed", label: "Detailed", hint: "~12–15 turns" },
              ]}
              selected={length}
              disabled={isSubmitting}
              onSelect={onLengthChange}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2.5 pt-1 sm:flex-row">
          <button
            type="submit"
            disabled={isSubmitting}
            className="kuro-interactive min-h-12 flex-1 rounded-xl bg-[var(--kuro-accent)] px-4 py-3 text-sm font-bold text-white hover:bg-[var(--kuro-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Preparing broadcast..." : "Create episode"}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onTrySample}
            className="kuro-interactive min-h-12 rounded-xl border border-[var(--kuro-border-strong)] bg-[var(--kuro-surface)] px-4 py-3 text-sm font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)] disabled:opacity-60"
          >
            Try a sample episode
          </button>
        </div>
      </form>
    </section>
  );
}
