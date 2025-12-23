// pages/index.js
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function LoginPage() {
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let mounted = true;

    // 1) Beim Laden prüfen, ob bereits eingeloggt
    supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      if (!error && data?.user) {
        window.location.href = "/dashboard";
        return;
      }
      setChecking(false);
    });

    // 2) Bei Login-Änderung automatisch weiterleiten
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) window.location.href = "/dashboard";
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  async function signIn(e) {
    e?.preventDefault?.();
    setErrorMsg("");

    if (!email || !password) {
      setErrorMsg("Bitte E-Mail und Passwort eingeben.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);

    if (error) setErrorMsg(error.message);
    // Bei Erfolg übernimmt onAuthStateChange die Weiterleitung
  }

  if (checking) {
    return (
      <div style={styles.page}>
        <div style={styles.centerWrap}>
          <div style={styles.card}>
            <div style={{ opacity: 0.8 }}>Lade…</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.bgGlow1} />
      <div style={styles.bgGlow2} />
      <div style={styles.gridOverlay} />

      <div style={styles.centerWrap}>
        <div style={styles.card}>
          <div style={styles.header}>
            <div style={styles.logoMark} aria-hidden="true" />
            <div style={styles.titleBlock}>
              <div style={styles.title}>Armaturenbrett</div>
              <div style={styles.subtitle}>Bitte anmelden, um fortzufahren.</div>
            </div>
          </div>

          <form onSubmit={signIn} style={{ display: "grid", gap: 12 }}>
            <label style={styles.label}>
              E-Mail
              <input
                style={styles.input}
                placeholder="name@firma.de"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>

            <label style={styles.label}>
              Passwort
              <input
                style={styles.input}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>

            {errorMsg ? <div style={styles.error}>{errorMsg}</div> : null}

            <button type="submit" style={styles.button} disabled={busy}>
              {busy ? "Anmelden…" : "Anmelden"}
            </button>

            <div style={styles.footerHint}>
              Wenn du dein Passwort nicht kennst, nutze die Supabase-Konsole zum Zurücksetzen.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    background: "linear-gradient(180deg, #0b1220 0%, #0a0f1a 45%, #070a12 100%)",
    color: "#e8eefc",
    position: "relative",
    overflow: "hidden"
  },
  centerWrap: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 20,
    position: "relative",
    zIndex: 2
  },
  card: {
    width: "min(520px, 92vw)",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 18,
    padding: 22,
    boxShadow: "0 20px 70px rgba(0,0,0,0.45)",
    backdropFilter: "blur(10px)"
  },
  header: {
    display: "flex",
    gap: 14,
    alignItems: "center",
    marginBottom: 16
  },
  logoMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    background:
      "linear-gradient(135deg, rgba(130,170,255,0.95), rgba(120,255,214,0.75))",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)"
  },
  titleBlock: { display: "grid", gap: 2 },
  title: { fontSize: 20, fontWeight: 650, letterSpacing: 0.2 },
  subtitle: { fontSize: 13, opacity: 0.8, lineHeight: 1.35 },

  label: { display: "grid", gap: 6, fontSize: 13, opacity: 0.95 },
  input: {
    width: "100%",
    padding: "11px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(10,15,26,0.55)",
    color: "#e8eefc",
    outline: "none"
  },
  button: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background:
      "linear-gradient(135deg, rgba(130,170,255,0.95), rgba(120,255,214,0.75))",
    color: "#06101a",
    cursor: "pointer",
    fontWeight: 650
  },
  error: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,120,120,0.35)",
    background: "rgba(255,120,120,0.12)",
    color: "#ffd7d7",
    fontSize: 13
  },
  footerHint: { fontSize: 12, opacity: 0.65, marginTop: 2 },

  // Background decor
  bgGlow1: {
    position: "absolute",
    inset: "-20% auto auto -20%",
    width: 520,
    height: 520,
    borderRadius: 999,
    background: "radial-gradient(circle, rgba(130,170,255,0.35), transparent 65%)",
    filter: "blur(2px)"
  },
  bgGlow2: {
    position: "absolute",
    inset: "auto -20% -25% auto",
    width: 620,
    height: 620,
    borderRadius: 999,
    background: "radial-gradient(circle, rgba(120,255,214,0.20), transparent 65%)",
    filter: "blur(2px)"
  },
  gridOverlay: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
    backgroundSize: "48px 48px",
    opacity: 0.12,
    zIndex: 1
  }
};
