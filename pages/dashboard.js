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

/* ---------------- Small utils ---------------- */
const pad2 = (n) => String(n).padStart(2, "0");

function safeDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function ymd(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
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

/* ---------------- Styles (ähnlich Screenshot) ---------------- */
const S = {
  page: {
    minHeight: "100vh",
    background: "#f3f6fa",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"',
    color: "#0f172a",
    padding: 18,
  },
  topbar: {
    maxWidth: 1300,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  brand: { fontSize: 22, fontWeight: 700, marginRight: 8 },
  tabs: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  pillBtn: (active) => ({
    border: "1px solid #e5e7eb",
    background: active ? "#0b7a2b" : "#fff",
    color: active ? "#fff" : "#0f172a",
    borderRadius: 999,
    padding: "8px 14px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  }),
  ghostBtn: {
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: "#0f172a",
    borderRadius: 999,
    padding: "8px 14px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
  right: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 },
  email: { fontSize: 13, opacity: 0.75 },
  logout: {
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: "#0f172a",
    borderRadius: 999,
    padding: "8px 14px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
  },

  container: { maxWidth: 1300, margin: "0 auto", marginTop: 14 },
  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    padding: 14,
    boxShadow: "0 1px 0 rgba(15,23,42,0.04)",
  },

  formRow: {
    display: "grid",
    gridTemplateColumns: "1.2fr 0.9fr 0.9fr 0.9fr 0.9fr auto",
    gap: 12,
    alignItems: "center",
  },
  input: {
    width: "100%",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
    background: "#fff",
  },
  select: {
    width: "100%",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
    background: "#fff",
    cursor: "pointer",
  },
  primary: {
    border: "0",
    background: "#0b7a2b",
    color: "#fff",
    borderRadius: 14,
    padding: "10px 16px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  board: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
    marginTop: 14,
  },
  column: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    padding: 14,
  },
  colHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  colTitle: { fontSize: 16, fontWeight: 800 },
  badgeCount: {
    fontSize: 12,
    opacity: 0.7,
  },

  taskCard: {
    border: "1px solid #eef2f7",
    background: "#fff",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  taskTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  taskTitleRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  taskTitle: { fontSize: 16, fontWeight: 800 },
  tag: (tone) => ({
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid #e5e7eb",
    background: tone === "todo" ? "#ffe9d6" : "#dcfce7",
    color: "#0f172a",
  }),
  meta: { fontSize: 12, opacity: 0.7, marginTop: 6 },
  statusBtn: {
    border: "1px solid #e5e7eb",
    background: "#fff",
    borderRadius: 14,
    padding: "10px 14px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },

  subtasksWrap: { marginTop: 10 },
  subtasksHead: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800 },
  progressBg: {
    height: 8,
    background: "#e5e7eb",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 6,
    marginBottom: 10,
  },
  progressBar: (pct) => ({
    height: "100%",
    width: `${pct}%`,
    background: "#0b7a2b",
  }),
  subtaskRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 8 },
  subtaskInputRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 10 },
  plusBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    border: "0",
    background: "#0b7a2b",
    color: "#fff",
    cursor: "pointer",
    fontSize: 18,
    fontWeight: 900,
  },

  listLayout: { display: "grid", gap: 12, marginTop: 14 },

  calHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  calBtn: {
    border: "1px solid #e5e7eb",
    background: "#fff",
    borderRadius: 14,
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },
  calGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 },
  calCell: (muted) => ({
    border: "1px solid #eef2f7",
    borderRadius: 16,
    padding: 10,
    minHeight: 86,
    background: "#fff",
    opacity: muted ? 0.5 : 1,
    cursor: "pointer",
  }),
  calDow: { fontSize: 12, opacity: 0.7, paddingLeft: 8 },

  err: {
    maxWidth: 1300,
    margin: "14px auto 0",
    background: "#fff5f5",
    border: "1px solid #fecaca",
    borderRadius: 18,
    padding: 12,
    color: "#991b1b",
    fontSize: 13,
  },

  modalBg: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.45)",
    display: "grid",
    placeItems: "center",
    padding: 18,
    zIndex: 9999,
  },
  modal: {
    width: "min(1100px, 96vw)",
    height: "min(780px, 92vh)",
    background: "#fff",
    borderRadius: 18,
    border: "1px solid #e5e7eb",
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto 1fr",
  },
  modalHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: 12, borderBottom: "1px solid #eef2f7" },
  modalTitle: { fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  modalClose: {
    border: "1px solid #e5e7eb",
    background: "#fff",
    borderRadius: 14,
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },
};

