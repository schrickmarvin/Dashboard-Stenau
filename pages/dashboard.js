// pages/dashboard.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* =========================================================
   Next.js + Supabase (wichtig):
   - createClient NICHT auf Server/Build ausführen
   - Client nur im Browser erstellen (typeof window !== "undefined")
   ========================================================= */

function getSupabaseClient() {
  if (typeof window === "undefined") return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Wenn Env Vars fehlen, soll die Seite nicht crashen
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase ENV fehlt: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return null;
  }

  // Singleton in window halten, damit GoTrue nicht mehrfach initialisiert
  if (!window.__supabase__) {
    window.__supabase__ = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return window.__supabase__;
}

/* ---------------- Settings Defaults ---------------- */
const DEFAULT_SETTINGS = {
  theme_mode: "light", // light | dark | system (system optional)
  background: "standard", // standard | soft | grid | waves | clean | custom
  accent: "#1626a2",
  notifications_enabled: true,
  notifications_desktop: true,
  notifications_email: false,
  background_custom_url: "",
};

const STATUS_VALUES = ["todo", "done"]; // "doing" entfernt

const GUIDE_BUCKET = "guides"; // Supabase Storage bucket name

/* ---------------- Helpers ---------------- */
function safeJsonParse(s, fallback) {
  try {
    const p = JSON.parse(s);
    if (!p || typeof p !== "object") return fallback;
    return { ...fallback, ...p };
  } catch {
    return fallback;
  }
}

