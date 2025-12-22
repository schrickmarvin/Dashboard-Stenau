import { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user) {
      loadTasks(user);
    }
  }, [user]);

  async function loadTasks(currentUser) {
    setLoading(true);
    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, status, period, created_at, user_id")
      .eq("user_id", currentUser.id);

    if (error) {
      console.error(error.message);
      setLoading(false);
      return;
    }

    setTasks(data || []);
    loadSubtasks(data);
    setLoading(false);
  }

  async function loadSubtasks(tasks) {
    const taskIds = tasks.map((t) => t.id);
    const { data, error } = await supabase
      .from("subtasks")
      .select("id, task_id, title, status")
      .in("task_id", taskIds);

    if (error) {
      console.error(error.message);
      return;
    }

    setSubtasks(data || []);
  }

  async function addSubtask(taskId) {
    const title = prompt("Unteraufgabe hinzufügen:");
    if (!title) return;

    const { error } = await supabase
      .from("subtasks")
      .insert({ task_id: taskId, title });

    if (error) {
      alert("Fehler beim Hinzufügen der Unteraufgabe: " + error.message);
      return;
    }

    loadTasks(user); // Tasks neu laden, um Unteraufgabe zu sehen
  }

  async function updateSubtaskStatus(subtaskId, status) {
    const { error } = await supabase
      .from("subtasks")
      .update({ status })
      .eq("id", subtaskId);

    if (error) {
      alert("Fehler beim Aktualisieren: " + error.message);
      return;
    }

    setSubtasks((prev) =>
      prev.map((s) => (s.id === subtaskId ? { ...s, status } : s))
    );
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <div>
        {tasks.map((task) => (
          <div key={task.id}>
            <h3>{task.title}</h3>
            <button onClick={() => addSubtask(task.id)}>Unteraufgabe hinzufügen</button>
            <div>
              {subtasks
                .filter((s) => s.task_id === task.id)
                .map((subtask) => (
                  <div key={subtask.id}>
                    <p>{subtask.title}</p>
                    <select
                      value={subtask.status}
                      onChange={(e) => updateSubtaskStatus(subtask.id, e.target.value)}
                    >
                      <option value="todo">Zu erledigen</option>
                      <option value="doing">In Arbeit</option>
                      <option value="done">Erledigt</option>
                    </select>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