/* ---------------- Supabase data functions ---------------- */
async function mustSupabase() {
  if (!supabase) throw new Error("Supabase ENV fehlt: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

async function getUser() {
  await mustSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user || null;
}

async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
async function signUp(email, password) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}
async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

async function fetchAreas() {
  try {
    const { data, error } = await supabase.from("areas").select("id,name").order("name");
    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}

async function fetchGuides() {
  const { data, error } = await supabase.from("guides").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function fetchTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select("id,title,area_id,due_at,status,guide_id,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function fetchSubtasksForTask(taskId) {
  try {
    const { data, error } = await supabase
      .from("subtasks")
      .select("id,task_id,title,done,guide_id,created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}

async function insertTask({ title, area_id, due_at, status, guide_id }) {
  const payload = {
    title,
    area_id: area_id || null,
    due_at: due_at || null,
    status: status || "todo",
    guide_id: guide_id || null,
  };
  const { data, error } = await supabase.from("tasks").insert([payload]).select("*").single();
  if (error) throw error;
  return data;
}

async function updateTask(id, patch) {
  const { data, error } = await supabase.from("tasks").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

async function insertSubtask({ task_id, title }) {
  const { data, error } = await supabase.from("subtasks").insert([{ task_id, title, done: false }]).select("*").single();
  if (error) throw error;
  return data;
}

async function updateSubtask(id, patch) {
  const { data, error } = await supabase.from("subtasks").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

/* ---------------- Guides: Storage ---------------- */
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

async function createGuide({ title, description, visibility, file }) {
  const { data: inserted, error: insErr } = await supabase
    .from("guides")
    .insert([{ title, description: description || null, visibility: visibility || "all" }])
    .select("id")
    .single();
  if (insErr) throw insErr;

  const fileMeta = await uploadGuideFile(file, inserted.id);

  const { data: updated, error: upErr } = await supabase
    .from("guides")
    .update(fileMeta)
    .eq("id", inserted.id)
    .select("*")
    .single();
  if (upErr) throw upErr;

  return updated;
}

async function deleteGuide(guide) {
  if (guide?.file_path) {
    await supabase.storage.from("guides").remove([guide.file_path]);
  }
  const { error } = await supabase.from("guides").delete().eq("id", guide.id);
  if (error) throw error;
}

async function signedGuideUrl(guide) {
  if (!guide?.file_path) return null;
  const { data, error } = await supabase.storage.from("guides").createSignedUrl(guide.file_path, 60 * 30);
  if (error) throw error;
  return data?.signedUrl || null;
}

/* ---------------- Component ---------------- */
export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [authMsg, setAuthMsg] = useState("");

  const [tab, setTab] = useState("board"); // board | list | calendar | guides
  const [err, setErr] = useState("");

  const [areas, setAreas] = useState([]);
  const [guides, setGuides] = useState([]);
  const guidesById = useMemo(() => Object.fromEntries((guides || []).map((g) => [g.id, g])), [guides]);

  const [tasks, setTasks] = useState([]);
  const [subtasksByTask, setSubtasksByTask] = useState({}); // { [taskId]: subtasks[] }
  const [subInputByTask, setSubInputByTask] = useState({}); // { [taskId]: string }

  // Create form (wie Screenshot: Titel, Bereich, Datum/Uhrzeit, Status, Anleitung)
  const [newTitle, setNewTitle] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [newDueAt, setNewDueAt] = useState("");
  const [newStatus, setNewStatus] = useState("todo");
  const [newGuideId, setNewGuideId] = useState("");

  // Kalender
  const [calCursor, setCalCursor] = useState(() => new Date());

  // Guides tab create
  const [gTitle, setGTitle] = useState("");
  const [gDesc, setGDesc] = useState("");
  const [gVis, setGVis] = useState("all");
  const [gFile, setGFile] = useState(null);

  // Viewer modal (Guide öffnen)
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerTitle, setViewerTitle] = useState("");
  const [viewerUrl, setViewerUrl] = useState(null);
  const [viewerText, setViewerText] = useState("");

  useEffect(() => {
    (async () => {
      try {
        await mustSupabase();
        // robust: prefer session as source of truth
        const { data } = await supabase.auth.getSession();
        const u = data?.session?.user || (await getUser());
        setUser(u);
      } catch (e) {
        setErr(String(e?.message || e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // robust: use session user directly
      setUser(session?.user || null);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  async function reloadAll() {
    setErr("");
    try {
      const [a, g, t] = await Promise.all([fetchAreas(), fetchGuides(), fetchTasks()]);
      setAreas(a);
      setGuides(g);
      setTasks(t);

      const map = {};
      for (const task of t) {
        const subs = await fetchSubtasksForTask(task.id);
        map[task.id] = subs;
      }
      setSubtasksByTask(map);
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  useEffect(() => {
    if (!user) return;
    reloadAll();
  }, [user]);

  /* -------- Task helpers -------- */
  const areaNameById = useMemo(() => {
    const map = {};
    (areas || []).forEach((a) => (map[a.id] = a.name));
    return map;
  }, [areas]);

  function taskMetaLine(task) {
    const parts = [];
    const a = task.area_id ? areaNameById[task.area_id] : null;
    if (a) parts.push(`Bereich: ${a}`);
    const d = safeDate(task.due_at);
    if (d) parts.push(`Fällig: ${d.toLocaleString("de-DE")}`);
    return parts.join(" • ") || "Bereich: —";
  }

  function subStats(taskId) {
    const subs = subtasksByTask[taskId] || [];
    if (subs.length === 0) return { done: 0, total: 0, pct: 0 };
    const done = subs.filter((s) => !!s.done).length;
    const total = subs.length;
    const pct = Math.round((done / total) * 100);
    return { done, total, pct };
  }

  async function toggleTaskStatus(task) {
    setErr("");
    try {
      const next = task.status === "done" ? "todo" : "done";
      const updated = await updateTask(task.id, { status: next });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  async function createNewTask() {
    if (!newTitle.trim()) return;
    setErr("");
    try {
      const due = newDueAt ? new Date(newDueAt).toISOString() : null;
      const created = await insertTask({
        title: newTitle.trim(),
        area_id: newAreaId || null,
        due_at: due,
        status: newStatus,
        guide_id: newGuideId || null,
      });
      setTasks((prev) => [created, ...prev]);
      setSubtasksByTask((prev) => ({ ...prev, [created.id]: [] }));
      setNewTitle("");
      setNewAreaId("");
      setNewDueAt("");
      setNewStatus("todo");
      setNewGuideId("");
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  async function addSubtask(taskId) {
    const v = (subInputByTask[taskId] || "").trim();
    if (!v) return;
    setErr("");
    try {
      const created = await insertSubtask({ task_id: taskId, title: v });
      setSubtasksByTask((prev) => ({
        ...prev,
        [taskId]: [...(prev[taskId] || []), created],
      }));
      setSubInputByTask((prev) => ({ ...prev, [taskId]: "" }));
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  async function toggleSubtask(taskId, sub) {
    setErr("");
    try {
      const updated = await updateSubtask(sub.id, { done: !sub.done });
      setSubtasksByTask((prev) => ({
        ...prev,
        [taskId]: (prev[taskId] || []).map((s) => (s.id === sub.id ? updated : s)),
      }));
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  async function setTaskGuide(taskId, guideId) {
    setErr("");
    try {
      const updated = await updateTask(taskId, { guide_id: guideId || null });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  async function setSubtaskGuide(taskId, subId, guideId) {
    setErr("");
    try {
      const updated = await updateSubtask(subId, { guide_id: guideId || null });
      setSubtasksByTask((prev) => ({
        ...prev,
        [taskId]: (prev[taskId] || []).map((s) => (s.id === subId ? updated : s)),
      }));
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  /* -------- Guide viewer -------- */
  async function openGuide(guide) {
    setErr("");
    try {
      setViewerTitle(guide?.title || "Anleitung");
      if (guide?.file_path) {
        const url = await signedGuideUrl(guide);
        setViewerUrl(url);
        setViewerText("");
      } else {
        setViewerUrl(null);
        setViewerText(guide?.description || "");
      }
      setViewerOpen(true);
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }
  function closeViewer() {
    setViewerOpen(false);
    setViewerTitle("");
    setViewerUrl(null);
    setViewerText("");
  }

  /* -------- Calendar -------- */
  const tasksByDay = useMemo(() => {
    const map = {};
    for (const t of tasks || []) {
      const d = safeDate(t.due_at);
      if (!d) continue;
      const key = ymd(d);
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [tasks]);

  const monthGrid = useMemo(() => {
    const cursor = calCursor;
    const startM = startOfMonth(cursor);
    const endM = endOfMonth(cursor);

    const startDay = new Date(startM);
    const dow = (startDay.getDay() + 6) % 7;
    const gridStart = addDays(startDay, -dow);

    const days = [];
    for (let i = 0; i < 42; i++) days.push(addDays(gridStart, i));
    return { startM, endM, days };
  }, [calCursor]);

  /* -------- Auth UI -------- */
  if (!supabase) {
    return (
      <div style={S.page}>
        <div style={S.err}>
          Supabase ist nicht konfiguriert (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={S.page}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <div style={{ ...S.card, marginTop: 30 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Dashboard Login</div>
            <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
              <button
                style={S.pillBtn(authMode === "login")}
                onClick={() => {
                  setAuthMode("login");
                  setAuthMsg("");
                }}
              >
                Login
              </button>
              <button
                style={S.pillBtn(authMode === "signup")}
                onClick={() => {
                  setAuthMode("signup");
                  setAuthMsg("");
                }}
              >
                Registrieren
              </button>
            </div>

            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
              <input style={S.input} placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input style={S.input} placeholder="Passwort" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />

              {authMode === "login" ? (
                <button
                  style={S.primary}
                  onClick={async () => {
                    setErr("");
                    setAuthMsg("");
                    try {
                      await signIn(email, pw);
                      // immediate UI update (avoid relying only on auth event)
                      const { data } = await supabase.auth.getSession();
                      if (data?.session?.user) setUser(data.session.user);
                    } catch (e) {
                      setAuthMsg(String(e?.message || e));
                    }
                  }}
                >
                  Login
                </button>
              ) : (
                <button
                  style={S.primary}
                  onClick={async () => {
                    setErr("");
                    setAuthMsg("");
                    try {
                      await signUp(email, pw);
                      setAuthMsg("Registrierung erfolgreich. Falls E-Mail-Bestätigung aktiv ist: bitte Mail prüfen.");
                    } catch (e) {
                      setAuthMsg(String(e?.message || e));
                    }
                  }}
                >
                  Registrieren
                </button>
              )}

              {authMsg ? <div style={{ fontSize: 13, color: "#991b1b" }}>{authMsg}</div> : null}
              {err ? <div style={{ fontSize: 13, color: "#991b1b" }}>{err}</div> : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const todoTasks = tasks.filter((t) => (t.status || "todo") === "todo");
  const doneTasks = tasks.filter((t) => (t.status || "todo") === "done");

  return (
    <div style={S.page}>
      <div style={S.topbar}>
        <div style={S.brand}>Dashboard</div>

        <div style={S.tabs}>
          <button style={S.pillBtn(tab === "board")} onClick={() => setTab("board")}>
            Board
          </button>
          <button style={S.pillBtn(tab === "list")} onClick={() => setTab("list")}>
            Liste
          </button>
          <button style={S.pillBtn(tab === "calendar")} onClick={() => setTab("calendar")}>
            Kalender
          </button>
          <button style={S.pillBtn(tab === "guides")} onClick={() => setTab("guides")}>
            Anleitungen
          </button>
          <button style={S.ghostBtn} onClick={reloadAll}>
            Neu laden
          </button>
        </div>

        <div style={S.right}>
          <div style={S.email}>{user.email}</div>
          <button
            style={S.logout}
            onClick={async () => {
              setErr("");
              try {
                await signOut();
                setUser(null);
              } catch (e) {
                setErr(String(e?.message || e));
              }
            }}
          >
            Abmelden
          </button>
        </div>
      </div>

      {err ? <div style={S.err}>{err}</div> : null}

      <div style={S.container}>
        <div style={S.card}>
          <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Aufgabe anlegen</div>
          <div style={S.formRow}>
            <input style={S.input} placeholder="Titel" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />

            <select style={S.select} value={newAreaId} onChange={(e) => setNewAreaId(e.target.value)}>
              <option value="">Bereich</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            <input style={S.input} type="datetime-local" value={newDueAt} onChange={(e) => setNewDueAt(e.target.value)} />

            <select style={S.select} value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              <option value="todo">Zu erledigen</option>
              <option value="done">Erledigt</option>
            </select>

            <select style={S.select} value={newGuideId} onChange={(e) => setNewGuideId(e.target.value)}>
              <option value="">Anleitung</option>
              {guides.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>

            <button style={S.primary} onClick={createNewTask}>
              Anlegen
            </button>
          </div>
        </div>

        {tab === "board" && (
          <div style={S.board}>
            <div style={S.column}>
              <div style={S.colHeader}>
                <div style={S.colTitle}>Zu erledigen</div>
                <div style={S.badgeCount}>{todoTasks.length}</div>
              </div>

              {todoTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  areasById={areaNameById}
                  guidesById={guidesById}
                  guides={guides}
                  subtasks={subtasksByTask[task.id] || []}
                  stats={subStats(task.id)}
                  subInput={subInputByTask[task.id] || ""}
                  onSubInput={(v) => setSubInputByTask((p) => ({ ...p, [task.id]: v }))}
                  onAddSub={() => addSubtask(task.id)}
                  onToggleSub={(sub) => toggleSubtask(task.id, sub)}
                  onToggleTask={() => toggleTaskStatus(task)}
                  onSetTaskGuide={(gid) => setTaskGuide(task.id, gid)}
                  onSetSubGuide={(subId, gid) => setSubtaskGuide(task.id, subId, gid)}
                  onOpenGuide={(g) => openGuide(g)}
                />
              ))}

              {todoTasks.length === 0 ? <div style={{ opacity: 0.65, fontSize: 13 }}>Keine offenen Aufgaben.</div> : null}
            </div>

            <div style={S.column}>
              <div style={S.colHeader}>
                <div style={S.colTitle}>Erledigt</div>
                <div style={S.badgeCount}>{doneTasks.length}</div>
              </div>

              {doneTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  areasById={areaNameById}
                  guidesById={guidesById}
                  guides={guides}
                  subtasks={subtasksByTask[task.id] || []}
                  stats={subStats(task.id)}
                  subInput={subInputByTask[task.id] || ""}
                  onSubInput={(v) => setSubInputByTask((p) => ({ ...p, [task.id]: v }))}
                  onAddSub={() => addSubtask(task.id)}
                  onToggleSub={(sub) => toggleSubtask(task.id, sub)}
                  onToggleTask={() => toggleTaskStatus(task)}
                  onSetTaskGuide={(gid) => setTaskGuide(task.id, gid)}
                  onSetSubGuide={(subId, gid) => setSubtaskGuide(task.id, subId, gid)}
                  onOpenGuide={(g) => openGuide(g)}
                />
              ))}

              {doneTasks.length === 0 ? <div style={{ opacity: 0.65, fontSize: 13 }}>Noch nichts erledigt.</div> : null}
            </div>
          </div>
        )}

        {tab === "calendar" && (
          <div style={{ ...S.card, marginTop: 14 }}>
            <div style={S.calHeader}>
              <button style={S.calBtn} onClick={() => setCalCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
                ←
              </button>
              <div style={{ fontSize: 16, fontWeight: 900 }}>
                {monthGrid.startM.toLocaleString("de-DE", { month: "long", year: "numeric" })}
              </div>
              <button style={S.calBtn} onClick={() => setCalCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
                →
              </button>
            </div>

            <div style={S.calGrid}>
              {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((h) => (
                <div key={h} style={S.calDow}>
                  {h}
                </div>
              ))}

              {monthGrid.days.map((d) => {
                const inMonth = d.getMonth() === calCursor.getMonth();
                const key = ymd(d);
                const dayTasks = tasksByDay[key] || [];
                return (
                  <div key={key} style={S.calCell(!inMonth)} title={key}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 900 }}>{d.getDate()}</div>
                      {key === ymd(new Date()) ? <div style={S.tag("done")}>Heute</div> : null}
                    </div>

                    <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                      {dayTasks.slice(0, 2).map((t) => (
                        <div
                          key={t.id}
                          style={{
                            fontSize: 12,
                            border: "1px solid #eef2f7",
                            background: "#f8fafc",
                            borderRadius: 12,
                            padding: "6px 8px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t.title}
                        </div>
                      ))}
                      {dayTasks.length > 2 ? <div style={{ fontSize: 12, opacity: 0.65 }}>+{dayTasks.length - 2} mehr</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "guides" && (
          <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
            <div style={S.card}>
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Anleitung erstellen</div>

              <div style={{ display: "grid", gap: 10, maxWidth: 850 }}>
                <input style={S.input} placeholder="Titel" value={gTitle} onChange={(e) => setGTitle(e.target.value)} />
                <textarea
                  style={{ ...S.input, minHeight: 110, borderRadius: 18 }}
                  placeholder="Beschreibung / Inhalt (optional)"
                  value={gDesc}
                  onChange={(e) => setGDesc(e.target.value)}
                />

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <select style={{ ...S.select, maxWidth: 260 }} value={gVis} onChange={(e) => setGVis(e.target.value)}>
                    <option value="all">Sichtbar für alle</option>
                    <option value="restricted">Eingeschränkt (später Rechte)</option>
                  </select>

                  <input type="file" onChange={(e) => setGFile(e.target.files?.[0] || null)} />
                  <button
                    style={S.primary}
                    onClick={async () => {
                      if (!gTitle.trim()) return;
                      setErr("");
                      try {
                        const created = await createGuide({
                          title: gTitle.trim(),
                          description: gDesc.trim(),
                          visibility: gVis,
                          file: gFile,
                        });
                        setGuides((prev) => [created, ...prev]);
                        setGTitle("");
                        setGDesc("");
                        setGVis("all");
                        setGFile(null);
                      } catch (e) {
                        setErr(String(e?.message || e));
                      }
                    }}
                  >
                    Speichern
                  </button>
                </div>

                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Hinweis: Bucket "guides" + Storage Policies notwendig, sonst schlagen Upload/Öffnen fehl.
                </div>
              </div>
            </div>

            <div style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 900 }}>Anleitungen</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{guides.length}</div>
              </div>

              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {guides.map((g) => (
                  <div
                    key={g.id}
                    style={{
                      border: "1px solid #eef2f7",
                      borderRadius: 18,
                      padding: 14,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 820 }}>
                        {g.title}
                      </div>
                      {g.description ? (
                        <div style={{ fontSize: 13, opacity: 0.8, marginTop: 6, whiteSpace: "pre-wrap" }}>{g.description}</div>
                      ) : null}
                      {g.file_name ? (
                        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Datei: {g.file_name}</div>
                      ) : null}
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Sichtbarkeit: {g.visibility}</div>
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button style={S.ghostBtn} onClick={() => openGuide(g)}>
                        Öffnen
                      </button>
                      <button
                        style={S.ghostBtn}
                        onClick={async () => {
                          if (!confirm("Anleitung wirklich löschen?")) return;
                          setErr("");
                          try {
                            await deleteGuide(g);
                            setGuides((prev) => prev.filter((x) => x.id !== g.id));
                            await reloadAll();
                          } catch (e) {
                            setErr(String(e?.message || e));
                          }
                        }}
                      >
                        Löschen
                      </button>
                    </div>
                  </div>
                ))}

                {guides.length === 0 ? <div style={{ fontSize: 13, opacity: 0.7 }}>Noch keine Anleitungen vorhanden.</div> : null}
              </div>
            </div>
          </div>
        )}
      </div>

      {viewerOpen && (
        <div style={S.modalBg} onClick={closeViewer}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <div style={S.modalTitle}>{viewerTitle}</div>
              <button style={S.modalClose} onClick={closeViewer}>
                Schließen
              </button>
            </div>
            <div style={{ padding: 0 }}>
              {viewerUrl ? (
                <iframe title="Anleitung" src={viewerUrl} style={{ width: "100%", height: "100%", border: 0 }} />
              ) : (
                <div style={{ padding: 14, whiteSpace: "pre-wrap", fontSize: 14 }}>
                  {viewerText || "Kein Inhalt vorhanden."}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Task Card ---------------- */
function TaskCard({
  task,
  areasById,
  guidesById,
  guides,
  subtasks,
  stats,
  subInput,
  onSubInput,
  onAddSub,
  onToggleSub,
  onToggleTask,
  onSetTaskGuide,
  onSetSubGuide,
  onOpenGuide,
}) {
  const statusTone = task.status === "done" ? "done" : "todo";
  const areaName = task.area_id ? areasById[task.area_id] : null;
  const due = safeDate(task.due_at);
  const guide = task.guide_id ? guidesById[task.guide_id] : null;

  return (
    <div style={S.taskCard}>
      <div style={S.taskTop}>
        <div style={{ minWidth: 0 }}>
          <div style={S.taskTitleRow}>
            <div style={S.taskTitle}>{task.title}</div>
            <div style={S.tag(statusTone)}>{statusTone}</div>
          </div>

          <div style={S.meta}>
            {areaName ? `Bereich: ${areaName}` : "Bereich: —"}
            {due ? ` • Fällig: ${due.toLocaleString("de-DE")}` : ""}
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select
              style={{ ...S.select, minWidth: 240 }}
              value={task.guide_id || ""}
              onChange={(e) => onSetTaskGuide(e.target.value || null)}
            >
              <option value="">Anleitung</option>
              {guides.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>

            <button
              style={S.ghostBtn}
              onClick={() => {
                if (!guide) return;
                onOpenGuide(guide);
              }}
            >
              Öffnen
            </button>
          </div>

          <div style={S.subtasksWrap}>
            <div style={S.subtasksHead}>
              Unteraufgaben <span style={{ fontWeight: 700, opacity: 0.7 }}>{stats.done}/{stats.total}</span>
            </div>

            <div style={S.progressBg}>
              <div style={S.progressBar(stats.pct)} />
            </div>

            <div style={S.subtaskInputRow}>
              <input
                style={S.input}
                placeholder="Unteraufgabe hinzufügen..."
                value={subInput}
                onChange={(e) => onSubInput(e.target.value)}
              />
              <button style={S.plusBtn} onClick={onAddSub}>
                +
              </button>
            </div>

            {subtasks.map((s) => {
              const sg = s.guide_id ? guidesById[s.guide_id] : null;
              return (
                <div key={s.id} style={S.subtaskRow}>
                  <input type="checkbox" checked={!!s.done} onChange={() => onToggleSub(s)} />
                  <div style={{ textDecoration: s.done ? "line-through" : "none" }}>{s.title}</div>

                  <select
                    style={{ ...S.select, minWidth: 220, marginLeft: "auto" }}
                    value={s.guide_id || ""}
                    onChange={(e) => onSetSubGuide(s.id, e.target.value || null)}
                  >
                    <option value="">Anleitung</option>
                    {guides.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>

                  <button
                    style={S.ghostBtn}
                    onClick={() => {
                      if (!sg) return;
                      onOpenGuide(sg);
                    }}
                  >
                    Öffnen
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <button style={S.statusBtn} onClick={onToggleTask}>
          Status
        </button>
      </div>
    </div>
  );
}
