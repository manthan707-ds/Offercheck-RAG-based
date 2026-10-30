import type { Risk, Verdict } from "./types";
import { byId } from "./retrieval";

/** Offline fallback used when no LLM key is configured, so the app always works. */
const SIG: Record<string, { w: number; l: string; e: string; c: string[] }> = {
  pay: { w: 45, l: "Payment demanded", e: "You’re asked to pay before joining. Genuine employers never charge candidates.", c: ["p1", "p2"] },
  urgent: { w: 15, l: "Artificial urgency", e: "A tight deadline pushes you to pay before you can verify anything.", c: ["p3"] },
  chat: { w: 12, l: "Chat-app-only contact", e: "Hiring that lives only on WhatsApp or Telegram skips the usual verification trail.", c: ["p4"] },
  nointerview: { w: 15, l: "Selected without an interview", e: "No interview or assessment, yet you’re already chosen.", c: ["p6"] },
  docs: { w: 15, l: "Early document request", e: "ID or bank details are requested before a signed offer letter.", c: ["p10"] },
  email: { w: 10, l: "Free email address", e: "A company recruiter on a free email domain needs extra checks.", c: ["p5"] },
  guarantee: { w: 15, l: "Guarantee claims", e: "Guaranteed jobs or certificates tied to a paid course are a classic red flag.", c: ["p7"] },
  good: { w: -15, l: "Genuine offer patterns", e: "An interview process, a named hiring manager or an explicit no-fee statement.", c: ["p9", "p8"] },
};
const RULES: { k: string; re: RegExp; when?: (t: string, hasInterview: boolean) => boolean }[] = [
  { k: "pay", re: /\b(?:registration fee|access fee|processing fee|security deposit|refundable deposit|dues)\b|(?<=\b(?:pay|dues|fee|deposit)\b[^.!?\n]{0,25})(?:rs\.?|₹|inr)\s?\d+(?:,\d+)*/ },
  { k: "urgent", re: /\bwithin \d+ ?(?:hours?|hrs?)\b|\bseats? (?:closing|filling)(?: (?:in|within) \d+ ?hours?)?|\b(?:last chance|limited seats?|today only)\b/ },
  { k: "chat", re: /\b(?:whatsapp|telegram)\s+only\b|\b(?:contact|reply|message|reach)\b[^.!?\n]{0,25}\b(?:whatsapp|telegram)\b(?:\s+only)?/ },
  { k: "nointerview", re: /\bno interview\b|\bwithout (?:an )?interview\b/ },
  { k: "nointerview", re: /\byou(?: are|’re|'re) selected\b/, when: (_t, i) => !i },
  { k: "docs", re: /\b(?:aadhaar|aadhar|pan card|bank details|otp)\b/, when: (t) => /\b(?:send|share|submit|provide)\b/i.test(t) },
  { k: "email", re: /[\w.+-]+@(?:gmail|yahoo|outlook|hotmail)\.com/ },
  { k: "guarantee", re: /\b100% (?:job )?guarantee\b|\bguaranteed (?:job|placement|certificate)s?\b|\bjob guarantee\b/ },
  { k: "good", re: /\bno (?:fee|payment|charges?)\b[^.!?\n]*|\bhiring manager\b|\binterview\b/ },
];

export function demo(t: string): Verdict {
  const hasI = /\binterview|assessment\b/i.test(t);
  const hits: { s: number; e: number; k: string }[] = [];
  for (const r of RULES) {
    if (r.when && !r.when(t, hasI)) continue;
    const rx = new RegExp(r.re.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = rx.exec(t))) hits.push({ s: m.index, e: m.index + m[0].length, k: r.k });
  }
  hits.sort((a, b) => a.s - b.s || b.e - a.e);
  const keys: string[] = [], quotes: Record<string, string[]> = {};
  let end = 0;
  for (const h of hits) if (h.s >= end) {
    end = h.e;
    if (!keys.includes(h.k)) keys.push(h.k);
    (quotes[h.k] ??= []).push(t.slice(h.s, h.e).trim());
  }
  keys.sort((a, b) => SIG[b].w - SIG[a].w);
  const risky = keys.filter((k) => SIG[k].w > 0), good = keys.includes("good");
  let score = Math.max(0, Math.min(99, risky.reduce((s, k) => s + SIG[k].w, 0) - (good ? 15 : 0)));
  const risk: Risk = score >= 60 ? "high" : score >= 25 ? "medium" : risky.length || good ? "low" : "unclear";
  if (risk === "low" && !risky.length) score = 8;
  const summary =
    risk === "high" ? `Several strong scam signals line up: ${risky.slice(0, 2).map((k) => SIG[k].l.toLowerCase()).join(" and ")}. Don’t pay or share documents until you’ve verified the company.`
    : risk === "medium" ? "There are red flags worth checking before you reply. Verify the company independently first."
    : risk === "low" ? (risky.length ? "Few concerns, but double-check the flagged phrases before sharing anything." : "No payment request and a normal hiring process. Still verify the company before sharing documents.")
    : "Nothing in the knowledge base clearly supports or contradicts this message, so there’s no verdict. Check the company directly before replying.";
  const signals = keys.map((k) => ({
    label: SIG[k].l, severity: (k === "good" ? "low" : SIG[k].w >= 30 ? "high" : "medium") as "low" | "medium" | "high",
    explanation: SIG[k].e, evidence: SIG[k].c, quotes: quotes[k],
  }));
  return { risk, score, summary, signals, sources: byId([...new Set(signals.flatMap((s) => s.evidence))]), grounded: 1, mode: "demo" };
}
