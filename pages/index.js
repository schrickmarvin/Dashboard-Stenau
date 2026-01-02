// Dashboard.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ---------------- Supabase ---------------- */
const SUPABASE_URL = import.meta?.env?.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta?.env?.VITE_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------------- Helpers ---------------- */
const STATUS = ["Zu erledigen", "In Arbeit", "Erledigt"];

const DEFAULT_SETTINGS = {
  theme_mode: "light", // light | dark | system
  background: "soft", // default | soft | clean
  accent: "#16a34a", // green default wie auf deinem Screenshot
  notifications_enabled: true,
  notifications_desktop: true,
  notifications_email: false,
};

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday=0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

function endOfWeek(date = new Date()) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 7);
  return d;
}

/* ---------------- Theme apply ---------------- */
function applyThemeToDom(settings) {
  const root = document.documentElement;

  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  const mode = settings.theme_mode === "system" ? (prefersDark ? "dark" : "light") : settings.theme_mode;

  root.dataset.theme = mode;
  root.dataset.bg = settings.background;
  root.style.setProperty("--accent", settings.accent);
}

/* ---------------- Minimal UI primitives ---------------- */
function Card({ title, right, children, style }) {
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.06)",
        background: "rgba(255,255,255,0.92)",
        borderRadius: 18,
        padding: 14,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        ...style,
      }}
    >
      {(title || right) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 16 }}>{title}</div>
          <div>{right}</div>
        </div>
      )}
      {children}
    </div>
  );
}

function Button({ children, onClick, variant = "primary", disabled, style, title }) {
  const isGhost = variant === "ghost";
  const isDanger = variant === "danger";
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        borderRadius: 12,
        border: "1px solid rgba(0,0,0,0.10)",
        padding: "8px 12px",
        background: isGhost ? "transparent" : isDanger ? "rgba(239,68,68,0.10)" : "var(--accent)",
        color: isGhost ? "inherit" : isDanger ? "rgb(185,28,28)" : "white",
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Input({ value, onChange, placeholder, style, type = "text" }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        borderRadius: 12,
        border: "1px solid rgba(0,0,0,0.10)",
        padding: "10px 12px",
        outline: "none",
        ...style,
      }}
    />
  );
}

