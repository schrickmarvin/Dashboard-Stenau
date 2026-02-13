
// pages/dashboard.js
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const { data: taskData, error: taskErr } = await supabase
        .from("tasks")
        .select("*")
        .order("due_at", { ascending: true });

      if (taskErr) throw taskErr;

      const { data: userData } = await supabase
        .from("users_profile")
        .select("id, name, email");

      const { data: areaData } = await supabase
        .from("areas")
        .select("*");

      setTasks(taskData || []);
      setUsers(userData || []);
      setAreas(areaData || []);
    } catch (err) {
      setError(err.message);
    }

    setLoading(false);
  }

  const usersById = useMemo(() => {
    const map = {};
    users.forEach((u) => {
      map[u.id] = u.name || u.email || u.id;
    });
    return map;
  }, [users]);

  const todo = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div style={{ padding: 30 }}>
      <h1>Armaturenbrett</h1>

      {error && (
        <div style={{ background: "#ffe6e6", padding: 10, marginBottom: 20 }}>
          Fehler: {error}
        </div>
      )}

      {loading ? (
        <div>Lade…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 }}>
          <Column title="Zu erledigen" tasks={todo} usersById={usersById} />
          <Column title="Erledigt" tasks={done} usersById={usersById} />
        </div>
      )}
    </div>
  );
}

function Column({ title, tasks, usersById }) {
  return (
    <div>
      <h2>{title} ({tasks.length})</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {tasks.map((task) => (
          <div
            key={task.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 12,
              background: "#fff",
            }}
          >
            <div style={{ fontWeight: "bold" }}>{task.title}</div>
            <div style={{ fontSize: 13, color: "#666" }}>
              Fällig: {task.due_at || "—"}
            </div>
            <div style={{ fontSize: 13, color: "#666" }}>
              Zuständig: {usersById[task.assignee_id] || "Unzugeordnet"}
            </div>
          </div>
        ))}
        {tasks.length === 0 && (
          <div style={{ color: "#888" }}>Keine Einträge</div>
        )}
      </div>
    </div>
  );
}
