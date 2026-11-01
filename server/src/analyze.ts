import { chatJSON } from "./llm";
import { search } from "./retrieval";
import type { Risk, Signal, Verdict } from "./types";
import { demo } from "./rules";

const BUDGET_MS = Math.max(4_000, Number(process.env.ANALYZE_MS) || 10_000);

const verdictPrompt = (ids: string[]) => `You assess scam risk in an internship or job offer message for students in India.
${ids.length ? `Use ONLY the evidence passages provided. Every signal must cite passage ids from: ${ids.join(", ")}.` : "No evidence passages are available; use general knowledge and leave evidence as []."}
If evidence is insufficient, set risk to "unclear". Never claim a company is a scam; describe risk signals instead.
Reply as JSON: {"risk":"high|medium|low|unclear","score":0-100,"summary":string,"signals":[{"label":string,"severity":"high|medium|low","explanation":string,"evidence":string[],"quotes":string[]}]}
quotes are short exact substrings copied from the message that justify the signal (may be empty).`;

function overlay(llm: Verdict, rules: Verdict): Verdict {
  const have = new Set(llm.signals.map((s) => s.label.toLowerCase()));
  const extra = rules.signals.filter((s) => !have.has(s.label.toLowerCase()));
  if (!llm.signals.length) return { ...rules, mode: llm.mode, grounded: 0 };
  if (!extra.length) return llm;
  const signals = [...llm.signals, ...extra];
  const seen = new Set(llm.sources.map((p) => p.id));
  const sources = [...llm.sources, ...rules.sources.filter((p) => !seen.has(p.id))];
  const score = Math.max(llm.score, rules.score);
  const risk: Risk = score >= 60 ? "high" : score >= 25 ? "medium" : llm.risk === "unclear" ? rules.risk : llm.risk;
  return { ...llm, risk, score, signals, sources };
}

export async function analyze(message: string, opts: { retrieval?: boolean } = {}): Promise<Verdict> {
  const rules = demo(message);
  if (!process.env.LLM_API_KEY) return rules;
  try {
    const useRetrieval = opts.retrieval ?? true;
    const timed = <T>(p: Promise<T>, ms: number) => Promise.race([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error("scan timed out")), ms)),
    ]);
    const passages = useRetrieval ? await search(message, 6) : [];
    const ids = passages.map((p) => p.id);
    const raw = await timed(chatJSON<{ risk: Risk; score: number; summary: string; signals: Signal[] }>(
      verdictPrompt(ids),
      `Message:\n${message}\n\nEvidence:\n${passages.map((p) => `[${p.id}] ${p.title}: ${p.text}`).join("\n")}`,
    ), BUDGET_MS);

    const low = message.toLowerCase();
    let signals = (raw.signals ?? []).map((s) => ({
      ...s,
      evidence: s.evidence ?? [],
      quotes: (s.quotes ?? []).filter((q) => q.trim().length > 2 && low.includes(q.trim().toLowerCase())),
    }));
    let grounded = 1;
    // Only require passage ids when retrieval actually returned some. Empty evidence used to
    // wipe every signal and force "unclear" on messages that were not in the tiny KB.
    if (useRetrieval && ids.length) {
      const kept = signals.map((s) => ({ ...s, evidence: (s.evidence ?? []).filter((e) => ids.includes(e)) })).filter((s) => s.evidence.length);
      grounded = signals.length ? kept.length / signals.length : 1;
      if (kept.length) signals = kept;
      else grounded = 0;
    }
    const cited = new Set(signals.flatMap((s) => s.evidence));
    const rag: Verdict = {
      risk: signals.length ? raw.risk : rules.risk,
      score: raw.score ?? rules.score,
      summary: raw.summary || rules.summary,
      signals,
      sources: passages.filter((p) => cited.has(p.id)),
      grounded,
      mode: "rag",
    };
    return overlay(rag, rules);
  } catch (e) {
    console.error("LLM analyze failed, using rules:", e);
    return rules;
  }
}
