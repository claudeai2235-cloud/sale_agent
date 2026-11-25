import { GoogleGenAI, type Content, type ThinkingLevel } from "@google/genai";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, platformSettings } from "@/db/schema";

let client: GoogleGenAI | null = null;
function ai() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey: key, apiVersion: "v1beta" });
  return client;
}

export async function platformModels() {
  const [p] = await db.select().from(platformSettings).limit(1);
  return {
    chat: p?.defaultChatModel || "gemini-flash-latest",
    lite: p?.defaultLiteModel || "gemini-flash-lite-latest",
  };
}

async function logUsage(tenantId: string | null, model: string, purpose: string, input: number, output: number) {
  const day = new Date().toISOString().slice(0, 10);
  await db
    .insert(aiUsage)
    .values({ tenantId, day, model, purpose, calls: 1, inputTokens: input, outputTokens: output })
    .onConflictDoUpdate({
      target: [aiUsage.tenantId, aiUsage.day, aiUsage.model, aiUsage.purpose],
      set: {
        calls: sql`${aiUsage.calls} + 1`,
        inputTokens: sql`${aiUsage.inputTokens} + ${input}`,
        outputTokens: sql`${aiUsage.outputTokens} + ${output}`,
      },
    })
    .catch((e) => console.error("ai usage log failed", e));
}

type GenArgs = {
  tenantId: string | null;
  model: string;
  fallbackModel?: string;
  purpose: string;
  system: string;
  contents: Content[];
  schema?: unknown;
  temperature?: number;
  /** Lower thinking = faster & cheaper replies. "default" lets the model decide. */
  thinkingLevel?: "default" | "low" | "medium" | "high";
  /** Enable Google Search grounding (text output only — not combined with a JSON schema). */
  googleSearch?: boolean;
};

/** Calls Gemini; returns parsed JSON when a schema is given, otherwise text. Falls back to a second model on failure. */
export async function generate<T = string>(args: GenArgs): Promise<T> {
  const models = [args.model, ...(args.fallbackModel && args.fallbackModel !== args.model ? [args.fallbackModel] : [])];
  const wantThinking = !!args.thinkingLevel && args.thinkingLevel !== "default";
  let lastErr: unknown;
  for (const model of models) {
    for (const thinking of wantThinking ? [true, false] : [false]) {
      try {
        return await callOnce<T>(args, model, thinking);
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        // If the model rejected the thinking level, retry the same model without it; otherwise try the next model.
        if (thinking && /thinking/i.test(msg)) continue;
        console.error(`Gemini ${model} failed`, msg.slice(0, 300));
        break;
      }
    }
  }
  throw lastErr;
}

async function callOnce<T>(args: GenArgs, model: string, thinking: boolean): Promise<T> {
  const res = await ai().models.generateContent({
    model,
    contents: mergeTurns(args.contents),
    config: {
      systemInstruction: args.system,
      temperature: args.temperature ?? 0.7,
      ...(thinking ? { thinkingConfig: { thinkingLevel: args.thinkingLevel!.toUpperCase() as ThinkingLevel } } : {}),
      ...(args.schema ? { responseMimeType: "application/json", responseJsonSchema: args.schema } : {}),
      ...(args.googleSearch && !args.schema ? { tools: [{ googleSearch: {} }] } : {}),
    },
  });
  const u = res.usageMetadata;
  await logUsage(args.tenantId, model, args.purpose, u?.promptTokenCount ?? 0, (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0));
  const text = res.text ?? "";
  if (!args.schema) return text as T;
  return parseJson<T>(text);
}

function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("Model did not return JSON");
  }
}

/** Gemini prefers alternating user/model turns; merge consecutive turns with the same role. */
function mergeTurns(contents: Content[]): Content[] {
  const out: Content[] = [];
  for (const c of contents) {
    const prev = out[out.length - 1];
    if (prev && prev.role === c.role) prev.parts = [...(prev.parts ?? []), ...(c.parts ?? [])];
    else out.push({ role: c.role, parts: [...(c.parts ?? [])] });
  }
  if (out[0]?.role === "model") out.unshift({ role: "user", parts: [{ text: "(conversation start)" }] });
  return out;
}
