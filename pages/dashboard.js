import { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const TABS = [
  { id: "board", label: "Board" },
  { id: "list", label: "Liste" },
  { id: "calendar", label: "Kalender" },
  { id: "timeline", label: "Timeline" },
  { id: "guides", label: "Anleitungen" },
  { id: "areas", label: "Bereiche" }
];

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("board");
  const [tasks, setTasks] = useState([]);

  // Demo-Daten (später aus Supabase)
  const demoTasks = useMemo(
    () => [
      {
        id: "t1",
        title: "Tourenplanung morgen",
        area: "Disposition",
        due: "Heute",
        status: "todo",
        subtasksDone: 1,
        subtasksTotal: 3
      },
      {
        id: "t2",
        title: "UVV Prüfliste aktualisieren",
        area: "Fuhrpark",
        due: "Diese Woche",
        status: "doing",
        subtasksDone: 2,
        subtasksTotal: 5
      },
      {
        id: "t3",
        title: "Monatsaufgabe: Kostenübersicht",
        area: "Verwaltung",
        due: "Monat",
        status: "done",
        subtasksDone: 4,
        subtasksTotal: 4
      }
    ],
    []
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    );

    return () => authListener.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Dashboard Stenau</h1>
        <p>Lade…</p>
      </div>
    );
  }

  if (!user) {
    if (typeof window !== "undefined") window.location.href = "/";
    return null;
  }

  const counts = {
    today: demoTasks.filter((t) => t.due === "Heute" && t.status !== "done").length,
    week: demoTasks.filter((t) => t.due === "Diese Woche" && t.status !== "done").length,
    open: demoTasks.filter((t) => t.status !== "done").length
  };

  return (
    <div style={{ fontFamily: "system-ui", minHeight: "100vh", background: "#f6f7f9" }}>
      {/* Topbar */}
      <div
        style={{
          background: "white",
          borderBottom: "1px solid #e5e7eb",
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Dashboard</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Angemeldet als: {user.email}</div>
        </div>

        <button onClick={signOut} style={{ padding: "10px 12px", cursor: "pointer" }}>
          Logout
        </button>
      </div>

      <div style={{ display: "flex" }}>
        {/* Sidebar (minimal) */}
        <div
          style={{
            width: 220,
