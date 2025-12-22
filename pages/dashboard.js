// pages/dashboard.js
import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const TABS = [
  { id: "board", label: "Planke" },
  { id: "list", label: "Liste" },
  { id: "calendar", label: "Kalender" },
  { id: "timeline", label: "Zeitleiste" },
  { id: "guides", label: "Anleitungen" }
];

const PERIODS = [
  { id: "Heute", label: "Heute" },
  { id: "Diese Woche", label: "Diese Woche" },
  { id: "Monat", label: "Monat" }
];

const STATUSES = [
  { id: "todo", label: "Zu erledigen" },
  { id: "doing", label: "In Arbeit" },
  { id: "done", label: "Erledigt" }
];

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("board");

  const [loadingData, setLoadingData] = useState(false);
  const [areas, setAreas] = useState([]);
  const [tasks, setTasks] = useState([]);

  // Filter
  const [filterArea, setFilterArea] = useState("ALL");
  const [filterPeriod, setFilterPeriod] = useState("ALL");
  const [search, setSearch] = useState("");

  // New task form
  const [newTitle, setNewTitle] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [newPeriod, setNewPeriod] = useState("Heute");
  const [newStatus, setNewStatus] = useState("todo");

  // -------- AUTH --------
  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      setAuthLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      if (typeof window !== "undefined") window.location.href = "/";
    }
  }, [authLoading, user]);

  const fetchData = useCallback(async () => {
    setLoadingData(true);

    // Areas
    const { data: areasData, error: areasError } = await supabase
      .from("areas")
      .select("id,name")
      .order("name", { ascending: true });

    if (areasError) {
      alert(
        `Fehler beim Laden der Bereiche: ${areasError.message}\n\nHinweis: Prüfe ob Tabelle "areas" existiert und RLS passt.`
      );
      setLoadingData(false);
      return;
    }

    setAreas(Array.isArray(areasData) ? areasData : []);

    // Tasks (mit area join)
    const { data: tasksData, error: tasksError } = await supabase
      .from("tasks")
      .select("id,title,area_id,period,status,created_at,areas(name)")
      .order("created_at", { ascending: false });

    if (tasksError) {
      alert(
        `Fehler beim Laden der Aufgaben: ${tasksError.message}\n\nHinweis: Dieses Dashboard erwartet in "tasks" die Spalten: title, area_id, period, status.`
      );
      setLoadingData(false);
      return;
    }

    const normalized = (Array.isArray(tasksData) ? tasksData : []).map((t) => ({
      id: t.id,
      title: t.title ?? "",
      area_id: t.area_id ?? null,
      area_name: t.areas?.name ?? "",
      period: t.period ?? "Heute",
      status: t.status ?? "todo",
      created_at: t.created_at
    }));

    setTasks(normalized);
    setLoadingData(false);
  }, []);

  // Load data after login
  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user, fetchData]);

  async function signOut() {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") window.location.href = "/";
  }

  async function createTask() {
    const title = (newTitle || "").trim();
    if (!title) {
      alert("Bitte Titel eingeben.");
      return;
    }
    if (!newAreaId) {
      alert("Bitte Bereich auswählen.");
      return;
    }

    const payload = {
      title,
      area_id: newAreaId,
      period: newPeriod,
      status: newStatus
    };

    const { error } = await supabase.from("tasks").insert(payload);
    if (error) {
      alert(`Fehler beim Anlegen: ${error.message}`);
      return;
    }

    // reset + reload
    setNewTitle("");
    setNewStatus("todo");
    setNewPeriod("Heute");
    await fetchData();
  }

  const filteredTasks = useMemo(() => {
    let t = [...tasks];

    if (filterArea !== "ALL") t = t.filter((x) => x.area_id === filterArea);
    if (filterPeriod !== "ALL") t = t.filter((x) => x.period === filterPeriod);

    const q = (search || "").trim().toLowerCase();
    if (q) t = t.filter((x) => (x.title || "").toLowerCase().includes(q));

    return t;
  }, [tasks, filterArea, filterPeriod, search]);

  const counts = useMemo(() => {
    const open = filteredTasks.filter((t) => t.status !== "done").length;
    const today = filteredTasks.filter((t) => t.period === "Heute" && t.status !== "done").length;
    const week = filteredTasks.filter((t) => t.period === "Diese Woche" && t.status !== "done").length;
    return { today, week, open };
  }, [filteredTasks]);

  if (authLoading) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Armaturenbrett</h1>
        <p>Lade…</p>
      </div>
    );
  }

  if (!user) {
    // redirect handled in effect
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
          <div style={{ fontSize: 18, fontWeight: 700 }}>Armaturenbrett</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Angemeldet als: {user.email}</div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={fetchData}
            style={{ padding: "10px 12px", cursor: "pointer" }}
            title="Daten neu laden"
          >
            Neu laden
          </button>
          <button onClick={signOut} style={{ padding: "10px 12px", cursor: "pointer" }}>
            Abmelden
          </button>
        </div>
      </div>

      <div style={{ display: "flex" }}>
        {/* Sidebar */}
        <div
          style={{
            width: 260,
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

          <div style={{ marginTop: 18, fontSize: 12, opacity: 0.7 }}>Filter</div>

          <select
            value={filterArea}
            onChange={(e) => setFilterArea(e.target.value)}
            style={{ marginTop: 8, padding: 10, width: "100%", borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option value="ALL">Alle Bereiche</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            style={{ marginTop: 8, padding: 10, width: "100%", borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option value="ALL">Alle Zeiträume</option>
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche…"
            style={{ marginTop: 8, padding: 10, width: "100%", borderRadius: 10, border: "1px solid #e5e7eb" }}
          />

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
            {loadingData ? "Lade Daten…" : `${filteredTasks.length} Aufgabe(n)`}
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

          {/* Task create box */}
          {(activeTab === "board" || activeTab === "list") && (
            <div
              style={{
                background: "white",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 14,
                marginBottom: 12
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Aufgabe anlegen</div>

              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.5fr 0.35fr 0.45fr 0.25fr", gap: 10 }}>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Titel"
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                />

                <select
                  value={newAreaId}
                  onChange={(e) => setNewAreaId(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                >
                  <option value="">Bereich auswählen</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>

                <select
                  value={newPeriod}
                  onChange={(e) => setNewPeriod(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                >
                  {PERIODS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>

                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                >
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>

                <button
                  onClick={createTask}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", cursor: "pointer" }}
                >
                  Anlegen
                </button>
              </div>
            </div>
          )}

          {activeTab === "board" && <BoardView tasks={filteredTasks} />}
          {activeTab === "list" && <ListView tasks={filteredTasks} />}
          {activeTab === "calendar" && (
            <Placeholder title="Kalender" text="Hier kommt die Wochen-/Monatsansicht rein." />
          )}
          {activeTab === "timeline" && (
            <Placeholder title="Zeitleiste" text="Hier kommt die Zeitachse für Monat/Jahr-Aufgaben rein." />
          )}
          {activeTab === "guides" && (
            <Placeholder title="Anleitungen" text="Hier kommt der Wiki-/Anleitungsbereich rein." />
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
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function BoardView({ tasks }) {
  const cols = [
    { id: "todo", title: "Zu erledigen" },
    { id: "doing", title: "In Arbeit" },
    { id: "done", title: "Erledigt" }
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
      {cols.map((col) => (
        <div
          key={col.id}
          style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 800 }}>{col.title}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{tasks.filter((t) => t.status === col.id).length}</div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {tasks.filter((t) => t.status === col.id).length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.7 }}>Keine Aufgaben</div>
            ) : (
              tasks
                .filter((t) => t.status === col.id)
                .map((t) => <TaskCard key={t.id} task={t} />)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskCard({ task }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>{task.title}</div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>
        {(task.area_name || "—")} • {task.period || "—"}
      </div>
    </div>
  );
}

function ListView({ tasks }) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>Aufgabenliste</div>

      <div style={{ width: "100%", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
              <th style={{ padding: 10 }}>Aufgabe</th>
              <th style={{ padding: 10 }}>Bereich</th>
              <th style={{ padding: 10 }}>Zeitraum</th>
              <th style={{ padding: 10 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td style={{ padding: 10, opacity: 0.7 }} colSpan={4}>
                  Keine Aufgaben
                </td>
              </tr>
            ) : (
              tasks.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: 10 }}>{t.title}</td>
                  <td style={{ padding: 10 }}>{t.area_name || "—"}</td>
                  <td style={{ padding: 10 }}>{t.period || "—"}</td>
                  <td style={{ padding: 10 }}>{statusLabel(t.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusLabel(status) {
  if (status === "todo") return "Zu erledigen";
  if (status === "doing") return "In Arbeit";
  if (status === "done") return "Erledigt";
  return status || "—";
}

function Placeholder({ title, text }) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>
      <div style={{ opacity: 0.8 }}>{text}</div>
    </div>
  );
}
