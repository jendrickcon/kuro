import { handleTtsPost } from "@/lib/tts/tts-route-handler";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  return handleTtsPost(request);
}
