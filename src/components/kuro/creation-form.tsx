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
    <div className="space-y-4">
      <KuromatePreview hostCount={hostCount} />

      <form
        onSubmit={handleSubmit}
        noValidate
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5"
      >
        <div>
          <label htmlFor="kuro-topic-input" className="block text-sm font-bold text-slate-950">
            Topic or pasted study material
          </label>
          <p id="kuro-topic-help" className="mt-1 text-xs text-slate-600">
            Enter {INPUT_MIN_CHARS} to {INPUT_MAX_CHARS.toLocaleString()} characters — paste class
            notes, a reading excerpt, or a topic you want explained.
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
            className={`mt-2 w-full rounded-xl border bg-white px-3 py-2.5 text-base text-slate-950 placeholder:text-slate-500 disabled:bg-slate-100 ${
              fieldError ? "border-red-500" : "border-slate-300"
            }`}
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => onInputChange(STUDY_EXAMPLE)}
                className="min-h-11 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
              >
                Use study example: Opportunity cost
              </button>
              {input.length > 0 ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => onInputChange("")}
                  className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Clear
                </button>
              ) : null}
            </div>

            <span
              id="kuro-char-count"
              className={`text-xs font-semibold ${
                isOverLimit
                  ? "text-red-700"
                  : isApproachingLimit
                    ? "text-amber-800"
                    : "text-slate-600"
              }`}
            >
              {trimmedLen.toLocaleString()} / {INPUT_MAX_CHARS.toLocaleString()}
              {isApproachingLimit ? " (approaching limit)" : ""}
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
            legend="Hosts"
            options={[
              { value: 2, label: "2 hosts" },
              { value: 3, label: "3 hosts" },
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

        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <button
            type="submit"
            disabled={isSubmitting}
            className="min-h-12 flex-1 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Preparing conversation..." : "Create conversation"}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onTrySample}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
          >
            Try sample episode
          </button>
        </div>

        <p className="text-xs text-slate-600">
          Current build uses the mock WP-004 episode service and returns validated sample episodes.
        </p>
      </form>
    </div>
  );
}
