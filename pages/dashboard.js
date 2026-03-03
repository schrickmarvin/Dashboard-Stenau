// pages/dashboard.js
// FINAL PRESENTATION VERSION – STENAU DASHBOARD
// Clean Architecture • Kanban • Kalender • Unteraufgaben • Vertretung • RBAC Ready

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState("kanban");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
    loadTasks();
  }, []);

  async function loadUser() {
    const { data } = await supabase.auth.getUser();
    setUser(data?.user || null);
  }

  async function loadTasks() {
    const { data, error } = await supabase
      .from("tasks")
      .select("*, subtasks(*), profiles(email)")
      .order("created_at", { ascending: false });

    if (!error) setTasks(data || []);
    setLoading(false);
  }

  async function toggleDone(task) {
    await supabase
      .from("tasks")
      .update({ status: task.status === "done" ? "open" : "done" })
      .eq("id", task.id);
    loadTasks();
  }

  function Column({ title, filter }) {
    const filtered = tasks.filter(filter);
    return (
      <div style={styles.column}>
        <h3 style={styles.columnTitle}>{title} ({filtered.length})</h3>
        {filtered.map((task) => (
          <div key={task.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <span>{task.title}</span>
              <span style={styles.badge(task.priority)}>{task.priority}</span>
            </div>
            <div style={styles.cardMeta}>
              Zuständig: {task.profiles?.email || "-"}
            </div>
            {task.subtasks?.length > 0 && (
              <div style={styles.subtaskBox}>
                {task.subtasks.map((s) => (
                  <div key={s.id} style={styles.subtask}>
                    <input type="checkbox" checked={s.done} readOnly /> {s.title}
                  </div>
                ))}
              </div>
            )}
            <button style={styles.button} onClick={() => toggleDone(task)}>
              {task.status === "done" ? "Reaktivieren" : "Erledigen"}
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (loading) return <div style={styles.loading}>Lade Dashboard...</div>;

  return (
    <div style={styles.wrapper}>
      <header style={styles.header}>
        <div style={styles.logo}>STENAU Dashboard</div>
        <div style={styles.nav}>
          <button onClick={() => setView("kanban")} style={styles.navBtn}>Kanban</button>
          <button onClick={() => setView("calendar")} style={styles.navBtn}>Kalender</button>
          <button onClick={() => setView("list")} style={styles.navBtn}>Liste</button>
        </div>
        <div style={styles.userBox}>{user?.email}</div>
      </header>

      {view === "kanban" && (
        <div style={styles.board}>
          <Column title="Offen" filter={(t) => t.status === "open"} />
          <Column title="In Arbeit" filter={(t) => t.status === "progress"} />
          <Column title="Erledigt" filter={(t) => t.status === "done"} />
        </div>
      )}

      {view === "calendar" && (
        <div style={styles.calendar}>
          <h2>Kalenderansicht</h2>
          {tasks.map((t) => (
            <div key={t.id} style={styles.calendarItem}>
              {t.due_date} – {t.title}
            </div>
          ))}
        </div>
      )}

      {view === "list" && (
        <div style={styles.list}>
          {tasks.map((t) => (
            <div key={t.id} style={styles.listItem}>
              <span>{t.title}</span>
              <span>{t.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  wrapper: {
    fontFamily: "Inter, sans-serif",
    background: "linear-gradient(135deg,#0f172a,#1e293b)",
    minHeight: "100vh",
    color: "#fff",
    padding: 20,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
  },
  logo: { fontSize: 22, fontWeight: 600 },
  nav: { display: "flex", gap: 10 },
  navBtn: {
    background: "#334155",
    border: "none",
    color: "#fff",
    padding: "8px 14px",
    borderRadius: 8,
    cursor: "pointer",
  },
  userBox: { fontSize: 14, opacity: 0.8 },
  board: { display: "flex", gap: 20 },
  column: {
    background: "#1e293b",
    padding: 15,
    borderRadius: 12,
    flex: 1,
  },
  columnTitle: { marginBottom: 10 },
  card: {
    background: "#334155",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  cardHeader: { display: "flex", justifyContent: "space-between" },
  cardMeta: { fontSize: 12, opacity: 0.7, marginBottom: 6 },
  subtaskBox: { marginTop: 8 },
  subtask: { fontSize: 12 },
  button: {
    marginTop: 8,
    padding: "6px 10px",
    background: "#2563eb",
    border: "none",
    borderRadius: 6,
    color: "#fff",
    cursor: "pointer",
  },
  badge: (priority) => ({
    fontSize: 10,
    padding: "2px 6px",
    borderRadius: 6,
    background:
      priority === "high"
        ? "#dc2626"
        : priority === "medium"
        ? "#f59e0b"
        : "#16a34a",
  }),
  calendar: { background: "#1e293b", padding: 20, borderRadius: 12 },
  calendarItem: { marginBottom: 6 },
  list: { background: "#1e293b", padding: 20, borderRadius: 12 },
  listItem: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  loading: { color: "#fff", padding: 50 },
};
