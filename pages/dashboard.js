import { useEffect, useMemo, useState } from "react";
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
  { id: "guides", label: "Anleitungen" }
];

export default function Dashboard() {
  // --- Hooks IMMER oben, keine frühen returns davor ---
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [tasks, setTasks] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState("");

  const [activeTab, setActiveTab] = useState("board");

  // Zählwerte (Hook-sicher: useMemo steht oben, vor allen returns)
  const counts = useMemo(() => {
    return {
      today: tasks.filter((t) => t.due === "Heute" && t.status !== "done").length,
      week: tasks.filter((t) => t.due === "Diese Woche" && t.status !== "done").length,
      open: tasks.filter((t) => t.status !== "done").length
    };
  }, [tasks]);

  // --- Auth laden ---
  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      setLoadingAuth(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      try {
        authListener?.subscription?.unsubscribe?.();
      } catch (e) {}
    };
  }, []);

  // --- Tasks laden (Read-Only / Stufe 1) ---
  useEffect(() => {
    let cancelled = false;

    async function loadTasks() {
      if (!user) {
        setTasks([]);
        setLoadingData(false);
        return;
      }

      setLoadingData(true);
      setDataError("");

      // Hinweis: Join funktioniert nur, wenn FK tasks.area_id -> areas.id existiert.
      // Wenn das bei dir noch nicht passt, funktioniert der Fallback ohne Join.
      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,status,due_bucket,subtasks_done,subtasks_total,created_at,areas(name)")
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        // Fallback: ohne Join laden (damit es nicht crasht)
        const fb = await supabase
          .from("tasks")
          .select("id,title,status,due_bucket,subtasks_done,subtasks_total,created_at")
          .order("created_at", { ascending: false });

        if (cancelled) return;

        if (fb.error) {
          setDataError(fb.error.message);
          setTasks([]);
        } else {
          const mapped = (fb.data || []).map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            due: t.due_bucket,
            area: "—",
            subtasksDone: t.subtasks_done ?? 0,
            subtasksTotal: t.subtasks_total ?? 0
          }));
          setTasks(mapped);
          setDataError(
            "Hinweis: Join auf areas hat nicht funktioniert. Aufgaben werden ohne Bereich geladen (—). " +
              "Prüfe FK tasks.area_id → areas.id und/oder RLS."
          );
        }
      } else {
        const mapped = (data || []).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          due: t.due_bucket,
          area: t.areas?.name || "Ohne Bereich",
          subtasksDone: t.subtasks_done ?? 0,
          subtasksTotal: t.subtasks_total ?? 0
        }));
        setTasks(mapped);
      }

      setLoadingData(false);
    }

    loadTasks();

    return () => {
      cancelled = true;
    };
  }, [user]);

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    if (typeof window !== "undefined") window.location.href = "/";
  }

  // --- Erst ab hier returns (Hook-Reihenfolge bleibt stabil) ---
  if (loadingAuth) {
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
        {/* Sidebar */}
        <div
          style={{
            width: 220,
            padding: 14,
            borderRight: "1px solid #e5e7eb",
            background: "white"
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>Übersicht</div>

          <div style={{ display: "grid", gap: 8 }}>
            <StatCard label="Aufgaben heute" value={counts.today} />
            <StatCard label="Diese Woche" value={counts.week} />
            <StatCard label="Offen" value={counts.open} />
          </div>

          <div style={{ marginTop: 18, fontSize: 12, opacity: 0.7 }}>Navigation</div>
          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  textAlign: "left",
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: activeTab === t.id ? "#eef2ff" : "white",
                  cursor: "pointer"
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, padding: 18 }}>
          {/* Tabs oben */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: activeTab === t.id ? "white" : "transparent",
                  cursor: "pointer"
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loadingData && <Placeholder title="Lade Daten…" text="Supabase wird abgefragt." />}

          {!loadingData && dataError && (
            <div style={{ marginBottom: 12 }}>
              <Placeholder title="Hinweis / Fehler" text={dataError} />
            </div>
          )}

          {!loadingData && (
            <>
              {activeTab === "board" && <BoardView tasks={tasks} />}
              {activeTab === "list" && <ListView tasks={tasks} />}
              {activeTab === "calendar" && (
                <Placeholder title="Kalender" text="Kommt als nächstes – aktuell Stufe 1 (lesen)." />
              )}
              {activeTab === "timeline" && (
                <Placeholder title="Timeline" text="Kommt als nächstes – aktuell Stufe 1 (lesen)." />
              )}
              {activeTab === "guides" && (
                <Placeholder title="Anleitungen" text="Kommt als nächstes – aktuell Stufe 1 (lesen)." />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function BoardView({ tasks }) {
  const cols = [
    { id: "todo", title: "To do" },
    { id: "doing", title: "In Arbeit" },
    { id: "done", title: "Erledigt" }
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
      {cols.map((col) => (
        <div key={col.id} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>{col.title}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{tasks.filter((t) => t.status === col.id).length}</div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {tasks
              .filter((t) => t.status === col.id)
              .map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}

            {tasks.filter((t) => t.status === col.id).length === 0 && (
              <div style={{ fontSize: 12, opacity: 0.6, padding: 8 }}>Keine Aufgaben</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskCard({ task }) {
  const progress =
    task.subtasksTotal > 0 ? Math.round((task.subtasksDone / task.subtasksTotal) * 100) : 0;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{task.title}</div>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
        {task.area} • {task.due}
      </div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>
        Unteraufgaben: {task.subtasksDone}/{task.subtasksTotal} ({progress}%)
      </div>
    </div>
  );
}

function ListView({ tasks }) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Aufgabenliste</div>

      <div style={{ width: "100%", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
              <th style={{ padding: 10 }}>Aufgabe</th>
              <th style={{ padding: 10 }}>Bereich</th>
              <th style={{ padding: 10 }}>Zeitraum</th>
              <th style={{ padding: 10 }}>Status</th>
              <th style={{ padding: 10 }}>Unteraufgaben</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: 10 }}>{t.title}</td>
                <td style={{ padding: 10 }}>{t.area}</td>
                <td style={{ padding: 10 }}>{t.due}</td>
                <td style={{ padding: 10 }}>{statusLabel(t.status)}</td>
                <td style={{ padding: 10 }}>
                  {t.subtasksDone}/{t.subtasksTotal}
                </td>
              </tr>
            ))}

            {tasks.length === 0 && (
              <tr>
                <td colSpan="5" style={{ padding: 10, opacity: 0.7 }}>
                  Keine Aufgaben gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusLabel(status) {
  if (status === "todo") return "To do";
  if (status === "doing") return "In Arbeit";
  if (status === "done") return "Erledigt";
  return status;
}

function Placeholder({ title, text }) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ opacity: 0.8 }}>{text}</div>
    </div>
  );
}
