"use client";

import type { FormEvent } from "react";
import {
  INPUT_MAX_CHARS,
  INPUT_MIN_CHARS,
  type EpisodeLength,
  type Tone,
} from "@contracts/episode.schema";

const STUDY_EXAMPLE =
  "Explain opportunity cost using a college student choosing among studying, commuting, and part-time work.";

interface OptionItem<T extends string | number> {
  value: T;
  label: string;
}

function BinaryOptionGroup<T extends string | number>({
  legend,
  options,
  selected,
  disabled,
  onSelect,
}: {
  legend: string;
  options: [OptionItem<T>, OptionItem<T>];
  selected: T;
  disabled: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-semibold text-slate-900">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => {
          const isSelected = selected === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => onSelect(opt.value)}
              className={`min-h-11 rounded-lg border-2 px-3 py-2 text-sm transition-colors disabled:opacity-60 ${
                isSelected
                  ? "border-slate-900 bg-slate-900 font-semibold text-white"
                  : "border-slate-300 bg-white font-medium text-slate-800 hover:border-slate-500"
              }`}
            >
              {isSelected ? `✓ ${opt.label}` : opt.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export interface CreationFormProps {
  input: string;
  tone: Tone;
  length: EpisodeLength;
  hostCount: 2 | 3;
  isSubmitting: boolean;
  errorMessage: string | null;
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
  errorMessage,
  onInputChange,
  onToneChange,
  onLengthChange,
  onHostCountChange,
  onSubmit,
  onTrySample,
}: CreationFormProps) {
  const trimmedLen = input.trim().length;
  const showCounter = trimmedLen >= 2000 || Boolean(errorMessage);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
    >
      <div>
        <label htmlFor="kuro-topic-input" className="block text-sm font-semibold text-slate-900">
          Topic or pasted study material
        </label>
        <p id="kuro-topic-help" className="mt-1 text-xs text-slate-600">
          Enter {INPUT_MIN_CHARS} to {INPUT_MAX_CHARS.toLocaleString()} characters.
        </p>
        <textarea
          id="kuro-topic-input"
          rows={4}
          value={input}
          disabled={isSubmitting}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Paste class notes, a reading excerpt, or a topic to unpack..."
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={errorMessage ? "kuro-topic-help kuro-topic-error" : "kuro-topic-help"}
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-500 disabled:bg-slate-100"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => onInputChange(STUDY_EXAMPLE)}
            className="min-h-11 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-60"
          >
            Use study example: Opportunity cost
          </button>
          {showCounter ? (
            <span
              className={`text-xs font-medium ${
                trimmedLen > INPUT_MAX_CHARS ? "text-red-700" : "text-slate-600"
              }`}
            >
              {trimmedLen.toLocaleString()} / {INPUT_MAX_CHARS.toLocaleString()}
            </span>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <div
          id="kuro-topic-error"
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-900"
        >
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <BinaryOptionGroup
          legend="Tone"
          options={[
            { value: "casual", label: "Casual" },
            { value: "serious", label: "Serious" },
          ]}
          selected={tone}
          disabled={isSubmitting}
          onSelect={onToneChange}
        />
        <BinaryOptionGroup
          legend="Length"
          options={[
            { value: "quick", label: "Quick" },
            { value: "detailed", label: "Detailed" },
          ]}
          selected={length}
          disabled={isSubmitting}
          onSelect={onLengthChange}
        />
        <BinaryOptionGroup
          legend="Hosts"
          options={[
            { value: 2, label: "2 hosts" },
            { value: 3, label: "3 hosts" },
          ]}
          selected={hostCount}
          disabled={isSubmitting}
          onSelect={onHostCountChange}
        />
      </div>

      <div className="flex flex-col gap-2 pt-1 sm:flex-row">
        <button
          type="submit"
          disabled={isSubmitting}
          className="min-h-12 flex-1 rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Preparing mock conversation..." : "Create conversation"}
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onTrySample}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
        >
          Try sample episode
        </button>
      </div>
    </form>
  );
}
