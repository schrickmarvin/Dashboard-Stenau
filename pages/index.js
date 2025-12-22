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
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Initialer User-Check
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      const u = data.user ?? null;
      setUser(u);
      setLoadingAuth(false);

      // Wenn bereits eingeloggt -> direkt weiter
      if (u && typeof window !== "undefined") {
        window.location.replace("/dashboard");
      }
    });

    // Listener für Login/Logout
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);

      // Nach Login -> weiterleiten
      if (u && typeof window !== "undefined") {
        window.location.replace("/dashboard");
      }
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

    setWorking(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setWorking(false);

    if (error) alert(error.message);
    // Redirect passiert im Auth-Listener automatisch
  }

  if (loadingAuth) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui" }}>
        <h1>Dashboard Stenau</h1>
        <p>Lade…</p>
      </div>
    );
  }

  // Wenn eingeloggt, zeigen wir hier nichts (Redirect passiert)
  if (user) return null;

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

        <button onClick={signIn} style={{ padding: 10 }} disabled={working}>
          {working ? "Login…" : "Login"}
        </button>
      </div>
    </div>
  );
}
