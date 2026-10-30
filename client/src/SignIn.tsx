import { useEffect, useState } from "react";

export type User = { name: string; email: string };
type Mode = "in" | "up";
type Done = { title: string; text: string; reset: boolean };

const EMAIL = /^\S+@\S+\.\S+$/;
const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion:reduce)").matches;
const strength = (v: string) =>
  (v.length >= 8 ? 1 : 0) + (/[A-Z]/.test(v) && /[a-z]/.test(v) ? 1 : 0) + (/\d/.test(v) ? 1 : 0) + (/[^A-Za-z0-9]/.test(v) || v.length >= 12 ? 1 : 0);
const METER = ["var(--hi)", "var(--hi)", "var(--med)", "var(--lo)", "var(--lo)"];

const Sun = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
const Moon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>;

export default function SignIn({ dark, setDark, onAuth }: { dark: boolean; setDark: (d: boolean) => void; onAuth: (u: User) => void }) {
  const [mode, setMode] = useState<Mode>("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [terms, setTerms] = useState(false);
  const [keep, setKeep] = useState(true);
  const [err, setErr] = useState<{ n?: string; e?: string; p?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const up = mode === "up";
  const s = strength(pw);

  // After a successful sign-in, hand over to the scanner automatically.
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => onAuth(user), reduce ? 0 : 1300);
    return () => clearTimeout(t);
  }, [user, onAuth]);

  function switchMode(m: Mode) { setMode(m); setErr({}); }
  function finish(u: User) {
    setUser(u);
    setDone({ title: up ? "Account created" : "You’re in", text: "Taking you to the scanner.", reset: false });
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const x: typeof err = {};
    if (up && name.trim().length < 2) x.n = "Tell us your name.";
    if (!EMAIL.test(email.trim())) x.e = "Enter a valid email address.";
    if (pw.length < 8) x.p = "Use at least 8 characters.";
    else if (up && s < 2) x.p = "Add upper and lower case letters or a number.";
    else if (up && !x.n && !x.e && !terms) x.p = "Please accept the terms to continue.";
    setErr(x);
    if (x.n || x.e || x.p) return;
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      finish({ name: up ? name.trim() : email.trim().split("@")[0], email: email.trim() });
    }, reduce ? 0 : 900);
  }
  function forgot(e: React.MouseEvent) {
    e.preventDefault();
    if (!EMAIL.test(email.trim())) return setErr({ e: "Enter your email first, then we’ll send a reset link." });
    setErr({});
    setDone({ title: "Reset not available yet", text: "Password reset needs an email service, which this version doesn’t have.", reset: true });
  }

  return (
    <div className="si-split">
      <section className="si-art">
        <div className="si-brand"><svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><path d="M14 2.5l9.5 3.7v7.4c0 5.7-4 10-9.5 12-5.5-2-9.5-6.3-9.5-12V6.2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M9.5 14l3.2 3.2 5.8-6" fill="none" stroke="var(--a1)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>OfferCheck</div>
        <div>
          <h1>Check before<br />you <em>trust</em>.</h1>
          <p className="si-sub">Sign in to scan offers, save your past checks and share a verdict with friends before they pay anyone.</p>
          <div className="si-demo" aria-hidden="true">
            <div className="si-t">To activate your LMS access, <mark>pay dues of Rs 1,499</mark> <mark>within 24 hours</mark>. Contact us on <mark>WhatsApp only</mark>.</div>
            <div className="si-verdict"><span className="si-badge">High risk</span><span className="si-s">3 signals, 3 sources</span></div>
            <div className="si-beam" />
          </div>
        </div>
        <div className="si-facts"><div><b>10+</b>scam patterns</div><div><b>100%</b>cited signals</div><div><b>Free</b>for students</div></div>
      </section>

      <section className="si-auth">
        <button className="si-sw" role="switch" aria-checked={dark} aria-label="Dark mode" onClick={() => setDark(!dark)}><span className="si-knob">{dark ? <Moon /> : <Sun />}</span></button>
        <div className={`si-box${up ? " si-up" : ""}`}>
          {!done ? (
            <div>
              <div className="si-tabs" data-m={mode} role="tablist"><i />
                <button role="tab" aria-selected={!up} onClick={() => switchMode("in")}>Sign in</button>
                <button role="tab" aria-selected={up} onClick={() => switchMode("up")}>Create account</button>
              </div>
              <h2>{up ? "Create your account" : "Welcome back"}</h2>
              <p className="si-lead">{up ? "Free for students. Takes under a minute." : "Sign in to see your saved checks."}</p>
              <form onSubmit={submit} noValidate>
                {up && <label className="si-f"><span>Full name</span><div className={`si-in${err.n ? " bad" : ""}`}><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your name" /></div><div className="si-er">{err.n}</div></label>}
                <label className="si-f"><span>Email</span><div className={`si-in${err.e ? " bad" : ""}`}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@college.edu" /></div><div className="si-er">{err.e}</div></label>
                <label className="si-f"><span>Password {!up && <a href="#" onClick={forgot}>Forgot password?</a>}</span>
                  <div className={`si-in${err.p ? " bad" : ""}`}>
                    <input type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={up ? "new-password" : "current-password"} placeholder="At least 8 characters" />
                    <button type="button" className="si-eye" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button>
                  </div>
                  {up && <div className="si-meter">{[0, 1, 2, 3].map((k) => <i key={k} style={k < s ? { background: METER[s] } : undefined} />)}</div>}
                  <div className="si-er">{err.p}</div></label>
                {up
                  ? <label className="si-row"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> I agree to the terms and privacy policy</label>
                  : <label className="si-row"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep me signed in</label>}
                <button className="si-go" type="submit" disabled={busy}>{busy ? (up ? "Creating account" : "Signing in") : up ? "Create account" : "Sign in"}</button>
              </form>
              <div className="si-or">or</div>
              <button className="si-g" type="button" onClick={() => finish({ name: "Google user", email: "" })}><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" /><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 019.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 000 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" /></svg>Continue with Google</button>
              <p className="si-fine">Demo sign-in: your details stay in this browser and are not sent anywhere.</p>
            </div>
          ) : (
            <div className="si-ok" role="status">
              {!done.reset && <svg viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="38" /><path d="M26 43l11 11 21-23" /></svg>}
              <h2>{done.title}</h2>
              <p className="si-lead">{done.text}</p>
              {!done.reset && user && <button className="si-go" onClick={() => onAuth(user)}>Open the scanner</button>}
              {done.reset && <button className="si-ghost" onClick={() => { setDone(null); switchMode("in"); }}>Back to sign in</button>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
