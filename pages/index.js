// pages/index.js
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/router";

/* ---------------- Supabase Client ---------------- */
function getSupabaseClient() {
  if (typeof window === "undefined") return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn("Supabase ENV fehlt");
    return null;
  }

  if (!window.__supabase__) {
    window.__supabase__ = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }

  return window.__supabase__;
}

/* ---------------- Page ---------------- */
export default function IndexPage() {
  const router = useRouter();
  const [supabase, setSupabase] = useState(null);
  const [session, setSession] = useState(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  /* Init Supabase */
  useEffect(() => {
    setSupabase(getSupabaseClient());
  }, []);

  /* Session prüfen */
  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/dashboard");
      } else {
        setSession(null);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace("/dashboard");
      }
    });

    return () => data.subscription.unsubscribe();
  }, [supabase, router]);

  /* Login */
  const login = async () => {
    setError("");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setError(error.message);
  };

  /* UI */
  return (
    <div style={{ padding: 40, maxWidth: 420, margin: "0 auto" }}>
      <h2>Bitte einloggen</h2>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <input
        placeholder="E-Mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", marginBottom: 10 }}
      />

      <input
        type="password"
        placeholder="Passwort"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: "100%", marginBottom: 10 }}
      />

      <button onClick={login} style={{ width: "100%" }}>
        Login
      </button>
    </div>
  );
}
