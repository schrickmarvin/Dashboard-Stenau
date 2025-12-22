import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Home() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      setLoadingAuth(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      try {
        authListener?.subscription?.unsubscribe?.();
      } catch {}
    };
  }, []);

  async function signIn() {
    if (!email || !password) {
      alert("E-Mail und Passwort eingeben");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  }

  if (loadingAuth) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui" }}>
        <h1>Dashboard Stenau</h1>
        <p>Lade…</p>
      </div>
    );
  }

  if (user) {
    if (typeof window !== "undefined") window.location.href = "/dashboard";
    return null;
  }

  return (
    <div style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>Dashboard Stenau</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: 320 }}>
        <input
          placeholder="E-Mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10 }}
        />
        <input
          type="password"
          placeholder="Passwort"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 10 }}
        />
        <button onClick={signIn} style={{ padding: 10 }}>
          Login
        </button>
      </div>

      <p style={{ marginTop: 18, opacity: 0.7, fontSize: 12 }}>
        Tipp: Wenn du später „Als App installieren“ willst: Chrome Menü → „App installieren“ (PWA).
      </p>
    </div>
  );
}
