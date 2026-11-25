"use client";

import { useState } from "react";
import {
  CreateEpisodeRequestSchema,
  CreateEpisodeResponseSchema,
  INPUT_MAX_CHARS,
  INPUT_MIN_CHARS,
  type Episode,
  type EpisodeLength,
  type Tone,
} from "@contracts/episode.schema";
import { CreationForm } from "@/components/kuro/creation-form";
import { EpisodePreview } from "@/components/kuro/episode-preview";
import { GenerationStatus } from "@/components/kuro/generation-status";
import { getSampleEpisode } from "@/lib/episode/fixtures";

export function KuroSkeleton() {
  const [input, setInput] = useState("");
  const [tone, setTone] = useState<Tone>("casual");
  const [length, setLength] = useState<EpisodeLength>("quick");
  const [hostCount, setHostCount] = useState<2 | 3>(2);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);

  async function handleSubmit() {
    const trimmed = input.trim();
    if (trimmed.length < INPUT_MIN_CHARS) {
      setErrorMessage(
        `Enter at least ${INPUT_MIN_CHARS} characters or paste a short study passage.`,
      );
      return;
    }
    if (trimmed.length > INPUT_MAX_CHARS) {
      setErrorMessage(
        `Keep your topic or pasted notes under ${INPUT_MAX_CHARS.toLocaleString()} characters.`,
      );
      return;
    }

    const requestCheck = CreateEpisodeRequestSchema.safeParse({
      input: trimmed,
      tone,
      length,
      hostCount,
    });
    if (!requestCheck.success) {
      setErrorMessage("Please check your input and selected options.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/episodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestCheck.data),
      });
      const json: unknown = await response.json();
      const parsed = CreateEpisodeResponseSchema.safeParse(json);

      if (!parsed.success) {
        setErrorMessage("Unexpected mock response format. Your input was preserved.");
        return;
      }

      if (!parsed.data.ok) {
        setErrorMessage(parsed.data.error.message);
        return;
      }

      setEpisode(parsed.data.episode);
    } catch {
      setErrorMessage("Could not reach the mock episode endpoint. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleTrySample() {
    setErrorMessage(null);
    setEpisode(getSampleEpisode());
  }

  if (episode) {
    return <EpisodePreview episode={episode} onBack={() => setEpisode(null)} />;
  }

  return (
    <div className="space-y-4">
      {isSubmitting ? <GenerationStatus /> : null}
      <CreationForm
        input={input}
        tone={tone}
        length={length}
        hostCount={hostCount}
        isSubmitting={isSubmitting}
        errorMessage={errorMessage}
        onInputChange={setInput}
        onToneChange={setTone}
        onLengthChange={setLength}
        onHostCountChange={setHostCount}
        onSubmit={handleSubmit}
        onTrySample={handleTrySample}
      />
    </div>
  );
}
