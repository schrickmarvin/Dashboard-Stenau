import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Aktuellen User laden
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    // Auf Login / Logout reagieren
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui" }}>
        <h1>Dashboard Stenau</h1>
        <p>Lade…</p>
      </div>
    );
  }

  // Nicht eingeloggt → zurück zur Login-Seite
  if (!user) {
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
    return null;
  }

  return (
    <div style={{ padding: 40, fontFamily: "system-ui" }}>
      {/* Kopfbereich */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20
        }}
      >
        <h1>Dashboard</h1>
        <button onClick={signOut} style={{ padding: 10 }}>
          Logout
        </button>
      </div>

      <p>Angemeldet als: {user.email}</p>

      <hr style={{ margin: "20px 0" }} />

      {/* Übersicht */}
      <h2>Übersicht</h2>
      <ul>
        <li>Aufgaben heute: 0</li>
        <li>Aufgaben diese Woche: 0</li>
        <li>Offene Aufgaben: 0</li>
      </ul>

      <hr style={{ margin: "20px 0" }} />

      {/* Platzhalter für nächste Schritte */}
      <h2>Nächste Bereiche</h2>
      <ul>
        <li>Aufgaben (Liste)</li>
        <li>Kalender</li>
        <li>Timeline</li>
        <li>Anleitungen</li>
      </ul>

      <p style={{ marginTop: 20, opacity: 0.7 }}>
        Hier bauen wir als Nächstes die Bereiche, Aufgaben und Anleitungen ein.
      </p>
    </div>
  );
}
