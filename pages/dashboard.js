// pages/dashboard.js
import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ---------------- Supabase Client (browser-only singleton) ---------------- */
function getSupabaseClient() {
  if (typeof window === "undefined") return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn("Supabase ENV fehlt: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return null;
  }

  if (!window.__supabase__) {
    window.__supabase__ = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return window.__supabase__;
}

/* ---------------- Helpers ---------------- */
const toISO = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

function fmtDateTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return "";
  }
}

/* ---------------- Main ---------------- */
export default function DashboardPage() {
  const [supabase, setSupabase] = useState(null);
  const [session, setSession] = useState(null);
  const user = session?.user || null;

  const [activeTab, setActiveTab] = useState("board"); // board | list
  const [loading, setLoading] = useState(false);

  const [tasks, setTasks] = useState([]);
  const [subtasksByTask, setSubtasksByTask] = useState({});
  const [areas, setAreas] = useState([]);
  const [guides, setGuides] = useState([]);

  const [expandedTaskIds, setExpandedTaskIds] = useState({});
  const [inlineSubtaskTitle, setInlineSubtaskTitle] = useState({});

  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  /* Create Task */
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [newDueAt, setNewDueAt] = useState("");
  const [newStatus, setNewStatus] = useState("todo"); // must be 'todo'|'done'
  const [newGuideId, setNewGuideId] = useState("");

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

  /* Load Data */
  useEffect(() => {
    if (!supabase || !user) return;
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user?.id]);

  const refreshAll = async () => {
    setError("");
    setLoading(true);
    try {
      await Promise.all([loadAreas(), loadGuides(), loadTasksAndSubtasks()]);
    } finally {
      setLoading(false);
    }
  };

  const loadAreas = async () => {
    const { data, error: e } = await supabase.from("areas").select("id,name").order("name");
    if (e) return showError(e, "LOAD AREAS ERROR");
    setAreas(data || []);
  };

  const loadGuides = async () => {
    const { data, error: e } = await supabase.from("guides").select("id,title").order("title");
    if (e) return showError(e, "LOAD GUIDES ERROR");
    setGuides(data || []);
  };

  const loadTasksAndSubtasks = async () => {
    const { data: tdata, error: te } = await supabase
      .from("tasks")
      .select("id,title,status,due_at,area_id,guide_id,created_at,areas(name),guides(title)")
      .order("created_at", { ascending: false });

    if (te) return showError(te, "LOAD TASKS ERROR");

    const safeTasks = tdata || [];
    setTasks(safeTasks);

    const taskIds = safeTasks.map((t) => t.id).filter(Boolean);
    if (taskIds.length === 0) {
      setSubtasksByTask({});
      return;
    }

    const { data: sdata, error: se } = await supabase
      .from("subtasks")
      .select("id,task_id,title,is_done,status,created_at,guide_id")
      .in("task_id", taskIds)
      .order("created_at", { ascending: true });

    if (se) return showError(se, "LOAD SUBTASKS ERROR");

    const map = {};
    (sdata || []).forEach((st) => {
      const k = st.task_id;
      if (!map[k]) map[k] = [];
      map[k].push(st);
    });
    setSubtasksByTask(map);
  };

  /* ---------- Robust error handler ---------- */
  const showError = (e, context) => {
    const msg = e?.message || String(e || "Unbekannter Fehler");
    console.error(context || "ERROR", e);
    setError(msg);
    setToast(msg);

    window.clearTimeout(window.__toastTimer__);
    window.__toastTimer__ = window.setTimeout(() => setToast(""), 4500);

    // Hint for the known trigger/calendar issue
    if (msg.includes("ON CONFLICT") || msg.includes("unique or exclusion constraint")) {
      console.warn("Hinweis: tasks_calendar braucht einen UNIQUE/PK-Constraint auf id (für ON CONFLICT (id)).");
    }
  };

  /* ---------------- Create Task ---------------- */
  const createTask = async () => {
    setError("");
    if (!supabase || !user) return showError("Nicht eingeloggt oder Supabase nicht bereit.", "createTask");
    if (!newTitle.trim()) return;

    try {
      setIsSavingTask(true);

      const payload = {
        title: newTitle.trim(),
        area_id: newAreaId || null,
        due_at: toISO(newDueAt) || null,
        status: newStatus, // todo | done
        user_id: user.id,  // RLS
        guide_id: newGuideId || null,
      };

      const { data, error } = await supabase
        .from("tasks")
        .insert([payload])
        .select("id")
        .single();

      if (error) return showError(error, "createTask insert");
      if (!data?.id) return showError("Insert ok, aber keine ID zurückgegeben (RLS/Trigger prüfen).", "createTask");

      setNewTitle("");
      setNewDueAt("");
      setNewAreaId("");
      setNewGuideId("");

      setToast("Aufgabe angelegt ✅");
      await loadAll();
    } catch (e) {
      showError(e, "createTask catch");
    } finally {
      setIsSavingTask(false);
    }
  };

  /* ---------------- Task status toggle ---------------- */
  const toggleTaskStatus = async (taskId, current) => {
    if (!supabase) return;
    const next = current === "done" ? "todo" : "done";
    const { error: e } = await supabase.from("tasks").update({ status: next }).eq("id", taskId);
    if (e) return showError(e, "TOGGLE TASK STATUS ERROR");
    await loadTasksAndSubtasks();
  };

  /* ---------------- Subtasks ---------------- */
  const toggleSubtaskDone = async (subtaskId, nextDone) => {
    if (!supabase) return;
    const { error: e } = await supabase.from("subtasks").update({ is_done: !!nextDone }).eq("id", subtaskId);
    if (e) return showError(e, "TOGGLE SUBTASK ERROR");
    await loadTasksAndSubtasks();
  };

  const addInlineSubtask = async (taskId) => {
    if (!supabase) return;
    const title = (inlineSubtaskTitle[taskId] || "").trim();
    if (!title) return;

    const payload = { task_id: taskId, title, is_done: false, status: "todo" };
    const { error: e } = await supabase.from("subtasks").insert([payload]).select("id").single();
    if (e) return showError(e, "CREATE SUBTASK ERROR");

    setInlineSubtaskTitle((m) => ({ ...m, [taskId]: "" }));
    await loadTasksAndSubtasks();
  };

  const toggleExpanded = (taskId) => setExpandedTaskIds((m) => ({ ...m, [taskId]: !m[taskId] }));

  /* ---------------- Derived (Board columns) ---------------- */
  const board = useMemo(() => {
    const todo = [];
    const done = [];
    (tasks || []).forEach((t) => ((t?.status || "todo") === "done" ? done : todo).push(t));
    return { todo, done };
  }, [tasks]);

  /* ---------------- Login ---------------- */
  if (!supabase) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, Arial" }}>
        <h2>Dashboard</h2>
        <div>Supabase ist nicht initialisiert (ENV prüfen).</div>
      </div>
    );
  }

  if (!user) return <Login supabase={supabase} />;

  /* ---------------- UI ---------------- */
  return (
    <div style={{ minHeight: "100vh", background: "#f5f7ff", padding: 20, fontFamily: "system-ui, Arial" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Dashboard</div>
          <TabButton active={activeTab === "board"} onClick={() => setActiveTab("board")}>Board</TabButton>
          <TabButton active={activeTab === "list"} onClick={() => setActiveTab("list")}>Liste</TabButton>
          <button onClick={refreshAll} style={btnSecondary} title="Daten neu laden">Neu laden</button>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#334155" }}>{user.email}</div>
          <button onClick={() => supabase.auth.signOut()} style={btnSecondary}>Abmelden</button>
        </div>
      </div>

      {toast ? (
        <div style={toastStyle}>
          {toast}
          <button onClick={() => setToast("")} style={{ marginLeft: 10, border: "none", background: "transparent", cursor: "pointer", color: "#fff" }}>
            ✕
          </button>
        </div>
      ) : null}

      {error ? <div style={errorStyle}>{error}</div> : null}

      <div style={cardStyle}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Aufgabe anlegen</div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <input placeholder="Titel" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={inputStyle} />

          <select value={newAreaId} onChange={(e) => setNewAreaId(e.target.value)} style={inputStyle}>
            <option value="">Bereich</option>
            {(areas || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>

          <input type="datetime-local" value={newDueAt} onChange={(e) => setNewDueAt(e.target.value)} style={inputStyle} />

          <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} style={inputStyle}>
            <option value="todo">Zu erledigen</option>
            <option value="done">Erledigt</option>
          </select>

          <select value={newGuideId} onChange={(e) => setNewGuideId(e.target.value)} style={inputStyle}>
            <option value="">Anleitung</option>
            {(guides || []).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>

          <button onClick={createTask} style={btnPrimary} disabled={loading || isSavingTask}>
            {(loading || isSavingTask) ? "..." : "Anlegen"}
          </button>
        </div>
      </div>

      {activeTab === "board" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
          <BoardColumn
            title="Zu erledigen"
            items={board.todo}
            subtasksByTask={subtasksByTask}
            expandedTaskIds={expandedTaskIds}
            inlineSubtaskTitle={inlineSubtaskTitle}
            setInlineSubtaskTitle={setInlineSubtaskTitle}
            toggleExpanded={toggleExpanded}
            toggleTaskStatus={toggleTaskStatus}
            toggleSubtaskDone={toggleSubtaskDone}
            addInlineSubtask={addInlineSubtask}
          />
          <BoardColumn
            title="Erledigt"
            items={board.done}
            subtasksByTask={subtasksByTask}
            expandedTaskIds={expandedTaskIds}
            inlineSubtaskTitle={inlineSubtaskTitle}
            setInlineSubtaskTitle={setInlineSubtaskTitle}
            toggleExpanded={toggleExpanded}
            toggleTaskStatus={toggleTaskStatus}
            toggleSubtaskDone={toggleSubtaskDone}
            addInlineSubtask={addInlineSubtask}
          />
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div style={cardStyle}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Liste</div>
            {(tasks || []).length === 0 ? (
              <div style={{ color: "#475569" }}>Keine Aufgaben</div>
            ) : (
              (tasks || []).map((t) => (
                <div key={t.id} style={{ padding: "10px 0", borderBottom: "1px solid #e5e7eb" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{t.title}</div>
                      <div style={{ fontSize: 12, color: "#475569" }}>
                        {t.areas?.name ? `Bereich: ${t.areas.name}` : ""}{t.due_at ? ` • Fällig: ${fmtDateTime(t.due_at)}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={pillStyle(t.status)}>{t.status}</span>
                      <button style={btnSecondary} onClick={() => toggleTaskStatus(t.id, t.status)}>Status wechseln</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Board Column + Task Card ---------------- */
function BoardColumn({
  title,
  items,
  subtasksByTask,
  expandedTaskIds,
  inlineSubtaskTitle,
  setInlineSubtaskTitle,
  toggleExpanded,
  toggleTaskStatus,
  toggleSubtaskDone,
  addInlineSubtask,
}) {
  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>{title}</div>

      {(items || []).length === 0 ? (
        <div style={{ color: "#475569" }}>Keine Aufgaben</div>
      ) : (
        (items || []).map((t) => {
          const st = subtasksByTask?.[t.id] || [];
          const total = st.length;
          const done = st.filter((x) => !!x.is_done).length;
          const progressText = total > 0 ? `${done}/${total}` : "0/0";
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          const expanded = !!expandedTaskIds?.[t.id];

          return (
            <div key={t.id} style={taskCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, wordBreak: "break-word" }}>{t.title}</div>
                    <span style={pillStyle(t.status)}>{t.status}</span>
                  </div>

                  <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                    {t.areas?.name ? `Bereich: ${t.areas.name}` : "Bereich: –"}
                    {t.due_at ? ` • Fällig: ${fmtDateTime(t.due_at)}` : ""}
                    {t.guides?.title ? ` • Anleitung: ${t.guides.title}` : ""}
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569" }}>
                      <span>Unteraufgaben</span>
                      <span>{progressText}</span>
                    </div>
                    <div style={progressOuter}>
                      <div style={{ ...progressInner, width: `${pct}%` }} />
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button style={btnSecondarySmall} onClick={() => toggleExpanded(t.id)}>{expanded ? "Zuklappen" : "Aufklappen"}</button>
                  <button style={btnSecondarySmall} onClick={() => toggleTaskStatus(t.id, t.status)}>Status</button>
                </div>
              </div>

              {expanded ? (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      placeholder="Unteraufgabe hinzufügen…"
                      value={inlineSubtaskTitle?.[t.id] || ""}
                      onChange={(e) => setInlineSubtaskTitle((m) => ({ ...m, [t.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") addInlineSubtask(t.id); }}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button style={btnPrimarySmall} onClick={() => addInlineSubtask(t.id)}>+</button>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    {st.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#64748b" }}>Keine Unteraufgaben</div>
                    ) : (
                      st.map((s) => (
                        <label key={s.id} style={subtaskRow}>
                          <input type="checkbox" checked={!!s.is_done} onChange={(e) => toggleSubtaskDone(s.id, e.target.checked)} />
                          <span style={{ textDecoration: s.is_done ? "line-through" : "none" }}>{s.title}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}

/* ---------------- Login Component ---------------- */
function Login({ supabase }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");

  const login = async () => {
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) setMsg(error.message);
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f7ff", fontFamily: "system-ui, Arial" }}>
      <div style={{ width: 360, background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Login</div>
        {msg ? <div style={{ ...errorStyle, marginBottom: 10 }}>{msg}</div> : null}
        <input placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...inputStyle, width: "100%", marginBottom: 8 }} />
        <input type="password" placeholder="Passwort" value={pw} onChange={(e) => setPw(e.target.value)} style={{ ...inputStyle, width: "100%", marginBottom: 8 }} />
        <button onClick={login} style={{ ...btnPrimary, width: "100%" }}>Login</button>
      </div>
    </div>
  );
}

/* ---------------- Small UI components/styles ---------------- */
function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "1px solid #e5e7eb",
        background: active ? "#0f7a2a" : "#ffffff",
        color: active ? "#ffffff" : "#0f172a",
        padding: "8px 12px",
        borderRadius: 999,
        cursor: "pointer",
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

const cardStyle = {
  background: "#ffffff",
  borderRadius: 16,
  padding: 14,
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
};

const taskCardStyle = {
  border: "1px solid #eef2ff",
  borderRadius: 14,
  padding: 12,
  marginBottom: 10,
  background: "#fbfdff",
};

const inputStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: "10px 10px",
  outline: "none",
  minWidth: 160,
};

const btnPrimary = {
  background: "#0f7a2a",
  color: "#fff",
  border: "none",
  borderRadius: 12,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 800,
};

const btnSecondary = {
  background: "#ffffff",
  color: "#0f172a",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const btnPrimarySmall = { ...btnPrimary, padding: "8px 10px", borderRadius: 10 };
const btnSecondarySmall = { ...btnSecondary, padding: "8px 10px", borderRadius: 10 };

const errorStyle = {
  background: "#fff1f2",
  border: "1px solid #fecdd3",
  color: "#9f1239",
  padding: 12,
  borderRadius: 12,
  marginBottom: 12,
  fontWeight: 700,
};

const toastStyle = {
  position: "sticky",
  top: 10,
  zIndex: 50,
  background: "#111827",
  color: "#fff",
  padding: "10px 12px",
  borderRadius: 12,
  marginBottom: 12,
  display: "inline-flex",
  alignItems: "center",
};

function pillStyle(status) {
  const isDone = status === "done";
  return {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    background: isDone ? "#dcfce7" : "#fff7ed",
    color: isDone ? "#166534" : "#9a3412",
    border: `1px solid ${isDone ? "#86efac" : "#fdba74"}`,
  };
}

const progressOuter = { width: "100%", height: 8, borderRadius: 999, background: "#eef2ff", overflow: "hidden" };
const progressInner = { height: 8, borderRadius: 999, background: "#0f7a2a" };

const subtaskRow = { display: "flex", gap: 10, alignItems: "center", padding: "6px 0", fontSize: 14 };
