import { NextResponse } from "next/server";
import {
  CreateEpisodeRequestSchema,
  CreateEpisodeResponseSchema,
} from "@contracts/episode.schema";
import {
  generateGeminiEpisode,
  resolveGenerationMode,
} from "@/lib/episode/gemini-service";
import { createMockEpisode } from "@/lib/episode/mock-service";

function invalidInputResponse(message: string) {
  return NextResponse.json(
    CreateEpisodeResponseSchema.parse({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message,
        retryable: false,
      },
    }),
    { status: 400 },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidInputResponse("Request body must be valid JSON.");
  }

  const parsed = CreateEpisodeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInputResponse(
      "Enter 10 to 2,500 characters and choose a valid tone, length, and host count (2 or 3).",
    );
  }

  if (resolveGenerationMode(process.env) === "mock") {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const episode = createMockEpisode(parsed.data);
    return NextResponse.json(
      CreateEpisodeResponseSchema.parse({
        ok: true,
        episode,
      }),
      { status: 200 },
    );
  }

  const result = await generateGeminiEpisode(parsed.data);
  console.info(
    "[kuro/episodes]",
    JSON.stringify({
      httpStatus: result.httpStatus,
      ...result.meta,
    }),
  );

  return NextResponse.json(result.response, {
    status: result.httpStatus,
    headers: {
      "X-Kuro-Fallback-Used": result.meta.fallbackUsed ? "true" : "false",
    },
  });
}
