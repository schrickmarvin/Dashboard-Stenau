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
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => authListener.subscription.unsubscribe();
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

  // Nicht eingeloggt → zurück zur Startseite (Login)
  if (!user) {
    if (typeof window !== "undefined") window.location.href = "/";
    return null;
  }

  return (
    <div style={{ padding: 40, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Dashboard</h1>
        <button onClick={signOut} style={{ padding: 10 }}>
          Logout
        </button>
      </div>

      if (typeof window !== "undefined") {
  window.location.href = "/dashboard";
}
return null;


      <hr style={{ margin: "20px 0" }} />

      <h2>Übersicht</h2>
      <ul>
        <li>Heute fällig: 0</li>
        <li>Diese Woche: 0</li>
        <li>Offen: 0</li>
      </ul>

      <p style={{ marginTop: 20, opacity: 0.75 }}>
        Nächster Schritt: Bereiche, Aufgaben, Kalender, Timeline.
      </p>
    </div>
  );
}
