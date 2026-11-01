// Defaults to Google Gemini (OpenAI-compatible endpoint). Set LLM_BASE_URL / LLM_MODEL to use another provider.
const BASE = (process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/+$/, "");
const MODEL = process.env.LLM_MODEL || "gemini-3.5-flash-lite";

// Gemini 3 thinks by default, which can stall a scan for minutes. "none" turns that off.
const REASON = process.env.LLM_REASONING ?? "none";
const think = REASON ? { reasoning_effort: REASON, thinkingConfig: { thinkingBudget: 0 } } : {};
const TIMEOUT = Math.max(3_000, Number(process.env.LLM_TIMEOUT_MS) || 8_000);

/** One shot — retries were turning a slow Gemini call into a multi-minute hang. */
async function post(label: string, body: unknown, ms = TIMEOUT): Promise<Response> {
  try {
    return await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.LLM_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
    });
  } catch (e) {
    throw new Error(`${label} timeout/network: ${(e as Error).message}`);
  }
}

function textOf(j: { choices?: { message?: { content?: unknown } }[] }): string {
  const c = j.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((p) => (typeof p === "string" ? p : (p as { text?: string }).text ?? "")).join("");
  return "";
}

function parseJSON<T>(raw: string): T {
  const t = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(t) as T; } catch { /* fall through */ }
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  if (i >= 0 && j > i) return JSON.parse(t.slice(i, j + 1)) as T;
  throw new Error("LLM did not return JSON");
}

export async function chatJSON<T>(system: string, user: string): Promise<T> {
  const r = await post("LLM", {
    model: MODEL, temperature: 0, max_tokens: 700, ...think,
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${await r.text()}`);
  return parseJSON<T>(textOf(await r.json() as { choices?: { message?: { content?: unknown } }[] }));
}

/** Returns null when EMBED_MODEL is unset, so retrieval falls back to BM25 only. */
export async function embed(texts: string[]): Promise<number[][] | null> {
  if (!process.env.EMBED_MODEL) return null;
  const r = await fetch(`${process.env.EMBED_BASE_URL || BASE}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.EMBED_API_KEY ?? process.env.LLM_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.EMBED_MODEL, input: texts }),
    signal: AbortSignal.timeout(4_000),
  });
  if (!r.ok) throw new Error(`Embeddings ${r.status}`);
  const j = (await r.json()) as { data: { embedding: number[] }[] };
  return j.data.map((d) => d.embedding);
}

/** Reads text out of a screenshot with a vision-capable model. */
export async function visionText(dataUrl: string): Promise<string> {
  const r = await post("Vision", {
      model: process.env.VISION_MODEL || MODEL, temperature: 0, max_tokens: 2000, ...think,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: [
        { type: "text", text: 'Transcribe all text in this screenshot of a job, internship or certificate message exactly as written. Reply as JSON: {"text":string}' },
        { type: "image_url", image_url: { url: dataUrl } }] }],
    });
  if (!r.ok) throw new Error(`Vision ${r.status}: ${await r.text()}`);
  return String(parseJSON<{ text?: string }>(textOf(await r.json() as { choices?: { message?: { content?: unknown } }[] })).text ?? "");
}
