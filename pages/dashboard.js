// pages/dashboard.js
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { createClient } from "@supabase/supabase-js";

/* -------------------------------------------------------
   Supabase (client-only, singleton)
------------------------------------------------------- */
function getSupabaseClient() {
  if (typeof window === "undefined") return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // eslint-disable-next-line no-console
    console.warn("Supabase ENV fehlt: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return null;
  }

  if (!window.__supabase__) {
    window.__supabase__ = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }

  return window.__supabase__;
}

/* -------------------------------------------------------
   Helpers
------------------------------------------------------- */
const toISO = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

const fmtDue = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const toYMD = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const monthEndExclusive = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);

// Monday-first index (0..6)
const weekdayMon0 = (dateObj) => {
  const js = dateObj.getDay(); // 0 Sun..6 Sat
  return (js + 6) % 7;
};

function Pill({ children, tone = "gray" }) {
  const bg =
    tone === "green" ? "#d1fae5" : tone === "orange" ? "#ffedd5" : tone === "red" ? "#fee2e2" : "#e5e7eb";
  const color =
    tone === "green" ? "#065f46" : tone === "orange" ? "#9a3412" : tone === "red" ? "#991b1b" : "#111827";

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        background: bg,
        color,
        fontSize: 12,
        fontWeight: 700,
        marginLeft: 8,
      }}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------
   Page
