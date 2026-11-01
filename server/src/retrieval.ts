import fs from "node:fs";
import type { Passage } from "./types";
import { embed } from "./llm";

const kb: Passage[] = JSON.parse(fs.readFileSync(new URL("./kb/seed.json", import.meta.url), "utf8"));
const tok = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const docs = kb.map((p) => tok(`${p.title} ${p.text} ${p.tags.join(" ")}`));
const avg = docs.reduce((a, d) => a + d.length, 0) / docs.length;
const df = new Map<string, number>();
docs.forEach((d) => new Set(d).forEach((t) => df.set(t, (df.get(t) ?? 0) + 1)));

function bm25(q: string[]): number[] {
  const k1 = 1.5, b = 0.75, N = docs.length;
  return docs.map((d) => {
    const tf = new Map<string, number>();
    d.forEach((t) => tf.set(t, (tf.get(t) ?? 0) + 1));
    return q.reduce((s, t) => {
      const f = tf.get(t); if (!f) return s;
      const n = df.get(t)!, idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      return s + (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg));
    }, 0);
  });
}
const cos = (a: number[], b: number[]) => {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] ** 2; y += b[i] ** 2; }
  return d / Math.sqrt(x * y);
};
const rank = (s: number[]) =>
  s.map((v, i) => [v, i] as const).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]).map(([, i]) => i);

let vecs: number[][] | null | undefined;

/** Hybrid search: BM25 + dense embeddings, fused with Reciprocal Rank Fusion. */
export async function search(query: string, k = 5): Promise<Passage[]> {
  const lists = [rank(bm25([...new Set(tok(query))]))];
  if (vecs === undefined) {
    try { vecs = await embed(kb.map((p) => `${p.title}. ${p.text}`)); }
    catch { vecs = null; }
  }
  const dv = vecs;
  if (dv) {
    try {
      const [qv] = (await embed([query]))!;
      lists.push(rank(dv.map((v) => cos(qv, v))));
    } catch { /* BM25 only */ }
  }
  const fused = new Map<number, number>();
  lists.forEach((l) => l.forEach((i, r) => fused.set(i, (fused.get(i) ?? 0) + 1 / (60 + r))));
  return [...fused].sort((a, b) => b[1] - a[1]).slice(0, k).map(([i]) => kb[i]);
}

export const byId = (ids: string[]) => ids.map((i) => kb.find((p) => p.id === i)).filter((p): p is Passage => !!p);