function fmtDateTimeLocal(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function fmtDateDE(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function isSameWeek(d, base = new Date()) {
  // ISO-ish week compare (good enough)
  const onejan = new Date(base.getFullYear(), 0, 1);
  const week = Math.ceil((((base - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  const onejan2 = new Date(d.getFullYear(), 0, 1);
  const week2 = Math.ceil((((d - onejan2) / 86400000) + onejan2.getDay() + 1) / 7);
  return d.getFullYear() === base.getFullYear() && week2 === week;
}

/* ---------------- UI style ---------------- */
const baseFont = {
  fontFamily:
    'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
};

function backgroundCSS(settings) {
  const mode = settings?.theme_mode || "light";
  const isDark = mode === "dark";
  const bg = settings?.background || "standard";

  const base = {
    backgroundColor: isDark ? "#0b1020" : "#f6f7fb",
    color: isDark ? "#eef2ff" : "#111827",
    minHeight: "100vh",
  };

  if (bg === "soft") {
    return {
      ...base,
      backgroundImage: isDark
        ? "radial-gradient(1200px 600px at 20% 10%, rgba(99,102,241,0.20), transparent 60%), radial-gradient(900px 500px at 70% 20%, rgba(34,197,94,0.10), transparent 55%)"
        : "radial-gradient(1200px 600px at 20% 10%, rgba(99,102,241,0.15), transparent 60%), radial-gradient(900px 500px at 70% 20%, rgba(34,197,94,0.10), transparent 55%)",
    };
  }

  if (bg === "grid") {
    return {
      ...base,
      backgroundImage: isDark
        ? "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)"
        : "linear-gradient(rgba(17,24,39,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(17,24,39,0.06) 1px, transparent 1px)",
      backgroundSize: "42px 42px",
    };
  }

  if (bg === "waves") {
    return {
      ...base,
      backgroundImage: isDark
        ? "radial-gradient(circle at 10% 10%, rgba(99,102,241,0.20), transparent 50%), radial-gradient(circle at 80% 20%, rgba(236,72,153,0.12), transparent 55%), radial-gradient(circle at 30% 90%, rgba(34,197,94,0.10), transparent 55%)"
        : "radial-gradient(circle at 10% 10%, rgba(99,102,241,0.12), transparent 50%), radial-gradient(circle at 80% 20%, rgba(236,72,153,0.10), transparent 55%), radial-gradient(circle at 30% 90%, rgba(34,197,94,0.10), transparent 55%)",
    };
  }

  if (bg === "clean") {
    return { ...base, backgroundColor: isDark ? "#0b1020" : "#ffffff" };
  }

  if (bg === "custom" && settings?.background_custom_url) {
    return {
      ...base,
      backgroundImage: `url(${settings.background_custom_url})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundAttachment: "fixed",
    };
  }

  return base;
}

function cardStyle(settings) {
  const mode = settings?.theme_mode || "light";
  const isDark = mode === "dark";
  return {
    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.85)",
    border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(15,23,42,0.10)",
    borderRadius: 18,
    boxShadow: isDark ? "0 8px 22px rgba(0,0,0,0.35)" : "0 8px 22px rgba(15,23,42,0.06)",
    backdropFilter: "blur(6px)",
  };
}

function pillStyle(settings, active) {
  const mode = settings?.theme_mode || "light";
  const isDark = mode === "dark";
  const accent = settings?.accent || "#1626a2";
  if (active) {
    return {
      borderRadius: 999,
      padding: "10px 16px",
      border: `1px solid ${accent}`,
      background: accent,
      color: "#fff",
      cursor: "pointer",
    };
  }
  return {
    borderRadius: 999,
    padding: "10px 16px",
    border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(15,23,42,0.10)",
    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.75)",
    color: isDark ? "#eef2ff" : "#0f172a",
    cursor: "pointer",
  };
}

function buttonStyle(settings, variant = "primary") {
  const mode = settings?.theme_mode || "light";
  const isDark = mode === "dark";
  const accent = settings?.accent || "#1626a2";
  if (variant === "primary") {
    return {
      borderRadius: 12,
      padding: "10px 14px",
      border: `1px solid ${accent}`,
      background: accent,
      color: "#fff",
      cursor: "pointer",
      fontWeight: 600,
    };
  }
  if (variant === "danger") {
    return {
      borderRadius: 12,
      padding: "10px 14px",
      border: "1px solid rgba(239,68,68,0.35)",
      background: "rgba(239,68,68,0.12)",
      color: isDark ? "#fecaca" : "#991b1b",
      cursor: "pointer",
      fontWeight: 600,
    };
  }
  return {
    borderRadius: 12,
    padding: "10px 14px",
    border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(15,23,42,0.10)",
    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.75)",
    color: isDark ? "#eef2ff" : "#0f172a",
    cursor: "pointer",
    fontWeight: 600,
  };
}

function inputStyle(settings) {
  const mode = settings?.theme_mode || "light";
  const isDark = mode === "dark";
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: isDark ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(15,23,42,0.12)",
    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.9)",
    color: isDark ? "#eef2ff" : "#0f172a",
    outline: "none",
  };
}

/* =========================================================
   Main Page
   ========================================================= */
export default function DashboardPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);

  // Auth
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Settings (nie null!)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // App
  const [activeTab, setActiveTab] = useState("board"); // board | list | calendar | timeline | areas | guide | settings
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Data
  const [areas, setAreas] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [calendarItems, setCalendarItems] = useState([]);

  // Filters
  const [areaFilter, setAreaFilter] = useState("");
  const [bucketFilter, setBucketFilter] = useState("Heute"); // Heute | Diese Woche | Jahr | Alle
  const [search, setSearch] = useState("");

  // Create task
  const [newTitle, setNewTitle] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [newDueAt, setNewDueAt] = useState(() => fmtDateTimeLocal(new Date()));
  const [newStatus, setNewStatus] = useState("todo");
  const [newDueBucket, setNewDueBucket] = useState("Heute");
  const [newPeriod, setNewPeriod] = useState("Heute"); // legacy display

  // Subtasks
  const [subtasks, setSubtasks] = useState([]);
  const [subtaskTaskId, setSubtaskTaskId] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");

  // Areas create
  const [newAreaName, setNewAreaName] = useState("");

  // Anleitung
  const [guides, setGuides] = useState([]);
  const [guideFiles, setGuideFiles] = useState([]);
  const [newGuideTitle, setNewGuideTitle] = useState("");
  const [newGuideBody, setNewGuideBody] = useState("");
  const [selectedGuideId, setSelectedGuideId] = useState("");
  const fileInputRef = useRef(null);

  /* ---------------- Auth bootstrap ---------------- */
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setAuthLoading(true);

      if (!supabase) {
        setAuthLoading(false);
        setErrorMsg("Supabase ENV fehlt (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;
      setUser(session?.user || null);
      setAuthLoading(false);

      // subscribe
      const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
        setUser(sess?.user || null);
      });

      return () => sub?.subscription?.unsubscribe?.();
    };

    const cleanupPromise = run();
    return () => {
      mounted = false;
      // cleanup handled by subscription unsubscribe
      void cleanupPromise;
    };
  }, [supabase]);

  /* ---------------- Load user settings ---------------- */
  useEffect(() => {
    if (!supabase || !user) return;

    const loadSettings = async () => {
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.warn("Settings load error:", error);
        setSettings(DEFAULT_SETTINGS);
        return;
      }

      if (!data) {
        setSettings(DEFAULT_SETTINGS);
        return;
      }

      // Merge (wichtig!)
      setSettings({ ...DEFAULT_SETTINGS, ...data });
    };

    loadSettings();
  }, [supabase, user]);

  /* ---------------- Save user settings ---------------- */
  const saveSettings = async (partial) => {
    if (!supabase || !user) return;

    const next = { ...settings, ...partial };
    setSettings(next);
    setSettingsSaving(true);
    setErrorMsg("");

    // Desktop Notification permission (optional)
    if (partial?.notifications_desktop && typeof window !== "undefined" && "Notification" in window) {
      try {
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
      } catch {
        // ignore
      }
    }

    const payload = { ...next, user_id: user.id };

    const { error } = await supabase.from("user_settings").upsert(payload, { onConflict: "user_id" });

    setSettingsSaving(false);
    if (error) {
      console.warn("Settings save error:", error);
      setErrorMsg(error.message || "Einstellungen konnten nicht gespeichert werden.");
    }
  };

  /* ---------------- Load core data ---------------- */
  const reloadAll = async () => {
    if (!supabase || !user) return;

    setLoading(true);
    setErrorMsg("");

    try {
      // Areas
      const { data: a, error: aErr } = await supabase
        .from("areas")
        .select("*")
        .order("name", { ascending: true });

      if (aErr) throw aErr;
      setAreas(a || []);

      // Tasks
      const { data: t, error: tErr } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false });

      if (tErr) throw tErr;
      setTasks(t || []);

      // Subtasks
      const { data: st, error: stErr } = await supabase
        .from("subtasks")
        .select("*")
        .order("created_at", { ascending: false });

      // subtasks table may not exist yet -> don't crash
      if (!stErr) setSubtasks(st || []);

      // Calendar source: prefer view v_tasks_calendar if exists; else tasks_calendar
      let calData = [];
      let calErr = null;

      const tryView = await supabase.from("v_tasks_calendar").select("*").order("due_at", { ascending: true });
      if (!tryView.error) {
        calData = tryView.data || [];
      } else {
        const tryTable = await supabase.from("tasks_calendar").select("*").order("due_at", { ascending: true });
        if (tryTable.error) calErr = tryTable.error;
        else calData = tryTable.data || [];
      }

      if (calErr) {
        // not fatal
        console.warn("Calendar load error:", calErr);
        setCalendarItems([]);
      } else {
        setCalendarItems(calData);
      }

      // Guides
      const { data: g, error: gErr } = await supabase
        .from("guides")
        .select("*")
        .order("created_at", { ascending: false });

      if (!gErr) setGuides(g || []);

      const { data: gf, error: gfErr } = await supabase
        .from("guide_files")
        .select("*")
        .order("created_at", { ascending: false });

      if (!gfErr) setGuideFiles(gf || []);
    } catch (e) {
      setErrorMsg(e?.message || "Fehler beim Laden.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, supabase]);

  /* ---------------- Auth actions ---------------- */
  const doLogin = async () => {
    if (!supabase) return;
    setErrorMsg("");
    setAuthLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setAuthLoading(false);
    if (error) setErrorMsg(error.message);
  };

  const doRegister = async () => {
    if (!supabase) return;
    setErrorMsg("");
    setAuthLoading(true);

    const { error } = await supabase.auth.signUp({ email, password });

    setAuthLoading(false);
    if (error) setErrorMsg(error.message);
  };

  const doLogout = async () => {
    if (!supabase) return;
    setErrorMsg("");
    await supabase.auth.signOut();
    setActiveTab("board");
  };

  /* ---------------- Data actions ---------------- */
  const createTask = async () => {
    if (!supabase || !user) return;
    setErrorMsg("");

    const title = (newTitle || "").trim();
    if (!title) return setErrorMsg("Bitte Titel eingeben.");

    if (!newAreaId) return setErrorMsg("Bitte Bereich wählen.");

    const dueAt = newDueAt ? new Date(newDueAt).toISOString() : null;

    // Status muss zu CHECK (todo|done) passen
    const status = STATUS_VALUES.includes(newStatus) ? newStatus : "todo";

    const payload = {
      title,
      area_id: newAreaId,
      status,
      due_at: dueAt,
      due_bucket: newDueBucket || newPeriod || "Heute",
      period: newPeriod || newDueBucket || "Heute",
      created_by: user.id,
    };

    const { error } = await supabase.from("tasks").insert(payload);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setNewTitle("");
    await reloadAll();
  };

  const updateTaskStatus = async (taskId, nextStatus) => {
    if (!supabase || !user) return;
    setErrorMsg("");

    const status = STATUS_VALUES.includes(nextStatus) ? nextStatus : "todo";

    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    await reloadAll();
  };

  const deleteTask = async (taskId) => {
    if (!supabase || !user) return;
    setErrorMsg("");

    // Delete subtasks first (if table exists)
    await supabase.from("subtasks").delete().eq("task_id", taskId);
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    await reloadAll();
  };

  const createSubtask = async () => {
    if (!supabase || !user) return;
    setErrorMsg("");

    const t = (subtaskTitle || "").trim();
    if (!t) return setErrorMsg("Bitte Unteraufgabe eingeben.");
    if (!subtaskTaskId) return setErrorMsg("Bitte Hauptaufgabe wählen.");

    const payload = { task_id: subtaskTaskId, title: t, created_by: user.id };

    const { error } = await supabase.from("subtasks").insert(payload);
    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setSubtaskTitle("");
    await reloadAll();
  };

  const createArea = async () => {
    if (!supabase || !user) return;
    setErrorMsg("");

    const name = (newAreaName || "").trim();
    if (!name) return setErrorMsg("Bitte Bereichname eingeben.");

    const { error } = await supabase.from("areas").insert({ name });

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setNewAreaName("");
    await reloadAll();
  };

  const deleteArea = async (areaId) => {
    if (!supabase || !user) return;
    setErrorMsg("");

    const { error } = await supabase.from("areas").delete().eq("id", areaId);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    await reloadAll();
  };

  /* ---------------- Guide actions ---------------- */
  const createGuide = async () => {
    if (!supabase || !user) return;
    setErrorMsg("");

    const title = (newGuideTitle || "").trim();
    if (!title) return setErrorMsg("Bitte Titel für Anleitung eingeben.");

    const body = (newGuideBody || "").trim();

    const { data, error } = await supabase
      .from("guides")
      .insert({ title, body, created_by: user.id })
      .select("*")
      .single();

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setNewGuideTitle("");
    setNewGuideBody("");
    setSelectedGuideId(data?.id || "");
    await reloadAll();
  };

  const uploadGuideFile = async (file) => {
    if (!supabase || !user) return;
    setErrorMsg("");

    if (!selectedGuideId) return setErrorMsg("Bitte zuerst eine Anleitung auswählen oder erstellen.");

    const safeName = file.name.replace(/[^\w.\-()+ ]+/g, "_");
    const path = `${user.id}/${selectedGuideId}/${Date.now()}-${safeName}`;

    const { error: upErr } = await supabase.storage.from(GUIDE_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (upErr) {
      setErrorMsg(upErr.message);
      return;
    }

    // public url (bucket can be private too; then you'd use signed urls later)
    const { data: pub } = supabase.storage.from(GUIDE_BUCKET).getPublicUrl(path);

    const { error: metaErr } = await supabase.from("guide_files").insert({
      guide_id: selectedGuideId,
      file_name: file.name,
      file_path: path,
      public_url: pub?.publicUrl || null,
      created_by: user.id,
    });

    if (metaErr) {
      setErrorMsg(metaErr.message);
      return;
    }

    await reloadAll();
  };

  const guideFilesForSelected = useMemo(() => {
    if (!selectedGuideId) return [];
    return (guideFiles || []).filter((f) => f.guide_id === selectedGuideId);
  }, [guideFiles, selectedGuideId]);

  /* ---------------- Derived lists ---------------- */
  const areaNameById = useMemo(() => {
    const m = new Map();
    (areas || []).forEach((a) => m.set(a.id, a.name));
    return m;
  }, [areas]);

  const filteredTasks = useMemo(() => {
    let list = [...(tasks || [])];

    if (areaFilter) list = list.filter((t) => t.area_id === areaFilter);
    if (bucketFilter && bucketFilter !== "Alle") list = list.filter((t) => (t.due_bucket || t.period) === bucketFilter);

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((t) => (t.title || "").toLowerCase().includes(s));
    }

    return list;
  }, [tasks, areaFilter, bucketFilter, search]);

  const boardTodo = useMemo(() => filteredTasks.filter((t) => t.status === "todo"), [filteredTasks]);
  const boardDone = useMemo(() => filteredTasks.filter((t) => t.status === "done"), [filteredTasks]);

  const stats = useMemo(() => {
    const now = new Date();
    const t0 = startOfToday();
    const t1 = endOfToday();

    const today = (tasks || []).filter((t) => {
      if (!t.due_at) return false;
      const d = new Date(t.due_at);
      return d >= t0 && d <= t1;
    });

    const week = (tasks || []).filter((t) => {
      if (!t.due_at) return false;
      const d = new Date(t.due_at);
      return isSameWeek(d, now);
    });

    const open = (tasks || []).filter((t) => t.status === "todo");
    return { today: today.length, week: week.length, open: open.length };
  }, [tasks]);

  const calendarGrouped = useMemo(() => {
    // group by date (DD.MM.YYYY)
    const items = [...(calendarItems || [])];

    // apply filters
    const filtered = items.filter((it) => {
      if (areaFilter && it.area_id !== areaFilter) return false;
      if (bucketFilter && bucketFilter !== "Alle" && (it.due_bucket || it.period) !== bucketFilter) return false;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        if (!String(it.title || "").toLowerCase().includes(s)) return false;
      }
      return true;
    });

    const groups = new Map();
    filtered.forEach((it) => {
      const key = it.due_at ? fmtDateDE(it.due_at).split(",")[0] : "Ohne Datum";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    });

    // sort groups by date if possible
    const entries = Array.from(groups.entries()).map(([k, v]) => ({ dateLabel: k, items: v }));
    return entries;
  }, [calendarItems, areaFilter, bucketFilter, search]);

  const timelineItems = useMemo(() => {
    // minimal: sort by due_at asc, show filtered tasks
    const list = [...filteredTasks];
    list.sort((a, b) => {
      const da = a.due_at ? new Date(a.due_at).getTime() : 0;
      const db = b.due_at ? new Date(b.due_at).getTime() : 0;
      return da - db;
    });
    return list.slice(0, 40);
  }, [filteredTasks]);

  /* ---------------- Notification (optional, minimal) ---------------- */
  useEffect(() => {
    if (!settings?.notifications_enabled) return;
    if (!settings?.notifications_desktop) return;
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;

    // Example: notify once when there are overdue todos (very minimal)
    const overdue = (tasks || []).some((t) => t.status === "todo" && t.due_at && new Date(t.due_at) < new Date());
    if (!overdue) return;

    // avoid spamming
    const key = "dash_notified_overdue_v1";
    const already = localStorage.getItem(key);
    if (already === "1") return;

    if (Notification.permission === "granted") {
      try {
        // eslint-disable-next-line no-new
        new Notification("Armaturenbrett", { body: "Es gibt überfällige Aufgaben." });
        localStorage.setItem(key, "1");
      } catch {
        // ignore
      }
    }
  }, [settings, tasks]);

  /* =========================================================
     UI: Auth screen
     ========================================================= */
  if (!supabase) {
    return (
      <div style={{ ...baseFont, padding: 24 }}>
        <div style={{ maxWidth: 720 }}>
          <h2>Konfiguration fehlt</h2>
          <p>
            Bitte in Vercel (Project Settings → Environment Variables) setzen:
            <br />
            NEXT_PUBLIC_SUPABASE_URL
            <br />
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </p>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div style={{ ...backgroundCSS(settings), ...baseFont, padding: 24 }}>
        <div style={{ maxWidth: 520, margin: "0 auto", paddingTop: 80 }}>
          <div style={{ ...cardStyle(settings), padding: 22 }}>Lade…</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ ...backgroundCSS(settings), ...baseFont, padding: 24 }}>
        <div style={{ maxWidth: 560, margin: "0 auto", paddingTop: 80 }}>
          <div style={{ ...cardStyle(settings), padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontSize: 22, marginBottom: 6 }}>Anmeldung</div>
                <div style={{ opacity: 0.75, fontSize: 13 }}>Armaturenbrett</div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Design ist bereits wählbar</div>
            </div>

            {errorMsg ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(239,68,68,0.35)",
                  background: "rgba(239,68,68,0.12)",
                  color: settings?.theme_mode === "dark" ? "#fecaca" : "#991b1b",
                }}
              >
                {errorMsg}
              </div>
            ) : null}

            <div style={{ marginTop: 14 }}>
              <div style={{ display: "grid", gap: 10 }}>
                <input
                  style={inputStyle(settings)}
                  placeholder="E-Mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
                <input
                  style={inputStyle(settings)}
                  placeholder="Passwort"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                />
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {authMode === "login" ? (
                  <>
                    <button style={buttonStyle(settings, "primary")} onClick={doLogin}>
                      Anmelden
                    </button>
                    <button style={buttonStyle(settings, "secondary")} onClick={() => setAuthMode("register")}>
                      Neues Konto erstellen
                    </button>
                  </>
                ) : (
                  <>
                    <button style={buttonStyle(settings, "primary")} onClick={doRegister}>
                      Registrieren
                    </button>
                    <button style={buttonStyle(settings, "secondary")} onClick={() => setAuthMode("login")}>
                      Zurück zur Anmeldung
                    </button>
                  </>
                )}
              </div>

              <div style={{ marginTop: 18, borderTop: "1px solid rgba(15,23,42,0.10)", paddingTop: 14 }}>
                <div style={{ fontSize: 14, marginBottom: 10 }}>Design</div>

                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10, alignItems: "center" }}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Theme</div>
                    <select
                      style={inputStyle(settings)}
                      value={settings.theme_mode}
                      onChange={(e) => saveSettings({ theme_mode: e.target.value })}
                    >
                      <option value="light">Hell</option>
                      <option value="dark">Dunkel</option>
                    </select>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10, alignItems: "center" }}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Hintergrund</div>
                    <select
                      style={inputStyle(settings)}
                      value={settings.background}
                      onChange={(e) => saveSettings({ background: e.target.value })}
                    >
                      <option value="standard">Standard</option>
                      <option value="soft">Soft</option>
                      <option value="grid">Grid</option>
                      <option value="waves">Waves</option>
                      <option value="clean">Clean</option>
                      <option value="custom">Eigenes Bild (URL)</option>
                    </select>
                  </div>

                  {settings.background === "custom" ? (
                    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10, alignItems: "center" }}>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>Bild-URL</div>
                      <input
                        style={inputStyle(settings)}
                        placeholder="https://…"
                        value={settings.background_custom_url || ""}
                        onChange={(e) => saveSettings({ background_custom_url: e.target.value })}
                      />
                    </div>
                  ) : null}

                  <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10, alignItems: "center" }}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Akzent</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input
                        type="color"
                        value={settings.accent}
                        onChange={(e) => saveSettings({ accent: e.target.value })}
                        style={{ width: 52, height: 34, border: "none", background: "transparent" }}
                      />
                      <div style={{ fontSize: 12, opacity: 0.75 }}>{settings.accent}</div>
                    </div>
                  </div>

                  {settingsSaving ? <div style={{ fontSize: 12, opacity: 0.7 }}>Speichere…</div> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* =========================================================
     UI: App
     ========================================================= */
  return (
    <div style={{ ...backgroundCSS(settings), ...baseFont }}>
      {/* Header */}
      <div
        style={{
          padding: "22px 24px",
          borderBottom:
            settings?.theme_mode === "dark"
              ? "1px solid rgba(255,255,255,0.10)"
              : "1px solid rgba(15,23,42,0.10)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 28 }}>Armaturenbrett</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Angemeldet als: {user.email}
            <br />
            Aktuell: {fmtDateDE(new Date().toISOString())}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={buttonStyle(settings, "secondary")} onClick={reloadAll} disabled={loading}>
            Neu laden
          </button>
          <button style={buttonStyle(settings, "secondary")} onClick={doLogout}>
            Abmelden
          </button>
        </div>
      </div>

      {/* Layout */}
      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "320px 1fr", gap: 18, alignItems: "start" }}>
        {/* Left column */}
        <div style={{ display: "grid", gap: 16 }}>
          {/* Übersicht */}
          <div style={{ ...cardStyle(settings), padding: 16 }}>
            <div style={{ fontSize: 16, marginBottom: 10 }}>Übersicht</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ ...cardStyle(settings), padding: 12, background: "transparent", boxShadow: "none" }}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Aufgaben heute</div>
                <div style={{ fontSize: 26 }}>{stats.today}</div>
              </div>
              <div style={{ ...cardStyle(settings), padding: 12, background: "transparent", boxShadow: "none" }}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Diese Woche</div>
                <div style={{ fontSize: 26 }}>{stats.week}</div>
              </div>
              <div style={{ ...cardStyle(settings), padding: 12, background: "transparent", boxShadow: "none" }}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Offen</div>
                <div style={{ fontSize: 26 }}>{stats.open}</div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div style={{ ...cardStyle(settings), padding: 16 }}>
            <div style={{ fontSize: 16, marginBottom: 10 }}>Navigation</div>
            <div style={{ display: "grid", gap: 8 }}>
              <button style={buttonStyle(settings, activeTab === "board" ? "primary" : "secondary")} onClick={() => setActiveTab("board")}>
                Board
              </button>
              <button style={buttonStyle(settings, activeTab === "list" ? "primary" : "secondary")} onClick={() => setActiveTab("list")}>
                Liste
              </button>
              <button style={buttonStyle(settings, activeTab === "calendar" ? "primary" : "secondary")} onClick={() => setActiveTab("calendar")}>
                Kalender
              </button>
              <button style={buttonStyle(settings, activeTab === "timeline" ? "primary" : "secondary")} onClick={() => setActiveTab("timeline")}>
                Timeline
              </button>
              <button style={buttonStyle(settings, activeTab === "areas" ? "primary" : "secondary")} onClick={() => setActiveTab("areas")}>
                Bereiche
              </button>
              <button style={buttonStyle(settings, activeTab === "guide" ? "primary" : "secondary")} onClick={() => setActiveTab("guide")}>
                Anleitung
              </button>
              <button style={buttonStyle(settings, activeTab === "settings" ? "primary" : "secondary")} onClick={() => setActiveTab("settings")}>
                Einstellungen
              </button>
            </div>
          </div>

          {/* Filter */}
          <div style={{ ...cardStyle(settings), padding: 16 }}>
            <div style={{ fontSize: 16, marginBottom: 10 }}>Filter</div>
            <div style={{ display: "grid", gap: 10 }}>
              <select style={inputStyle(settings)} value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
                <option value="">Alle Bereiche</option>
                {(areas || []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>

              <select style={inputStyle(settings)} value={bucketFilter} onChange={(e) => setBucketFilter(e.target.value)}>
                <option value="Alle">Alle Zeiträume</option>
                <option value="Heute">Heute</option>
                <option value="Diese Woche">Diese Woche</option>
                <option value="Jahr">Jahr</option>
                <option value="Serie">Serie</option>
              </select>

              <input style={inputStyle(settings)} placeholder="Suche…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "grid", gap: 16 }}>
          {/* Top Tabs row (visual) */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={pillStyle(settings, activeTab === "board")} onClick={() => setActiveTab("board")}>
              Board
            </button>
            <button style={pillStyle(settings, activeTab === "list")} onClick={() => setActiveTab("list")}>
              Liste
            </button>
            <button style={pillStyle(settings, activeTab === "calendar")} onClick={() => setActiveTab("calendar")}>
              Kalender
            </button>
            <button style={pillStyle(settings, activeTab === "timeline")} onClick={() => setActiveTab("timeline")}>
              Timeline
            </button>
            <button style={pillStyle(settings, activeTab === "areas")} onClick={() => setActiveTab("areas")}>
              Bereiche
            </button>
            <button style={pillStyle(settings, activeTab === "guide")} onClick={() => setActiveTab("guide")}>
              Anleitung
            </button>
            <button style={pillStyle(settings, activeTab === "settings")} onClick={() => setActiveTab("settings")}>
              Einstellungen
            </button>
          </div>

          {/* Error banner */}
          {errorMsg ? (
            <div
              style={{
                ...cardStyle(settings),
                padding: 14,
                border: "1px solid rgba(239,68,68,0.35)",
                background: settings?.theme_mode === "dark" ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.10)",
                color: settings?.theme_mode === "dark" ? "#fecaca" : "#991b1b",
              }}
            >
              {errorMsg}
            </div>
          ) : null}

          {/* Create Task */}
          <div style={{ ...cardStyle(settings), padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontSize: 16 }}>Aufgabe anlegen</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Kalender nutzt due_at, due_bucket ist Filter.</div>
            </div>

            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "1.4fr 0.9fr 1fr 0.7fr 0.8fr 120px",
                gap: 10,
                alignItems: "center",
              }}
            >
              <input style={inputStyle(settings)} placeholder="Titel" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />

              <select style={inputStyle(settings)} value={newAreaId} onChange={(e) => setNewAreaId(e.target.value)}>
                <option value="">Bereich</option>
                {(areas || []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>

              <input
                style={inputStyle(settings)}
                type="datetime-local"
                value={newDueAt}
                onChange={(e) => setNewDueAt(e.target.value)}
              />

              <select style={inputStyle(settings)} value={newDueBucket} onChange={(e) => setNewDueBucket(e.target.value)}>
                <option value="Heute">Heute</option>
                <option value="Diese Woche">Diese Woche</option>
                <option value="Jahr">Jahr</option>
                <option value="Serie">Serie</option>
              </select>

              <select style={inputStyle(settings)} value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                <option value="todo">Zu erledigen</option>
                <option value="done">Erledigt</option>
              </select>

              <button style={buttonStyle(settings, "primary")} onClick={createTask}>
                Anlegen
              </button>
            </div>
          </div>

          {/* Main content */}
          {activeTab === "board" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ ...cardStyle(settings), padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: 16 }}>Zu erledigen</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{boardTodo.length}</div>
                </div>
                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  {boardTodo.length === 0 ? <div style={{ opacity: 0.7 }}>Keine Aufgaben</div> : null}
                  {boardTodo.map((t) => (
                    <TaskCard
                      key={t.id}
                      t={t}
                      areaName={areaNameById.get(t.area_id) || "—"}
                      settings={settings}
                      onStatus={(s) => updateTaskStatus(t.id, s)}
                      onDelete={() => deleteTask(t.id)}
                      compact
                    />
                  ))}
                </div>
              </div>

              <div style={{ ...cardStyle(settings), padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: 16 }}>Erledigt</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{boardDone.length}</div>
                </div>
                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  {boardDone.length === 0 ? <div style={{ opacity: 0.7 }}>Keine Aufgaben</div> : null}
                  {boardDone.map((t) => (
                    <TaskCard
                      key={t.id}
                      t={t}
                      areaName={areaNameById.get(t.area_id) || "—"}
                      settings={settings}
                      onStatus={(s) => updateTaskStatus(t.id, s)}
                      onDelete={() => deleteTask(t.id)}
                      compact
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "list" ? (
            <div style={{ ...cardStyle(settings), padding: 16 }}>
              <div style={{ fontSize: 16, marginBottom: 10 }}>Liste</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 10px" }}>
                  <thead>
                    <tr style={{ textAlign: "left", fontSize: 12, opacity: 0.75 }}>
                      <th style={{ padding: "0 10px" }}>Aufgabe</th>
                      <th style={{ padding: "0 10px" }}>Bereich</th>
                      <th style={{ padding: "0 10px" }}>Datum/Uhrzeit</th>
                      <th style={{ padding: "0 10px" }}>Zeitraum</th>
                      <th style={{ padding: "0 10px" }}>Status</th>
                      <th style={{ padding: "0 10px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTasks.map((t) => (
                      <tr key={t.id} style={{ ...cardStyle(settings) }}>
                        <td style={{ padding: "12px 10px" }}>{t.title}</td>
                        <td style={{ padding: "12px 10px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 999,
                                background: settings.accent,
                                opacity: 0.45,
                              }}
                            />
                            {areaNameById.get(t.area_id) || "—"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 10px" }}>{fmtDateDE(t.due_at)}</td>
                        <td style={{ padding: "12px 10px" }}>{t.due_bucket || t.period || "—"}</td>
                        <td style={{ padding: "12px 10px" }}>
                          <select
                            style={{ ...inputStyle(settings), maxWidth: 160 }}
                            value={t.status || "todo"}
                            onChange={(e) => updateTaskStatus(t.id, e.target.value)}
                          >
                            <option value="todo">Zu erledigen</option>
                            <option value="done">Erledigt</option>
                          </select>
                        </td>
                        <td style={{ padding: "12px 10px" }}>
                          <button style={buttonStyle(settings, "secondary")} onClick={() => deleteTask(t.id)}>
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredTasks.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 12, opacity: 0.7 }}>
                          Keine Aufgaben
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {activeTab === "calendar" ? (
            <div style={{ ...cardStyle(settings), padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontSize: 16 }}>Kalender</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  Quelle: v_tasks_calendar oder tasks_calendar
                </div>
              </div>

              {calendarGrouped.length === 0 ? (
                <div style={{ marginTop: 10, opacity: 0.7 }}>Keine Kalender-Einträge (Tabelle/View ist leer).</div>
              ) : (
                <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                  {calendarGrouped.map((g) => (
                    <div key={g.dateLabel} style={{ ...cardStyle(settings), padding: 14, background: "transparent", boxShadow: "none" }}>
                      <div style={{ fontSize: 14, marginBottom: 8 }}>{g.dateLabel}</div>
                      <div style={{ display: "grid", gap: 10 }}>
                        {g.items.map((it) => (
                          <div
                            key={it.cal_id || it.id}
                            style={{
                              ...cardStyle(settings),
                              padding: 12,
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span
                                  style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 999,
                                    background: settings.accent,
                                    opacity: 0.9,
                                  }}
                                />
                                <div style={{ fontSize: 14 }}>{it.title || "—"}</div>
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>
                                {(areaNameById.get(it.area_id) || "—") + " · " + (it.status || "todo") + " · " + (it.due_bucket || it.period || "—")}
                              </div>
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>{fmtDateDE(it.due_at)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "timeline" ? (
            <div style={{ ...cardStyle(settings), padding: 16 }}>
              <div style={{ fontSize: 16, marginBottom: 10 }}>Timeline (minimal)</div>
              <div style={{ display: "grid", gap: 10 }}>
                {timelineItems.length === 0 ? <div style={{ opacity: 0.7 }}>Keine Aufgaben</div> : null}
                {timelineItems.map((t) => (
                  <div key={t.id} style={{ ...cardStyle(settings), padding: 12, display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 14 }}>{t.title}</div>
                      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>
                        {areaNameById.get(t.area_id) || "—"} · {t.status || "todo"} · {t.due_bucket || t.period || "—"}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{fmtDateDE(t.due_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === "areas" ? (
            <div style={{ ...cardStyle(settings), padding: 16 }}>
              <div style={{ fontSize: 16, marginBottom: 10 }}>Bereiche</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10 }}>
                <input
                  style={inputStyle(settings)}
                  placeholder="Neuer Bereichname…"
                  value={newAreaName}
                  onChange={(e) => setNewAreaName(e.target.value)}
                />
                <button style={buttonStyle(settings, "primary")} onClick={createArea}>
                  Anlegen
                </button>
              </div>

              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                {(areas || []).map((a) => (
                  <div
                    key={a.id}
                    style={{ ...cardStyle(settings), padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: settings.accent, opacity: 0.5 }} />
                      <div>{a.name}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={buttonStyle(settings, "danger")} onClick={() => deleteArea(a.id)}>
                        Löschen
                      </button>
                    </div>
                  </div>
                ))}
                {(areas || []).length === 0 ? <div style={{ opacity: 0.7 }}>Keine Bereiche</div> : null}
              </div>
            </div>
          ) : null}

          {activeTab === "settings" ? (
            <div style={{ ...cardStyle(settings), padding: 16 }}>
              <div style={{ fontSize: 16, marginBottom: 10 }}>Einstellungen</div>

              <div style={{ display: "grid", gap: 12, maxWidth: 720 }}>
                <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Theme</div>
                  <select
                    style={inputStyle(settings)}
                    value={settings.theme_mode}
                    onChange={(e) => saveSettings({ theme_mode: e.target.value })}
                  >
                    <option value="light">Hell</option>
                    <option value="dark">Dunkel</option>
                  </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Hintergrund</div>
                  <select
                    style={inputStyle(settings)}
                    value={settings.background}
                    onChange={(e) => saveSettings({ background: e.target.value })}
                  >
                    <option value="standard">Standard</option>
                    <option value="soft">Soft</option>
                    <option value="grid">Grid</option>
                    <option value="waves">Waves</option>
                    <option value="clean">Clean</option>
                    <option value="custom">Eigenes Bild (URL)</option>
                  </select>
                </div>

                {settings.background === "custom" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, alignItems: "center" }}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Bild-URL</div>
                    <input
                      style={inputStyle(settings)}
                      placeholder="https://…"
                      value={settings.background_custom_url || ""}
                      onChange={(e) => saveSettings({ background_custom_url: e.target.value })}
                    />
                  </div>
                ) : null}

                <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Akzent</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="color"
                      value={settings.accent}
                      onChange={(e) => saveSettings({ accent: e.target.value })}
                      style={{ width: 56, height: 36, border: "none", background: "transparent" }}
                    />
                    <div style={{ fontSize: 12, opacity: 0.75 }}>{settings.accent}</div>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid rgba(15,23,42,0.10)", paddingTop: 12 }}>
                  <div style={{ fontSize: 14, marginBottom: 8 }}>Benachrichtigungen</div>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <input
                      type="checkbox"
                      checked={!!settings.notifications_enabled}
                      onChange={(e) => saveSettings({ notifications_enabled: e.target.checked })}
                    />
                    Aktiviert
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <input
                      type="checkbox"
                      checked={!!settings.notifications_desktop}
                      onChange={(e) => saveSettings({ notifications_desktop: e.target.checked })}
                    />
                    Desktop
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={!!settings.notifications_email}
                      onChange={(e) => saveSettings({ notifications_email: e.target.checked })}
                    />
                    E-Mail
                  </label>
                </div>

                {settingsSaving ? <div style={{ fontSize: 12, opacity: 0.7 }}>Speichere…</div> : null}
              </div>
            </div>
          ) : null}

          {activeTab === "guide" ? (
            <div style={{ ...cardStyle(settings), padding: 16 }}>
              <div style={{ fontSize: 16, marginBottom: 10 }}>Anleitung</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {/* Left: create/select */}
                <div style={{ ...cardStyle(settings), padding: 14, background: "transparent", boxShadow: "none" }}>
                  <div style={{ fontSize: 14, marginBottom: 10 }}>Anleitung anlegen</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    <input
                      style={inputStyle(settings)}
                      placeholder="Titel (z. B. Twence anmelden)"
                      value={newGuideTitle}
                      onChange={(e) => setNewGuideTitle(e.target.value)}
                    />
                    <textarea
                      style={{ ...inputStyle(settings), minHeight: 110, resize: "vertical" }}
                      placeholder="Inhalt / Hinweis / Ansprechpartner / Link…"
                      value={newGuideBody}
                      onChange={(e) => setNewGuideBody(e.target.value)}
                    />
                    <button style={buttonStyle(settings, "primary")} onClick={createGuide}>
                      Anleitung speichern
                    </button>
                  </div>

                  <div style={{ marginTop: 14, fontSize: 14, marginBottom: 8 }}>Vorhandene Anleitungen</div>
                  <select style={inputStyle(settings)} value={selectedGuideId} onChange={(e) => setSelectedGuideId(e.target.value)}>
                    <option value="">— auswählen —</option>
                    {(guides || []).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>

                  <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
                    Zielbild: Hauptaufgabe → Unteraufgabe → Verweis zur Anleitung.
                    <br />
                    Die Verknüpfung bauen wir als nächstes (guide_id an Task/Subtask).
                  </div>
                </div>

                {/* Right: details + upload */}
                <div style={{ ...cardStyle(settings), padding: 14, background: "transparent", boxShadow: "none" }}>
                  <div style={{ fontSize: 14, marginBottom: 10 }}>Dateien hochladen</div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadGuideFile(f);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }} />
                    <button
                      style={buttonStyle(settings, "primary")}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!selectedGuideId}
                    >
                      Datei auswählen
                    </button>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      Bucket: {GUIDE_BUCKET}
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 14, marginBottom: 8 }}>Dateien zur ausgewählten Anleitung</div>
                    {selectedGuideId ? (
                      guideFilesForSelected.length === 0 ? (
                        <div style={{ opacity: 0.7 }}>Noch keine Dateien</div>
                      ) : (
                        <div style={{ display: "grid", gap: 10 }}>
                          {guideFilesForSelected.map((f) => (
                            <div key={f.id} style={{ ...cardStyle(settings), padding: 12, display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <div>
                                <div style={{ fontSize: 13 }}>{f.file_name}</div>
                                <div style={{ fontSize: 12, opacity: 0.75 }}>{fmtDateDE(f.created_at)}</div>
                              </div>
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                {f.public_url ? (
                                  <a
                                    href={f.public_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      ...buttonStyle(settings, "secondary"),
                                      textDecoration: "none",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    Öffnen
                                  </a>
                                ) : (
                                  <div style={{ fontSize: 12, opacity: 0.7 }}>private</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    ) : (
                      <div style={{ opacity: 0.7 }}>Bitte Anleitung auswählen.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Subtask creation (kept) */}
              <div style={{ marginTop: 14, ...cardStyle(settings), padding: 16 }}>
                <div style={{ fontSize: 14, marginBottom: 10 }}>Unteraufgabe anlegen</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 120px", gap: 10 }}>
                  <select style={inputStyle(settings)} value={subtaskTaskId} onChange={(e) => setSubtaskTaskId(e.target.value)}>
                    <option value="">Hauptaufgabe wählen…</option>
                    {(tasks || []).slice(0, 200).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                  <input
                    style={inputStyle(settings)}
                    placeholder="Unteraufgabe…"
                    value={subtaskTitle}
                    onChange={(e) => setSubtaskTitle(e.target.value)}
                  />
                  <button style={buttonStyle(settings, "primary")} onClick={createSubtask}>
                    Anlegen
                  </button>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                  Verknüpfung Unteraufgabe → Anleitung: kommt als nächstes (guide_id Feld).
                </div>
              </div>
            </div>
          ) : null}

          {/* Loading hint */}
          {loading ? <div style={{ fontSize: 12, opacity: 0.7 }}>Lade…</div> : null}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Components
   ========================================================= */
function TaskCard({ t, areaName, settings, onStatus, onDelete, compact }) {
  const isDark = settings?.theme_mode === "dark";
  return (
    <div
      style={{
        ...cardStyle(settings),
        padding: 12,
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 10,
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontSize: 14, marginBottom: 4 }}>{t.title}</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          {areaName} · {t.due_bucket || t.period || "—"} · {fmtDateDE(t.due_at)}
        </div>
        {!compact ? (
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
            Status: {t.status || "todo"}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          value={t.status || "todo"}
          onChange={(e) => onStatus?.(e.target.value)}
          style={{
            padding: "8px 10px",
            borderRadius: 12,
            border: isDark ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(15,23,42,0.12)",
            background: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.9)",
            color: isDark ? "#eef2ff" : "#0f172a",
          }}
        >
          <option value="todo">Zu erledigen</option>
          <option value="done">Erledigt</option>
        </select>

        <button
          onClick={onDelete}
          style={{
            borderRadius: 12,
            padding: "8px 10px",
            border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(15,23,42,0.10)",
            background: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.75)",
            color: isDark ? "#eef2ff" : "#0f172a",
            cursor: "pointer",
          }}
          title="Löschen"
        >
          ×
        </button>
      </div>
    </div>
  );
}
