// pages/dashboard.js
import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* =========================================================
   Next.js + Supabase (wichtig):
   - createClient NICHT auf Server/Build ausführen
   - Client nur im Browser erstellen (typeof window !== "undefined")
   ========================================================= */

const DEFAULT_SETTINGS = {
  theme_mode: "light", // light | dark | system
  background: "standard", // standard | soft | grid | waves | clean
  accent: "#1626a2",
  notifications_enabled: true,
  notifications_desktop: true,
  notifications_email: false,
  background_custom_url: "", // optional später
};

const STATUS_VALUES = ["todo", "done"]; // "doing" wird nicht mehr benutzt

const GUIDE_BUCKET = "guides"; // Supabase Storage Bucket-Name (falls anders -> anpassen)

/* ---------------- Helpers ---------------- */
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
  return d.toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function applyThemeToDom(settings) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  const mode =
    settings.theme_mode === "system"
      ? prefersDark
        ? "dark"
        : "light"
      : settings.theme_mode;

  root.dataset.theme = mode;
  root.style.setProperty("--accent", settings.accent || "#1626a2");
}

function getBackgroundCSS(settings) {
  const custom = (settings.background_custom_url || "").trim();
  if (custom) return `url("${custom}")`;

  switch (settings.background) {
    case "clean":
      return "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,1) 100%)";
    case "soft":
      return "linear-gradient(180deg, rgba(248,250,252,1) 0%, rgba(241,245,249,1) 100%)";
    case "grid":
      return `
        radial-gradient(circle at 1px 1px, rgba(15,23,42,0.08) 1px, transparent 0),
        linear-gradient(180deg, rgba(248,250,252,1) 0%, rgba(241,245,249,1) 100%)
      `;
    case "waves":
      return `
        radial-gradient(1200px 600px at 10% 10%, rgba(22,38,162,0.10) 0%, transparent 60%),
        radial-gradient(900px 500px at 90% 20%, rgba(22,38,162,0.10) 0%, transparent 60%),
        radial-gradient(900px 500px at 30% 90%, rgba(22,38,162,0.08) 0%, transparent 60%),
        linear-gradient(180deg, rgba(248,250,252,1) 0%, rgba(241,245,249,1) 100%)
      `;
    case "standard":
    default:
      return "linear-gradient(180deg, rgba(250,250,251,1) 0%, rgba(245,247,250,1) 100%)";
  }
}

/* =========================================================
   UI atoms
   ========================================================= */
function Card({ title, right, children, style, themeColors }) {
  return (
    <div
      style={{
        border: `1px solid ${themeColors.border}`,
        background: themeColors.card,
        borderRadius: 18,
        padding: 14,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        ...style,
      }}
    >
      {(title || right) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 16 }}>{title}</div>
          <div>{right}</div>
        </div>
      )}
      {children}
    </div>
  );
}

function Button({ children, onClick, variant = "primary", disabled, style, title, type = "button" }) {
  const isGhost = variant === "ghost";
  const isDanger = variant === "danger";
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        borderRadius: 12,
        border: "1px solid rgba(0,0,0,0.10)",
        padding: "8px 12px",
        background: isGhost
          ? "transparent"
          : isDanger
          ? "rgba(239,68,68,0.10)"
          : "var(--accent)",
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

function MiniStat({ label, value }) {
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: 14,
        padding: 12,
        background: "rgba(255,255,255,0.6)",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 24, marginTop: 2 }}>{value}</div>
    </div>
  );
}

/* =========================================================
   Auth Screen
   ========================================================= */
function AuthScreen({ supabase, onLoggedIn, settings, setSettings }) {
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
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 16,
        backgroundImage: getBackgroundCSS(settings),
        backgroundSize: settings.background === "grid" ? "18px 18px, auto" : "cover",
        backgroundRepeat: settings.background === "grid" ? "repeat, no-repeat" : "no-repeat",
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          border: "1px solid rgba(0,0,0,0.10)",
          borderRadius: 18,
          padding: 16,
          background: "white",
        }}
      >
        <div style={{ fontSize: 20 }}>Anmeldung</div>

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

          <div style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: 10, alignItems: "center" }}>
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
                { value: "standard", label: "Standard" },
                { value: "soft", label: "Soft" },
                { value: "grid", label: "Raster" },
                { value: "waves", label: "Wellen" },
                { value: "clean", label: "Clean" },
              ]}
            />

            <div style={{ fontSize: 12, opacity: 0.7 }}>Akzent</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="color"
                value={settings.accent}
                onChange={(e) => setSettings((s) => ({ ...s, accent: e.target.value }))}
                style={{ width: 48, height: 36, border: "none", background: "transparent" }}
              />
              <div style={{ fontSize: 12, opacity: 0.7 }}>{settings.accent}</div>
            </div>

            <div style={{ fontSize: 12, opacity: 0.7 }}>Custom Bild-URL (optional)</div>
            <Input
              value={settings.background_custom_url}
              onChange={(v) => setSettings((s) => ({ ...s, background_custom_url: v }))}
              placeholder="https://..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Main Page: Dashboard
   ========================================================= */
