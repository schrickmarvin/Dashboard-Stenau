import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Home() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialen Status laden
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    // Session-Änderungen beobachten (Login/Logout)
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function signIn() {
    if (!email || !password) {
      alert("Bitte E-Mail und Passwort eingeben.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) alert(error.message);
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) alert(error.message);
  }

  if (loading) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui" }}>
        <h1>Dashboard Stenau</h1>
        <p>Lade…</p>
      </div>
    );
  }

  // ---------- LOGIN ----------
  if (!user) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui" }}>
        <h1>Dashboard Stenau</h1>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            width: 320
          }}
        >
          <input
            placeholder="E-Mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: 10 }}
            autoComplete="email"
          />

          <input
            type="password"
            placeholder="Passwort"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: 10 }}
            autoComplete="current-password"
          />

          <button onClick={signIn} style={{ padding: 10 }}>
            Login
          </button>

          <p style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>
            Hinweis: Benutzer + Passwort müssen in Supabase unter Authentication → Users
            angelegt sein.
          </p>
        </div>
      </div>
    );
  }

  // ---------- EINGELOGGT ----------
  return (
    <div style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>Dashboard Stenau</h1>
      <p>Angemeldet als: {user.email}</p>

      <button onClick={signOut} style={{ padding: 10 }}>
        Logout
      </button>
    </div>
  );
}
