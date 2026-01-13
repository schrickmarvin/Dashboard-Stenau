// Dashboard.js
import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ---------------- Supabase ---------------- */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

/* ---------------- Helpers: Date ---------------- */
function pad2(n) {
  return String(n).padStart(2, "0");
}
function toYMD(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}
function ymdToDate(ymd) {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameYMD(a, b) {
  return toYMD(a) === toYMD(b);
}

/* ---------------- Helpers: UI ---------------- */
const styles = {
  page: { padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial", background: "#f7f7f8", minHeight: "100vh" },
  shell: { maxWidth: 1200, margin: "0 auto", display: "grid", gap: 12 },
  topbar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 12, border: "1px solid #e5e5e5", background: "#fff", borderRadius: 12 },
  tabs: { display: "flex", gap: 8, flexWrap: "wrap" },
  tab: (active) => ({
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #e5e5e5",
    background: active ? "#111" : "#fff",
    color: active ? "#fff" : "#111",
    cursor: "pointer",
    fontSize: 14,
  }),
  grid2: { display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12, alignItems: "start" },
  card: { padding: 12, border: "1px solid #e5e5e5", background: "#fff", borderRadius: 12 },
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  input: { width: "100%", padding: "10px 10px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14 },
  textarea: { width: "100%", padding: "10px 10px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14, resize: "vertical" },
  select: { padding: "10px 10px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14, background: "#fff" },
  btn: (variant) => ({
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: variant === "primary" ? "#111" : "#fff",
    color: variant === "primary" ? "#fff" : "#111",
    cursor: "pointer",
    fontSize: 14,
    whiteSpace: "nowrap",
  }),
  subtle: { opacity: 0.7, fontSize: 13 },
  list: { display: "grid", gap: 10 },
  divider: { height: 1, background: "#eee", margin: "10px 0" },
  pill: (tone) => ({
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 12,
    border: "1px solid #e5e5e5",
    background: tone === "done" ? "#f1fff1" : "#fff",
  }),
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "grid",
    placeItems: "center",
    padding: 20,
    zIndex: 9999,
  },
  modal: {
    width: "min(1100px, 95vw)",
    height: "min(750px, 90vh)",
    background: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    border: "1px solid #e5e5e5",
  },
  modalHeader: { padding: 10, borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" },
};

/* ---------------- Helpers: Supabase (Tasks) ---------------- */
async function requireSupabase() {
  if (!supabase) throw new Error("Supabase ENV fehlt: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

async function getSessionUser() {
  await requireSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user || null;
}

async function listTasks() {
  await requireSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .select("id,title,description,status,due_date,created_at,guide_id")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function createTask({ title, description, due_date }) {
  await requireSupabase();
  const payload = {
    title,
    description: description || null,
    due_date: due_date || null,
    status: "offen",
  };
  const { data, error } = await supabase.from("tasks").insert([payload]).select("*").single();
  if (error) throw error;
  return data;
}

async function updateTask(taskId, patch) {
  await requireSupabase();
  const { data, error } = await supabase.from("tasks").update(patch).eq("id", taskId).select("*").single();
  if (error) throw error;
  return data;
}

async function deleteTask(taskId) {
  await requireSupabase();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw error;
}

/* ---------------- Helpers: Supabase (Subtasks) ----------------
   Optional: wenn du keine subtasks Tabelle hast, wird das abgefangen. */
async function listSubtasks(taskId) {
  await requireSupabase();
  try {
    const { data, error } = await supabase
      .from("subtasks")
      .select("id,task_id,title,done,created_at,guide_id")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (e) {
    return [];
  }
}

async function createSubtask({ taskId, title }) {
  await requireSupabase();
  try {
    const { data, error } = await supabase
      .from("subtasks")
      .insert([{ task_id: taskId, title, done: false }])
      .select("*")
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    throw new Error("subtasks Tabelle fehlt oder RLS verhindert Insert.");
  }
}

async function updateSubtask(subtaskId, patch) {
  await requireSupabase();
  try {
    const { data, error } = await supabase.from("subtasks").update(patch).eq("id", subtaskId).select("*").single();
    if (error) throw error;
    return data;
  } catch (e) {
    throw new Error("subtasks Tabelle fehlt oder RLS verhindert Update.");
  }
}

async function deleteSubtask(subtaskId) {
  await requireSupabase();
  try {
    const { error } = await supabase.from("subtasks").delete().eq("id", subtaskId);
    if (error) throw error;
  } catch (e) {
    throw new Error("subtasks Tabelle fehlt oder RLS verhindert Delete.");
  }
}

/* ---------------- Helpers: Supabase (Guides) ---------------- */
async function uploadGuideFile(file, guideId) {
  if (!file) return { file_path: null, file_name: null, file_mime: null, file_size: null };

  const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
  const path = `guides/${guideId}/${Date.now()}_${safeName}`;

  const { error: upErr } = await supabase.storage.from("guides").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) throw upErr;

  return { file_path: path, file_name: file.name, file_mime: file.type, file_size: file.size };
}

async function createGuide({ title, description, visibility = "all", file }) {
  await requireSupabase();
  const { data: inserted, error: insErr } = await supabase
    .from("guides")
    .insert([{ title, description: description || null, visibility }])
    .select("id")
    .single();
  if (insErr) throw insErr;

  const guideId = inserted.id;
  const fileMeta = await uploadGuideFile(file, guideId);

  const { data: updated, error: upErr } = await supabase.from("guides").update(fileMeta).eq("id", guideId).select("*").single();
  if (upErr) throw upErr;

  return updated;
}

async function listGuides() {
  await requireSupabase();
  const { data, error } = await supabase.from("guides").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function deleteGuide(guide) {
  await requireSupabase();
  if (guide?.file_path) {
    await supabase.storage.from("guides").remove([guide.file_path]);
  }
  const { error } = await supabase.from("guides").delete().eq("id", guide.id);
  if (error) throw error;
}

async function getGuideFileUrl(guide) {
  await requireSupabase();
  if (!guide?.file_path) return null;

  // Signed URL (Bucket sollte privat sein)
  const { data, error } = await supabase.storage.from("guides").createSignedUrl(guide.file_path, 60 * 30);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function setTaskGuide(taskId, guideId) {
  await requireSupabase();
  const { error } = await supabase.from("tasks").update({ guide_id: guideId || null }).eq("id", taskId);
  if (error) throw error;
}

async function setSubtaskGuide(subtaskId, guideId) {
  await requireSupabase();
  const { error } = await supabase.from("subtasks").update({ guide_id: guideId || null }).eq("id", subtaskId);
  if (error) throw error;
}

/* ---------------- Component ---------------- */
export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [authView, setAuthView] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [authMsg, setAuthMsg] = useState("");

  const [activeTab, setActiveTab] = useState("tasks"); // tasks | calendar | guides | settings

  // Tasks
  const [tasks, setTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const selectedTask = useMemo(() => tasks.find((t) => t.id === selectedTaskId) || null, [tasks, selectedTaskId]);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskDue, setTaskDue] = useState("");

  // Subtasks
  const [subtasks, setSubtasks] = useState([]);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskErr, setSubtaskErr] = useState("");

  // Guides
  const [guides, setGuides] = useState([]);
  const guidesById = useMemo(() => Object.fromEntries((guides || []).map((g) => [g.id, g])), [guides]);

  const [guideTitle, setGuideTitle] = useState("");
  const [guideDesc, setGuideDesc] = useState("");
  const [guideVis, setGuideVis] = useState("all");
  const [guideFile, setGuideFile] = useState(null);

  // Viewer Modal (für Guide-Dateien oder Text)
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerTitle, setViewerTitle] = useState("");
  const [viewerUrl, setViewerUrl] = useState(null);
  const [viewerText, setViewerText] = useState("");

  // Calendar
  const [calCursor, setCalCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => toYMD(new Date()));
  const [calendarMode, setCalendarMode] = useState("month"); // month | day

  // Global error
  const [globalErr, setGlobalErr] = useState("");

  /* ---------------- Init Auth ---------------- */
  useEffect(() => {
    (async () => {
      try {
        await requireSupabase();
        const u = await getSessionUser();
        setUser(u);
      } catch (e) {
        setGlobalErr(String(e?.message || e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      try {
        const u = await getSessionUser();
        setUser(u);
      } catch (e) {
        setGlobalErr(String(e?.message || e));
      }
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  /* ---------------- Load Data ---------------- */
  async function refreshAll() {
    setGlobalErr("");
    try {
      const [t, g] = await Promise.all([listTasks(), listGuides()]);
      setTasks(t);
      setGuides(g);
    } catch (e) {
      setGlobalErr(String(e?.message || e));
    }
  }

  useEffect(() => {
    if (!user) return;
    refreshAll();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (!selectedTaskId) {
      setSubtasks([]);
      return;
    }
    (async () => {
      const s = await listSubtasks(selectedTaskId);
      setSubtasks(s);
      setSubtaskErr("");
    })();
  }, [user, selectedTaskId]);

  /* ---------------- Auth Actions ---------------- */
  async function doLogin() {
    setAuthMsg("");
    setGlobalErr("");
    try {
      await requireSupabase();
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      setEmail("");
      setPass("");
    } catch (e) {
      setAuthMsg(String(e?.message || e));
    }
  }

  async function doSignup() {
    setAuthMsg("");
    setGlobalErr("");
    try {
      await requireSupabase();
      const { error } = await supabase.auth.signUp({ email, password: pass });
      if (error) throw error;
      setAuthMsg("Registrierung erfolgreich. Falls E-Mail-Bestätigung aktiv ist: bitte Mail prüfen.");
    } catch (e) {
      setAuthMsg(String(e?.message || e));
    }
  }

  async function doLogout() {
    setGlobalErr("");
    try {
      await supabase.auth.signOut();
      setUser(null);
      setTasks([]);
      setGuides([]);
      setSelectedTaskId(null);
      setActiveTab("tasks");
    } catch (e) {
      setGlobalErr(String(e?.message || e));
    }
  }

  /* ---------------- Task Actions ---------------- */
  async function onCreateTask() {
    if (!taskTitle.trim()) return;
    setGlobalErr("");
    try {
      const created = await createTask({ title: taskTitle.trim(), description: taskDesc.trim(), due_date: taskDue || null });
      setTasks((prev) => [created, ...prev]);
      setTaskTitle("");
      setTaskDesc("");
      setTaskDue("");
      setSelectedTaskId(created.id);
    } catch (e) {
      setGlobalErr(String(e?.message || e));
    }
  }

  async function onToggleTaskDone(task) {
    setGlobalErr("");
    try {
      const newStatus = task.status === "erledigt" ? "offen" : "erledigt";
      const updated = await updateTask(task.id, { status: newStatus });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (e) {
      setGlobalErr(String(e?.message || e));
    }
  }

  async function onDeleteTask(taskId) {
    setGlobalErr("");
    if (!confirm("Aufgabe wirklich löschen?")) return;
    try {
      await deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      if (selectedTaskId === taskId) setSelectedTaskId(null);
    } catch (e) {
      setGlobalErr(String(e?.message || e));
    }
  }

  /* ---------------- Subtask Actions ---------------- */
  async function onCreateSubtask() {
    setSubtaskErr("");
    if (!selectedTaskId) return;
    if (!subtaskTitle.trim()) return;
    try {
      const created = await createSubtask({ taskId: selectedTaskId, title: subtaskTitle.trim() });
      setSubtasks((prev) => [...prev, created]);
      setSubtaskTitle("");
    } catch (e) {
      setSubtaskErr(String(e?.message || e));
    }
  }

  async function onToggleSubtaskDone(st) {
    setSubtaskErr("");
    try {
      const updated = await updateSubtask(st.id, { done: !st.done });
      setSubtasks((prev) => prev.map((x) => (x.id === st.id ? updated : x)));
    } catch (e) {
      setSubtaskErr(String(e?.message || e));
    }
  }

  async function onDeleteSubtask(stId) {
    setSubtaskErr("");
    if (!confirm("Unteraufgabe wirklich löschen?")) return;
    try {
      await deleteSubtask(stId);
      setSubtasks((prev) => prev.filter((x) => x.id !== stId));
    } catch (e) {
      setSubtaskErr(String(e?.message || e));
    }
  }

  /* ---------------- Guide Viewer ---------------- */
  async function openGuide(guide) {
    setGlobalErr("");
    try {
      setViewerTitle(guide?.title || "Anleitung");
      if (guide?.file_path) {
        const url = await getGuideFileUrl(guide);
        setViewerUrl(url);
        setViewerText("");
      } else {
        setViewerUrl(null);
        setViewerText(guide?.description || "");
      }
      setViewerOpen(true);
    } catch (e) {
      setGlobalErr(String(e?.message || e));
    }
  }

  function closeViewer() {
    setViewerOpen(false);
    setViewerTitle("");
    setViewerUrl(null);
    setViewerText("");
  }

  /* ---------------- Calendar ---------------- */
  const tasksByDay = useMemo(() => {
    const map = {};
    for (const t of tasks || []) {
      if (!t.due_date) continue;
      const key = String(t.due_date).slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [tasks]);

  const monthGrid = useMemo(() => {
    const cursor = calCursor;
    const startM = startOfMonth(cursor);
    const endM = endOfMonth(cursor);

    // Start grid Monday
    const startDay = new Date(startM);
    const dow = (startDay.getDay() + 6) % 7; // Monday=0
    const gridStart = addDays(startDay, -dow);

    // 6 weeks grid
    const days = [];
    for (let i = 0; i < 42; i++) days.push(addDays(gridStart, i));
    return { startM, endM, days };
  }, [calCursor]);

  function goPrevMonth() {
    setCalCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function goNextMonth() {
    setCalCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  /* ---------------- Render Guards ---------------- */
  if (!supabase) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.card}>
            <div>Supabase ist nicht konfiguriert.</div>
            <div style={{ ...styles.subtle, marginTop: 8 }}>
              Lege in Vercel/Next ENV an:
              <div style={{ marginTop: 6 }}>
                NEXT_PUBLIC_SUPABASE_URL
                <br />
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.topbar}>
            <div>
              <div style={{ fontSize: 18 }}>Dashboard</div>
              <div style={styles.subtle}>Login erforderlich</div>
            </div>
            <div style={styles.row}>
              <button style={styles.btn(authView === "login" ? "primary" : "default")} onClick={() => setAuthView("login")}>
                Login
              </button>
              <button style={styles.btn(authView === "signup" ? "primary" : "default")} onClick={() => setAuthView("signup")}>
                Registrieren
              </button>
            </div>
          </div>

          <div style={styles.card}>
            <div style={{ display: "grid", gap: 10, maxWidth: 460 }}>
              <input style={styles.input} placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input style={styles.input} placeholder="Passwort" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />

              {authView === "login" ? (
                <button style={styles.btn("primary")} onClick={doLogin}>
                  Login
                </button>
              ) : (
                <button style={styles.btn("primary")} onClick={doSignup}>
                  Registrieren
                </button>
              )}

              {authMsg ? <div style={{ color: "#b00020", fontSize: 13 }}>{authMsg}</div> : null}
              {globalErr ? <div style={{ color: "#b00020", fontSize: 13 }}>{globalErr}</div> : null}

              <div style={styles.subtle}>
                Hinweis: Wenn RLS aktiv ist, brauchst du Policies für tasks / guides / storage.objects (Bucket: guides).
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- Main UI ---------------- */
  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.topbar}>
          <div>
            <div style={{ fontSize: 18 }}>Dashboard</div>
            <div style={styles.subtle}>{user.email}</div>
          </div>

          <div style={styles.tabs}>
            <button style={styles.tab(activeTab === "tasks")} onClick={() => setActiveTab("tasks")}>
              Aufgaben
            </button>
            <button style={styles.tab(activeTab === "calendar")} onClick={() => setActiveTab("calendar")}>
              Kalender
            </button>
            <button style={styles.tab(activeTab === "guides")} onClick={() => setActiveTab("guides")}>
              Anleitungen
            </button>
            <button style={styles.tab(activeTab === "settings")} onClick={() => setActiveTab("settings")}>
              Einstellungen
            </button>
          </div>

          <div style={styles.row}>
            <button style={styles.btn("default")} onClick={refreshAll}>
              Aktualisieren
            </button>
            <button style={styles.btn("default")} onClick={doLogout}>
              Logout
            </button>
          </div>
        </div>

        {globalErr ? (
          <div style={{ ...styles.card, borderColor: "#f0c0c0", background: "#fff7f7" }}>
            <div style={{ color: "#b00020", fontSize: 13 }}>{globalErr}</div>
          </div>
        ) : null}

        {/* ---------------- TAB: TASKS ---------------- */}
        {activeTab === "tasks" && (
          <div style={styles.grid2}>
            {/* Left: Task list + create */}
            <div style={{ display: "grid", gap: 12 }}>
              <div style={styles.card}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 16 }}>Neue Aufgabe</div>
                  <input style={styles.input} value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Titel" />
                  <textarea style={styles.textarea} rows={3} value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} placeholder="Beschreibung (optional)" />
                  <div style={styles.row}>
                    <input style={{ ...styles.input, maxWidth: 220 }} type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
                    <button style={styles.btn("primary")} onClick={onCreateTask}>
                      Speichern
                    </button>
                  </div>
                  <div style={styles.subtle}>Status: offen / erledigt (keine "In Arbeit"-Option)</div>
                </div>
              </div>

              <div style={styles.card}>
                <div style={styles.row}>
                  <div style={{ fontSize: 16, flex: 1 }}>Aufgaben</div>
                  <div style={styles.subtle}>{tasks.length} gesamt</div>
                </div>
                <div style={styles.divider} />

                <div style={styles.list}>
                  {tasks.map((t) => {
                    const guide = t.guide_id ? guidesById[t.guide_id] : null;
                    return (
                      <div key={t.id} style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, background: selectedTaskId === t.id ? "#fafafa" : "#fff" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              <div
                                onClick={() => setSelectedTaskId(t.id)}
                                style={{ fontSize: 16, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 520 }}
                                title="Details öffnen"
                              >
                                {t.title}
                              </div>
                              <div style={styles.pill(t.status === "erledigt" ? "done" : "open")}>{t.status}</div>
                              {t.due_date ? <div style={styles.pill()}>{String(t.due_date).slice(0, 10)}</div> : null}
                            </div>

                            {t.description ? <div style={{ marginTop: 6, opacity: 0.8, whiteSpace: "pre-wrap" }}>{t.description}</div> : null}

                            {guide ? (
                              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                <div style={{ fontSize: 13, opacity: 0.75 }}>Anleitung: {guide.title}</div>
                                <button style={styles.btn("default")} onClick={() => openGuide(guide)}>
                                  Öffnen
                                </button>
                              </div>
                            ) : null}
                          </div>

                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <button style={styles.btn("default")} onClick={() => onToggleTaskDone(t)}>
                              {t.status === "erledigt" ? "Wieder öffnen" : "Erledigt"}
                            </button>
                            <button style={styles.btn("default")} onClick={() => onDeleteTask(t.id)}>
                              Löschen
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {tasks.length === 0 ? <div style={styles.subtle}>Noch keine Aufgaben.</div> : null}
                </div>
              </div>
            </div>

            {/* Right: Task details */}
            <div style={styles.card}>
              <div style={{ fontSize: 16 }}>Details</div>
              <div style={styles.divider} />

              {!selectedTask ? (
                <div style={styles.subtle}>Wähle links eine Aufgabe aus.</div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={styles.subtle}>Titel</div>
                    <input
                      style={styles.input}
                      value={selectedTask.title || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? { ...t, title: v } : t)));
                      }}
                      onBlur={async () => {
                        try {
                          const updated = await updateTask(selectedTask.id, { title: selectedTask.title });
                          setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? updated : t)));
                        } catch (e) {
                          setGlobalErr(String(e?.message || e));
                        }
                      }}
                    />
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={styles.subtle}>Beschreibung</div>
                    <textarea
                      style={styles.textarea}
                      rows={4}
                      value={selectedTask.description || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? { ...t, description: v } : t)));
                      }}
                      onBlur={async () => {
                        try {
                          const updated = await updateTask(selectedTask.id, { description: selectedTask.description || null });
                          setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? updated : t)));
                        } catch (e) {
                          setGlobalErr(String(e?.message || e));
                        }
                      }}
                    />
                  </div>

                  <div style={styles.row}>
                    <div style={{ display: "grid", gap: 6, flex: 1, minWidth: 220 }}>
                      <div style={styles.subtle}>Fällig am</div>
                      <input
                        style={styles.input}
                        type="date"
                        value={selectedTask.due_date ? String(selectedTask.due_date).slice(0, 10) : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? { ...t, due_date: v || null } : t)));
                        }}
                        onBlur={async () => {
                          try {
                            const t = tasks.find((x) => x.id === selectedTask.id);
                            const updated = await updateTask(selectedTask.id, { due_date: t?.due_date || null });
                            setTasks((prev) => prev.map((x) => (x.id === selectedTask.id ? updated : x)));
                          } catch (e) {
                            setGlobalErr(String(e?.message || e));
                          }
                        }}
                      />
                    </div>

                    <div style={{ display: "grid", gap: 6, minWidth: 220 }}>
                      <div style={styles.subtle}>Status</div>
                      <select
                        style={styles.select}
                        value={selectedTask.status || "offen"}
                        onChange={async (e) => {
                          const v = e.target.value;
                          try {
                            const updated = await updateTask(selectedTask.id, { status: v });
                            setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? updated : t)));
                          } catch (err) {
                            setGlobalErr(String(err?.message || err));
                          }
                        }}
                      >
                        <option value="offen">offen</option>
                        <option value="erledigt">erledigt</option>
                      </select>
                    </div>
                  </div>

                  {/* Guide linking */}
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={styles.subtle}>Anleitung verknüpfen</div>
                    <div style={styles.row}>
                      <select
                        style={{ ...styles.select, flex: 1, minWidth: 260 }}
                        value={selectedTask.guide_id || ""}
                        onChange={async (e) => {
                          const newGuideId = e.target.value || null;
                          try {
                            await setTaskGuide(selectedTask.id, newGuideId);
                            setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? { ...t, guide_id: newGuideId } : t)));
                          } catch (err) {
                            setGlobalErr(String(err?.message || err));
                          }
                        }}
                      >
                        <option value="">Keine Anleitung</option>
                        {guides.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.title}
                          </option>
                        ))}
                      </select>

                      <button
                        style={styles.btn("default")}
                        onClick={async () => {
                          const g = selectedTask.guide_id ? guidesById[selectedTask.guide_id] : null;
                          if (!g) return alert("Keine Anleitung verknüpft.");
                          await openGuide(g);
                        }}
                      >
                        Öffnen
                      </button>
                    </div>
                  </div>

                  {/* Subtasks */}
                  <div style={styles.divider} />
                  <div style={{ fontSize: 15 }}>Unteraufgaben</div>

                  {subtaskErr ? <div style={{ color: "#b00020", fontSize: 13 }}>{subtaskErr}</div> : null}

                  <div style={styles.row}>
                    <input style={{ ...styles.input, flex: 1, minWidth: 220 }} value={subtaskTitle} onChange={(e) => setSubtaskTitle(e.target.value)} placeholder="Neue Unteraufgabe" />
                    <button style={styles.btn("primary")} onClick={onCreateSubtask}>
                      Hinzufügen
                    </button>
                  </div>

                  <div style={styles.list}>
                    {subtasks.map((st) => {
                      const g = st.guide_id ? guidesById[st.guide_id] : null;
                      return (
                        <div key={st.id} style={{ padding: 10, border: "1px solid #eee", borderRadius: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                <input type="checkbox" checked={!!st.done} onChange={() => onToggleSubtaskDone(st)} />
                                <div style={{ textDecoration: st.done ? "line-through" : "none" }}>{st.title}</div>
                              </div>

                              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                <select
                                  style={{ ...styles.select, minWidth: 240 }}
                                  value={st.guide_id || ""}
                                  onChange={async (e) => {
                                    const newGuideId = e.target.value || null;
                                    try {
                                      await setSubtaskGuide(st.id, newGuideId);
                                      setSubtasks((prev) => prev.map((x) => (x.id === st.id ? { ...x, guide_id: newGuideId } : x)));
                                    } catch (err) {
                                      setSubtaskErr(String(err?.message || err));
                                    }
                                  }}
                                >
                                  <option value="">Keine Anleitung</option>
                                  {guides.map((gg) => (
                                    <option key={gg.id} value={gg.id}>
                                      {gg.title}
                                    </option>
                                  ))}
                                </select>

                                <button
                                  style={styles.btn("default")}
                                  onClick={async () => {
                                    const gg = st.guide_id ? guidesById[st.guide_id] : null;
                                    if (!gg) return alert("Keine Anleitung verknüpft.");
                                    await openGuide(gg);
                                  }}
                                >
                                  Öffnen
                                </button>
                              </div>

                              {g ? <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>Anleitung: {g.title}</div> : null}
                            </div>

                            <button style={styles.btn("default")} onClick={() => onDeleteSubtask(st.id)}>
                              Löschen
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {subtasks.length === 0 ? <div style={styles.subtle}>Keine Unteraufgaben.</div> : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------------- TAB: CALENDAR ---------------- */}
        {activeTab === "calendar" && (
          <div style={styles.card}>
            <div style={styles.row}>
              <div style={{ fontSize: 16, flex: 1 }}>Kalender</div>
              <select style={styles.select} value={calendarMode} onChange={(e) => setCalendarMode(e.target.value)}>
                <option value="month">Monat</option>
                <option value="day">Tag</option>
              </select>
            </div>

            <div style={styles.divider} />

            {calendarMode === "month" ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <button style={styles.btn("default")} onClick={goPrevMonth}>
                    ←
                  </button>
                  <div style={{ fontSize: 15 }}>
                    {monthGrid.startM.toLocaleString("de-DE", { month: "long", year: "numeric" })}
                  </div>
                  <button style={styles.btn("default")} onClick={goNextMonth}>
                    →
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                  {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((h) => (
                    <div key={h} style={{ fontSize: 12, opacity: 0.7, paddingLeft: 6 }}>
                      {h}
                    </div>
                  ))}

                  {monthGrid.days.map((d) => {
                    const inMonth = d.getMonth() === calCursor.getMonth();
                    const key = toYMD(d);
                    const dayTasks = tasksByDay[key] || [];
                    const isSelected = selectedDay === key;

                    return (
                      <div
                        key={key}
                        onClick={() => {
                          setSelectedDay(key);
                          setCalendarMode("day");
                        }}
                        style={{
                          border: "1px solid #eee",
                          borderRadius: 12,
                          padding: 10,
                          minHeight: 84,
                          background: isSelected ? "#f3f3f3" : "#fff",
                          cursor: "pointer",
                          opacity: inMonth ? 1 : 0.45,
                          display: "grid",
                          gap: 6,
                        }}
                        title="Klicken = Tagesansicht"
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontSize: 13 }}>{d.getDate()}</div>
                          {sameYMD(d, new Date()) ? <div style={styles.pill()}>Heute</div> : null}
                        </div>

                        {dayTasks.slice(0, 2).map((t) => (
                          <div key={t.id} style={{ fontSize: 12, padding: "4px 6px", borderRadius: 10, border: "1px solid #eee", background: "#fafafa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {t.title}
                          </div>
                        ))}
                        {dayTasks.length > 2 ? <div style={{ fontSize: 12, opacity: 0.7 }}>+{dayTasks.length - 2} mehr</div> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={styles.row}>
                  <input style={{ ...styles.input, maxWidth: 220 }} type="date" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} />
                  <button
                    style={styles.btn("default")}
                    onClick={() => {
                      setCalendarMode("month");
                      setCalCursor(ymdToDate(selectedDay));
                    }}
                  >
                    Monat öffnen
                  </button>
                </div>

                <div style={{ fontSize: 15 }}>
                  {ymdToDate(selectedDay).toLocaleDateString("de-DE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                </div>

                <div style={styles.list}>
                  {(tasksByDay[selectedDay] || []).map((t) => {
                    const guide = t.guide_id ? guidesById[t.guide_id] : null;
                    return (
                      <div key={t.id} style={{ padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              <div style={{ fontSize: 15 }}>{t.title}</div>
                              <div style={styles.pill(t.status === "erledigt" ? "done" : "open")}>{t.status}</div>
                            </div>
                            {t.description ? <div style={{ marginTop: 6, opacity: 0.8, whiteSpace: "pre-wrap" }}>{t.description}</div> : null}
                            {guide ? (
                              <div style={{ marginTop: 8 }}>
                                <button style={styles.btn("default")} onClick={() => openGuide(guide)}>
                                  Anleitung öffnen
                                </button>
                              </div>
                            ) : null}
                          </div>

                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <button
                              style={styles.btn("default")}
                              onClick={() => {
                                setActiveTab("tasks");
                                setSelectedTaskId(t.id);
                              }}
                            >
                              Details
                            </button>
                            <button style={styles.btn("default")} onClick={() => onToggleTaskDone(t)}>
                              {t.status === "erledigt" ? "Wieder öffnen" : "Erledigt"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {(tasksByDay[selectedDay] || []).length === 0 ? <div style={styles.subtle}>Keine Aufgaben an diesem Tag.</div> : null}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---------------- TAB: GUIDES ---------------- */}
        {activeTab === "guides" && (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={styles.card}>
              <div style={{ fontSize: 16 }}>Neue Anleitung</div>
              <div style={styles.divider} />
              <div style={{ display: "grid", gap: 10, maxWidth: 700 }}>
                <input style={styles.input} value={guideTitle} onChange={(e) => setGuideTitle(e.target.value)} placeholder="Titel" />
                <textarea style={styles.textarea} rows={4} value={guideDesc} onChange={(e) => setGuideDesc(e.target.value)} placeholder="Beschreibung / Inhalt (optional)" />
                <div style={styles.row}>
                  <select style={styles.select} value={guideVis} onChange={(e) => setGuideVis(e.target.value)}>
                    <option value="all">Sichtbar für alle</option>
                    <option value="restricted">Eingeschränkt (später Rechte)</option>
                  </select>
                  <input type="file" onChange={(e) => setGuideFile(e.target.files?.[0] || null)} />
                </div>

                <div style={styles.row}>
                  <button
                    style={styles.btn("primary")}
                    onClick={async () => {
                      if (!guideTitle.trim()) return;
                      setGlobalErr("");
                      try {
                        const created = await createGuide({
                          title: guideTitle.trim(),
                          description: guideDesc.trim(),
                          visibility: guideVis,
                          file: guideFile,
                        });
                        setGuides((prev) => [created, ...prev]);
                        setGuideTitle("");
                        setGuideDesc("");
                        setGuideVis("all");
                        setGuideFile(null);
                      } catch (e) {
                        setGlobalErr(String(e?.message || e));
                      }
                    }}
                  >
                    Speichern
                  </button>

                  <div style={styles.subtle}>Upload: Bucket "guides" + Policies erforderlich (Storage).</div>
                </div>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.row}>
                <div style={{ fontSize: 16, flex: 1 }}>Anleitungen</div>
                <div style={styles.subtle}>{guides.length} gesamt</div>
              </div>
              <div style={styles.divider} />

              <div style={styles.list}>
                {guides.map((g) => (
                  <div key={g.id} style={{ padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 700 }}>{g.title}</div>
                        {g.description ? <div style={{ marginTop: 6, opacity: 0.8, whiteSpace: "pre-wrap" }}>{g.description}</div> : null}
                        {g.file_name ? <div style={{ marginTop: 6, opacity: 0.7, fontSize: 13 }}>Datei: {g.file_name}</div> : null}
                        <div style={{ marginTop: 6, opacity: 0.7, fontSize: 13 }}>Sichtbarkeit: {g.visibility}</div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button style={styles.btn("default")} onClick={() => openGuide(g)}>
                          Öffnen
                        </button>
                        <button
                          style={styles.btn("default")}
                          onClick={async () => {
                            if (!confirm("Anleitung wirklich löschen?")) return;
                            setGlobalErr("");
                            try {
                              await deleteGuide(g);
                              setGuides((prev) => prev.filter((x) => x.id !== g.id));
                              // optional: Tasks/Subtasks behalten dann guide_id NULL per FK on delete set null
                              await refreshAll();
                            } catch (e) {
                              setGlobalErr(String(e?.message || e));
                            }
                          }}
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {guides.length === 0 ? <div style={styles.subtle}>Noch keine Anleitungen.</div> : null}
              </div>
            </div>
          </div>
        )}

        {/* ---------------- TAB: SETTINGS ---------------- */}
        {activeTab === "settings" && (
          <div style={styles.card}>
            <div style={{ fontSize: 16 }}>Einstellungen</div>
            <div style={styles.divider} />
            <div style={{ display: "grid", gap: 10, maxWidth: 900 }}>
              <div style={styles.subtle}>
                Hier können wir als nächstes deine Nutzer-/Rechteverwaltung, Design pro User, Benachrichtigungen (Mail/Browser) und Chef-Cockpit sauber ergänzen.
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 14 }}>Status-Logik</div>
                <div style={styles.subtle}>Aktuell: offen / erledigt. Keine "In Arbeit"-Option.</div>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 14 }}>Anleitungen</div>
                <div style={styles.subtle}>
                  Bucket: guides (privat empfohlen). Tabellen: guides, tasks.guide_id, optional subtasks.guide_id.
                </div>
              </div>

              <button style={styles.btn("default")} onClick={refreshAll}>
                Alles neu laden
              </button>
            </div>
          </div>
        )}

        {/* Viewer Modal */}
        {viewerOpen && (
          <div style={styles.modalBackdrop} onClick={closeViewer}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <div style={{ fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{viewerTitle}</div>
                <button style={styles.btn("default")} onClick={closeViewer}>
                  Schließen
                </button>
              </div>

              <div style={{ padding: 0 }}>
                {viewerUrl ? (
                  <iframe title="Anleitung" src={viewerUrl} style={{ width: "100%", height: "100%", border: 0 }} />
                ) : (
                  <div style={{ padding: 14, whiteSpace: "pre-wrap" }}>{viewerText || "Kein Inhalt vorhanden."}</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