------------------------------------------------------- */
export default function DashboardPage() {
  const router = useRouter();

  const [supabase, setSupabase] = useState(null);

  // session: "loading" | null | sessionObject
  const [session, setSession] = useState("loading");
  const user = session && session !== "loading" ? session.user : null;

  const [error, setError] = useState("");

  // Data
  const [areas, setAreas] = useState([]);
  const [guides, setGuides] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [subtasksByTask, setSubtasksByTask] = useState({});
  const [expanded, setExpanded] = useState({});

  // UI tab
  const [tab, setTab] = useState("board"); // board | list | calendar

  // Calendar
  const [calMonth, setCalMonth] = useState(() => new Date());
  const [calSelectedDate, setCalSelectedDate] = useState(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [calItems, setCalItems] = useState([]); // tasks with due_at in current month
  const [calStatusFilter, setCalStatusFilter] = useState("all"); // all | todo | done
  const [calAreaFilter, setCalAreaFilter] = useState(""); // area_id or ""


  // Create task
  const [newTitle, setNewTitle] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [newDueAt, setNewDueAt] = useState("");
  const [newStatus, setNewStatus] = useState("todo"); // todo|done
  const [newGuideId, setNewGuideId] = useState("");

  // Create subtask
  const [subtaskDraft, setSubtaskDraft] = useState({});

  /* ---------------- Init supabase ---------------- */
  useEffect(() => {
    setSupabase(getSupabaseClient());
  }, []);

  /* ---------------- Auth + redirect ---------------- */
  useEffect(() => {
    if (!supabase) return;

    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        setSession(null);
        return;
      }
      setSession(data.session || null);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (session === "loading") return;
    if (!session) router.replace("/login");
  }, [session, router]);

  /* ---------------- Loaders ---------------- */
  const loadAreas = async () => {
    const { data, error } = await supabase.from("areas").select("id,name").order("name");
    if (error) throw error;
    setAreas(data || []);
  };

  const loadGuides = async () => {
    const { data, error } = await supabase.from("guides").select("id,title").order("title");
    if (error) throw error;
    setGuides(data || []);
  };

  const loadTasks = async () => {
    // Prefer UI View (v_tasks_ui). Fallback: base table.
    let data = null;
    let error = null;

    // 1) Try view (has area_name / guide_title / is_done)
    {
      const res = await supabase
        .from("v_tasks_ui")
        .select(
          "id,title,status,is_done,created_at,due_at,due_day,period,user_id,area_id,area_name,guide_id,guide_title"
        )
        .order("created_at", { ascending: false });
      data = res.data;
      error = res.error;
    }

    // 2) Fallback if view doesn't exist
    if (error) {
      const msg = (error?.message || "").toLowerCase();
      const viewMissing = msg.includes("does not exist") || msg.includes("relation") || msg.includes("42p01");
      if (viewMissing) {
        const res2 = await supabase
          .from("tasks")
          .select("id,title,status,created_at,due_at,area_id,guide_id,areas(name),guides(title)")
          .order("created_at", { ascending: false });
        data = (res2.data || []).map((t) => ({
          ...t,
          is_done: t.status === "done",
          area_name: t.areas?.name || null,
          guide_title: t.guides?.title || null,
        }));
        error = res2.error;
      }
    }

    if (error) throw error;
    setTasks(data || []);
  };

  const loadCalendarItems = async (monthDate = calMonth) => {
    const start = monthStart(monthDate);
    const end = monthEndExclusive(monthDate);
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    // Prefer view if present, fallback to tasks table
    let { data, error } = await supabase
      .from("v_tasks_calendar_ui")
      .select("id,title,status,due_at,due_date,area_id,area_name,guide_id,guide_title")
      .gte("due_at", startISO)
      .lt("due_at", endISO)
      .order("due_at", { ascending: true });

    if (error) {
      const res = await supabase
        .from("tasks")
        .select("id,title,status,due_at,areas(name),guides(title)")
        .gte("due_at", startISO)
        .lt("due_at", endISO)
        .order("due_at", { ascending: true });

      if (res.error) throw res.error;

      data = (res.data || []).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        due_at: t.due_at,
        area_name: t?.areas?.name || "–",
        guide_title: t?.guides?.title || "",
      }));
    }

    setCalItems(data || []);
  };

  const loadSubtasksForTask = async (taskId) => {
    // Prefer UI View (v_subtasks_ui) if present; fallback to table.
    let data = null;
    let error = null;

    const res1 = await supabase
      .from("v_subtasks_ui")
      .select("id,task_id,title,is_done,status,created_at,updated_at,guide_id,guide_title")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });

    if (!res1.error) {
      data = res1.data;
    } else {
      const res2 = await supabase
        .from("subtasks")
        .select("id,task_id,title,is_done,status,created_at,updated_at,guide_id,guides(title)")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });

      if (!res2.error) {
        data = (res2.data || []).map((s) => ({
          ...s,
          guide_title: s?.guides?.title || null,
        }));
      }
      error = res2.error;
    }

    if (error) throw error;
    setSubtasksByTask((prev) => ({ ...prev, [taskId]: data || [] }));
  };

  const loadAll = async () => {
    if (!supabase || !user) return;
    setError("");
    try {
      await Promise.all([loadAreas(), loadGuides(), loadTasks(), loadCalendarItems()]);
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  useEffect(() => {
    if (!supabase || !user) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user?.id]);

  // Reload calendar when month changes
  useEffect(() => {
    if (!supabase || !user) return;
    loadCalendarItems(calMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calMonth, supabase, user?.id]);

  /* ---------------- Derived ---------------- */
  const tasksTodo = useMemo(() => tasks.filter((t) => t.status === "todo"), [tasks]);
  const tasksDone = useMemo(() => tasks.filter((t) => t.status === "done"), [tasks]);

  const areaName = (t) => t?.area_name || t?.areas?.name || "–";
  const guideTitle = (t) => t?.guide_title || t?.guides?.title || "";


  const calFilteredItems = useMemo(() => {
    const base = calItems || [];
    return base.filter((it) => {
      if (calStatusFilter !== "all" && it.status !== calStatusFilter) return false;
      if (calAreaFilter && it.area_id && it.area_id !== calAreaFilter) return false;
      // if view provides only area_name, we keep area filter best-effort by matching name
      if (calAreaFilter && !it.area_id) {
        const area = areas.find((a) => a.id === calAreaFilter);
        if (area && it.area_name && it.area_name !== area.name) return false;
      }
      return true;
    });
  }, [calItems, calStatusFilter, calAreaFilter, areas]);

  const subStats = (taskId) => {
    const list = subtasksByTask[taskId] || [];
    const total = list.length;
    const done = list.filter((s) => !!s.is_done).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  };

  /* ---------------- Actions: tasks ---------------- */
  const createTask = async () => {
    if (!supabase || !user) return;
    setError("");

    const title = newTitle.trim();
    if (!title) return;

    const payload = {
      title,
      status: newStatus, // todo|done (DB check)
      user_id: user.id, // RLS
      area_id: newAreaId || null,
      guide_id: newGuideId || null,
      due_at: toISO(newDueAt) || null,
    };

    const { error } = await supabase.from("tasks").insert([payload]);
    if (error) return setError(error.message);

    setNewTitle("");
    setNewAreaId("");
    setNewDueAt("");
    setNewStatus("todo");
    setNewGuideId("");

    await loadTasks();
  };

  const toggleTaskStatus = async (taskId, current) => {
    if (!supabase) return;
    setError("");
    const next = current === "done" ? "todo" : "done";
    const { error } = await supabase.from("tasks").update({ status: next }).eq("id", taskId);
    if (error) return setError(error.message);
    await loadTasks();
  };

  const deleteTask = async (taskId) => {
    if (!supabase) return;
    setError("");
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) return setError(error.message);

    setSubtasksByTask((prev) => {
      const copy = { ...prev };
      delete copy[taskId];
      return copy;
    });

    await loadTasks();
  };

  /* ---------------- Actions: subtasks ---------------- */
  const toggleExpand = async (taskId) => {
    const willOpen = !expanded[taskId];
    setExpanded((prev) => ({ ...prev, [taskId]: willOpen }));
    if (willOpen) {
      try {
        await loadSubtasksForTask(taskId);
      } catch (e) {
        setError(e?.message || String(e));
      }
    }
  };

  const addSubtask = async (taskId) => {
    if (!supabase) return;
    setError("");

    const title = (subtaskDraft[taskId] || "").trim();
    if (!title) return;

    const payload = {
      task_id: taskId,
      title,
      is_done: false,
      status: "todo",
      guide_id: null,
    };

    const { error } = await supabase.from("subtasks").insert([payload]);
    if (error) return setError(error.message);

    setSubtaskDraft((prev) => ({ ...prev, [taskId]: "" }));
    await loadSubtasksForTask(taskId);
  };

  const toggleSubtask = async (subtask) => {
    if (!supabase) return;
    setError("");

    const nextDone = !subtask.is_done;
    const { error } = await supabase
      .from("subtasks")
      .update({ is_done: nextDone, status: nextDone ? "done" : "todo" })
      .eq("id", subtask.id);

    if (error) return setError(error.message);
    await loadSubtasksForTask(subtask.task_id);
  };

  const deleteSubtask = async (subtask) => {
    if (!supabase) return;
    setError("");
    const { error } = await supabase.from("subtasks").delete().eq("id", subtask.id);
    if (error) return setError(error.message);
    await loadSubtasksForTask(subtask.task_id);
  };

  /* ---------------- Logout ---------------- */
  const logout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.replace("/login");
  };

  /* ---------------- Guard render ---------------- */
  if (session === "loading") return <div style={{ padding: 24 }}>Lade…</div>;
  if (!user) return null; // redirect already triggered

  /* ---------------- Styles ---------------- */
  const page = { padding: 18, background: "#f3f6ff", minHeight: "100vh" };
  const topbar = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 };
  const tabs = { display: "flex", gap: 10, alignItems: "center" };
  const tabBtn = (active) => ({
    padding: "8px 14px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: active ? "#0f7a2a" : "white",
    color: active ? "white" : "#111827",
    cursor: "pointer",
    fontWeight: 800,
  });

  const card = {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 8px 18px rgba(16,24,40,0.04)",
  };

  const btnGreen = {
    background: "#0f7a2a",
    color: "white",
    border: "none",
    borderRadius: 12,
    padding: "10px 18px",
    cursor: "pointer",
    fontWeight: 900,
  };

  const btnGhost = {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: 800,
  };

  const grid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12 };

  const TaskCard = ({ t }) => {
    const isDone = t.status === "done";
    const { total, done } = subStats(t.id);
    const isOpen = !!expanded[t.id];
    const list = subtasksByTask[t.id] || [];
    const progress = total ? Math.round((done / total) * 100) : 0;

    return (
      <div style={{ ...card, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.2 }}>
              {t.title}
              <Pill tone={isDone ? "green" : "orange"}>{t.status}</Pill>
            </div>

            <div style={{ marginTop: 6, color: "#374151", fontSize: 13 }}>
              Bereich: {areaName(t)}
              {t.due_at ? ` • Fällig: ${fmtDue(t.due_at)}` : ""}
              {guideTitle(t) ? ` • Anleitung: ${guideTitle(t)}` : ""}
            </div>

            <div style={{ marginTop: 10, fontSize: 13, color: "#374151" }}>
              Unteraufgaben <span style={{ float: "right" }}>{done}/{total} ({progress}%)</span>
              <div style={{ height: 10, background: "#eef2ff", borderRadius: 999, overflow: "hidden", marginTop: 6 }}>
                <div style={{ height: "100%", width: `${progress}%`, background: "#0f7a2a" }} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <button style={btnGhost} onClick={() => toggleExpand(t.id)}>{isOpen ? "Zuklappen" : "Aufklappen"}</button>
            <button style={btnGhost} onClick={() => toggleTaskStatus(t.id, t.status)}>Status</button>
            <button style={{ ...btnGhost, borderColor: "#fecaca" }} onClick={() => deleteTask(t.id)}>Löschen</button>
          </div>
        </div>

        {isOpen && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                placeholder="Unteraufgabe hinzufügen…"
                value={subtaskDraft[t.id] || ""}
                onChange={(e) => setSubtaskDraft((prev) => ({ ...prev, [t.id]: e.target.value }))}
                style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
              />
              <button style={btnGreen} onClick={() => addSubtask(t.id)}>+</button>
            </div>

            <div style={{ marginTop: 10 }}>
              {list.length === 0 ? (
                <div style={{ color: "#6b7280" }}>Keine Unteraufgaben</div>
              ) : (
                list.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 2px" }}>
                    <input type="checkbox" checked={!!s.is_done} onChange={() => toggleSubtask(s)} />
                    <div style={{ flex: 1, textDecoration: s.is_done ? "line-through" : "none" }}>{s.title}</div>
                    <button style={btnGhost} onClick={() => deleteSubtask(s)}>Entfernen</button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={page}>
      <div style={topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 20, fontWeight: 900 }}>Dashboard</div>
          <div style={tabs}>
            <button style={tabBtn(tab === "board")} onClick={() => setTab("board")}>Board</button>
            <button style={tabBtn(tab === "list")} onClick={() => setTab("list")}>Liste</button>
            <button style={tabBtn(tab === "calendar")} onClick={() => setTab("calendar")}>Kalender</button>
            <button style={btnGhost} onClick={loadAll}>Neu laden</button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ color: "#374151", fontSize: 13 }}>{user?.email}</div>
          <button style={btnGhost} onClick={logout}>Abmelden</button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 14, background: "#fee2e2", border: "1px solid #fecaca", color: "#991b1b", fontWeight: 800 }}>
          {error}
        </div>
      )}

      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Aufgabe anlegen</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr auto", gap: 10 }}>
          <input
            placeholder="Titel"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
          />

          <select
            value={newAreaId}
            onChange={(e) => setNewAreaId(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
          >
            <option value="">Bereich</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>

          <input
            type="datetime-local"
            value={newDueAt}
            onChange={(e) => setNewDueAt(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
          />

          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
          >
            <option value="todo">Zu erledigen</option>
            <option value="done">Erledigt</option>
          </select>

          <select
            value={newGuideId}
            onChange={(e) => setNewGuideId(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
          >
            <option value="">Anleitung</option>
            {guides.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>

          <button style={btnGreen} onClick={createTask}>Anlegen</button>
        </div>
      </div>

      
      {tab === "board" ? (

        <div style={grid}>
          <div>
            <div style={{ ...card, marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>Zu erledigen</div>
              <div style={{ marginTop: 10 }}>
                {tasksTodo.length === 0 ? <div style={{ color: "#6b7280" }}>Keine Aufgaben</div> : tasksTodo.map((t) => <TaskCard key={t.id} t={t} />)}
              </div>
            </div>
          </div>
          <div>
            <div style={{ ...card, marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>Erledigt</div>
              <div style={{ marginTop: 10 }}>
                {tasksDone.length === 0 ? <div style={{ color: "#6b7280" }}>Keine Aufgaben</div> : tasksDone.map((t) => <TaskCard key={t.id} t={t} />)}
              </div>
            </div>
          </div>
        </div>
      
      ) : tab === "list" ? (

        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Liste</div>
          {tasks.length === 0 ? (
            <div style={{ color: "#6b7280" }}>Keine Aufgaben</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {tasks.map((t) => {
                const isOpen = !!expanded[t.id];
                const { total, done } = subStats(t.id);
                const progress = total ? Math.round((done / total) * 100) : 0;
                const list = subtasksByTask[t.id] || [];

                return (
                  <div
                    key={t.id}
                    style={{
                      padding: 12,
                      border: "1px solid #e5e7eb",
                      borderRadius: 14,
                      background: "white",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 900 }}>
                          {t.title}
                          <Pill tone={t.status === "done" ? "green" : "orange"}>{t.status}</Pill>
                        </div>

                        <div style={{ color: "#374151", fontSize: 13, marginTop: 4 }}>
                          Bereich: {areaName(t)}
                          {t.due_at ? ` • Fällig: ${fmtDue(t.due_at)}` : ""}
                          {guideTitle(t) ? ` • Anleitung: ${guideTitle(t)}` : ""}
                        </div>

                        <div style={{ marginTop: 10, fontSize: 13, color: "#374151" }}>
                          Unteraufgaben <span style={{ float: "right" }}>{done}/{total}</span>
                          <div style={{ height: 10, background: "#eef2ff", borderRadius: 999, overflow: "hidden", marginTop: 6 }}>
                            <div style={{ height: "100%", width: `${progress}%`, background: "#0f7a2a" }} />
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <button style={btnGhost} onClick={() => toggleExpand(t.id)}>
                          {isOpen ? "Zuklappen" : "Aufklappen"}
                        </button>
                        <button style={btnGhost} onClick={() => toggleTaskStatus(t.id, t.status)}>
                          Status
                        </button>
                        <button style={{ ...btnGhost, borderColor: "#fecaca" }} onClick={() => deleteTask(t.id)}>
                          Löschen
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <input
                            placeholder="Unteraufgabe hinzufügen…"
                            value={subtaskDraft[t.id] || ""}
                            onChange={(e) => setSubtaskDraft((prev) => ({ ...prev, [t.id]: e.target.value }))}
                            style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
                          />
                          <button style={btnGreen} onClick={() => addSubtask(t.id)}>
                            +
                          </button>
                        </div>

                        <div style={{ marginTop: 10 }}>
                          {list.length === 0 ? (
                            <div style={{ color: "#6b7280" }}>Keine Unteraufgaben</div>
                          ) : (
                            list.map((s) => (
                              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 2px" }}>
                                <input type="checkbox" checked={!!s.is_done} onChange={() => toggleSubtask(s)} />
                                <div style={{ flex: 1, textDecoration: s.is_done ? "line-through" : "none" }}>
                                  {s.title}
                                </div>
                                <button style={btnGhost} onClick={() => deleteSubtask(s)}>
                                  Entfernen
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>      
      ) : (
        <div style={...card}>
          <div style={ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }>
            <div style={ fontSize: 16, fontWeight: 900 }>Kalender</div>
            <div style={ display: "flex", gap: 8 }>
              <button
                style={...btnGhost}
                onClick={() => setCalMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              >
                ◀
              </button>
              <div style={ fontWeight: 900, alignSelf: "center" }>
                {calMonth.toLocaleString("de-DE", { month: "long", year: "numeric" })}
              </div>
              <button
                style={...btnGhost}
                onClick={() => setCalMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              >
                ▶
              </button>
            </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <select
              value={calStatusFilter}
              onChange={(e) => setCalStatusFilter(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid #e5e7eb", fontWeight: 800 }}
            >
              <option value="all">Alle Status</option>
              <option value="todo">Zu erledigen</option>
              <option value="done">Erledigt</option>
            </select>

            <select
              value={calAreaFilter}
              onChange={(e) => setCalAreaFilter(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid #e5e7eb", fontWeight: 800 }}
            >
              <option value="">Alle Bereiche</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>

            <button
              style={btnGhost}
              onClick={() => {
                const d = new Date();
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, "0");
                const dd = String(d.getDate()).padStart(2, "0");
                setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                setCalSelectedDate(`${yyyy}-${mm}-${dd}`);
              }}
            >
              Heute
            </button>
          </div>

          </div>

          <div style={ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 14 }>
            {["Mo","Di","Mi","Do","Fr","Sa","So"].map((w) => (
              <div key={w} style={ fontSize: 12, color: "#6b7280", fontWeight: 900, textAlign: "center" }>
                {w}
              </div>
            ))}

            {(() => {
              const start = monthStart(calMonth);
              const lead = weekdayMon0(start);
              const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
              const cells = [];
              for (let i = 0; i < lead; i++) cells.push(null);
              for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(calMonth.getFullYear(), calMonth.getMonth(), d));

              const itemsByDate = {};
              for (const it of calFilteredItems) {
                const key = toYMD(new Date(it.due_at));
                itemsByDate[key] = (itemsByDate[key] || 0) + 1;
              }

              return cells.map((d, idx) => {
                if (!d) return <div key={`e-${idx}`} />;
                const key = toYMD(d);
                const count = itemsByDate[key] || 0;
                const isSelected = key === calSelectedDate;

                return (
                  <button
                    key={key}
                    onClick={() => setCalSelectedDate(key)}
                    style={
                      border: "1px solid #e5e7eb",
                      background: isSelected ? "#0f7a2a" : "white",
                      color: isSelected ? "white" : "#111827",
                      borderRadius: 14,
                      padding: "10px 8px",
                      textAlign: "left",
                      cursor: "pointer",
                      minHeight: 54,
                    }
                  >
                    <div style={ display: "flex", justifyContent: "space-between", alignItems: "baseline" }>
                      <div style={ fontWeight: 900 }>{d.getDate()}</div>
                      {count > 0 && (
                        <div style={
                          fontSize: 12,
                          fontWeight: 900,
                          background: isSelected ? "rgba(255,255,255,0.2)" : "#eef2ff",
                          padding: "2px 8px",
                          borderRadius: 999,
                        }>
                          {count}
                        </div>
                      )}
                    </div>
                  </button>
                );
              });
            })()}
          </div>

          <div style={ fontWeight: 900, marginBottom: 8 }>
            Termine am {(() => {
              const [y,m,d] = calSelectedDate.split("-");
              return `${d}.${m}.${y}`;
            })()}
          </div>

          {(() => {
            const dayItems = (calFilteredItems || [])
              .filter((it) => toYMD(new Date(it.due_at)) === calSelectedDate)
              .sort((a,b) => new Date(a.due_at) - new Date(b.due_at));

            if (dayItems.length === 0) {
              return <div style={ color: "#6b7280" }>Keine Aufgaben an diesem Tag</div>;
            }

            return (
              <div style={ display: "grid", gap: 10 }>
                {dayItems.map((it) => (
                  <div key={it.id} style={ padding: 12, border: "1px solid #e5e7eb", borderRadius: 14, display: "flex", justifyContent: "space-between", gap: 12 }>
                    <div style={ minWidth: 0 }>
                      <div style={ fontWeight: 900 }>
                        {it.title}
                        <Pill tone={it.status === "done" ? "green" : "orange"}>{it.status}</Pill>
                      </div>
                      <div style={ fontSize: 13, color: "#374151", marginTop: 4 }>
                        {fmtDue(it.due_at)}
                        {it.area_name ? ` • Bereich: ${it.area_name}` : ""}
                        {it.guide_title ? ` • Anleitung: ${it.guide_title}` : ""}
                      </div>
                    </div>
                    <div style={ display: "flex", gap: 8, alignItems: "flex-start" }>
                      <button style={...btnGhost} onClick={() => toggleTaskStatus(it.id, it.status)}>Status</button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

    </div>
  );
}
