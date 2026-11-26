"use client";

import { useRef, useState } from "react";
import {
  CreateEpisodeRequestSchema,
  CreateEpisodeResponseSchema,
  EpisodeSchema,
  INPUT_MAX_CHARS,
  INPUT_MIN_CHARS,
  type Episode,
  type EpisodeLength,
  type Tone,
} from "@contracts/episode.schema";
import { CreationForm } from "@/components/kuro/creation-form";
import { RecoverableErrorCard } from "@/components/kuro/form-error";
import { GenerationStatus } from "@/components/kuro/generation-status";
import { EpisodePlayer } from "@/components/kuro/player/episode-player";
import { getSampleEpisode } from "@/lib/episode/fixtures";

interface ResultState {
  instanceId: number;
  episode: Episode;
  source: "generated" | "mock" | "sample";
  usedFallback?: boolean;
  requestedOptions?: {
    tone: Tone;
    length: EpisodeLength;
    hostCount: 2 | 3;
  };
}

export interface KuroSkeletonProps {
  ttsRequestIntervalMs?: number;
}

export function KuroSkeleton({ ttsRequestIntervalMs }: KuroSkeletonProps = {}) {
  const [input, setInput] = useState("");
  const [tone, setTone] = useState<Tone>("casual");
  const [length, setLength] = useState<EpisodeLength>("quick");
  const [hostCount, setHostCount] = useState<2 | 3>(2);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<{ message: string; retryable: boolean } | null>(
    null,
  );
  const [result, setResult] = useState<ResultState | null>(null);

  const isSubmittingRef = useRef(false);
  const episodeCounterRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const errorCardRef = useRef<HTMLDivElement | null>(null);

  function focusTextarea() {
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }

  function focusErrorCard() {
    window.requestAnimationFrame(() => {
      errorCardRef.current?.focus();
    });
  }

  function handleInputChange(nextValue: string) {
    setInput(nextValue);
    if (fieldError) setFieldError(null);
    if (requestError) setRequestError(null);
  }

  async function handleSubmit() {
    if (isSubmittingRef.current) return;

    const trimmed = input.trim();
    if (trimmed.length === 0) {
      setFieldError(
        `Enter a topic or paste study material (at least ${INPUT_MIN_CHARS} characters).`,
      );
      setRequestError(null);
      focusTextarea();
      return;
    }
    if (trimmed.length < INPUT_MIN_CHARS) {
      setFieldError(`Enter at least ${INPUT_MIN_CHARS} characters so Kuro has enough context.`);
      setRequestError(null);
      focusTextarea();
      return;
    }
    if (trimmed.length > INPUT_MAX_CHARS) {
      setFieldError(
        `Keep your topic or pasted notes under ${INPUT_MAX_CHARS.toLocaleString()} characters (~400 words).`,
      );
      setRequestError(null);
      focusTextarea();
      return;
    }

    const requestCheck = CreateEpisodeRequestSchema.safeParse({
      input: trimmed,
      tone,
      length,
      hostCount,
    });
    if (!requestCheck.success) {
      setFieldError("Check your topic and selected options before continuing.");
      setRequestError(null);
      focusTextarea();
      return;
    }

    isSubmittingRef.current = true;
    setFieldError(null);
    setRequestError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/episodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestCheck.data),
      });

      let json: unknown;
      try {
        json = await response.json();
      } catch {
        setRequestError({
          message: "The server returned an unreadable response. Your text is safe—please try again.",
          retryable: true,
        });
        focusErrorCard();
        return;
      }

      const parsed = CreateEpisodeResponseSchema.safeParse(json);
      if (!parsed.success) {
        setRequestError({
          message: "Received an unexpected episode response format. Please try again.",
          retryable: true,
        });
        focusErrorCard();
        return;
      }

      if (!parsed.data.ok) {
        if (parsed.data.error.code === "INVALID_INPUT") {
          setFieldError(parsed.data.error.message);
          focusTextarea();
        } else {
          setRequestError({
            message: parsed.data.error.message,
            retryable: parsed.data.error.retryable,
          });
          focusErrorCard();
        }
        return;
      }

      const episodeCheck = EpisodeSchema.safeParse(parsed.data.episode);
      if (!episodeCheck.success) {
        setRequestError({
          message: "The returned episode could not be verified. Please try again.",
          retryable: true,
        });
        focusErrorCard();
        return;
      }

      const usedFallback = response.headers.get("x-kuro-fallback-used") === "true";
      const source = episodeCheck.data.status === "ready" ? "generated" : "mock";
      episodeCounterRef.current += 1;
      setResult({
        instanceId: episodeCounterRef.current,
        episode: episodeCheck.data,
        source,
        usedFallback: source === "generated" ? usedFallback : false,
        requestedOptions: { tone, length, hostCount },
      });
    } catch {
      setRequestError({
        message: "Could not reach the episode service. Check your connection and try again.",
        retryable: true,
      });
      focusErrorCard();
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  function handleTrySample() {
    if (isSubmittingRef.current) return;
    setFieldError(null);
    setRequestError(null);
    const sample = EpisodeSchema.parse(getSampleEpisode());
    episodeCounterRef.current += 1;
    setResult({
      instanceId: episodeCounterRef.current,
      episode: sample,
      source: "sample",
    });
  }

  function handleBackToForm() {
    setResult(null);
    focusTextarea();
  }

  if (result) {
    return (
      <EpisodePlayer
        key={result.instanceId}
        episode={result.episode}
        source={result.source}
        usedFallback={result.usedFallback}
        ttsRequestIntervalMs={ttsRequestIntervalMs}
        requestedOptions={result.requestedOptions}
        onBack={handleBackToForm}
      />
    );
  }

  return (
    <div className="space-y-4">
      {isSubmitting ? <GenerationStatus /> : null}
      {requestError && !isSubmitting ? (
        <RecoverableErrorCard
          message={requestError.message}
          retryable={requestError.retryable}
          containerRef={errorCardRef}
          onRetry={handleSubmit}
          onEdit={() => {
            setRequestError(null);
            focusTextarea();
          }}
          onTrySample={handleTrySample}
        />
      ) : null}
      <CreationForm
        input={input}
        tone={tone}
        length={length}
        hostCount={hostCount}
        isSubmitting={isSubmitting}
        fieldError={fieldError}
        textareaRef={textareaRef}
        onInputChange={handleInputChange}
        onToneChange={setTone}
        onLengthChange={setLength}
        onHostCountChange={setHostCount}
        onSubmit={handleSubmit}
        onTrySample={handleTrySample}
      />
    </div>
  );
}
