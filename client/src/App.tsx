import { useEffect, useRef, useState } from "react";
import type { User } from "./SignIn";

type Passage = { id: string; title: string; text: string; source: string; key?: string };
type Signal = { label: string; severity: "high" | "medium" | "low"; explanation: string; evidence: string[]; quotes: string[] };
type Verdict = { risk: "high" | "medium" | "low" | "unclear"; score: number; summary: string; signals: Signal[]; sources: Passage[]; grounded: number; mode: "rag" | "demo" };
type Phase = "idle" | "wait" | "reveal" | "done";

const SAMPLES = {
  scam: "Congratulations! You are selected for the Data Science Internship. To activate your LMS access, pay dues of Rs 1,499 within 24 hours. Contact us on WhatsApp only.",
  legit: "Hi, we would like to invite you for an interview for the Data Analyst intern role on Monday at 11am over Google Meet. Please reply to confirm. This is from our hiring manager, and there is no fee at any stage.",
  cert: "Get certified in 7 days with 100% job guarantee! Pay Rs 4,999 registration fee now, seats closing in 12 hours. Reply on Telegram only.",
};
const LBL = { high: "High risk", medium: "Medium risk", low: "Low risk", unclear: "No verdict" };
const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion:reduce)").matches;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Where the API lives. Empty = same site (Render, local dev). Set VITE_API_URL when the site is hosted
// somewhere that can't run the server (e.g. Vercel) and the API is deployed elsewhere.
const API = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "");
const NO_SERVER = "Can't reach the scan server. If this is the first scan in a while, wait a minute and try again.";

async function api<T>(url: string, body: unknown): Promise<T> {
  let r: Response;
  try { r = await fetch(API + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch { throw new Error(NO_SERVER); }
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error ?? NO_SERVER);
  return j as T;
}
async function shrink(f: File): Promise<string> {
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}
function hits(text: string, sigs: Signal[]) {
  const low = text.toLowerCase(), all: { s: number; e: number; i: number; g: boolean }[] = [];
  sigs.forEach((sg, i) => sg.quotes.forEach((q) => {
    const k = q.trim().toLowerCase(), s = k.length > 2 ? low.indexOf(k) : -1;
    if (s >= 0) all.push({ s, e: s + k.length, i, g: sg.severity === "low" });
  }));
  all.sort((a, b) => a.s - b.s || b.e - a.e);
  const kept: typeof all = []; let end = 0;
  for (const h of all) if (h.s >= end) { kept.push(h); end = h.e; }
  return kept;
}
function Ring({ v }: { v: Verdict }) {
  const [on, setOn] = useState(false), [n, setN] = useState(0), un = v.risk === "unclear";
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true)), t0 = performance.now();
    let raf = 0;
    const f = (t: number) => { const k = reduce ? 1 : Math.min(1, (t - t0) / 1000); setN(Math.round(v.score * (1 - (1 - k) ** 3))); if (k < 1) raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    return () => { cancelAnimationFrame(id); cancelAnimationFrame(raf); };
  }, [v]);
  return (
    <div className={v.risk}>
      <div className="ring">
        <svg viewBox="0 0 120 120"><circle className="tr" cx="60" cy="60" r="52" /><circle className="fg" cx="60" cy="60" r="52" style={{ strokeDashoffset: on && !un ? 326.7 * (1 - v.score / 100) : 326.7 }} /></svg>
        <div className="num"><span>{un ? "?" : n}</span><small>{un ? "no score" : "risk score"}</small></div>
      </div>
      <span className="badge">{LBL[v.risk]}</span>
    </div>
  );
}

