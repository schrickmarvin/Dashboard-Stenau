// pages/login.js
import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { createClient } from "@supabase/supabase-js";

/* -------------------------------------------------------
   Supabase (client-only, singleton)
------------------------------------------------------- */
function getSupabaseClient() {
  if (typeof window === "undefined") return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // eslint-disable-next-line no-console
    console.warn("Supabase ENV fehlt: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return null;
  }

  if (!window.__supabase__) {
    window.__supabase__ = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }

  return window.__supabase__;
}

export default function LoginPage() {
  const router = useRouter();
  const [supabase, setSupabase] = useState(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupabase(getSupabaseClient());
  }, []);

  // Wenn schon eingeloggt -> direkt ins Dashboard
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) router.replace("/dashboard");
    });
  }, [supabase, router]);

  const login = async () => {
    if (!supabase) {
      setMsg("Supabase ist nicht initialisiert. Bitte ENV prüfen (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setMsg(error.message);
        return;
      }
      router.replace("/dashboard");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f6f7fb" }}>
      <div style={{ width: "100%", maxWidth: 420, background: "white", borderRadius: 16, padding: 24, boxShadow: "0 8px 30px rgba(0,0,0,0.08)" }}>
        <h2 style={{ margin: 0, marginBottom: 14 }}>Bitte einloggen</h2>

        {msg && (
          <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10, borderRadius: 10, marginBottom: 12 }}>
            {msg}
          </div>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          <input
            placeholder="E-Mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
          <input
            type="password"
            placeholder="Passwort"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb" }}
          />

          <button
            onClick={login}
            disabled={busy}
            style={{
              padding: 12,
              borderRadius: 10,
              border: "none",
              background: busy ? "#9ca3af" : "#0f6b2f",
              color: "white",
              fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Bitte warten…" : "Login"}
          </button>
        </div>
      </div>
    </div>
  );
}
