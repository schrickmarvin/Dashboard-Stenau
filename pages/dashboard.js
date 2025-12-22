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

const STATUS = [
  { id: "todo", label: "To do" },
  { id: "doing", label: "In Arbeit" },
  { id: "done", label: "Erledigt" }
];

const DUE_BUCKETS = ["Heute", "Diese Woche", "Monat", "Jahr"];

export default function Dashboard() {
  /* -------------------- STATE -------------------- */
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [tasks, setTasks] = useState([]);
  const [areas, setAreas] = useState([]);

  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState("");

  const [activeTab, setActiveTab] = useState("board");

  // Create-Form
  const [newTitle, setNewTitle] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [newDue, setNewDue] = useState("Heute");
  const [newStatus, setNewStatus] = useState("todo");
  const [creating, setCreating] = useState(false);

  /* -------------------- COUNTS -------------------- */
  const counts = useMemo(() => {
    return {
      today: tasks.filter((t) => t.due === "Heute" && t.status !== "done").length,
      week: tasks.filter((t) => t.due === "Diese Woche" && t.status !== "done").length,
      open: tasks.filter((t) => t.status !== "done").length
    };
  }, [tasks]);

  /* -------------------- AUTH -------------------- */
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
      } catch {}
    };
  }, []);

  /* -------------------- LOAD AREAS -------------------- */
  async function reloadAreas() {
    const { data, error } = await supabase
      .from("areas")
      .select("id,name")
      .order("name", { ascending: true });

    if (error) {
      setAreas([]);
      setDataError(error.message);
      return;
    }

    setAreas(data || []);
    // falls noch nichts ausgewählt ist: erstes Area automatisch setzen
    if (!newAreaId && data?.length) setNewAreaId(data[0].id);
  }

  /* -------------------- LOAD TASKS -------------------- */
  async function reloadTasks() {
    if (!user) return;

    setLoadingData(true);
    setDataError("");

    // Versuch mit Join
    const { data, error } = await supabase
      .from("tasks")
      .select("id,title,status,due_bucket,subtasks_done,subtasks_total,created_at,area_id,areas(name)")
      .order("created_at", { ascending: false });

    if (error) {
      // Fallback ohne Join
      const fb = await supabase
        .from("tasks")
        .select("id,title,status,due_bucket,subtasks_done,subtasks_total,created_at,area_id")
        .order("created_at", { ascending: false });

      if (fb.error) {
        setDataError(fb.error.message);
        setTasks([]);
      } else {
        setTasks(
          (fb.data || []).map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            due: t.due_bucket,
            area: "—",
            area_id: t.area_id || null,
            subtasksDone: t.subtasks_done ?? 0,
            subtasksTotal: t.subtasks_total ?? 0
          }))
        );
        setDataError(
          "Hinweis: Bereiche konnten nicht per Join geladen werden (FK/RLS). Aufgaben werden ohne Bereich angezeigt (—)."
        );
      }
    } else {
      setTasks(
        (data || []).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          due: t.due_bucket,
          area: t.areas?.name || "Ohne Bereich",
          area_id: t.area_id || null,
          subtasksDone: t.subtasks_done ?? 0,
          subtasksTotal: t.subtasks_total ?? 0
        }))
      );
    }

    setLoadingData(false);
  }

  /* -------------------- INITIAL LOAD -------------------- */
  useEffect(() => {
    if (!user) return;
    (async () => {
      await reloadAreas();
      await reloadTasks();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /* -------------------- CREATE TASK -------------------- */
  async function createTask() {
    if (!newTitle.trim()) {
      alert("Bitte Titel eingeben.");
      return;
    }
    if (!newAreaId) {
      alert("Bitte Bereich auswählen.");
      return;
    }

    setCreating(true);
    setDataError("");

    const { error } = await supabase.from("tasks").insert({
      title: newTitle.trim(),
      area_id: newAreaId,
      status: newStatus,
      due_bucket: newDue,
      subtasks_done: 0,
      subtasks_total: 0
    });

    if (error) {
      setDataError(error.message);
      setCreating(false);
      return;
    }

    // Reset
    setNewTitle("");
    setNewDue("Heute");
    setNewStatus("todo");

    // Reload
    await reloadTasks();
    setCreating(false);
  }

  /* -------------------- UPDATE STATUS (CLICK) -------------------- */
  async function setTaskStatus(taskId, status) {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
    if (error) {
      alert(error.message);
      return;
    }
    await reloadTasks();
  }

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } catch {}
    window.location.href = "/";
  }

  /* -------------------- RENDER -------------------- */
  if (loadingAuth) {
    return (
      <div style={{ padding: 30, fontFamily: "system-ui" }}>
        <h1>Dashboard</h1>
        <p>Lade…</p>
      </div>
    );
  }

  if (!user) {
    window.location.href = "/";
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
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Dashboard</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Angemeldet als: {user.email}</div>
        </div>

        <button onClick={signOut} style={{ padding: "8px 12px", cursor: "pointer" }}>
          Logout
        </button>
      </div>

      <div style={{ display: "flex" }}>
        {/* Sidebar */}
        <div
          style={{
            width: 240,
            background: "white",
            padding: 14,
            borderRight: "1px solid #e5e7eb"
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
                  width: "100%",
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
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

          {/* Actions Row */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
            <button
              onClick={reloadTasks}
              disabled={loadingData}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "white",
                cursor: loadingData ? "not-allowed" : "pointer",
                opacity: loadingData ? 0.6 : 1
              }}
            >
              Neu laden
            </button>

            {loadingData && <span style={{ fontSize: 12, opacity: 0.7 }}>Lade…</span>}
          </div>

          {/* Create Task (Stufe 2 light) */}
          <div
            style={{
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: 12,
              marginBottom: 14
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Aufgabe anlegen</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 220px 160px 160px 140px", gap: 8 }}>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Titel (z. B. Tourenplanung morgen)"
                style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
              />

              <select
                value={newAreaId}
                onChange={(e) => setNewAreaId(e.target.value)}
                style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
              >
                {areas.length === 0 && <option value="">(keine Bereiche)</option>}
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>

              <select
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
              >
                {DUE_BUCKETS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>

              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
              >
                {STATUS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>

              <button
                onClick={createTask}
                disabled={creating}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: creating ? "#f3f4f6" : "white",
                  cursor: creating ? "not-allowed" : "pointer"
                }}
              >
                {creating ? "Speichere…" : "Anlegen"}
              </button>
            </div>

            {dataError && (
              <div style={{ marginTop: 10, color: "darkred", fontSize: 12 }}>
                {dataError}
              </div>
            )}
          </div>

          {/* Views */}
          {activeTab === "board" && <BoardView tasks={tasks} onSetStatus={setTaskStatus} />}
          {activeTab === "list" && <ListView tasks={tasks} onSetStatus={setTaskStatus} />}

          {activeTab === "calendar" && (
            <Placeholder title="Kalender" text="Kommt als nächstes – aktuell Stufe 2 light (Anlegen/Status ändern)." />
          )}
          {activeTab === "timeline" && (
            <Placeholder title="Timeline" text="Kommt als nächstes – aktuell Stufe 2 light (Anlegen/Status ändern)." />
          )}
          {activeTab === "guides" && (
            <Placeholder title="Anleitungen" text="Kommt als nächstes – Upload/Editor bauen wir als eigenen Schritt." />
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------- COMPONENTS -------------------- */

function StatCard({ label, value }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function BoardView({ tasks, onSetStatus }) {
  const cols = [
    { id: "todo", title: "To do" },
    { id: "doing", title: "In Arbeit" },
    { id: "done", title: "Erledigt" }
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
      {cols.map((col) => (
        <div
          key={col.id}
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 12
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>{col.title}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{tasks.filter((t) => t.status === col.id).length}</div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {tasks
              .filter((t) => t.status === col.id)
              .map((t) => (
                <TaskCard key={t.id} task={t} onSetStatus={onSetStatus} />
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

function TaskCard({ task, onSetStatus }) {
  const progress = task.subtasksTotal > 0 ? Math.round((task.subtasksDone / task.subtasksTotal) * 100) : 0;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{task.title}</div>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
        {task.area} • {task.due}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <button onClick={() => onSetStatus(task.id, "todo")} style={smallBtn(task.status === "todo")}>
          To do
        </button>
        <button onClick={() => onSetStatus(task.id, "doing")} style={smallBtn(task.status === "doing")}>
          In Arbeit
        </button>
        <button onClick={() => onSetStatus(task.id, "done")} style={smallBtn(task.status === "done")}>
          Erledigt
        </button>
      </div>

      <div style={{ fontSize: 12, opacity: 0.8 }}>
        Unteraufgaben: {task.subtasksDone}/{task.subtasksTotal} ({progress}%)
      </div>
    </div>
  );
}

function smallBtn(active) {
  return {
    padding: "6px 8px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: active ? "#eef2ff" : "white",
    cursor: "pointer",
    fontSize: 12
  };
}

function ListView({ tasks, onSetStatus }) {
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
              <th style={{ padding: 10 }}>Aktion</th>
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
                  <select
                    value={t.status}
                    onChange={(e) => onSetStatus(t.id, e.target.value)}
                    style={{ padding: 6, border: "1px solid #e5e7eb", borderRadius: 8 }}
                  >
                    <option value="todo">To do</option>
                    <option value="doing">In Arbeit</option>
                    <option value="done">Erledigt</option>
                  </select>
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