export default function App({ dark, setDark, user, onSignOut }: { dark: boolean; setDark: (d: boolean) => void; user: User; onSignOut: () => void }) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [res, setRes] = useState<Verdict | null>(null);
  const [rev, setRev] = useState<Set<number>>(new Set());
  const [glow, setGlow] = useState<number | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const [beamKey, setBeamKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch(API + "/api/config").then((r) => r.json()).then((c) => setDemoMode(!!c.demo)).catch(() => {}); }, []);
  useEffect(() => {
    if (phase !== "reveal" || !docRef.current) return;
    const d = docRef.current, H = d.scrollHeight || 1, total = reduce ? 0 : 1400;
    const ts = [...d.querySelectorAll<HTMLElement>("mark.f")].map((m, i) => setTimeout(() => setRev((s) => new Set(s).add(i)), ((m.offsetTop + 14) / H) * total * 0.92));
    const t = setTimeout(() => setPhase("done"), total + 250);
    return () => { ts.forEach(clearTimeout); clearTimeout(t); };
  }, [phase]);

  async function scan(t: string) {
    if (busy || t.trim().length < 20) return;
    setBusy(true); setErr(""); setRes(null); setRev(new Set()); setHot(null); setGlow(null); setPhase("wait"); setNote("Reading line by line");
    try {
      const [v] = await Promise.all([api<Verdict>("/api/analyze", { message: t.trim() }), sleep(reduce ? 0 : 900)]);
      setRes(v); setBeamKey((k) => k + 1); setPhase("reveal");
      await sleep(reduce ? 0 : 1700);
      setNote("Hover a signal to light up its phrases.");
    } catch (e) { setErr((e as Error).message); setPhase("idle"); setNote(""); }
    finally { setBusy(false); }
  }
  async function onFile(f?: File) {
    if (!f || busy) return;
    setBusy(true); setErr(""); setNote("Reading the screenshot");
    try {
      const { text: t } = await api<{ text: string }>("/api/extract", { image: await shrink(f) });
      setText(t); setBusy(false); await scan(t);
    } catch (e) { setErr((e as Error).message); setBusy(false); setNote(""); }
    if (fileRef.current) fileRef.current.value = "";
  }
  function focusSource(id: string) {
    setHot(id);
    document.getElementById("e-" + id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const shown = phase === "reveal" || phase === "done";
  const marks = res ? hits(text.trim(), res.signals) : [];
  const parts: React.ReactNode[] = [];
  if (shown && res) {
    const t = text.trim(); let p = 0;
    marks.forEach((h, k) => {
      parts.push(t.slice(p, h.s));
      parts.push(<mark key={k} className={`f ${h.g ? "g" : "r"}${rev.has(k) ? " on" : ""}${glow === h.i ? " glow" : ""}`}>{t.slice(h.s, h.e)}<sup>{h.i + 1}</sup></mark>);
      p = h.e;
    });
    parts.push(t.slice(p));
  }

  return (
    <div className="wrap">
      <nav>
        <div className="brand"><svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><path d="M14 2.5l9.5 3.7v7.4c0 5.7-4 10-9.5 12-5.5-2-9.5-6.3-9.5-12V6.2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M9.5 14l3.2 3.2 5.8-6" fill="none" stroke="var(--a1)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>OfferCheck</div>
        <div className="who">
          <span className="tiny" title={user.email}>Hi, {user.name}</span>
          <button className="link" onClick={onSignOut}>Sign out</button>
          <button className="sw" role="switch" aria-checked={dark} aria-label="Dark mode" onClick={() => setDark(!dark)}><span className="knob">{dark ? "☾" : "☀"}</span></button>
        </div>
      </nav>
      <section className="hero">
        <h1>Is this offer <em>real</em>?</h1>
        <p className="sub">Paste any internship or job message, or upload a screenshot. We flag the risky phrases and show the evidence behind every call.</p>
        <div className="samples">{(["scam", "legit", "cert"] as const).map((k) => <button key={k} className="pill" disabled={busy} onClick={() => { setText(SAMPLES[k]); scan(SAMPLES[k]); }}>{{ scam: "Scam offer", legit: "Genuine invite", cert: "Fake certificate" }[k]}</button>)}</div>
      </section>
      {demoMode && <p className="banner">Demo mode: no LLM key is set on the server, so scoring uses built-in rules and screenshot reading is off. Add LLM_API_KEY to switch on retrieval and the LLM.</p>}
      <section className="bench">
        <div className="pane">
          <div className="ph"><span>Your message</span>{phase !== "idle" && <button className="link" onClick={() => { setPhase("idle"); setNote(""); }}>Edit message</button>}</div>
          <div className="stage">
            {phase === "idle" ? <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the offer message here" aria-label="Offer message" />
              : <div className="doc" ref={docRef}>{shown ? parts : text.trim()}</div>}
            <div key={beamKey} className={`beam ${phase === "wait" ? "loop" : phase === "reveal" ? "run" : ""}`} />
          </div>
          <div className="act">
            <button className="go" disabled={busy || text.trim().length < 20} onClick={() => scan(text)}>{busy ? "Scanning" : phase === "idle" ? "Scan this offer" : "Scan again"}</button>
            <button className="ghost" disabled={busy} onClick={() => fileRef.current?.click()}>Upload screenshot</button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hide" onChange={(e) => onFile(e.target.files?.[0])} />
            <span className="tiny">{note || "Highlights appear as the scan passes over them."}</span>
          </div>
          {err && <p className="err" role="alert">{err}</p>}
        </div>
        <div className="pane" aria-live="polite">
          <div className="ph"><span>Verdict</span></div>
          {phase !== "done" || !res ? (
            <div className="empty">
              <div className="ring"><svg viewBox="0 0 120 120"><circle className="tr" cx="60" cy="60" r="52" strokeDasharray="4 9" /></svg><div className="num" style={{ color: "var(--mute)" }}>?</div></div>
              <div>Run a scan to see the risk score,<br />the flagged phrases and their evidence.</div>
            </div>
          ) : (
            <div className="vc">
              <Ring v={res} />
              <p className="summary">{res.summary}</p>
              <ul className="sigs">
                {res.signals.map((s, i) => (
                  <li key={s.label} className={`sig ${s.severity}`} style={{ animationDelay: `${0.15 + i * 0.12}s` }} onMouseEnter={() => setGlow(i)} onMouseLeave={() => setGlow(null)}>
                    <span className="no">{i + 1}</span>
                    <div><b>{s.label}</b>{s.evidence.map((id) => <button key={id} className="chip" aria-label={`Show evidence ${id.slice(1)}`} onClick={() => focusSource(id)}>{id.slice(1)}</button>)}<p>{s.explanation}</p></div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
      {phase === "done" && res && res.sources.length > 0 && (
        <section className="ev">
          <h2>Evidence</h2><p className="tiny" style={{ margin: 0 }}>Each number in a signal links to the passage it relies on.</p>
          <div className="grid">
            {res.sources.map((p, i) => {
              const k = p.key ? p.text.indexOf(p.key) : -1;
              return (
                <article key={p.id} id={"e-" + p.id} className={`card sweep${hot === p.id ? " hot" : ""}`} style={{ ["--d" as string]: `${0.2 + i * 0.25}s` }}>
                  <div className="m"><span className="n">{p.id.slice(1)}</span>{p.title}</div>
                  <p>{k >= 0 ? <>{p.text.slice(0, k)}<mark>{p.key}</mark>{p.text.slice(k + p.key!.length)}</> : p.text}</p>
                  <small>{p.source}</small>
                </article>
              );
            })}
          </div>
        </section>
      )}
      <footer>OfferCheck reports risk signals, never accusations. Always verify a company independently before paying or sharing documents.</footer>
    </div>
  );
}
