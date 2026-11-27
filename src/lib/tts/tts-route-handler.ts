import { randomUUID } from "node:crypto";
import {
  generateSegmentTts,
  type GenerateSegmentTtsOptions,
} from "@/lib/tts/gemini-tts-service";
import { sanitizeRetryAfterSeconds } from "@/lib/tts/retry-after";
import {
  GenerateTtsFailureSchema,
  GenerateTtsRequestSchema,
  TTS_MAX_REQUEST_BODY_BYTES,
} from "@/lib/tts/tts-contract";

function resolveCorrelationId(request: Request): string {
  const raw = request.headers.get("x-request-id")?.trim();
  if (raw && /^[a-zA-Z0-9._-]{1,64}$/.test(raw)) {
    return raw;
  }
  return randomUUID();
}

function invalidTtsInputResponse(message: string, requestId: string): Response {
  const payload = GenerateTtsFailureSchema.parse({
    ok: false,
    error: {
      code: "INVALID_TTS_INPUT",
      message,
      retryable: false,
      hostedState: "hosted_unavailable",
    },
  });
  return Response.json(payload, {
    status: 400,
    headers: {
      "Cache-Control": "no-store",
      "X-Kuro-Request-Id": requestId,
      "X-Kuro-TTS-Fallback-Used": "false",
      "X-Kuro-TTS-Retry-Used": "false",
      "X-Kuro-TTS-Quota-Class": "none",
      "X-Kuro-TTS-Hosted-State": "hosted_unavailable",
    },
  });
}

/** Handles single-segment Kuromate TTS synthesis with strict request validation and safe response metadata. */
export async function handleTtsPost(
  request: Request,
  options: GenerateSegmentTtsOptions = {},
): Promise<Response> {
  const requestId = options.requestId?.trim() || resolveCorrelationId(request);
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return invalidTtsInputResponse("Request Content-Type must be application/json.", requestId);
  }

  const rawContentLength = request.headers.get("content-length");
  if (rawContentLength !== null) {
    const declaredBytes = Number.parseInt(rawContentLength, 10);
    if (Number.isFinite(declaredBytes) && declaredBytes > TTS_MAX_REQUEST_BODY_BYTES) {
      return invalidTtsInputResponse("Request payload exceeds maximum allowed size.", requestId);
    }
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return invalidTtsInputResponse("Unable to read request body.", requestId);
  }

  if (Buffer.byteLength(rawBody, "utf8") > TTS_MAX_REQUEST_BODY_BYTES) {
    return invalidTtsInputResponse("Request payload exceeds maximum allowed size.", requestId);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return invalidTtsInputResponse("Request body must be valid JSON.", requestId);
  }

  const parsed = GenerateTtsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return invalidTtsInputResponse(
      "Provide a valid segmentId, speakerId, approved Kuromate role, and 1 to 320 characters of text.",
      requestId,
    );
  }

  const result = await generateSegmentTts(parsed.data, {
    ...options,
    requestId,
    signal: options.signal ?? request.signal,
  });

  // Log only sanitized, non-secret telemetry to server runtime logs.
  console.info(
    "[kuro/tts]",
    JSON.stringify({
      httpStatus: result.httpStatus,
      ...result.meta,
    }),
  );

  const sanitizedRetryAfter = sanitizeRetryAfterSeconds(
    result.ok
      ? result.meta.retryAfterSeconds
      : (result.retryAfterSeconds ?? result.meta.retryAfterSeconds),
  );
  const retryAfterHeaders: Record<string, string> =
    sanitizedRetryAfter !== undefined
      ? { "X-Kuro-TTS-Retry-After": String(sanitizedRetryAfter) }
      : {};
  const providerHeader = result.meta.resolvedProvider ?? result.meta.provider ?? "gemini";
  const safeVoiceHeader =
    result.meta.resolvedVoice ?? result.meta.identityProfileId;

  if (!result.ok) {
    return Response.json(result.response, {
      status: result.httpStatus,
      headers: {
        "Cache-Control": "no-store",
        "X-Kuro-Request-Id": requestId,
        "X-Kuro-TTS-Provider": providerHeader,
        "X-Kuro-TTS-Voice": safeVoiceHeader,
        "X-Kuro-TTS-Retry-Used": String(Boolean(result.meta.retryUsed)),
        "X-Kuro-TTS-Fallback-Used": String(result.meta.fallbackUsed),
        "X-Kuro-TTS-Quota-Class": result.meta.quotaClass,
        "X-Kuro-TTS-Hosted-State": result.meta.hostedState,
        "X-Kuro-TTS-Profile": result.meta.profileId,
        "X-Kuro-TTS-Identity": result.meta.identityProfileId,
        "X-Kuro-Provider-Attempts": String(result.meta.providerAttempts),
        ...retryAfterHeaders,
        ...(sanitizedRetryAfter !== undefined
          ? { "Retry-After": String(sanitizedRetryAfter) }
          : {}),
      },
    });
  }

  const headers: Record<string, string> = {
    "Content-Type": result.audio.mimeType,
    "Content-Length": String(result.audio.byteLength),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Kuro-Request-Id": requestId,
    "X-Kuro-Segment-Id": parsed.data.segmentId,
    "X-Kuro-Speaker-Id": parsed.data.speakerId,
    "X-Kuro-Profile-Id": result.profile.profileId,
    "X-Kuro-TTS-Profile": result.profile.profileId,
    "X-Kuro-TTS-Identity": result.profile.identityProfileId,
    "X-Kuro-TTS-Provider": providerHeader,
    "X-Kuro-TTS-Voice": safeVoiceHeader,
    "X-Kuro-TTS-Retry-Used": String(Boolean(result.meta.retryUsed)),
    "X-Kuro-TTS-Hosted-State": result.meta.hostedState,
    "X-Kuro-Audio-Bytes": String(result.audio.byteLength),
    "X-Kuro-Audio-Container": result.audio.container,
    "X-Kuro-TTS-Fallback-Used": String(result.meta.fallbackUsed),
    "X-Kuro-TTS-Quota-Class": result.meta.quotaClass,
    "X-Kuro-Provider-Attempts": String(result.meta.providerAttempts),
    ...retryAfterHeaders,
  };
  if (result.audio.durationMs !== undefined) {
    headers["X-Kuro-Audio-Duration-Ms"] = String(result.audio.durationMs);
  }

  return new Response(new Uint8Array(result.audioBytes), {
    status: 200,
    headers,
  });
}
