import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { analyze } from "./analyze";
import { visionText } from "./llm";

// Short, safe reason from the AI provider so failures are diagnosable from the UI.
const why = (e: unknown) => String((e as Error)?.message ?? e).replace(/\s+/g, " ").slice(0, 280);

const app = express();
app.set("trust proxy", 1);
app.use(cors(), express.json({ limit: "8mb" }));
app.use("/api", rateLimit({ windowMs: 60_000, limit: 30 }));

const Body = z.object({ message: z.string().min(20, "Paste the full message (at least 20 characters)").max(4000) });
const Img = z.object({ image: z.string().regex(/^data:image\/(png|jpe?g|webp);base64,/, "Upload a PNG, JPG or WebP image").max(7_000_000) });

app.get("/api/health", (_q, r) => void r.json({ ok: true }));
app.get("/api/config", (_q, r) => void r.json({ demo: !process.env.LLM_API_KEY }));

// TEMPORARY diagnostics: open /api/diag to see how the AI service responds to 3 request styles. Remove when done.
app.get("/api/diag", async (q, res) => {
  const base = (process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/+$/, "");
  const model = typeof q.query.model === "string" && q.query.model ? q.query.model : process.env.LLM_MODEL || "gemini-3.8-flash";
  if (q.query.list) { // /api/diag?list=1 shows the models this key can use
    try {
      const r = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${process.env.LLM_API_KEY}` }, signal: AbortSignal.timeout(20_000) });
      const t = await r.text();
      let ids: string[] | string = t.replace(/\s+/g, " ").slice(0, 300);
      try { ids = (JSON.parse(t).data as { id: string }[]).map((m) => m.id.replace(/^models\//, "")).filter((i) => /gemini/i.test(i)); } catch { /* keep raw text */ }
      return void res.json({ status: r.status, models: ids });
    } catch (e) { return void res.json({ error: why(e) }); }
  }
  const tests: Record<string, Record<string, unknown>> = {
    plain: {},
    json_mode: { response_format: { type: "json_object" } },
    json_mode_low_thinking: { response_format: { type: "json_object" }, reasoning_effort: "low" },
  };
  const out: Record<string, unknown> = { model, base, hasKey: !!process.env.LLM_API_KEY };
  for (const [name, extra] of Object.entries(tests)) {
    const t0 = Date.now();
    try {
      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.LLM_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature: 0, messages: [{ role: "user", content: 'Reply with JSON: {"ok":true}' }], ...extra }),
        signal: AbortSignal.timeout(20_000),
      });
      out[name] = { ms: Date.now() - t0, status: r.status, body: (await r.text()).replace(/\s+/g, " ").slice(0, 200) };
    } catch (e) { out[name] = { ms: Date.now() - t0, error: why(e) }; }
  }
  res.json(out);
});
app.post("/api/analyze", async (req, res) => {
  const p = Body.safeParse(req.body);
  if (!p.success) return void res.status(400).json({ error: p.error.issues[0].message });
  try { res.json(await analyze(p.data.message)); }
  catch (e) { console.error(e); res.status(502).json({ error: `Analysis failed. Check your LLM key and model. (${why(e)})` }); }
});
app.post("/api/extract", async (req, res) => {
  if (!process.env.LLM_API_KEY) return void res.status(503).json({ error: "Screenshot reading needs LLM_API_KEY with a vision-capable model." });
  const p = Img.safeParse(req.body);
  if (!p.success) return void res.status(400).json({ error: p.error.issues[0].message });
  try {
    const text = (await visionText(p.data.image)).trim();
    if (text.length < 20) return void res.status(422).json({ error: "Couldn’t read enough text in that image. Try a clearer screenshot." });
    res.json({ text: text.slice(0, 4000) });
  } catch (e) { console.error(e); res.status(502).json({ error: `Couldn’t read the screenshot. Check your model supports images. (${why(e)})` }); }
});

const dist = fileURLToPath(new URL("../../client/dist", import.meta.url));
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_q, r) => void r.sendFile(path.join(dist, "index.html")));
}
app.listen(Number(process.env.PORT ?? 8787), () => console.log(`OfferCheck ready on :${process.env.PORT ?? 8787}`));