export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);

  const [settings, setSettings] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    return safeJsonParse(localStorage.getItem("stenau_settings_v2"), DEFAULT_SETTINGS);
  });

  // create Supabase client (browser only)
  const supabase = useMemo(() => {
    if (typeof window === "undefined") return null;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }, []);

  const [session, setSession] = useState(null);
  const user = session?.user || null;

  const [activeTab, setActiveTab] = useState("Board");
  const [loading, setLoading] = useState(false);
  const [uiError, setUiError] = useState("");

  // filters
  const [filterArea, setFilterArea] = useState("ALL");
  const [filterBucket, setFilterBucket] = useState("ALL");
  const [search, setSearch] = useState("");

  // data
  const [areas, setAreas] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [subtasks, setSubtasks] = useState([]);

  // guides
  const [guides, setGuides] = useState([]);
  const [guideFiles, setGuideFiles] = useState([]);
  const [guideSelectedId, setGuideSelectedId] = useState("");
  const [guideNewTitle, setGuideNewTitle] = useState("");
  const [guideNewBody, setGuideNewBody] = useState("");

  // create task
  const [newTitle, setNewTitle] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [newDueAt, setNewDueAt] = useState(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16); // datetime-local
  });
  const [newBucket, setNewBucket] = useState("Heute");
  const [newStatus, setNewStatus] = useState("todo"); // DB: todo/done

  // create subtask
  const [subTaskParentId, setSubTaskParentId] = useState("");
  const [subTaskTitle, setSubTaskTitle] = useState("");
  const [subTaskGuideId, setSubTaskGuideId] = useState(""); // optional – wird nur gesetzt, wenn Spalte existiert (Fallback)

  // areas manage
  const [areaNewName, setAreaNewName] = useState("");
  const [areaEditId, setAreaEditId] = useState("");
  const [areaEditName, setAreaEditName] = useState("");
  const [areaEditColor, setAreaEditColor] = useState("#94a3b8");

  useEffect(() => {
    setMounted(true);
  }, []);

  /* ---- theme apply ---- */
  useEffect(() => {
    if (!mounted) return;
    applyThemeToDom(settings);
    try {
      localStorage.setItem("stenau_settings_v2", JSON.stringify(settings));
    } catch {}
  }, [settings, mounted]);

  /* ---- auth ---- */
  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => sub?.subscription?.unsubscribe?.();
  }, [supabase]);

  /* ---- load data after login ---- */
  useEffect(() => {
    if (!supabase || !user?.id) return;
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user?.id]);

  async function reloadAll() {
    setUiError("");
    setLoading(true);
    try {
      await Promise.all([loadAreas(), loadTasksAndSubtasks(), loadGuides()]);
    } catch (e) {
      setUiError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function loadAreas() {
    const { data, error } = await supabase
      .from("areas")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;

    setAreas(data || []);
    if (!newAreaId && (data || []).length) setNewAreaId(data[0].id);
  }

  async function loadTasksAndSubtasks() {
    const { data: t, error: te } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });

    if (te) throw te;

    const { data: st, error: se } = await supabase
      .from("subtasks")
      .select("*")
      .order("created_at", { ascending: true });

    if (se) throw se;

    setTasks(t || []);
    setSubtasks(st || []);

    if (!subTaskParentId && (t || []).length) setSubTaskParentId(t[0].id);
  }

  async function loadGuides() {
    // guides
    const { data: g, error: ge } = await supabase
      .from("guides")
      .select("*")
      .order("created_at", { ascending: false });

    if (ge) {
      // guides ggf. noch nicht angelegt – UI soll nicht komplett brechen
      setGuides([]);
      setGuideFiles([]);
      return;
    }

    setGuides(g || []);
    if (!guideSelectedId && (g || []).length) setGuideSelectedId(g[0].id);

    // guide_files
    const { data: gf, error: gfe } = await supabase
      .from("guide_files")
      .select("*")
      .order("created_at", { ascending: false });

    if (gfe) {
      setGuideFiles([]);
      return;
    }
    setGuideFiles(gf || []);
  }

  /* ---- derived ---- */
  const themeColors = useMemo(() => {
    const isDark = typeof document !== "undefined" && document?.documentElement?.dataset?.theme === "dark";
    return isDark
      ? {
          text: "#e5e7eb",
          card: "rgba(17,24,39,0.75)",
          border: "rgba(255,255,255,0.10)",
          muted: "rgba(229,231,235,0.65)",
        }
      : {
          text: "#0f172a",
          card: "rgba(255,255,255,0.92)",
          border: "rgba(0,0,0,0.08)",
          muted: "rgba(15,23,42,0.55)",
        };
  }, [settings.theme_mode, mounted]);

  const pageBg = useMemo(() => getBackgroundCSS(settings), [settings]);

  const areasById = useMemo(() => {
    const m = new Map();
    for (const a of areas) m.set(a.id, a);
    return m;
  }, [areas]);

  const subtasksByTask = useMemo(() => {
    const map = new Map();
    for (const st of subtasks) {
      if (!map.has(st.task_id)) map.set(st.task_id, []);
      map.get(st.task_id).push(st);
    }
    return map;
  }, [subtasks]);

  const buckets = useMemo(() => {
    const set = new Set();
    for (const t of tasks) if (t.due_bucket) set.add(t.due_bucket);
    return ["ALL", ...Array.from(set).sort((a, b) => String(a).localeCompare(String(b), "de"))];
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (filterArea !== "ALL" && t.area_id !== filterArea) return false;
      if (filterBucket !== "ALL" && (t.due_bucket || "—") !== filterBucket) return false;
      if (q && !String(t.title || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, filterArea, filterBucket, search]);

  const openCount = useMemo(
    () => tasks.filter((t) => (t.status || "todo") !== "done").length,
    [tasks]
  );

  const todayCount = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return tasks.filter((t) => {
      if (!t.due_at) return false;
      const d = new Date(t.due_at);
      return d >= start && d < end && (t.status || "todo") !== "done";
    }).length;
  }, [tasks]);

  const weekCount = useMemo(() => {
    const s = startOfWeek(new Date());
    const e = endOfWeek(new Date());
    return tasks.filter((t) => {
      if (!t.due_at) return false;
      const d = new Date(t.due_at);
      return d >= s && d < e && (t.status || "todo") !== "done";
    }).length;
  }, [tasks]);

  const calendarRows = useMemo(() => {
    // Kalender = direkt aus tasks.due_at
    const rows = (tasks || [])
      .filter((t) => !!t.due_at)
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status || "todo",
        area_id: t.area_id,
        due_at: t.due_at,
        due_bucket: t.due_bucket || "",
      }))
      .sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
    return rows;
  }, [tasks]);

  /* =========================================================
     Mutations (mit Fallback, falls Spalte nicht existiert)
     ========================================================= */
  async function safeInsert(table, payload, fallbackRemoveKeys = []) {
    const { error } = await supabase.from(table).insert(payload);
    if (!error) return null;

    // Wenn Spalte nicht existiert o.ä. -> Fallback ohne bestimmte Keys
    const msg = String(error.message || "");
    const isColumnIssue = msg.includes("column") && msg.includes("does not exist");
    if (!isColumnIssue) return error;

    const cleaned = { ...payload };
    for (const k of fallbackRemoveKeys) delete cleaned[k];
    const { error: e2 } = await supabase.from(table).insert(cleaned);
    return e2 || null;
  }

  async function safeUpdate(table, payload, eqCol, eqVal, fallbackRemoveKeys = []) {
    const { error } = await supabase.from(table).update(payload).eq(eqCol, eqVal);
    if (!error) return null;

    const msg = String(error.message || "");
    const isColumnIssue = msg.includes("column") && msg.includes("does not exist");
    if (!isColumnIssue) return error;

    const cleaned = { ...payload };
    for (const k of fallbackRemoveKeys) delete cleaned[k];
    const { error: e2 } = await supabase.from(table).update(cleaned).eq(eqCol, eqVal);
    return e2 || null;
  }

  async function createTask() {
    setUiError("");
    if (!newTitle.trim()) return;

    const payload = {
      title: newTitle.trim(),
      area_id: newAreaId || null,
      status: newStatus, // todo/done
      due_bucket: newBucket,
      due_at: newDueAt ? new Date(newDueAt).toISOString() : null,
    };

    const err = await safeInsert("tasks", payload);
    if (err) {
      setUiError(err.message);
      return;
    }

    setNewTitle("");
    await loadTasksAndSubtasks();
  }

  async function updateTaskStatus(taskId, status) {
    setUiError("");
    const safe = STATUS_VALUES.includes(status) ? status : "todo";

    const err = await safeUpdate("tasks", { status: safe }, "id", taskId);
    if (err) {
      setUiError(err.message);
      return;
    }
    await loadTasksAndSubtasks();
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
  }

  async function createSubtask() {
    setUiError("");
    if (!subTaskParentId) return;
    if (!subTaskTitle.trim()) return;

    // optional: guide_id (falls Spalte existiert)
    const payload = {
      task_id: subTaskParentId,
      title: subTaskTitle.trim(),
      is_done: false,
      status: "todo",
      guide_id: subTaskGuideId || null,
    };

    const err = await safeInsert("subtasks", payload, ["status", "guide_id"]);
    if (err) {
      setUiError(err.message);
      return;
    }
    setSubTaskTitle("");
    await loadTasksAndSubtasks();
  }

  async function toggleSubtask(subId, is_done) {
    setUiError("");

    // Wenn status-Spalte existiert -> mit pflegen, sonst nur is_done
    const payload = { is_done, status: is_done ? "done" : "todo" };
    const err = await safeUpdate("subtasks", payload, "id", subId, ["status"]);
    if (err) {
      setUiError(err.message);
      return;
    }
    await loadTasksAndSubtasks();
  }

  /* ---- areas CRUD ---- */
  async function createArea() {
    setUiError("");
    const name = areaNewName.trim();
    if (!name) return;

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
    if (!confirm("Bereich wirklich löschen?")) return;

    const { error } = await supabase.from("areas").delete().eq("id", areaId);
    if (error) {
      setUiError(error.message);
      return;
    }

    await loadAreas();
    await loadTasksAndSubtasks();
  }

  /* ---- Guides (Anleitungen) ---- */
  async function createGuide() {
    setUiError("");
    const title = guideNewTitle.trim();
    if (!title) return;

    const payload = {
      title,
      body: (guideNewBody || "").trim(),
    };

    const err = await safeInsert("guides", payload, ["body"]);
    if (err) {
      setUiError(err.message);
      return;
    }

    setGuideNewTitle("");
    setGuideNewBody("");
    await loadGuides();
  }

  async function deleteGuide(guideId) {
    setUiError("");
    if (!confirm("Anleitung wirklich löschen?")) return;

    const { error } = await supabase.from("guides").delete().eq("id", guideId);
    if (error) {
      setUiError(error.message);
      return;
    }
    if (guideSelectedId === guideId) setGuideSelectedId("");
    await loadGuides();
  }

  async function uploadGuideFile(file) {
    setUiError("");
    if (!file) return;
    if (!guideSelectedId) {
      setUiError("Bitte zuerst eine Anleitung auswählen.");
      return;
    }

    // 1) Upload in Storage
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${guideSelectedId}/${Date.now()}_${safeName}`;

    const { error: upErr } = await supabase.storage.from(GUIDE_BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });

    if (upErr) {
      setUiError(`Upload fehlgeschlagen: ${upErr.message}`);
      return;
    }

    // 2) Metadaten in guide_files
    const meta = {
      guide_id: guideSelectedId,
      file_name: file.name,
      file_path: path,
    };

    const err = await safeInsert("guide_files", meta);
    if (err) {
      setUiError(err.message);
      return;
    }

    await loadGuides();
  }

  async function openGuideFile(fileRow) {
    setUiError("");
    if (!fileRow?.file_path) return;

    // Signed URL (funktioniert auch wenn Bucket nicht public ist)
    const { data, error } = await supabase.storage
      .from(GUIDE_BUCKET)
      .createSignedUrl(fileRow.file_path, 60 * 10);

    if (error) {
      setUiError(error.message);
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteGuideFile(fileRow) {
    setUiError("");
    if (!confirm("Datei wirklich löschen?")) return;

    // 1) Storage delete (best effort)
    if (fileRow?.file_path) {
      await supabase.storage.from(GUIDE_BUCKET).remove([fileRow.file_path]);
    }
    // 2) DB delete
    const { error } = await supabase.from("guide_files").delete().eq("id", fileRow.id);
    if (error) {
      setUiError(error.message);
      return;
    }
    await loadGuides();
  }

  /* ---- guard: supabase env missing ---- */
  if (mounted && !supabase) {
    return (
      <div style={{ padding: 20, fontFamily: "system-ui" }}>
        Supabase ENV fehlt. Bitte in Vercel setzen:
        <div style={{ marginTop: 8 }}>
          NEXT_PUBLIC_SUPABASE_URL<br />
          NEXT_PUBLIC_SUPABASE_ANON_KEY
        </div>
      </div>
    );
  }

  /* ---- auth screen ---- */
  if (mounted && supabase && !user) {
    return <AuthScreen supabase={supabase} settings={settings} setSettings={setSettings} onLoggedIn={setSession} />;
  }

  if (!mounted) {
    return <div style={{ padding: 20, fontFamily: "system-ui" }}>Lade…</div>;
  }

  /* ---- render ---- */
  return (
    <div
      style={{
        minHeight: "100vh",
        color: themeColors.text,
        backgroundImage: pageBg,
        backgroundSize: settings.background === "grid" ? "18px 18px, auto" : "cover",
        backgroundRepeat: settings.background === "grid" ? "repeat, no-repeat" : "no-repeat",
      }}
    >
      <GlobalStyle />

      {/* Header */}
      <div
        style={{
          padding: 18,
          borderBottom: `1px solid ${themeColors.border}`,
          background: "rgba(255,255,255,0.65)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
            maxWidth: 1320,
            margin: "0 auto",
          }}
        >
          <div>
            <div style={{ fontSize: 22 }}>Armaturenbrett</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>Angemeldet als: {user?.email}</div>
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

      {/* Layout */}
      <div
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          padding: 18,
          display: "grid",
          gridTemplateColumns: "260px 1fr",
          gap: 16,
        }}
      >
        {/* Sidebar */}
        <div style={{ display: "grid", gap: 12 }}>
          <Card title="Übersicht" themeColors={themeColors}>
            <div style={{ display: "grid", gap: 10 }}>
              <MiniStat label="Aufgaben heute" value={String(todayCount)} />
              <MiniStat label="Diese Woche" value={String(weekCount)} />
              <MiniStat label="Offen" value={String(openCount)} />
            </div>
          </Card>

          <Card title="Navigation" themeColors={themeColors}>
            <div style={{ display: "grid", gap: 10 }}>
              {["Board", "Liste", "Kalender", "Timeline", "Bereiche", "Anleitungen", "Einstellungen"].map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  style={{
                    textAlign: "left",
                    borderRadius: 12,
                    border: `1px solid ${themeColors.border}`,
                    background: activeTab === t ? "rgba(22,38,162,0.08)" : "transparent",
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

          <Card title="Filter" themeColors={themeColors}>
            <div style={{ display: "grid", gap: 10 }}>
              <Select
                value={filterArea}
                onChange={setFilterArea}
                options={[
                  { value: "ALL", label: "Alle Bereiche" },
                  ...areas.map((a) => ({ value: a.id, label: a.name })),
                ]}
              />
              <Select
                value={filterBucket}
                onChange={setFilterBucket}
                options={buckets.map((b) => ({ value: b, label: b === "ALL" ? "Alle Zeiträume" : b }))}
              />
              <Input value={search} onChange={setSearch} placeholder="Suche..." />
            </div>
          </Card>
        </div>

        {/* Main */}
        <div style={{ display: "grid", gap: 12 }}>
          {/* Pills */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {["Board", "Liste", "Kalender", "Timeline", "Bereiche", "Anleitungen", "Einstellungen"].map((t) => (
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
            <div
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(239,68,68,0.25)",
                background: "rgba(239,68,68,0.06)",
                color: "rgb(185,28,28)",
              }}
            >
              {uiError}
            </div>
          )}

          <Card
            title="Aufgabe anlegen"
            right={<div style={{ fontSize: 12, opacity: 0.7 }}>Kalender nutzt tasks.due_at.</div>}
            themeColors={themeColors}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 0.7fr 0.55fr 0.55fr 0.6fr auto",
                gap: 10,
                alignItems: "center",
              }}
            >
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
              <Select
                value={newStatus}
                onChange={setNewStatus}
                options={[
                  { value: "todo", label: "Zu erledigen" },
                  { value: "done", label: "Erledigt" },
                ]}
              />
              <Button onClick={createTask} disabled={!newTitle.trim()}>
                Anlegen
              </Button>
            </div>
          </Card>

          {activeTab === "Board" && (
            <BoardView
              tasks={filteredTasks}
              areasById={areasById}
              subtasksByTask={subtasksByTask}
              onStatus={updateTaskStatus}
              onDelete={deleteTask}
              themeColors={themeColors}
            />
          )}

          {activeTab === "Liste" && (
            <ListView tasks={filteredTasks} areasById={areasById} onStatus={updateTaskStatus} onDelete={deleteTask} themeColors={themeColors} />
          )}

          {activeTab === "Kalender" && <CalendarView rows={calendarRows} areasById={areasById} themeColors={themeColors} />}

          {activeTab === "Timeline" && <TimelineView tasks={filteredTasks} areasById={areasById} themeColors={themeColors} />}

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

          {activeTab === "Anleitungen" && (
            <GuidesView
              themeColors={themeColors}
              guides={guides}
              guideFiles={guideFiles}
              guideSelectedId={guideSelectedId}
              setGuideSelectedId={setGuideSelectedId}
              guideNewTitle={guideNewTitle}
              setGuideNewTitle={setGuideNewTitle}
              guideNewBody={guideNewBody}
              setGuideNewBody={setGuideNewBody}
              onCreateGuide={createGuide}
              onDeleteGuide={deleteGuide}
              onUploadFile={uploadGuideFile}
              onOpenFile={openGuideFile}
              onDeleteFile={deleteGuideFile}
            />
          )}

          {activeTab === "Einstellungen" && <SettingsView settings={settings} setSettings={setSettings} themeColors={themeColors} />}

          {/* Subtasks */}
          <Card title="Unteraufgabe anlegen" themeColors={themeColors}>
            <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 260px auto", gap: 10 }}>
              <Select
                value={subTaskParentId}
                onChange={setSubTaskParentId}
                options={(tasks || []).map((t) => ({ value: t.id, label: t.title }))}
              />
              <Input value={subTaskTitle} onChange={setSubTaskTitle} placeholder="Unteraufgabe..." />

              <Select
                value={subTaskGuideId}
                onChange={setSubTaskGuideId}
                options={[
                  { value: "", label: "Kein Verweis" },
                  ...guides.map((g) => ({ value: g.id, label: g.title || "(ohne Titel)" })),
                ]}
              />

              <Button onClick={createSubtask} disabled={!subTaskParentId || !subTaskTitle.trim()}>
                Anlegen
              </Button>
            </div>

            {subTaskParentId && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {(subtasksByTask.get(subTaskParentId) || []).map((st) => (
                  <label
                    key={st.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      border: `1px solid ${themeColors.border}`,
                      borderRadius: 12,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!st.is_done}
                      onChange={(e) => toggleSubtask(st.id, e.target.checked)}
                    />
                    <span
                      style={{
                        textDecoration: st.is_done ? "line-through" : "none",
                        opacity: st.is_done ? 0.7 : 1,
                      }}
                    >
                      {st.title}
                    </span>
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

/* =========================================================
   Views
   ========================================================= */
function BoardView({ tasks, areasById, subtasksByTask, onStatus, onDelete, themeColors }) {
  const cols = useMemo(() => ({ todo: [], done: [] }), []);

  for (const t of tasks) {
    const s = (t.status || "todo") === "done" ? "done" : "todo";
    cols[s].push(t);
  }

  const colMeta = [
    { key: "todo", label: "Zu erledigen" },
    { key: "done", label: "Erledigt" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {colMeta.map((c) => (
        <Card
          key={c.key}
          title={c.label}
          right={<div style={{ fontSize: 12, opacity: 0.7 }}>{cols[c.key].length}</div>}
          themeColors={themeColors}
          style={{ minHeight: 260 }}
        >
          <div style={{ display: "grid", gap: 10 }}>
            {cols[c.key].length === 0 ? (
              <div style={{ opacity: 0.6 }}>Keine Aufgaben</div>
            ) : (
              cols[c.key].map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  area={areasById.get(t.area_id)}
                  subtasks={subtasksByTask.get(t.id) || []}
                  onStatus={onStatus}
                  onDelete={onDelete}
                  themeColors={themeColors}
                />
              ))
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function TaskCard({ task, area, subtasks, onStatus, onDelete, themeColors }) {
  const done = subtasks.filter((s) => s.is_done).length;
  const total = subtasks.length;
  const percent = total ? Math.round((done / total) * 100) : 0;

  const areaColor = area?.color || "#94a3b8";
  const statusVal = (task.status || "todo") === "done" ? "done" : "todo";

  return (
    <div style={{ border: `1px solid ${themeColors.border}`, borderRadius: 14, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            title="Bereichsfarbe"
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: areaColor,
              border: `1px solid ${themeColors.border}`,
            }}
          />
          <div style={{ fontSize: 14 }}>{task.title}</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={statusVal}
            onChange={(e) => onStatus(task.id, e.target.value)}
            style={{
              borderRadius: 12,
              border: `1px solid ${themeColors.border}`,
              padding: "6px 10px",
              background: "white",
            }}
          >
            <option value="todo">Zu erledigen</option>
            <option value="done">Erledigt</option>
          </select>
          <button
            onClick={() => onDelete(task.id)}
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              border: `1px solid ${themeColors.border}`,
              background: "transparent",
              cursor: "pointer",
            }}
            title="Löschen"
          >
            ×
          </button>
        </div>
      </div>

      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
        {area?.name || "—"} · {task.due_bucket || "—"} · {task.due_at ? formatDateTime(task.due_at) : "—"}
      </div>

      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
        Unteraufgaben: {done}/{total}
        {total ? ` (${percent}%)` : ""}
      </div>

      {total > 0 && (
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          {subtasks.slice(0, 6).map((s) => (
            <div
              key={s.id}
              style={{
                padding: "6px 10px",
                borderRadius: 12,
                border: `1px solid ${themeColors.border}`,
                opacity: s.is_done ? 0.7 : 1,
              }}
            >
              <span style={{ textDecoration: s.is_done ? "line-through" : "none" }}>{s.title}</span>
            </div>
          ))}
          {subtasks.length > 6 && <div style={{ fontSize: 12, opacity: 0.65 }}>+{subtasks.length - 6} weitere…</div>}
        </div>
      )}
    </div>
  );
}

function ListView({ tasks, areasById, onStatus, onDelete, themeColors }) {
  return (
    <Card title="Liste" themeColors={themeColors}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {["Aufgabe", "Bereich", "Datum/Uhrzeit", "Zeitraum", "Status", ""].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    fontSize: 12,
                    opacity: 0.7,
                    padding: "10px 10px",
                    borderBottom: `1px solid ${themeColors.border}`,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const a = areasById.get(t.area_id);
              const statusVal = (t.status || "todo") === "done" ? "done" : "todo";

              return (
                <tr key={t.id}>
                  <td style={{ padding: "12px 10px", borderBottom: `1px solid ${themeColors.border}` }}>{t.title}</td>
                  <td style={{ padding: "12px 10px", borderBottom: `1px solid ${themeColors.border}` }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: a?.color || "#94a3b8",
                          border: `1px solid ${themeColors.border}`,
                        }}
                      />
                      {a?.name || "—"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 10px", borderBottom: `1px solid ${themeColors.border}` }}>
                    {t.due_at ? formatDateTime(t.due_at) : "—"}
                  </td>
                  <td style={{ padding: "12px 10px", borderBottom: `1px solid ${themeColors.border}` }}>{t.due_bucket || "—"}</td>
                  <td style={{ padding: "12px 10px", borderBottom: `1px solid ${themeColors.border}` }}>
                    <select
                      value={statusVal}
                      onChange={(e) => onStatus(t.id, e.target.value)}
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${themeColors.border}`,
                        padding: "6px 10px",
                        background: "white",
                      }}
                    >
                      <option value="todo">Zu erledigen</option>
                      <option value="done">Erledigt</option>
                    </select>
                  </td>
                  <td style={{ padding: "12px 10px", borderBottom: `1px solid ${themeColors.border}`, textAlign: "right" }}>
                    <button
                      onClick={() => onDelete(t.id)}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 10,
                        border: `1px solid ${themeColors.border}`,
                        background: "transparent",
                        cursor: "pointer",
                      }}
                      title="Löschen"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}

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
        title="Kalender"
        right={<div style={{ fontSize: 12, opacity: 0.7 }}>Quelle: tasks (due_at).</div>}
        themeColors={themeColors}
      />

      {rows.length === 0 ? (
        <Card themeColors={themeColors}>
          <div style={{ opacity: 0.7 }}>Keine Aufgaben mit Datum/Uhrzeit (due_at).</div>
        </Card>
      ) : (
        grouped.map(([day, items]) => (
          <Card key={day} title={day} themeColors={themeColors}>
            <div style={{ display: "grid", gap: 10 }}>
              {items.map((it) => {
                const a = areasById.get(it.area_id);
                const statusLabel = it.status === "done" ? "Erledigt" : "Zu erledigen";
                return (
                  <div key={it.id} style={{ border: `1px solid ${themeColors.border}`, borderRadius: 14, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            background: a?.color || "#94a3b8",
                            border: `1px solid ${themeColors.border}`,
                          }}
                        />
                        <div>{it.title}</div>
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>{formatDateTime(it.due_at)}</div>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                      {a?.name || "—"} · {statusLabel} · {it.due_bucket || "—"}
                    </div>
                  </div>
                );
              })}
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
    .slice(0, 80);

  return (
    <Card title="Timeline (minimal)" themeColors={themeColors}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontSize: 14 }}>Diese Woche</div>
        <div style={{ display: "grid", gap: 10 }}>
          {weekTasks.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Keine Einträge.</div>
          ) : (
            weekTasks.map((t) => {
              const a = areasById.get(t.area_id);
              const statusLabel = (t.status || "todo") === "done" ? "Erledigt" : "Zu erledigen";
              return (
                <div key={t.id} style={{ border: `1px solid ${themeColors.border}`, borderRadius: 14, padding: 12 }}>
                  <div style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: a?.color || "#94a3b8",
                        border: `1px solid ${themeColors.border}`,
                      }}
                    />
                    {t.title}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    {a?.name || "—"} · {statusLabel} · {t.due_at ? formatDateTime(t.due_at) : "—"}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Card>
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
    <Card title="Bereiche" themeColors={themeColors}>
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
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        background: a.color || "#94a3b8",
                        border: `1px solid ${themeColors.border}`,
                      }}
                      title="Bereichsfarbe"
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 10, alignItems: "center" }}>
                    <Input value={areaEditName} onChange={setAreaEditName} placeholder="Bereichsname" />
                    <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
                      <input
                        type="color"
                        value={areaEditColor}
                        onChange={(e) => setAreaEditColor(e.target.value)}
                        style={{ width: 48, height: 36, border: "none", background: "transparent" }}
                      />
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Farbe</div>
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
                </div>
              )}
            </div>
          );
        })}
        {areas.length === 0 && <div style={{ opacity: 0.7 }}>Keine Bereiche.</div>}
      </div>
    </Card>
  );
}

