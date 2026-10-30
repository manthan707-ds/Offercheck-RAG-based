import { useCallback, useEffect, useState } from "react";
import App from "./App";
import SignIn, { type User } from "./SignIn";

const KEY = "offercheck:user";

function load(): User | null {
  try { const v = localStorage.getItem(KEY); return v ? (JSON.parse(v) as User) : null; } catch { return null; }
}

export default function Root() {
  const [user, setUser] = useState<User | null>(load);
  const [dark, setDark] = useState(() => matchMedia("(prefers-color-scheme:dark)").matches);
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);

  const signIn = useCallback((u: User) => {
    try { localStorage.setItem(KEY, JSON.stringify(u)); } catch { /* storage blocked: stay signed in for this tab only */ }
    setUser(u);
    window.scrollTo(0, 0);
  }, []);
  const signOut = useCallback(() => {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    setUser(null);
  }, []);

  return user
    ? <App dark={dark} setDark={setDark} user={user} onSignOut={signOut} />
    : <SignIn dark={dark} setDark={setDark} onAuth={signIn} />;
}
