import { useEffect, useMemo, useState } from "react";
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

const PERIODS = ["Heute", "Diese Woche", "Monat", "Jahr"];

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [activeTab, setActiveTab] = useState("board");

  const [areas, setAreas] = useState([]);
  const [loadingAreas, setLoadingAreas] = useState(true);

  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Formular
  const [newTitle, setNewTitle] = useState("");
  const [newPeriod, setNewPeriod] = useState("Heute");
  const [newStatus, setNewStatus] = useState("todo");
  const [newAreaId, setNewAreaId] = useState("");

  // Filter
  const [filterPeriod, setFilterPeriod] = useState("Alle Zeiträume");
  const [filterArea, setFilterArea] = useState("Alle Bereiche");
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoadingAuth(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function loadAreas() {
    setLoadingAreas(true);

    const { data, error } = await supabase
      .from("areas")
      .select("id,name")
      .order("name", { ascending: true });

    if (error) {
      alert("Fehler beim Laden der Bereiche: " + error.message);
      setLoadingAreas(false);
      return;
    }

    setAreas(data || []);
    setLoadingAreas(false);
  }

  async function loadTasks(currentUser) {
    if (!currentUser) return;
    setLoadingTasks(true);

    // join: areas(name) über foreign table select
    const { data, error } = await supabase
      .from("tasks")
      .select("id,title,status,period,created_at,user_id,area_id, areas(name)")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) {
      alert("Fehler beim Laden der Aufgaben: " + error.message);
      setLoadingTasks(false);
      return;
    }

    setTasks(data || []);
    setLoadingTasks(false);
  }

  useEffect(() => {
    if (!user) return;
    loadAreas();
    loadTasks(user);
  }, [user]);

  async function createTask() {
    if (!newTitle.trim()) {
      alert("Bitte einen Titel eingeben.");
      return;
    }
    if (!newAreaId) {
      alert("Bitte einen Bereich auswählen.");
      return;
    }
    if (!user) return;

    const payload = {
      title: newTitle.trim(),
      period: newPeriod,
      status: newStatus,
      user_id: user.id,
      area_id: newAreaId
    };

    const { error } = await supabase.from("tasks").insert(payload);

    if (error) {
      alert("Fehler beim Anlegen: " + error.message);
      return;
    }

    setNewTitle("");
    setNewPeriod("Heute");
    setNewStatus("todo");
    await loadTasks(user);
  }

  async function updateTaskStatus(taskId, status) {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);

    if (error) {
      alert("Fehler beim Aktualisieren: " + error.message);
      return;
    }

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
  }

  const counts = useMemo(() => {
    const todayOpen = tasks.filter((t) => t.period === "Heute" && t.status !== "done").length;
    const weekOpen = tasks.filter((t) => t.period === "Diese Woche" && t.status !== "done").length;
    const open = tasks.filter((t) => t.status !== "done").length;
    return { today: todayOpen, week: weekOpen, open };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let list = [...tasks];

    if (filterPeriod !== "Alle Zeiträume") {
      list = list.filter((t) => t.period === filterPeriod);
    }
    if (filterArea !== "Alle Bereiche") {
      list = list.filter((t) => (t.areas?.name || "") === filterArea);
    }
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((t) => (t.title || "").toLowerCase().includes(s));
    }

    return list;
  }, [tasks, filterPeriod, filterArea, search]);

  if (loadingAuth) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Armaturenbrett</h1>
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
          <div style={{ fontSize: 18, fontWeight: 600 }}>Armaturenbrett</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Angemeldet als: {user.email}</div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => loadTasks(user)} style={{ padding: "10px 12px", cursor: "pointer" }}>
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
            {["board", "list", "calendar", "timeline", "guides"].map((id) => {
              const label = TABS.find((t) => t.id === id)?.label;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  style={{
                    textAlign: "left",
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: activeTab === id ? "#eef2ff" : "white",
                    cursor: "pointer"
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 18, fontSize: 12, opacity: 0.7 }}>Filter</div>

          <select
            value={filterArea}
            onChange={(e) => setFilterArea(e.target.value)}
            style={{ marginTop: 8, width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option>Alle Bereiche</option>
            {areas.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>

          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            style={{ marginTop: 10, width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option>Alle Zeiträume</option>
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <input
            placeholder="Suche…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginTop: 10, width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
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

          {(activeTab === "board" || activeTab === "list") && (
            <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Aufgabe anlegen</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 260px 220px 220px 140px", gap: 10 }}>
                <input
                  placeholder="Titel"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                />

                <select
                  value={newAreaId}
                  onChange={(e) => setNewAreaId(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                  disabled={loadingAreas}
                >
                  <option value="">{loadingAreas ? "Bereiche laden…" : "Bereich auswählen"}</option>
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
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                >
                  <option value="todo">Zu erledigen</option>
                  <option value="doing">In Arbeit</option>
                  <option value="done">Erledigt</option>
                </select>

                <button
                  onClick={createTask}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    cursor: "pointer",
                    background: "white"
                  }}
                >
                  Anlegen
                </button>
              </div>
            </div>
          )}

          {activeTab === "board" && <BoardView tasks={filteredTasks} loading={loadingTasks} onMove={updateTaskStatus} />}
          {activeTab === "list" && <ListView tasks={filteredTasks} loading={loadingTasks} onMove={updateTaskStatus} />}
          {activeTab === "calendar" && <Placeholder title="Kalender" text="Später: Wochen-/Monatsansicht." />}
          {activeTab === "timeline" && <Placeholder title="Zeitleiste" text="Später: Zeitachse für Monat/Jahr-Aufgaben." />}
          {activeTab === "guides" && <Placeholder title="Anleitungen" text="Später: Upload + Ordner + Versionen." />}
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

function BoardView({ tasks, loading, onMove }) {
  const cols = [
    { id: "todo", title: "Zu erledigen" },
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

          {loading ? (
            <div style={{ fontSize: 12, opacity: 0.7 }}>Daten laden…</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {tasks.filter((t) => t.status === col.id).map((t) => (
                <TaskCard key={t.id} task={t} onMove={onMove} />
              ))}

              {tasks.filter((t) => t.status === col.id).length === 0 && (
                <div style={{ fontSize: 12, opacity: 0.6 }}>Keine Aufgaben</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TaskCard({ task, onMove }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{task.title}</div>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
        {task.areas?.name ? `${task.areas.name} • ` : ""}{task.period}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {task.status !== "todo" && (
          <button onClick={() => onMove(task.id, "todo")} style={chipBtn()}>
            Zu erledigen
          </button>
        )}
        {task.status !== "doing" && (
          <button onClick={() => onMove(task.id, "doing")} style={chipBtn()}>
            In Arbeit
          </button>
        )}
        {task.status !== "done" && (
          <button onClick={() => onMove(task.id, "done")} style={chipBtn()}>
            Erledigt
          </button>
        )}
      </div>
    </div>
  );
}

function chipBtn() {
  return {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    cursor: "pointer",
    background: "white"
  };
}

function ListView({ tasks, loading, onMove }) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Aufgabenliste</div>

      {loading ? (
        <div style={{ fontSize: 12, opacity: 0.7 }}>Daten laden…</div>
      ) : (
        <div style={{ width: "100%", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: 10 }}>Aufgabe</th>
                <th style={{ padding: 10 }}>Bereich</th>
                <th style={{ padding: 10 }}>Zeitraum</th>
                <th style={{ padding: 10 }}>Status</th>
                <th style={{ padding: 10 }}>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: 10 }}>{t.title}</td>
                  <td style={{ padding: 10 }}>{t.areas?.name || "-"}</td>
                  <td style={{ padding: 10 }}>{t.period}</td>
                  <td style={{ padding: 10 }}>{statusLabel(t.status)}</td>
                  <td style={{ padding: 10 }}>
                    <select
                      value={t.status}
                      onChange={(e) => onMove(t.id, e.target.value)}
                      style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}
                    >
                      <option value="todo">Zu erledigen</option>
                      <option value="doing">In Arbeit</option>
                      <option value="done">Erledigt</option>
                    </select>
                  </td>
                </tr>
              ))}

              {tasks.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 12, fontSize: 12, opacity: 0.6 }}>
                    Keine Aufgaben gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function statusLabel(status) {
  if (status === "todo") return "Zu erledigen";
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
