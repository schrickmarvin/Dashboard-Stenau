// pages/dashboard.js
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ---------------- Supabase ---------------- */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/* ---------------- Page ---------------- */
export default function Dashboard() {
  const [user, setUser] = useState(null);

  const [tasks, setTasks] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [stats, setStats] = useState([]);

  const [areas, setAreas] = useState([]);
  const [guides, setGuides] = useState([]);

  const [title, setTitle] = useState("");
  const [areaId, setAreaId] = useState("");
  const [guideId, setGuideId] = useState("");
  const [dueAt, setDueAt] = useState("");

  const [error, setError] = useState("");

  /* ---------------- Auth ---------------- */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  /* ---------------- Load ---------------- */
  useEffect(() => {
    if (!user) return;
    loadAll();
  }, [user]);

  async function loadAll() {
    await Promise.all([
      loadTasks(),
      loadSubtasks(),
      loadStats(),
      loadAreas(),
      loadGuides(),
    ]);
  }

  async function loadTasks() {
    const { data, error } = await supabase
      .from("v_tasks_ui")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) setError(error.message);
    else setTasks(data ?? []);
  }

  async function loadSubtasks() {
    const { data } = await supabase.from("v_subtasks_ui").select("*");
    setSubtasks(data ?? []);
  }

  async function loadStats() {
    const { data } = await supabase
      .from("v_task_subtask_stats")
      .select("*");
    setStats(data ?? []);
  }

  async function loadAreas() {
    const { data } = await supabase.from("areas").select("*").order("name");
    setAreas(data ?? []);
  }

  async function loadGuides() {
    const { data } = await supabase.from("guides").select("*").order("title");
    setGuides(data ?? []);
  }

  /* ---------------- Create Task ---------------- */
  async function createTask() {
    setError("");
    if (!title.trim()) return;

    const { error } = await supabase.from("tasks").insert([
      {
        title: title.trim(),
        area_id: areaId || null,
        guide_id: guideId || null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        status: "todo",
        user_id: user.id,
      },
    ]);

    if (error) {
      setError(error.message);
      return;
    }

    setTitle("");
    setAreaId("");
    setGuideId("");
    setDueAt("");
    await loadAll();
  }

  /* ---------------- Subtasks ---------------- */
  async function addSubtask(taskId, text) {
    if (!text.trim()) return;

    await supabase.from("subtasks").insert([
      {
        task_id: taskId,
        title: text.trim(),
        is_done: false,
      },
    ]);

    await loadAll();
  }

  async function toggleSubtask(id, isDone) {
    await supabase
      .from("subtasks")
      .update({ is_done: !isDone })
      .eq("id", id);

    await loadAll();
  }

  /* ---------------- UI ---------------- */
  if (!user) {
    return <div style={{ padding: 40 }}>Bitte einloggen…</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Aufgabe anlegen</h2>

      {error && <div style={{ color: "red" }}>{error}</div>}

      <input
        placeholder="Titel"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
        <option value="">Bereich</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      <input
        type="datetime-local"
        value={dueAt}
        onChange={(e) => setDueAt(e.target.value)}
      />

      <select value={guideId} onChange={(e) => setGuideId(e.target.value)}>
        <option value="">Anleitung</option>
        {guides.map((g) => (
          <option key={g.id} value={g.id}>
            {g.title}
          </option>
        ))}
      </select>

      <button onClick={createTask}>Anlegen</button>

      <hr />

      <h2>Board</h2>

      {tasks.map((t) => {
        const s = stats.find((x) => x.task_id === t.id);
        const taskSubs = subtasks.filter((st) => st.task_id === t.id);

        return (
          <div key={t.id} style={{ border: "1px solid #ccc", marginBottom: 16, padding: 12 }}>
            <strong>{t.title}</strong> ({t.status})<br />
            Unteraufgaben: {s?.done_subtasks ?? 0}/{s?.total_subtasks ?? 0}

            <div>
              {taskSubs.map((st) => (
                <div key={st.id}>
                  <input
                    type="checkbox"
                    checked={st.is_done}
                    onChange={() => toggleSubtask(st.id, st.is_done)}
                  />{" "}
                  {st.title}
                </div>
              ))}
            </div>

            <AddSubtask onAdd={(text) => addSubtask(t.id, text)} />
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Subtask Input ---------------- */
function AddSubtask({ onAdd }) {
  const [text, setText] = useState("");

  return (
    <div>
      <input
        placeholder="Unteraufgabe…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        onClick={() => {
          onAdd(text);
          setText("");
        }}
      >
        +
      </button>
    </div>
  );
}
