import { chatJSON } from "./llm";
import { search } from "./retrieval";
import type { Risk, Signal, Verdict } from "./types";
import { demo } from "./rules";

const EXTRACT = `Extract facts from a job or internship offer message. Reply as JSON:
{"company":string|null,"feeDemanded":string|null,"channel":string|null,"certificateIssuer":string|null,"notes":string[]}`;

const verdictPrompt = (ids: string[]) => `You assess scam risk in an internship or job offer message for students in India.
${ids.length ? `Use ONLY the evidence passages provided. Every signal must cite passage ids from: ${ids.join(", ")}.` : "No evidence passages are available; use general knowledge and leave evidence as []."}
If evidence is insufficient, set risk to "unclear". Never claim a company is a scam; describe risk signals instead.
Reply as JSON: {"risk":"high|medium|low|unclear","score":0-100,"summary":string,"signals":[{"label":string,"severity":"high|medium|low","explanation":string,"evidence":string[],"quotes":string[]}]}
quotes are short exact substrings copied from the message that justify the signal (may be empty).`;

export async function analyze(message: string, opts: { retrieval?: boolean } = {}): Promise<Verdict> {
  if (!process.env.LLM_API_KEY) return demo(message);
  const useRetrieval = opts.retrieval ?? true;
  const claims = await chatJSON<Record<string, unknown>>(EXTRACT, message);
  const passages = useRetrieval ? await search(`${message}\n${JSON.stringify(claims)}`, 6) : [];
  const ids = passages.map((p) => p.id);
  const raw = await chatJSON<{ risk: Risk; score: number; summary: string; signals: Signal[] }>(
    verdictPrompt(ids),
    `Message:\n${message}\n\nExtracted:\n${JSON.stringify(claims)}\n\nEvidence:\n${passages.map((p) => `[${p.id}] ${p.title}: ${p.text}`).join("\n")}`,
  );

  // Grounding guard: drop any signal whose citations don't point at retrieved passages.
  const low = message.toLowerCase();
  let signals = (raw.signals ?? []).map((s) => ({ ...s, evidence: s.evidence ?? [], quotes: (s.quotes ?? []).filter((q) => q.trim().length > 2 && low.includes(q.trim().toLowerCase())) })), grounded = 1;
  if (useRetrieval) {
    const kept = signals.map((s) => ({ ...s, evidence: (s.evidence ?? []).filter((e) => ids.includes(e)) })).filter((s) => s.evidence.length);
    grounded = signals.length ? kept.length / signals.length : 1;
    signals = kept;
  }
  const risk: Risk = useRetrieval && !signals.length ? "unclear" : raw.risk;
  const cited = new Set(signals.flatMap((s) => s.evidence));
  return { risk, score: raw.score, summary: raw.summary, signals, sources: passages.filter((p) => cited.has(p.id)), grounded, mode: "rag" };
}