function Select({ value, onChange, options, style }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        borderRadius: 12,
        border: "1px solid rgba(0,0,0,0.10)",
        padding: "10px 12px",
        outline: "none",
        background: "white",
        ...style,
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ---------------- Main Component ---------------- */
export default function Dashboard() {
  const [session, setSession] = useState(null);
  const user = session?.user || null;

  const [activeTab, setActiveTab] = useState("Board"); // Board | Liste | Kalender | Timeline | Anleitungen | Bereiche | Einstellungen
  const [loading, setLoading] = useState(false);
  const [uiError, setUiError] = useState("");

  // Filters
  const [filterArea, setFilterArea] = useState("ALL");
  const [filterBucket, setFilterBucket] = useState("ALL");
  const [search, setSearch] = useState("");

  // Settings (Design) - lokal gespeichert (später supabase möglich)
  const [settings, setSettings] = useState(() => safeJsonParse(localStorage.getItem("stenau_settings_v1"), DEFAULT_SETTINGS));

  // Data
  const [areas, setAreas] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [instructions, setInstructions] = useState([]);

  // Calendar
  const [calendarRows, setCalendarRows] = useState([]);

  // Create Task form
  const [newTitle, setNewTitle] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [newDueAt, setNewDueAt] = useState(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16); // for datetime-local
  });
  const [newBucket, setNewBucket] = useState("Heute");
  const [newStatus, setNewStatus] = useState("Zu erledigen");

  // Create Subtask
  const [subTaskParentId, setSubTaskParentId] = useState("");
  const [subTaskTitle, setSubTaskTitle] = useState("");

  // Create Instruction
  const [instTitle, setInstTitle] = useState("");
  const [instAreaId, setInstAreaId] = useState("");
  const [instBody, setInstBody] = useState("");
  const fileInputRef = useRef(null);

  // Area management
  const [areaNewName, setAreaNewName] = useState("");
  const [areaEditId, setAreaEditId] = useState("");
  const [areaEditName, setAreaEditName] = useState("");
  const [areaEditColor, setAreaEditColor] = useState("#94a3b8"); // future

  /* ----------- Apply theme ----------- */
  useEffect(() => {
    applyThemeToDom(settings);
    localStorage.setItem("stenau_settings_v1", JSON.stringify(settings));
  }, [settings]);

  /* ----------- Auth ----------- */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  /* ----------- Load initial data when logged in ----------- */
  useEffect(() => {
    if (!user?.id) return;
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function reloadAll() {
    setUiError("");
    setLoading(true);
    try {
      await Promise.all([loadAreas(), loadTasksAndSubtasks(), loadInstructions()]);
      await loadCalendar(); // uses tasks_calendar
    } catch (e) {
      setUiError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function loadAreas() {
    const { data, error } = await supabase.from("areas").select("id, name, color").order("name", { ascending: true });
    if (error) throw error;
    setAreas(data || []);
    // set default selection
    if (!newAreaId && data?.length) setNewAreaId(data[0].id);
    if (!instAreaId && data?.length) setInstAreaId(data[0].id);
  }

  async function loadTasksAndSubtasks() {
    const { data: t, error: te } = await supabase
      .from("tasks")
      .select("id, title, status, area_id, due_at, due_bucket, instructions, created_at")
      .order("created_at", { ascending: false });
    if (te) throw te;

    const { data: st, error: se } = await supabase.from("subtasks").select("id, task_id, title, done, created_at").order("created_at", { ascending: true });
    if (se) throw se;

    setTasks(t || []);
    setSubtasks(st || []);

    if (!subTaskParentId && (t || []).length) setSubTaskParentId(t[0].id);
  }

  async function loadInstructions() {
    const { data, error } = await supabase
      .from("instructions")
      .select("id, title, area_id, body, file_url, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    setInstructions(data || []);
  }

  // Kalender: fix für task_id-Fehler -> wir nutzen id
  async function loadCalendar() {
    const { data, error } = await supabase
      .from("tasks_calendar")
      .select("id, title, status, area_id, due_at, due_bucket, is_series, series_id, series_parent_id, cal_id")
      .not("due_at", "is", null)
      .order("due_at", { ascending: true });

    if (error) throw error;
    setCalendarRows(data || []);
  }

  /* ----------- Derived data ----------- */
  const areasById = useMemo(() => {
    const m = new Map();
    for (const a of areas) m.set(a.id, a);
    return m;
  }, [areas]);

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (filterArea !== "ALL" && t.area_id !== filterArea) return false;
      if (filterBucket !== "ALL" && (t.due_bucket || "—") !== filterBucket) return false;
      if (q && !String(t.title || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, filterArea, filterBucket, search]);

  const subtasksByTask = useMemo(() => {
    const map = new Map();
    for (const st of subtasks) {
      if (!map.has(st.task_id)) map.set(st.task_id, []);
      map.get(st.task_id).push(st);
    }
    return map;
  }, [subtasks]);

  const openCount = useMemo(() => tasks.filter((t) => t.status !== "Erledigt").length, [tasks]);

  const todayCount = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return tasks.filter((t) => t.due_at && new Date(t.due_at) >= start && new Date(t.due_at) < end && t.status !== "Erledigt").length;
  }, [tasks]);

  const weekCount = useMemo(() => {
    const s = startOfWeek(new Date());
    const e = endOfWeek(new Date());
    return tasks.filter((t) => t.due_at && new Date(t.due_at) >= s && new Date(t.due_at) < e && t.status !== "Erledigt").length;
  }, [tasks]);

  const buckets = useMemo(() => {
    const set = new Set();
    for (const t of tasks) if (t.due_bucket) set.add(t.due_bucket);
    return ["ALL", ...Array.from(set).sort((a, b) => String(a).localeCompare(String(b), "de"))];
  }, [tasks]);

  /* ----------- Mutations ----------- */
  async function createTask() {
    setUiError("");
    if (!newTitle.trim()) return;

    const payload = {
      title: newTitle.trim(),
      area_id: newAreaId || null,
      status: newStatus,
      due_bucket: newBucket,
      due_at: newDueAt ? new Date(newDueAt).toISOString() : null,
    };

    const { error } = await supabase.from("tasks").insert(payload);
    if (error) {
      setUiError(error.message);
      return;
    }

    setNewTitle("");
    await loadTasksAndSubtasks();
    await loadCalendar();
  }

  async function updateTaskStatus(taskId, status) {
    setUiError("");
    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
    if (error) {
      setUiError(error.message);
      return;
    }
    await loadTasksAndSubtasks();
    await loadCalendar();
  }

  async function deleteTask(taskId) {
    setUiError("");
    if (!confirm("Aufgabe wirklich löschen?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) {
      setUiError(error.message);
      return;
    }
    await loadTasksAndSubtasks();
    await loadCalendar();
  }

  async function createSubtask() {
    setUiError("");
    if (!subTaskParentId) return;
    if (!subTaskTitle.trim()) return;

    const { error } = await supabase.from("subtasks").insert({ task_id: subTaskParentId, title: subTaskTitle.trim(), done: false });
    if (error) {
      setUiError(error.message);
      return;
    }
    setSubTaskTitle("");
    await loadTasksAndSubtasks();
  }

  async function toggleSubtask(subId, done) {
    setUiError("");
    const { error } = await supabase.from("subtasks").update({ done }).eq("id", subId);
    if (error) {
      setUiError(error.message);
      return;
    }
    await loadTasksAndSubtasks();
  }

  async function createInstruction() {
    setUiError("");
    if (!instTitle.trim()) return;

    // optional file upload (wenn du Storage schon nutzt)
    let file_url = null;
    const file = fileInputRef.current?.files?.[0] || null;

    if (file) {
      try {
        const path = `instructions/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage.from("files").upload(path, file, { upsert: true });
        if (!upErr) {
          const { data: pub } = supabase.storage.from("files").getPublicUrl(path);
          file_url = pub?.publicUrl || null;
        }
      } catch (e) {
        // Storage ist optional; wenn nicht vorhanden, ignorieren
      }
    }

    const { error } = await supabase.from("instructions").insert({
      title: instTitle.trim(),
      area_id: instAreaId || null,
      body: instBody || null,
      file_url,
    });

    if (error) {
      setUiError(error.message);
      return;
    }

    setInstTitle("");
    setInstBody("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    await loadInstructions();
  }

  /* ----------- Areas CRUD ----------- */
  async function createArea() {
    setUiError("");
    const name = areaNewName.trim();
    if (!name) return;

    // color column optional, we pass it anyway
    const { error } = await supabase.from("areas").insert({ name, color: "#94a3b8" });
    if (error) {
      setUiError(error.message);
      return;
    }

    setAreaNewName("");
    await loadAreas();
  }

  function startEditArea(a) {
    setAreaEditId(a.id);
    setAreaEditName(a.name || "");
    setAreaEditColor(a.color || "#94a3b8");
  }

  async function saveArea() {
    setUiError("");
    if (!areaEditId) return;

    const name = areaEditName.trim();
    if (!name) return;

    // color column "für später" -> wird direkt mitgespeichert, wenn die Spalte existiert
    const { error } = await supabase.from("areas").update({ name, color: areaEditColor }).eq("id", areaEditId);
    if (error) {
      setUiError(error.message);
      return;
    }

    setAreaEditId("");
    setAreaEditName("");
    await loadAreas();
  }

  async function deleteArea(areaId) {
    setUiError("");
    if (!confirm("Bereich wirklich löschen? Aufgaben bleiben dann ohne Bereich, falls keine DB-Constraint existiert.")) return;

    const { error } = await supabase.from("areas").delete().eq("id", areaId);
    if (error) {
      setUiError(error.message);
      return;
    }
    await loadAreas();
    await loadTasksAndSubtasks();
  }

  /* ----------- Layout styles ----------- */
  const pageBg =
    settings.background === "soft" ? "linear-gradient(180deg, rgba(248,250,252,1) 0%, rgba(241,245,249,1) 100%)" : settings.background === "clean" ? "#ffffff" : "#f8fafc";

  const themeColors =
    document?.documentElement?.dataset?.theme === "dark"
      ? { text: "#e5e7eb", card: "rgba(17,24,39,0.75)", border: "rgba(255,255,255,0.10)", muted: "rgba(229,231,235,0.65)" }
      : { text: "#0f172a", card: "rgba(255,255,255,0.92)", border: "rgba(0,0,0,0.08)", muted: "rgba(15,23,42,0.55)" };

  /* ----------- Auth UI (simple) ----------- */
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return (
      <div style={{ padding: 20 }}>
        Supabase ENV fehlt (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onLoggedIn={setSession} settings={settings} setSettings={setSettings} />;
  }

  /* ----------- Top-level render ----------- */
  return (
    <div
      style={{
        minHeight: "100vh",
        background: pageBg,
        color: themeColors.text,
      }}
    >
      <GlobalStyle />

      <div style={{ padding: 18, borderBottom: `1px solid ${themeColors.border}`, background: "rgba(255,255,255,0.65)", backdropFilter: "blur(8px)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, maxWidth: 1320, margin: "0 auto" }}>
          <div>
            <div style={{ fontSize: 22 }}>Armaturenbrett</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>Angemeldet als: {user.email}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Aktuell: {formatDateTime(new Date().toISOString())}</div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="ghost" onClick={reloadAll} disabled={loading}>
              Neu laden
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await supabase.auth.signOut();
              }}
            >
              Abmelden
            </Button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1320, margin: "0 auto", padding: 18, display: "grid", gridTemplateColumns: "260px 1fr", gap: 16 }}>
        {/* Left sidebar */}
        <div style={{ display: "grid", gap: 12 }}>
          <Card
            title="Übersicht"
            style={{ background: themeColors.card, border: `1px solid ${themeColors.border}` }}
          >
            <div style={{ display: "grid", gap: 10 }}>
              <MiniStat label="Aufgaben heute" value={String(todayCount)} />
              <MiniStat label="Diese Woche" value={String(weekCount)} />
              <MiniStat label="Offen" value={String(openCount)} />
            </div>
          </Card>

          <Card title="Navigation" style={{ background: themeColors.card, border: `1px solid ${themeColors.border}` }}>
            <div style={{ display: "grid", gap: 10 }}>
              {["Board", "Liste", "Kalender", "Timeline", "Anleitungen", "Bereiche", "Einstellungen"].map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  style={{
                    textAlign: "left",
                    borderRadius: 12,
                    border: `1px solid ${themeColors.border}`,
                    background: activeTab === t ? "rgba(59,130,246,0.08)" : "transparent",
                    padding: "10px 12px",
                    cursor: "pointer",
                    color: themeColors.text,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </Card>

          <Card title="Filter" style={{ background: themeColors.card, border: `1px solid ${themeColors.border}` }}>
            <div style={{ display: "grid", gap: 10 }}>
              <Select
                value={filterArea}
                onChange={setFilterArea}
                options={[
                  { value: "ALL", label: "Alle Bereiche" },
                  ...areas.map((a) => ({ value: a.id, label: a.name })),
                ]}
              />
              <Select value={filterBucket} onChange={setFilterBucket} options={buckets.map((b) => ({ value: b, label: b === "ALL" ? "Alle Zeiträume" : b }))} />
              <Input value={search} onChange={setSearch} placeholder="Suche..." />
            </div>
          </Card>
        </div>

        {/* Main content */}
        <div style={{ display: "grid", gap: 12 }}>
          {/* Top tab pills */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {["Board", "Liste", "Kalender", "Timeline", "Anleitungen", "Bereiche", "Einstellungen"].map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                style={{
                  borderRadius: 999,
                  border: `1px solid ${themeColors.border}`,
                  padding: "8px 12px",
                  background: activeTab === t ? "white" : "rgba(255,255,255,0.65)",
                  cursor: "pointer",
                  color: themeColors.text,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {uiError && (
            <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.06)", color: "rgb(185,28,28)" }}>
              {uiError}
            </div>
          )}

          {/* Create task */}
          <Card
            title="Aufgabe anlegen"
            style={{ background: themeColors.card, border: `1px solid ${themeColors.border}` }}
            right={<div style={{ fontSize: 12, opacity: 0.7 }}>Hinweis: Kalender nutzt due_at, due_bucket bleibt für schnelle Filter.</div>}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.7fr 0.55fr 0.55fr 0.6fr auto", gap: 10, alignItems: "center" }}>
              <Input value={newTitle} onChange={setNewTitle} placeholder="Titel" />
              <Select value={newAreaId} onChange={setNewAreaId} options={areas.map((a) => ({ value: a.id, label: a.name }))} />
              <input
                type="datetime-local"
                value={newDueAt}
                onChange={(e) => setNewDueAt(e.target.value)}
                style={{
                  width: "100%",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.10)",
                  padding: "10px 12px",
                  outline: "none",
                }}
              />
              <Select
                value={newBucket}
                onChange={setNewBucket}
                options={[
                  { value: "Heute", label: "Heute" },
                  { value: "Diese Woche", label: "Diese Woche" },
                  { value: "Monat", label: "Monat" },
                  { value: "Jahr", label: "Jahr" },
                ]}
              />
              <Select value={newStatus} onChange={setNewStatus} options={STATUS.map((s) => ({ value: s, label: s }))} />
              <Button onClick={createTask} disabled={!newTitle.trim()}>
                Anlegen
              </Button>
            </div>
          </Card>

          {/* Tab content */}
          {activeTab === "Board" && <BoardView tasks={filteredTasks} areasById={areasById} subtasksByTask={subtasksByTask} onStatus={updateTaskStatus} onDelete={deleteTask} themeColors={themeColors} />}

          {activeTab === "Liste" && <ListView tasks={filteredTasks} areasById={areasById} onStatus={updateTaskStatus} onDelete={deleteTask} themeColors={themeColors} />}

          {activeTab === "Kalender" && <CalendarView rows={calendarRows} areasById={areasById} themeColors={themeColors} />}

          {activeTab === "Timeline" && <TimelineView tasks={filteredTasks} areasById={areasById} themeColors={themeColors} />}

          {activeTab === "Anleitungen" && (
            <InstructionsView
              themeColors={themeColors}
              areas={areas}
              instructions={instructions}
              instTitle={instTitle}
              setInstTitle={setInstTitle}
              instAreaId={instAreaId}
              setInstAreaId={setInstAreaId}
              instBody={instBody}
              setInstBody={setInstBody}
              fileInputRef={fileInputRef}
              onCreate={createInstruction}
            />
          )}

          {activeTab === "Bereiche" && (
            <AreasView
              themeColors={themeColors}
              areas={areas}
              areaNewName={areaNewName}
              setAreaNewName={setAreaNewName}
              onCreateArea={createArea}
              onStartEdit={startEditArea}
              areaEditId={areaEditId}
              areaEditName={areaEditName}
              setAreaEditName={setAreaEditName}
              areaEditColor={areaEditColor}
              setAreaEditColor={setAreaEditColor}
              onSaveArea={saveArea}
              onCancelEdit={() => setAreaEditId("")}
              onDeleteArea={deleteArea}
            />
          )}

          {activeTab === "Einstellungen" && <SettingsView settings={settings} setSettings={setSettings} themeColors={themeColors} />}
          
          {/* Subtask create section */}
          <Card title="Unteraufgabe anlegen" style={{ background: themeColors.card, border: `1px solid ${themeColors.border}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "260px 1fr auto", gap: 10 }}>
              <Select
                value={subTaskParentId}
                onChange={setSubTaskParentId}
                options={(tasks || []).map((t) => ({ value: t.id, label: t.title }))}
              />
              <Input value={subTaskTitle} onChange={setSubTaskTitle} placeholder="Unteraufgabe..." />
              <Button onClick={createSubtask} disabled={!subTaskParentId || !subTaskTitle.trim()}>
                Anlegen
              </Button>
            </div>

            {subTaskParentId && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {(subtasksByTask.get(subTaskParentId) || []).map((st) => (
                  <label key={st.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: `1px solid ${themeColors.border}`, borderRadius: 12 }}>
                    <input type="checkbox" checked={!!st.done} onChange={(e) => toggleSubtask(st.id, e.target.checked)} />
                    <span style={{ textDecoration: st.done ? "line-through" : "none", opacity: st.done ? 0.7 : 1 }}>{st.title}</span>
                  </label>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Views ---------------- */
function BoardView({ tasks, areasById, subtasksByTask, onStatus, onDelete, themeColors }) {
  const cols = useMemo(
    () => ({
      "Zu erledigen": [],
      "In Arbeit": [],
      Erledigt: [],
    }),
    []
  );

  for (const t of tasks) {
    const s = STATUS.includes(t.status) ? t.status : "Zu erledigen";
    cols[s].push(t);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
      {STATUS.map((st) => (
        <Card
          key={st}
          title={st}
          style={{ background: themeColors.card, border: `1px solid ${themeColors.border}`, minHeight: 260 }}
          right={<div style={{ fontSize: 12, opacity: 0.7 }}>{cols[st].length}</div>}
        >
          <div style={{ display: "grid", gap: 10 }}>
            {cols[st].length === 0 ? (
              <div style={{ opacity: 0.6 }}>Keine Aufgaben</div>
            ) : (
              cols[st].map((t) => <TaskCard key={t.id} task={t} area={areasById.get(t.area_id)} subtasks={subtasksByTask.get(t.id) || []} onStatus={onStatus} onDelete={onDelete} themeColors={themeColors} />)
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function TaskCard({ task, area, subtasks, onStatus, onDelete, themeColors }) {
  const done = subtasks.filter((s) => s.done).length;
  const total = subtasks.length;
  const percent = total ? Math.round((done / total) * 100) : 0;

  return (
    <div style={{ border: `1px solid ${themeColors.border}`, borderRadius: 14, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 14 }}>{task.title}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={task.status || "Zu erledigen"}
            onChange={(e) => onStatus(task.id, e.target.value)}
            style={{ borderRadius: 12, border: `1px solid ${themeColors.border}`, padding: "6px 10px", background: "white" }}
          >
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={() => onDelete(task.id)}
            style={{ width: 30, height: 30, borderRadius: 10, border: `1px solid ${themeColors.border}`, background: "transparent", cursor: "pointer" }}
            title="Löschen"
          >
            ×
          </button>
        </div>
      </div>

      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
        {area?.name || "—"} · {task.due_bucket || "—"} · {task.due_at ? formatDateTime(task.due_at) : "—"}
      </div>

      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>Unteraufgaben: {done}/{total}{total ? ` (${percent}%)` : ""}</div>

      {total > 0 && (
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          {subtasks.slice(0, 6).map((s) => (
            <div key={s.id} style={{ padding: "6px 10px", borderRadius: 12, border: `1px solid ${themeColors.border}`, opacity: s.done ? 0.7 : 1 }}>
              <span style={{ textDecoration: s.done ? "line-through" : "none" }}>{s.title}</span>
            </div>
          ))}
          {subtasks.length > 6 && <div style={{ fontSize: 12, opacity: 0.65 }}>+{subtasks.length - 6} weitere…</div>}
        </div>
      )}

      {task.instructions && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Anleitungen</div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 4 }}>{task.instructions}</div>
        </div>
      )}
    </div>
  );
}

function ListView({ tasks, areasById, onStatus, onDelete, themeColors }) {
  return (
    <Card title="Liste" style={{ background: themeColors.card, border: `1px solid ${themeColors.border}` }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {["Aufgabe", "Bereich", "Datum/Uhrzeit", "Zeitraum", "Status", ""].map((h) => (
                <th key={h} style={{ textAlign: "left", fontSize: 12, opacity: 0.7, padding: "10px 10px", borderBottom: `1px solid ${themeColors.border}` }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td style={{ padding: "12px 10px", borderBottom: `1px solid ${themeColors.border}` }}>{t.title}</td>
                <td style={{ padding: "12px 10px", borderBottom: `1px solid ${themeColors.border}` }}>{areasById.get(t.area_id)?.name || "—"}</td>
                <td style={{ padding: "12px 10px", borderBottom: `1px solid ${themeColors.border}` }}>{t.due_at ? formatDateTime(t.due_at) : "—"}</td>
                <td style={{ padding: "12px 10px", borderBottom: `1px solid ${themeColors.border}` }}>{t.due_bucket || "—"}</td>
                <td style={{ padding: "12px 10px", borderBottom: `1px solid ${themeColors.border}` }}>
                  <select
                    value={t.status || "Zu erledigen"}
                    onChange={(e) => onStatus(t.id, e.target.value)}
                    style={{ borderRadius: 12, border: `1px solid ${themeColors.border}`, padding: "6px 10px", background: "white" }}
                  >
                    {STATUS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: "12px 10px", borderBottom: `1px solid ${themeColors.border}`, textAlign: "right" }}>
                  <button
                    onClick={() => onDelete(t.id)}
                    style={{ width: 30, height: 30, borderRadius: 10, border: `1px solid ${themeColors.border}`, background: "transparent", cursor: "pointer" }}
                    title="Löschen"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 14, opacity: 0.7 }}>
                  Keine Aufgaben.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CalendarView({ rows, areasById, themeColors }) {
  const grouped = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const d = new Date(r.due_at);
      const key = d.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(r);
    }
    return Array.from(m.entries());
  }, [rows]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card
        title="Kalender (tasks_calendar)"
        style={{ background: themeColors.card, border: `1px solid ${themeColors.border}` }}
        right={<div style={{ fontSize: 12, opacity: 0.7 }}>Gruppiert nach Datum (aus due_at). Serien-Einträge sind read-only.</div>}
      />

      {rows.length === 0 ? (
        <Card style={{ background: themeColors.card, border: `1px solid ${themeColors.border}` }}>
          <div style={{ opacity: 0.7 }}>Keine Aufgaben mit Datum/Uhrzeit (due_at).</div>
        </Card>
      ) : (
        grouped.map(([day, items]) => (
          <Card key={day} title={day} style={{ background: themeColors.card, border: `1px solid ${themeColors.border}` }}>
            <div style={{ display: "grid", gap: 10 }}>
              {items.map((it) => (
                <div key={it.id} style={{ border: `1px solid ${themeColors.border}`, borderRadius: 14, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>{it.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>{formatDateTime(it.due_at)}</div>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                    {areasById.get(it.area_id)?.name || "—"} · {it.status || "—"} · {it.due_bucket || "—"}
                    {it.is_series ? " · Serie" : ""}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function TimelineView({ tasks, areasById, themeColors }) {
  const weekStart = startOfWeek(new Date());
  const weekEnd = endOfWeek(new Date());

  const weekTasks = tasks
    .filter((t) => t.due_bucket === "Diese Woche" || (t.due_at && new Date(t.due_at) >= weekStart && new Date(t.due_at) < weekEnd))
    .slice(0, 30);

  return (
    <Card title="Timeline (minimal)" style={{ background: themeColors.card, border: `1px solid ${themeColors.border}` }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontSize: 14 }}>Diese Woche</div>
        <div style={{ display: "grid", gap: 10 }}>
          {weekTasks.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Keine Einträge.</div>
          ) : (
            weekTasks.map((t) => (
              <div key={t.id} style={{ border: `1px solid ${themeColors.border}`, borderRadius: 14, padding: 12 }}>
                <div style={{ fontSize: 14 }}>{t.title}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  {areasById.get(t.area_id)?.name || "—"} · {t.status || "—"} · {t.due_at ? formatDateTime(t.due_at) : "—"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}

function InstructionsView({
  themeColors,
  areas,
  instructions,
  instTitle,
  setInstTitle,
  instAreaId,
  setInstAreaId,
  instBody,
  setInstBody,
  fileInputRef,
  onCreate,
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card title="Anleitung anlegen" style={{ background: themeColors.card, border: `1px solid ${themeColors.border}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px 1fr auto", gap: 10, alignItems: "center" }}>
          <Input value={instTitle} onChange={setInstTitle} placeholder="Titel" />
          <Select value={instAreaId} onChange={setInstAreaId} options={areas.map((a) => ({ value: a.id, label: a.name }))} />
          <input ref={fileInputRef} type="file" style={{ width: "100%" }} />
          <Button onClick={onCreate} disabled={!instTitle.trim()}>
            Speichern
          </Button>
        </div>
        <textarea
          value={instBody}
          onChange={(e) => setInstBody(e.target.value)}
          placeholder="Kurzbeschreibung / Inhalt (optional)..."
          style={{ marginTop: 10, width: "100%", minHeight: 120, borderRadius: 14, border: `1px solid ${themeColors.border}`, padding: 12, outline: "none" }}
        />
      </Card>

      <Card title="Anleitungen" style={{ background: themeColors.card, border: `1px solid ${themeColors.border}` }}>
        <div style={{ display: "grid", gap: 10 }}>
          {instructions.map((it) => (
            <div key={it.id} style={{ border: `1px solid ${themeColors.border}`, borderRadius: 14, padding: 12 }}>
              <div style={{ fontSize: 14 }}>{it.title}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                {(areas.find((a) => a.id === it.area_id)?.name || "—")} · {it.created_at ? formatDateTime(it.created_at) : "—"}
              </div>
              {it.body && <div style={{ marginTop: 8, fontSize: 13, whiteSpace: "pre-wrap" }}>{it.body}</div>}
              {it.file_url && (
                <div style={{ marginTop: 8 }}>
                  <a href={it.file_url} target="_blank" rel="noreferrer">
                    Datei öffnen
                  </a>
                </div>
              )}
            </div>
          ))}
          {instructions.length === 0 && <div style={{ opacity: 0.7 }}>Keine Anleitungen.</div>}
        </div>
      </Card>
    </div>
  );
}

function AreasView({
  themeColors,
  areas,
  areaNewName,
  setAreaNewName,
  onCreateArea,
  onStartEdit,
  areaEditId,
  areaEditName,
  setAreaEditName,
  areaEditColor,
  setAreaEditColor,
  onSaveArea,
  onCancelEdit,
  onDeleteArea,
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card title="Bereiche" style={{ background: themeColors.card, border: `1px solid ${themeColors.border}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <Input value={areaNewName} onChange={setAreaNewName} placeholder="Neuer Bereichname..." />
          <Button onClick={onCreateArea} disabled={!areaNewName.trim()}>
            Anlegen
          </Button>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {areas.map((a) => {
            const isEditing = areaEditId === a.id;
            return (
              <div key={a.id} style={{ border: `1px solid ${themeColors.border}`, borderRadius: 14, padding: 12 }}>
                {!isEditing ? (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        title="Bereichsfarbe (später)"
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 999,
                          background: a.color || "#94a3b8",
                          border: `1px solid ${themeColors.border}`,
                        }}
                      />
                      <div style={{ fontSize: 14 }}>{a.name}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button variant="ghost" onClick={() => onStartEdit(a)}>
                        Bearbeiten
                      </Button>
                      <Button variant="danger" onClick={() => onDeleteArea(a.id)}>
                        Löschen
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 10, alignItems: "center" }}>
                      <Input value={areaEditName} onChange={setAreaEditName} placeholder="Bereichsname" />
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <input type="color" value={areaEditColor} onChange={(e) => setAreaEditColor(e.target.value)} style={{ width: 48, height: 36, border: "none", background: "transparent" }} />
                        <div style={{ fontSize: 12, opacity: 0.7 }}>Farbe (für später)</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <Button onClick={onSaveArea} disabled={!areaEditName.trim()}>
                        Speichern
                      </Button>
                      <Button variant="ghost" onClick={onCancelEdit}>
                        Abbrechen
                      </Button>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      Hinweis: Sobald du in Supabase in der Tabelle areas eine Spalte color (text) hast, wird die Farbe auch gespeichert und überall nutzbar.
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {areas.length === 0 && <div style={{ opacity: 0.7 }}>Keine Bereiche.</div>}
        </div>
      </Card>
    </div>
  );
}

function SettingsView({ settings, setSettings, themeColors }) {
  return (
    <Card title="Einstellungen" style={{ background: themeColors.card, border: `1px solid ${themeColors.border}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "200px 220px", gap: 14, alignItems: "center" }}>
        <div style={{ fontSize: 13, opacity: 0.8 }}>Theme</div>
        <Select
          value={settings.theme_mode}
          onChange={(v) => setSettings((s) => ({ ...s, theme_mode: v }))}
          options={[
            { value: "light", label: "Hell" },
            { value: "dark", label: "Dunkel" },
            { value: "system", label: "System" },
          ]}
        />

        <div style={{ fontSize: 13, opacity: 0.8 }}>Hintergrund</div>
        <Select
          value={settings.background}
          onChange={(v) => setSettings((s) => ({ ...s, background: v }))}
          options={[
            { value: "default", label: "Standard" },
            { value: "soft", label: "Soft" },
            { value: "clean", label: "Clean" },
          ]}
        />

        <div style={{ fontSize: 13, opacity: 0.8 }}>Akzent</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input type="color" value={settings.accent} onChange={(e) => setSettings((s) => ({ ...s, accent: e.target.value }))} style={{ width: 48, height: 36, border: "none", background: "transparent" }} />
          <div style={{ fontSize: 12, opacity: 0.7 }}>{settings.accent}</div>
        </div>

        <div style={{ gridColumn: "1 / -1", marginTop: 6, borderTop: `1px solid ${themeColors.border}`, paddingTop: 12 }}>Benachrichtigungen</div>

        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="checkbox" checked={settings.notifications_enabled} onChange={(e) => setSettings((s) => ({ ...s, notifications_enabled: e.target.checked }))} />
          Aktiviert
        </label>
        <div />

        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={settings.notifications_desktop}
            onChange={(e) => setSettings((s) => ({ ...s, notifications_desktop: e.target.checked }))}
            disabled={!settings.notifications_enabled}
          />
          Desktop
        </label>
        <div />

        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={settings.notifications_email}
            onChange={(e) => setSettings((s) => ({ ...s, notifications_email: e.target.checked }))}
            disabled={!settings.notifications_enabled}
          />
          E-Mail
        </label>
        <div />
      </div>
    </Card>
  );
}

/* ---------------- Auth Screen ---------------- */
function AuthScreen({ onLoggedIn, settings, setSettings }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    applyThemeToDom(settings);
  }, [settings]);

  async function submit() {
    setErr("");
    setBusy(true);
    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        onLoggedIn(data.session);
      } else {
        const { error } = await supabase.auth.signUp({ email, password: pw });
        if (error) throw error;
        setMode("login");
      }
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: settings.background === "soft" ? "#f1f5f9" : "#ffffff" }}>
      <div style={{ width: "min(520px, 100%)", border: "1px solid rgba(0,0,0,0.10)", borderRadius: 18, padding: 16, background: "white" }}>
        <div style={{ fontSize: 20 }}>Anmeldung</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Stenau Dashboard</div>

        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <Input value={email} onChange={setEmail} placeholder="E-Mail" />
          <Input value={pw} onChange={setPw} placeholder="Passwort" type="password" />
          {err && <div style={{ color: "rgb(185,28,28)", fontSize: 12 }}>{err}</div>}
          <Button onClick={submit} disabled={busy || !email.trim() || !pw.trim()}>
            {mode === "login" ? "Anmelden" : "Registrieren"}
          </Button>
          <Button variant="ghost" onClick={() => setMode((m) => (m === "login" ? "signup" : "login"))}>
            {mode === "login" ? "Neues Konto erstellen" : "Zurück zur Anmeldung"}
          </Button>
        </div>

        <div style={{ marginTop: 14, borderTop: "1px solid rgba(0,0,0,0.10)", paddingTop: 12 }}>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>Design</div>
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, alignItems: "center" }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Theme</div>
            <Select
              value={settings.theme_mode}
              onChange={(v) => setSettings((s) => ({ ...s, theme_mode: v }))}
              options={[
                { value: "light", label: "Hell" },
                { value: "dark", label: "Dunkel" },
                { value: "system", label: "System" },
              ]}
            />
            <div style={{ fontSize: 12, opacity: 0.7 }}>Hintergrund</div>
            <Select
              value={settings.background}
              onChange={(v) => setSettings((s) => ({ ...s, background: v }))}
              options={[
                { value: "default", label: "Standard" },
                { value: "soft", label: "Soft" },
                { value: "clean", label: "Clean" },
              ]}
            />
            <div style={{ fontSize: 12, opacity: 0.7 }}>Akzent</div>
            <input type="color" value={settings.accent} onChange={(e) => setSettings((s) => ({ ...s, accent: e.target.value }))} style={{ width: 48, height: 36, border: "none", background: "transparent" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Small components ---------------- */
function MiniStat({ label, value }) {
  return (
    <div style={{ border: "1px solid rgba(0,0,0,0.06)", borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.6)" }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 24, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function GlobalStyle() {
  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      :root { --accent: #16a34a; }
      :root[data-theme="dark"] {
        background: #0b1220;
        color: #e5e7eb;
      }
      :root[data-bg="soft"] { }
      :root[data-bg="clean"] { }
      a { color: var(--accent); }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  return null;
}