function GuidesView({
  themeColors,
  guides,
  guideFiles,
  guideSelectedId,
  setGuideSelectedId,
  guideNewTitle,
  setGuideNewTitle,
  guideNewBody,
  setGuideNewBody,
  onCreateGuide,
  onDeleteGuide,
  onUploadFile,
  onOpenFile,
  onDeleteFile,
}) {
  const selected = guides.find((g) => g.id === guideSelectedId) || null;
  const filesForSelected = (guideFiles || []).filter((f) => f.guide_id === guideSelectedId);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 12 }}>
      <Card title="Anleitungen" themeColors={themeColors} style={{ height: "fit-content" }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Neue Anleitung</div>
            <Input value={guideNewTitle} onChange={setGuideNewTitle} placeholder="Titel (z. B. Twence anmelden)" />
            <Input value={guideNewBody} onChange={setGuideNewBody} placeholder="Kurzbeschreibung (optional)" />
            <Button onClick={onCreateGuide} disabled={!guideNewTitle.trim()}>
              Anlegen
            </Button>
          </div>

          <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 10, marginTop: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>Liste</div>
            <div style={{ display: "grid", gap: 8 }}>
              {guides.length === 0 ? (
                <div style={{ opacity: 0.7 }}>Noch keine Anleitungen.</div>
              ) : (
                guides.map((g) => (
                  <div
                    key={g.id}
                    style={{
                      border: "1px solid rgba(0,0,0,0.08)",
                      borderRadius: 14,
                      padding: 10,
                      background: g.id === guideSelectedId ? "rgba(22,38,162,0.06)" : "transparent",
                      cursor: "pointer",
                    }}
                    onClick={() => setGuideSelectedId(g.id)}
                    title="Anleitung auswählen"
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 14 }}>{g.title || "(ohne Titel)"}</div>
                        <div style={{ fontSize: 12, opacity: 0.65 }}>{g.body || ""}</div>
                      </div>
                      <Button variant="danger" onClick={(e) => (e.stopPropagation(), onDeleteGuide(g.id))}>
                        Löschen
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title={selected ? `Details: ${selected.title}` : "Details"}
        right={<div style={{ fontSize: 12, opacity: 0.7 }}>Dateien: Upload + Öffnen</div>}
        themeColors={themeColors}
      >
        {!selected ? (
          <div style={{ opacity: 0.7 }}>Bitte links eine Anleitung auswählen.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Beschreibung</div>
            <div style={{ padding: 12, borderRadius: 14, border: `1px solid ${themeColors.border}` }}>
              {selected.body ? selected.body : <span style={{ opacity: 0.7 }}>—</span>}
            </div>

            <div style={{ borderTop: `1px solid ${themeColors.border}`, paddingTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ fontSize: 14 }}>Dateien</div>
                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="file"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUploadFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                {filesForSelected.length === 0 ? (
                  <div style={{ opacity: 0.7 }}>Noch keine Dateien.</div>
                ) : (
                  filesForSelected.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        border: `1px solid ${themeColors.border}`,
                        borderRadius: 14,
                        padding: 10,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <div style={{ display: "grid", gap: 2 }}>
                        <div style={{ fontSize: 13 }}>{f.file_name || f.file_path}</div>
                        <div style={{ fontSize: 12, opacity: 0.65 }}>{f.created_at ? formatDateTime(f.created_at) : ""}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Button variant="ghost" onClick={() => onOpenFile(f)}>
                          Öffnen
                        </Button>
                        <Button variant="danger" onClick={() => onDeleteFile(f)}>
                          Löschen
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function SettingsView({ settings, setSettings, themeColors }) {
  return (
    <Card title="Einstellungen" themeColors={themeColors}>
      <div style={{ display: "grid", gridTemplateColumns: "220px 280px", gap: 14, alignItems: "center" }}>
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
          onChange={(v) => setSettings((s) => ({ ...s, background: v, background_custom_url: "" }))}
          options={[
            { value: "standard", label: "Standard" },
            { value: "soft", label: "Soft" },
            { value: "grid", label: "Raster" },
            { value: "waves", label: "Wellen" },
            { value: "clean", label: "Clean" },
          ]}
        />

        <div style={{ fontSize: 13, opacity: 0.8 }}>Custom Bild-URL</div>
        <Input
          value={settings.background_custom_url}
          onChange={(v) => setSettings((s) => ({ ...s, background_custom_url: v }))}
          placeholder="https://..."
        />

        <div style={{ fontSize: 13, opacity: 0.8 }}>Akzent</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="color"
            value={settings.accent}
            onChange={(e) => setSettings((s) => ({ ...s, accent: e.target.value }))}
            style={{ width: 48, height: 36, border: "none", background: "transparent" }}
          />
          <div style={{ fontSize: 12, opacity: 0.7 }}>{settings.accent}</div>
        </div>

        <div style={{ gridColumn: "1 / -1", marginTop: 6, borderTop: `1px solid ${themeColors.border}`, paddingTop: 12 }}>
          Benachrichtigungen
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={settings.notifications_enabled}
            onChange={(e) => setSettings((s) => ({ ...s, notifications_enabled: e.target.checked }))}
          />
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

function GlobalStyle() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const style = document.createElement("style");
    style.innerHTML = `
      :root { --accent: #1626a2; }
      :root[data-theme="dark"] { background: #0b1220; color: #e5e7eb; }
      a { color: var(--accent); }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  return null;
}
