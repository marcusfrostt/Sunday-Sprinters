import { generateText, Output } from "ai";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  clips: z
    .array(
      z.object({
        name: z.string().max(180),
        duration: z.number().positive().max(600),
      }),
    )
    .min(1)
    .max(4),
  frames: z
    .array(
      z.object({
        clipIndex: z.number().int().min(0).max(3),
        time: z.number().min(0).max(600),
        dataUrl: z.string().startsWith("data:image/jpeg;base64,"),
      }),
    )
    .min(1)
    .max(12),
});

const analysisSchema = z.object({
  selectedClipIndex: z.number().int().min(0).max(3),
  start: z.number().min(0),
  end: z.number().positive(),
  topText: z.string().min(1).max(60),
  bottomText: z.string().min(1).max(60),
  instagramCaption: z.string().min(1).max(400),
  reason: z.string().min(1).max(240),
  confidence: z.number().min(0).max(1),
});

const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  current.count += 1;
  return current.count > 8;
}

export async function POST(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "local";
  const clientKey = forwarded.split(",")[0]?.trim() ?? "local";
  if (rateLimited(clientKey)) {
    return Response.json(
      { error: "Analysis limit reached. Try again in an hour." },
      { status: 429 },
    );
  }

  try {
    const raw = await request.json();
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: "Invalid clip analysis request." }, { status: 400 });
    }

    const { clips, frames } = parsed.data;
    const frameGuide = frames
      .map(
        (frame, index) =>
          `Image ${index + 1}: clip ${frame.clipIndex + 1}, timestamp ${frame.time.toFixed(1)} seconds.`,
      )
      .join("\n");

    const result = await generateText({
      model: "openai/gpt-5.4-mini",
      output: Output.object({ schema: analysisSchema }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are the sharp, dry-humored editor for Sunday Sprinters, an English-language road-cycling meme reel account.

Analyze the sampled frames and choose ONE visually strong, relatable moment for a short Instagram reel. Pick the clip and a 4–10 second window. Prefer visible action, reactions, suffering, group-ride dynamics, bad weather, climbs, coffee stops, mechanical mishaps, or other recognizably cycling-specific details. Never invent a crash, person, object, brand, or event that is not visible. Keep the humor affectionate, punchy, and original.

Write short uppercase meme copy with a setup in topText and payoff in bottomText. Avoid hashtags inside the on-video text. Write a separate Instagram caption with 2–4 relevant hashtags. Times must stay inside the selected clip duration.

Clips: ${JSON.stringify(clips)}
Frame order:
${frameGuide}`,
            },
            ...frames.map((frame) => ({
              type: "file" as const,
              data: frame.dataUrl,
              mediaType: "image/jpeg",
            })),
          ],
        },
      ],
      providerOptions: {
        gateway: {
          user: `sunday-sprinters-${clientKey.slice(0, 48)}`,
          tags: ["feature:clip-analysis", "app:sunday-sprinters"],
        },
      },
    });

    const output = result.output;
    if (!output) throw new Error("The model returned no analysis.");

    const selectedClip = clips[output.selectedClipIndex] ?? clips[0];
    const safeStart = Math.max(0, Math.min(output.start, selectedClip.duration - 1));
    const safeEnd = Math.max(
      safeStart + 1,
      Math.min(output.end, selectedClip.duration),
    );

    return Response.json({
      ...output,
      selectedClipIndex: Math.min(output.selectedClipIndex, clips.length - 1),
      start: Number(safeStart.toFixed(2)),
      end: Number(safeEnd.toFixed(2)),
    });
  } catch (error) {
    console.error("clip-analysis-failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("402")) {
      return Response.json(
        { error: "AI credits are not active for this Vercel project yet." },
        { status: 402 },
      );
    }
    return Response.json(
      { error: "AI analysis is temporarily unavailable. Please try again." },
      { status: 500 },
    );
  }
}
