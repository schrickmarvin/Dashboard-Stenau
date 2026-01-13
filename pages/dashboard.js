// pages/dashboard.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ---------------- Supabase Client (browser singleton) ---------------- */
function getSupabaseClient() {
  if (typeof window === "undefined") return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn("Supabase ENV fehlt (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)");
    return null;
  }

  if (!window.__supabase__) {
    window.__supabase__ = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return window.__supabase__;
}

/* ---------------- Small helpers ---------------- */
const pad2 = (n) => String(n).padStart(2, "0");
const isoFromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

function ymdLocal(date) {
  // date: Date
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function addMonths(d, delta) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1, 0, 0, 0, 0);
}

/* ---------------- Page ---------------- */
export default function DashboardPage() {
  const [supabase, setSupabase] = useState(null);
  const [session, setSession] = useState(null);
  const user = session?.user || null;

  const [activeTab, setActiveTab] = useState("board"); // board | list | calendar

  const [tasks, setTasks] = useState([]); // enriched tasks
  const [subtasks, setSubtasks] = useState([]); // enriched subtasks
  const [areas, setAreas] = useState([]);
  const [guides, setGuides] = useState([]);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // create task
  const [newTitle, setNewTitle] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [newDueAt, setNewDueAt] = useState(""); // datetime-local
  const [newStatus, setNewStatus] = useState("todo");
  const [newGuideId, setNewGuideId] = useState("");

  // subtasks input per task
  const [subtaskDraft, setSubtaskDraft] = useState({}); // { [taskId]: string }

  // calendar UI state
  const [calMonth, setCalMonth] = useState(() => startOfMonth(new Date()));
  const [calSelectedDay, setCalSelectedDay] = useState(() => ymdLocal(new Date()));
  const [calStatus, setCalStatus] = useState(""); // "" | todo | done
  const [calArea, setCalArea] = useState(""); // "" or area_id

  const infoTimer = useRef(null);

  function flashInfo(msg) {
    setInfo(msg);
    if (infoTimer.current) clearTimeout(infoTimer.current);
    infoTimer.current = setTimeout(() => setInfo(""), 2500);
  }

  /* Init Supabase */
  useEffect(() => {
    setSupabase(getSupabaseClient());
  }, []);

  /* Auth */
  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  /* Load on login */
  useEffect(() => {
    if (!supabase || !user) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user?.id]);

  /* ---------------- Data loading ---------------- */
  const loadAreas = async () => {
    const { data, error } = await supabase.from("areas").select("*").order("name");
    if (error) throw error;
    setAreas(data || []);
  };

  const loadGuides = async () => {
    const { data, error } = await supabase.from("guides").select("*").order("title");
    if (error) throw error;
    setGuides(data || []);
  };

  const loadTasks = async () => {
    // Prefer view v_tasks_ui (enriched), fallback to tasks
    let res = await supabase
      .from("v_tasks_ui")
      .select("id,title,status,is_done,created_at,due_at,area_id,area_name,guide_id,guide_title")
      .order("created_at", { ascending: false });

    if (res.error) {
      // fallback
      res = await supabase
        .from("tasks")
        .select("id,title,status,created_at,due_at,area_id,guide_id")
        .order("created_at", { ascending: false });
    }

    if (res.error) throw res.error;

    const list = (res.data || []).map((t) => ({
      ...t,
      is_done: typeof t.is_done === "boolean" ? t.is_done : t.status === "done",
    }));
    setTasks(list);
  };

  const loadSubtasks = async () => {
    // Prefer view v_subtasks_ui (enriched), fallback to subtasks
    let res = await supabase
      .from("v_subtasks_ui")
      .select("id,task_id,title,is_done,status,created_at,updated_at,guide_id,guide_title")
      .order("created_at", { ascending: true });

    if (res.error) {
      res = await supabase
        .from("subtasks")
        .select("id,task_id,title,is_done,status,created_at,updated_at,guide_id")
        .order("created_at", { ascending: true });
    }

    if (res.error) throw res.error;
    setSubtasks(res.data || []);
  };

  const loadAll = async () => {
    if (!supabase || !user) return;
    setError("");
    try {
      await Promise.all([loadAreas(), loadGuides(), loadTasks(), loadSubtasks()]);
      flashInfo("Aktualisiert");
    } catch (e) {
      setError(e?.message || "Fehler beim Laden");
    }
  };

  /* ---------------- Derived ---------------- */
  const subtasksByTask = useMemo(() => {
    const m = {};
    for (const s of subtasks) {
      if (!m[s.task_id]) m[s.task_id] = [];
      m[s.task_id].push(s);
    }
    return m;
  }, [subtasks]);

  const progressByTask = useMemo(() => {
    const m = {};
    for (const t of tasks) {
      const list = subtasksByTask[t.id] || [];
      const total = list.length;
      const done = list.reduce((acc, s) => acc + (s.is_done ? 1 : 0), 0);
      m[t.id] = { total, done };
    }
    return m;
  }, [tasks, subtasksByTask]);

  const tasksTodo = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);
  const tasksDone = useMemo(() => tasks.filter((t) => t.status === "done"), [tasks]);

  /* ---------------- Mutations: Tasks ---------------- */
  const createTask = async () => {
    setError("");
    if (!supabase || !user) return;
    if (!newTitle.trim()) return;

    const payload = {
      title: newTitle.trim(),
      status: newStatus || "todo",
      user_id: user.id,
      area_id: newAreaId || null,
      guide_id: newGuideId || null,
      due_at: isoFromLocalInput(newDueAt),
    };

    const { error } = await supabase.from("tasks").insert([payload]);
    if (error) return setError(error.message);

    setNewTitle("");
    setNewAreaId("");
    setNewGuideId("");
    setNewDueAt("");
    setNewStatus("todo");

    await loadTasks();
    flashInfo("Aufgabe angelegt");
  };

  const toggleTaskStatus = async (taskId) => {
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    const next = t.status === "done" ? "todo" : "done";

    const { error } = await supabase.from("tasks").update({ status: next }).eq("id", taskId);
    if (error) return setError(error.message);

    await loadTasks();
    flashInfo("Status geändert");
  };

  const updateTaskDueAt = async (taskId, isoOrNull) => {
    const { error } = await supabase.from("tasks").update({ due_at: isoOrNull }).eq("id", taskId);
    if (error) return setError(error.message);
    await loadTasks();
    flashInfo("Fälligkeitsdatum gespeichert");
  };

  /* ---------------- Mutations: Subtasks ---------------- */
  const addSubtask = async (taskId) => {
    setError("");
    const title = (subtaskDraft[taskId] || "").trim();
    if (!title) return;

    const { error } = await supabase.from("subtasks").insert([
      {
        task_id: taskId,
        title,
        is_done: false,
        status: "todo",
      },
    ]);
    if (error) return setError(error.message);

    setSubtaskDraft((prev) => ({ ...prev, [taskId]: "" }));
    await loadSubtasks();
    flashInfo("Unteraufgabe hinzugefügt");
  };

  const toggleSubtask = async (subtaskId) => {
    const s = subtasks.find((x) => x.id === subtaskId);
    if (!s) return;
    const nextDone = !s.is_done;
    const nextStatus = nextDone ? "done" : "todo";

    const { error } = await supabase
      .from("subtasks")
      .update({ is_done: nextDone, status: nextStatus })
      .eq("id", subtaskId);

    if (error) return setError(error.message);
    await loadSubtasks();
  };

  /* ---------------- Calendar data (month + day) ---------------- */
  const monthRange = useMemo(() => {
    const from = startOfMonth(calMonth);
    const to = endOfMonth(calMonth);
    return { from, to };
  }, [calMonth]);

  const calTasksInMonth = useMemo(() => {
    // client-side filter on already loaded tasks
    // ensures calendar works even if v_tasks_calendar is not used client-side
    const from = monthRange.from.getTime();
    const to = monthRange.to.getTime();
    return tasks.filter((t) => {
      if (!t.due_at) return false;
      const ts = new Date(t.due_at).getTime();
      if (ts < from || ts > to) return false;
      if (calStatus && t.status !== calStatus) return false;
      if (calArea && t.area_id !== calArea) return false;
      return true;
    });
  }, [tasks, monthRange, calStatus, calArea]);

  const calCountByDay = useMemo(() => {
    const m = {};
    for (const t of calTasksInMonth) {
      const day = ymdLocal(new Date(t.due_at));
      m[day] = (m[day] || 0) + 1;
    }
    return m;
  }, [calTasksInMonth]);

  const calTasksForSelectedDay = useMemo(() => {
    return calTasksInMonth
      .filter((t) => ymdLocal(new Date(t.due_at)) === calSelectedDay)
      .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  }, [calTasksInMonth, calSelectedDay]);

  /* ---------------- UI helpers ---------------- */
  const styles = useMemo(
    () => ({
      page: { padding: 20, background: "#f4f7fb", minHeight: "100vh" },
      topbar: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        marginBottom: 16,
      },
      tabs: { display: "flex", gap: 8, alignItems: "center" },
      tab: (active) => ({
        padding: "8px 14px",
        borderRadius: 999,
        border: "1px solid #e5e7eb",
        background: active ? "#0f7a2a" : "white",
        color: active ? "white" : "#111827",
        fontWeight: 800,
        cursor: "pointer",
      }),
      btn: {
        padding: "8px 14px",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        background: "white",
        cursor: "pointer",
        fontWeight: 800,
      },
      btnPrimary: {
        padding: "10px 16px",
        borderRadius: 14,
        border: "none",
        background: "#0f7a2a",
        color: "white",
        cursor: "pointer",
        fontWeight: 900,
      },
      card: {
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        padding: 16,
        boxShadow: "0 6px 20px rgba(15, 23, 42, 0.06)",
      },
      section: { marginTop: 14 },
      row: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" },
      input: {
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        minWidth: 180,
      },
      select: {
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        minWidth: 180,
        background: "white",
      },
      twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
      listRow: {
        display: "grid",
        gridTemplateColumns: "1.6fr 0.8fr 0.8fr 0.8fr 0.8fr",
        gap: 10,
        alignItems: "center",
        padding: "10px 0",
        borderBottom: "1px solid #eef2f7",
      },
      pill: (done) => ({
        display: "inline-flex",
        padding: "3px 10px",
        borderRadius: 999,
        fontWeight: 900,
        fontSize: 12,
        background: done ? "#dcfce7" : "#ffedd5",
        color: done ? "#166534" : "#9a3412",
        border: "1px solid #e5e7eb",
      }),
      subRow: { display: "flex", gap: 10, alignItems: "center", padding: "6px 0" },
      progressWrap: { height: 10, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" },
      progressBar: (pct) => ({ height: 10, width: `${pct}%`, background: "#0f7a2a" }),
      calGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gap: 10,
      },
      calCell: (selected) => ({
        minHeight: 58,
        borderRadius: 14,
        border: "1px solid #e5e7eb",
        background: selected ? "#0f7a2a" : "white",
        color: selected ? "white" : "#111827",
        padding: 10,
        cursor: "pointer",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
      }),
      calBadge: (selected) => ({
        minWidth: 22,
        height: 22,
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 900,
        fontSize: 12,
        background: selected ? "rgba(255,255,255,0.25)" : "#eef2ff",
        color: selected ? "white" : "#3730a3",
        border: "1px solid rgba(0,0,0,0.08)",
      }),
      bannerErr: {
        background: "#fee2e2",
        color: "#991b1b",
        border: "1px solid #fecaca",
        padding: 10,
        borderRadius: 12,
        marginBottom: 12,
        fontWeight: 800,
      },
      bannerOk: {
        background: "#dcfce7",
        color: "#166534",
        border: "1px solid #bbf7d0",
        padding: 10,
        borderRadius: 12,
        marginBottom: 12,
        fontWeight: 800,
      },
    }),
    []
  );

  const monthLabel = useMemo(() => {
    const monthNames = [
      "Januar",
      "Februar",
      "März",
      "April",
      "Mai",
      "Juni",
      "Juli",
      "August",
      "September",
      "Oktober",
      "November",
      "Dezember",
    ];
    return `${monthNames[calMonth.getMonth()]} ${calMonth.getFullYear()}`;
  }, [calMonth]);

  const calDays = useMemo(() => {
    const d0 = startOfMonth(calMonth);
    // monday-based grid
    const dayOfWeek = (d0.getDay() + 6) % 7; // 0=Mon
    const firstGridDay = new Date(d0);
    firstGridDay.setDate(d0.getDate() - dayOfWeek);

    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(firstGridDay);
      d.setDate(firstGridDay.getDate() + i);
      cells.push(d);
    }
    return cells;
  }, [calMonth]);

  /* ---------------- Login screen ---------------- */
  if (!user) {
    return <Login supabase={supabase} />;
  }

  /* ---------------- Render helpers ---------------- */
  function TaskCard({ t, compact }) {
    const p = progressByTask[t.id] || { total: 0, done: 0 };
    const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
    const list = subtasksByTask[t.id] || [];

    return (
      <div style={{ ...styles.card, padding: compact ? 12 : 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>{t.title}</div>
              <span style={styles.pill(t.status === "done")}>{t.status}</span>
            </div>

            <div style={{ marginTop: 6, color: "#475569", fontSize: 13 }}>
              Bereich: {t.area_name || "—"}
              {t.due_at ? ` • Fällig: ${new Date(t.due_at).toLocaleString("de-DE")}` : ""}
            </div>

            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: "#334155" }}>Unteraufgaben</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>
                {p.done}/{p.total}
              </div>
            </div>

            <div style={{ marginTop: 6, ...styles.progressWrap }}>
              <div style={styles.progressBar(pct)} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button style={styles.btn} onClick={() => toggleTaskStatus(t.id)}>
              Status
            </button>
          </div>
        </div>

        {/* Subtasks */ }
        {!compact && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                style={{ ...styles.input, flex: 1, minWidth: 220 }}
                placeholder="Unteraufgabe hinzufügen…"
                value={subtaskDraft[t.id] || ""}
                onChange={(e) => setSubtaskDraft((prev) => ({ ...prev, [t.id]: e.target.value }))}
              />
              <button style={styles.btnPrimary} onClick={() => addSubtask(t.id)}>
                +
              </button>
            </div>

            {list.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {list.map((s) => (
                  <div key={s.id} style={styles.subRow}>
                    <input type="checkbox" checked={!!s.is_done} onChange={() => toggleSubtask(s.id)} />
                    <div style={{ flex: 1, textDecoration: s.is_done ? "line-through" : "none" }}>{s.title}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ---------------- Main UI ---------------- */
  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={styles.tabs}>
          <div style={{ fontSize: 20, fontWeight: 900, marginRight: 6 }}>Dashboard</div>
          <button style={styles.tab(activeTab === "board")} onClick={() => setActiveTab("board")}>
            Board
          </button>
          <button style={styles.tab(activeTab === "list")} onClick={() => setActiveTab("list")}>
            Liste
          </button>
          <button style={styles.tab(activeTab === "calendar")} onClick={() => setActiveTab("calendar")}>
            Kalender
          </button>
          <button style={styles.btn} onClick={loadAll}>
            Neu laden
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ color: "#475569", fontSize: 13 }}>{user.email}</div>
          <button
            style={styles.btn}
            onClick={async () => {
              await supabase.auth.signOut();
            }}
          >
            Abmelden
          </button>
        </div>
      </div>

      {error ? <div style={styles.bannerErr}>{error}</div> : null}
      {info ? <div style={styles.bannerOk}>{info}</div> : null}

      {/* Create Task */}
      <div style={styles.card}>
        <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Aufgabe anlegen</div>
        <div style={styles.row}>
          <input style={styles.input} placeholder="Titel" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <select style={styles.select} value={newAreaId} onChange={(e) => setNewAreaId(e.target.value)}>
            <option value="">Bereich</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input style={styles.input} type="datetime-local" value={newDueAt} onChange={(e) => setNewDueAt(e.target.value)} />
          <select style={styles.select} value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
            <option value="todo">Zu erledigen</option>
            <option value="done">Erledigt</option>
          </select>
          <select style={styles.select} value={newGuideId} onChange={(e) => setNewGuideId(e.target.value)}>
            <option value="">Anleitung</option>
            {guides.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
          <button style={styles.btnPrimary} onClick={createTask}>
            Anlegen
          </button>
        </div>
      </div>

      {/* Tabs content */}
      {activeTab === "board" && (
        <div style={{ ...styles.section, ...styles.twoCol }}>
          <div style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>Zu erledigen</div>
              <div style={{ color: "#64748b", fontSize: 13 }}>{tasksTodo.length}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {tasksTodo.map((t) => (
                <TaskCard key={t.id} t={t} compact={false} />
              ))}
              {tasksTodo.length === 0 && <div style={{ color: "#64748b" }}>Keine Aufgaben</div>}
            </div>
          </div>

          <div style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>Erledigt</div>
              <div style={{ color: "#64748b", fontSize: 13 }}>{tasksDone.length}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {tasksDone.map((t) => (
                <TaskCard key={t.id} t={t} compact={false} />
              ))}
              {tasksDone.length === 0 && <div style={{ color: "#64748b" }}>Keine erledigten Aufgaben</div>}
            </div>
          </div>
        </div>
      )}

      {activeTab === "list" && (
        <div style={{ ...styles.section, ...styles.card }}>
          <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Liste</div>

          <div style={{ ...styles.listRow, fontWeight: 900, color: "#334155" }}>
            <div>Titel</div>
            <div>Status</div>
            <div>Bereich</div>
            <div>Fällig</div>
            <div>Aktion</div>
          </div>

          {tasks.map((t) => (
            <div key={t.id} style={styles.listRow}>
              <div style={{ fontWeight: 800 }}>{t.title}</div>
              <div>
                <span style={styles.pill(t.status === "done")}>{t.status}</span>
              </div>
              <div>{t.area_name || "—"}</div>
              <div>
                {t.due_at ? (
                  <input
                    type="datetime-local"
                    style={{ ...styles.input, minWidth: 210 }}
                    value={new Date(t.due_at).toISOString().slice(0, 16)}
                    onChange={(e) => updateTaskDueAt(t.id, isoFromLocalInput(e.target.value))}
                  />
                ) : (
                  <input
                    type="datetime-local"
                    style={{ ...styles.input, minWidth: 210 }}
                    value={""}
                    onChange={(e) => updateTaskDueAt(t.id, isoFromLocalInput(e.target.value))}
                  />
                )}
              </div>
              <div>
                <button style={styles.btn} onClick={() => toggleTaskStatus(t.id)}>
                  Status
                </button>
              </div>
            </div>
          ))}

          {tasks.length === 0 && <div style={{ marginTop: 10, color: "#64748b" }}>Keine Aufgaben</div>}
        </div>
      )}

      {activeTab === "calendar" && (
        <div style={{ ...styles.section, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 900 }}>Kalender</div>

                <button style={styles.btn} onClick={() => setCalMonth((m) => addMonths(m, -1))}>
                  ◀
                </button>
                <div style={{ fontWeight: 900 }}>{monthLabel}</div>
                <button style={styles.btn} onClick={() => setCalMonth((m) => addMonths(m, 1))}>
                  ▶
                </button>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <select style={styles.select} value={calStatus} onChange={(e) => setCalStatus(e.target.value)}>
                  <option value="">Alle Status</option>
                  <option value="todo">todo</option>
                  <option value="done">done</option>
                </select>

                <select style={styles.select} value={calArea} onChange={(e) => setCalArea(e.target.value)}>
                  <option value="">Alle Bereiche</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>

                <button
                  style={styles.btn}
                  onClick={() => {
                    const today = new Date();
                    setCalMonth(startOfMonth(today));
                    setCalSelectedDay(ymdLocal(today));
                  }}
                >
                  Heute
                </button>
              </div>
            </div>

            <div style={{ marginTop: 12, color: "#64748b", fontSize: 13 }}>
              Tipp: Aufgaben ohne Fälligkeitsdatum erscheinen nicht im Kalender.
            </div>

            <div style={{ marginTop: 14, ...styles.calGrid }}>
              {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
                <div key={d} style={{ fontWeight: 900, color: "#475569", paddingLeft: 6 }}>
                  {d}
                </div>
              ))}

              {calDays.map((d) => {
                const key = ymdLocal(d);
                const inMonth = d.getMonth() === calMonth.getMonth();
                const selected = key === calSelectedDay;
                const count = calCountByDay[key] || 0;

                return (
                  <div
                    key={key}
                    onClick={() => setCalSelectedDay(key)}
                    style={{
                      ...styles.calCell(selected),
                      opacity: inMonth ? 1 : 0.35,
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{d.getDate()}</div>
                    {count > 0 ? <div style={styles.calBadge(selected)}>{count}</div> : <div />}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={styles.card}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>
              Termine am {new Date(calSelectedDay + "T00:00:00").toLocaleDateString("de-DE")}
            </div>

            {calTasksForSelectedDay.map((t) => (
              <div key={t.id} style={{ marginBottom: 10 }}>
                <TaskCard t={t} compact={true} />
              </div>
            ))}

            {calTasksForSelectedDay.length === 0 && <div style={{ color: "#64748b" }}>Keine Termine</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Login Component ---------------- */
function Login({ supabase }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  const login = async () => {
    setErr("");
    if (!supabase) return setErr("Supabase nicht initialisiert – ENV prüfen.");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) setErr(error.message);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f4f7fb", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 420, background: "white", border: "1px solid #e5e7eb", borderRadius: 18, padding: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 14 }}>Bitte einloggen</div>
        {err ? (
          <div style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca", padding: 10, borderRadius: 12, marginBottom: 12, fontWeight: 800 }}>
            {err}
          </div>
        ) : null}
        <input
          style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", marginBottom: 10 }}
          placeholder="E-Mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", marginBottom: 12 }}
          type="password"
          placeholder="Passwort"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        <button
          style={{ width: "100%", padding: "10px 16px", borderRadius: 14, border: "none", background: "#0f7a2a", color: "white", cursor: "pointer", fontWeight: 900 }}
          onClick={login}
        >
          Login
        </button>
      </div>
    </div>
  );
}
