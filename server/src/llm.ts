// Defaults to Google Gemini (OpenAI-compatible endpoint). Set LLM_BASE_URL / LLM_MODEL to use another provider.
const BASE = (process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/+$/, "");
const MODEL = process.env.LLM_MODEL || "gemini-3.8-flash";

// Gemini 3 "thinks" before answering, which is slow. "low" keeps replies fast. Set LLM_REASONING="" to omit it for other providers.
const REASON = process.env.LLM_REASONING ?? "low";
const think = REASON ? { reasoning_effort: REASON } : {};

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POSTs to the LLM. Retries a few times when the provider is busy (503/429) or times out. */
async function post(label: string, body: unknown): Promise<Response> {
  let last = "";
  for (let i = 0; i < 3; i++) {
    if (i) await sleep(1500 * 2 ** (i - 1)); // 1.5s, 3s
    try {
      const r = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.LLM_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(40_000),
      });
      if (r.ok || !RETRYABLE.has(r.status)) return r;
      last = `${label} ${r.status}: ${await r.text()}`;
    } catch (e) {
      last = `${label} timeout/network: ${(e as Error).message}`;
    }
  }
  throw new Error(`${last} (the AI service is busy; tried 3 times)`);
}

export async function chatJSON<T>(system: string, user: string): Promise<T> {
  const r = await post("LLM", {
      model: MODEL, temperature: 0, ...think,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { choices: { message: { content: string } }[] };
  return JSON.parse(j.choices[0].message.content) as T;
}

/** Returns null when EMBED_MODEL is unset, so retrieval falls back to BM25 only. */
export async function embed(texts: string[]): Promise<number[][] | null> {
  if (!process.env.EMBED_MODEL) return null;
  const r = await fetch(`${process.env.EMBED_BASE_URL || BASE}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.EMBED_API_KEY ?? process.env.LLM_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.EMBED_MODEL, input: texts }),
  });
  if (!r.ok) throw new Error(`Embeddings ${r.status}`);
  const j = (await r.json()) as { data: { embedding: number[] }[] };
  return j.data.map((d) => d.embedding);
}

/** Reads text out of a screenshot with a vision-capable model. */
export async function visionText(dataUrl: string): Promise<string> {
  const r = await post("Vision", {
      model: process.env.VISION_MODEL || MODEL, temperature: 0, ...think,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: [
        { type: "text", text: 'Transcribe all text in this screenshot of a job, internship or certificate message exactly as written. Reply as JSON: {"text":string}' },
        { type: "image_url", image_url: { url: dataUrl } }] }],
    });
  if (!r.ok) throw new Error(`Vision ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { choices: { message: { content: string } }[] };
  return String((JSON.parse(j.choices[0].message.content) as { text?: string }).text ?? "");
}
