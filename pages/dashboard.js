
/**
 * pages/dashboard.js
 * Stenau Dashboard – Single-file page (Next.js pages router)
 *
 * Ziel: Stabil laufende Gesamt-Datei mit:
 * - Plan: Aufgaben + Unteraufgaben + Serienaufgaben + Guide-Einsicht + Farben + Löschen
 * - Kanboard: Status/Personen-Ansichten inkl. Filter Bereich/Nutzer
 * - Kalender: Monats-/Wochenansicht inkl. Filter Bereich/Nutzer
 * - Anleitungen: Liste + Upload (Supabase Storage) + Bereich-Zuordnung + Datei-Übersicht
 * - Nutzer: Profile verwalten (Name/Role/Bereich) + Profil anlegen/ändern + Bereiche + Farben
 * - Einstellungen: User-Theme (Fallback, wenn Tabelle fehlt)
 *
 * Backend-Schema kann variieren -> robust:
 * - select('*') um fehlende Spalten wie tasks.description zu vermeiden
 * - Subtask done fallback (is_done/done/completed/status)
 */

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const APP_VERSION = "v2026.02.18";


// --- Grid/Layout (Drag & Resize) ---
// Requires: npm i react-grid-layout react-resizable
const ReactGridLayout = dynamic(
  async () => {
    const rgl = await import("react-grid-layout");
    const { Responsive, WidthProvider } = rgl;
    return WidthProvider(Responsive);
  },
  { ssr: false }
);

const DEFAULT_PLAN_LAYOUTS = {
  lg: [
    { i: "create", x: 0, y: 0, w: 5, h: 14, minW: 4, minH: 10 },
    { i: "tasks", x: 5, y: 0, w: 7, h: 18, minW: 6, minH: 12 },
    { i: "series", x: 0, y: 14, w: 5, h: 10, minW: 4, minH: 8 },
  ],
  md: [
    { i: "create", x: 0, y: 0, w: 5, h: 14, minW: 4, minH: 10 },
    { i: "tasks", x: 5, y: 0, w: 5, h: 18, minW: 5, minH: 12 },
    { i: "series", x: 0, y: 14, w: 5, h: 10, minW: 4, minH: 8 },
  ],
  sm: [
    { i: "create", x: 0, y: 0, w: 6, h: 14, minH: 10 },
    { i: "tasks", x: 0, y: 14, w: 6, h: 18, minH: 12 },
    { i: "series", x: 0, y: 32, w: 6, h: 10, minH: 8 },
  ],
  xs: [
    { i: "create", x: 0, y: 0, w: 4, h: 14, minH: 10 },
    { i: "tasks", x: 0, y: 14, w: 4, h: 18, minH: 12 },
    { i: "series", x: 0, y: 32, w: 4, h: 10, minH: 8 },
  ],
  xxs: [
    { i: "create", x: 0, y: 0, w: 2, h: 14, minH: 10 },
    { i: "tasks", x: 0, y: 14, w: 2, h: 18, minH: 12 },
    { i: "series", x: 0, y: 32, w: 2, h: 10, minH: 8 },
  ],
};
/* ---------------- Helpers ---------------- */

function fmtDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("de-DE");
}
function fmtDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function safeLower(s) {
  return String(s || "").toLowerCase();
}
function uuidv4() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const rnd = () =>
    Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, "0");
  return `${rnd().slice(0, 8)}-${rnd().slice(0, 4)}-4${rnd().slice(
    1,
    4
  )}-a${rnd().slice(1, 4)}-${rnd()}`;
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function addMonths(d, months) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}
function isSameDay(a, b) {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/**
 * Subtask done-field fallback:
 * supports: is_done | done | completed | status ("done")
 */
function getSubDone(sub) {
  if (!sub) return false;
  if (typeof sub.is_done === "boolean") return sub.is_done;
  if (typeof sub.done === "boolean") return sub.done;
  if (typeof sub.completed === "boolean") return sub.completed;
  if (typeof sub.status === "string") return safeLower(sub.status) === "done";
  return false;
}
function setSubDonePatch(sub, next) {
  if (!sub) return { field: "is_done", value: !!next };
  if ("is_done" in sub) return { field: "is_done", value: !!next };
  if ("done" in sub) return { field: "done", value: !!next };
  if ("completed" in sub) return { field: "completed", value: !!next };
  if ("status" in sub) return { field: "status", value: next ? "done" : "todo" };
  return { field: "is_done", value: !!next };
}

/* ---------------- Styles ---------------- */

const styles = {
  // Hintergrund kommt vom <body> (user_settings: background_color / background_image_url).
  // -> Page transparent lassen, sonst überdeckt sie das Background-Image.
  page: { minHeight: "100vh", background: "transparent" },
  wrap: { maxWidth: 1180, margin: "0 auto", padding: "18px 14px 80px" },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#fff",
    border: "1px solid #e6e9f0",
    borderRadius: 12,
    padding: "12px 14px",
  },
  brand: { fontSize: 20, fontWeight: 700 },
  small: { fontSize: 12, color: "#666" },
  tabs: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 },
  tab: (active) => ({
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: active ? "var(--stenau-primary, #0b6b2a)" : "#fff",
    color: active ? "#fff" : "#111",
    cursor: "pointer",
    fontSize: 13,
  }),
  btn: {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #d0d7e2",
    background: "#fff",
    cursor: "pointer",
  },
  btnPrimary: {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #0b6b2a",
    background: "var(--stenau-primary, #0b6b2a)",
    color: "#fff",
    cursor: "pointer",
  },
  btnSmall: {
    padding: "6px 9px",
    borderRadius: 10,
    border: "1px solid #d0d7e2",
    background: "#fff",
    cursor: "pointer",
    fontSize: 12,
  },
  btnSmallPrimary: {
    padding: "6px 9px",
    borderRadius: 10,
    border: "1px solid #0b6b2a",
    background: "var(--stenau-primary, #0b6b2a)",
    color: "#fff",
    cursor: "pointer",
    fontSize: 12,
  },
  panel: {
    background: "#fff",
    border: "1px solid #e6e9f0",
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  h2: { fontSize: 16, fontWeight: 700, marginBottom: 10 },
  h3: { fontSize: 14, fontWeight: 700, marginBottom: 8 },
  h4: { fontSize: 13, fontWeight: 700 },
  input: {
    width: "100%",
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid #d0d7e2",
    outline: "none",
    fontSize: 13,
    background: "#fff",
  },
  textarea: {
    width: "100%",
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid #d0d7e2",
    outline: "none",
    fontSize: 13,
    background: "#fff",
    minHeight: 90,
  },
  select: {
    width: "100%",
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid #d0d7e2",
    outline: "none",
    fontSize: 13,
    background: "#fff",
  },
  grid3: { display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 10 },
  cols: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  hr: { height: 1, background: "#e6e9f0", margin: "14px 0" },
  error: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#991b1b",
    padding: 10,
    borderRadius: 12,
    fontSize: 13,
    whiteSpace: "pre-wrap",
  },
  ok: {
    background: "#ecfdf5",
    border: "1px solid #a7f3d0",
    color: "#065f46",
    padding: 10,
    borderRadius: 12,
    fontSize: 13,
    whiteSpace: "pre-wrap",
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid #e6e9f0",
    fontSize: 12,
    color: "#111",
    background: "#fff",
  },
  dot: (c) => ({
    width: 10,
    height: 10,
    borderRadius: 999,
    background: c || "#94a3b8",
    display: "inline-block",
  }),
  card: { border: "1px solid #e6e9f0", borderRadius: 12, padding: 12, background: "#fff" },
  subRow: {
    display: "grid",
    gridTemplateColumns: "22px 1fr auto auto",
    gap: 8,
    alignItems: "center",
    padding: "6px 0",
    borderBottom: "1px dashed #eef2f7",
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 50,
  },
  modal: {
    width: "min(900px, 96vw)",
    maxHeight: "86vh",
    overflow: "auto",
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #e6e9f0",
    padding: 14,
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderBottom: "1px solid #eef2f7",
    paddingBottom: 10,
    marginBottom: 10,
  },
};

/* ---------------- Main Page ---------------- */

function DashboardPage() {
  const [tab, setTab] = useState("plan"); // plan|kanboard|calendar|guides|users|settings
  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Layout-Edit (Drag & Resize) – pro User gespeichert (localStorage + optional user_settings.layout_json)
  const [layoutEditMode, setLayoutEditMode] = useState(false);
  const [planLayouts, setPlanLayouts] = useState(DEFAULT_PLAN_LAYOUTS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("stenau_plan_layouts_v1");
      if (raw) setPlanLayouts(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("stenau_plan_layouts_v1", JSON.stringify(planLayouts));
    } catch {}
  }, [planLayouts]);


  const router = useRouter();

  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [areas, setAreas] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [guides, setGuides] = useState([]);

  const [tasks, setTasks] = useState([]);
  const [subtasksByTaskId, setSubtasksByTaskId] = useState({});

  const [metaError, setMetaError] = useState("");
  const [taskError, setTaskError] = useState("");
  const [info, setInfo] = useState("");

  const ensureSupabase = useCallback(() => {
    if (!supabase) {
      throw new Error(
        "Supabase ist nicht konfiguriert. Bitte NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY setzen."
      );
    }
  }, []);


useEffect(() => {
  const t = setInterval(() => setNow(new Date()), 30000);
  return () => clearInterval(t);
}, []);

  const loadAuth = useCallback(async () => {
    try {
      ensureSupabase();
      const { data } = await supabase.auth.getSession();
      setAuthUser(data?.session?.user || null);
      setAuthChecked(true);

      supabase.auth.onAuthStateChange((_event, newSession) => {
        setAuthUser(newSession?.user || null);
        setAuthChecked(true);
      });
    } catch (e) {
      setMetaError(String(e?.message || e));
      setAuthChecked(true);
    }
  }, [ensureSupabase]);

  const persistLayoutToDb = useCallback(async () => {
    if (!user) return;
    const sb = ensureSupabase();
    if (!sb) return;
    try {
      // Optional: Spalte layout_json in user_settings (wenn nicht vorhanden, ignorieren wir den Fehler)
      await sb.from("user_settings").upsert({
        user_id: user.id,
        layout_json: JSON.stringify({ plan: planLayouts }),
      });
    } catch (e) {
      // silently ignore
    }
  }, [ensureSupabase, user, planLayouts]);

  const toggleLayoutEdit = useCallback(async () => {
    setLayoutEditMode((prev) => !prev);
  }, []);

  useEffect(() => {
    // wenn Layout-Modus beendet wird, Layout in DB speichern
    if (!layoutEditMode) {
      persistLayoutToDb();
    }
  }, [layoutEditMode, persistLayoutToDb]);


  useEffect(() => {
    loadAuth();
  }, [loadAuth]);

  // Wenn nicht eingeloggt: automatisch zur Login-Seite weiterleiten
  useEffect(() => {
    if (!authChecked) return;
    if (authUser) return;
    router.replace("/login?next=/dashboard");
  }, [authChecked, authUser, router]);

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setMetaError("");
    try {
      ensureSupabase();
      const [areasRes, profilesRes, guidesRes] = await Promise.all([
        supabase.from("areas").select("*").order("name", { ascending: true }),
        supabase.from("profiles").select("*").order("name", { ascending: true }),
        supabase.from("guides").select("*").order("title", { ascending: true }),
      ]);

      if (areasRes.error) throw areasRes.error;
      if (profilesRes.error) throw profilesRes.error;

      setAreas(areasRes.data || []);
      setProfiles(profilesRes.data || []);
      setGuides(guidesRes.error ? [] : guidesRes.data || []);
    } catch (e) {
      setMetaError(String(e?.message || e));
    } finally {
      setLoadingMeta(false);
    }
  }, [ensureSupabase]);
  // Alias für alte Referenzen (SSR/Build-Fehler vermeiden)
  const reloadMeta = useCallback(async () => {
    await loadMeta();
  }, [loadMeta]);


  const loadTasksAndSubtasks = useCallback(async () => {
    setLoadingTasks(true);
    setTaskError("");
    try {
      ensureSupabase();
      const tRes = await supabase
        .from("tasks")
        .select("*")
        .order("due_at", { ascending: true, nullsFirst: true });
      if (tRes.error) throw tRes.error;
      setTasks(tRes.data || []);

      const stRes = await supabase
        .from("subtasks")
        .select("*")
        .order("created_at", { ascending: true });
      if (stRes.error) {
        setSubtasksByTaskId({});
      } else {
        const map = {};
        (stRes.data || []).forEach((s) => {
          const tid = s.task_id || s.parent_task_id;
          if (!tid) return;
          if (!map[tid]) map[tid] = [];
          map[tid].push(s);
        });
        setSubtasksByTaskId(map);
      }
    } catch (e) {
      setTaskError(String(e?.message || e));
    } finally {
      setLoadingTasks(false);
    }
  }, [ensureSupabase]);

  const reloadAll = useCallback(async () => {
    setInfo("");
    await loadMeta();
    await loadTasksAndSubtasks();
  }, [loadMeta, loadTasksAndSubtasks]);

  useEffect(() => {
    if (authUser?.id) reloadAll();
  }, [authUser?.id, reloadAll]);

  const logout = useCallback(async () => {
    try {
      ensureSupabase();
      await supabase.auth.signOut();
      setInfo("Abgemeldet.");
    } catch (e) {
      setMetaError(String(e?.message || e));
    }
  }, [ensureSupabase]);

  const profileById = useMemo(() => {
    const m = {};
    (profiles || []).forEach((p) => (m[p.id] = p));
    return m;
  }, [profiles]);

  const areaById = useMemo(() => {
    const m = {};
    (areas || []).forEach((a) => (m[a.id] = a));
    return m;
  }, [areas]);

  const currentProfile = useMemo(() => {
    if (!authUser) return null;
    return profiles.find((p) => p.id === authUser.id) || null;
  }, [authUser, profiles]);

  const isAdmin = useMemo(
    () => safeLower(currentProfile?.role) === "admin",
    [currentProfile]
  );

  const taskWithResolved = useMemo(() => {
    return (tasks || []).map((t) => {
      const areaObj = t.area_id ? areaById[t.area_id] : null;
      const assignee = t.assignee_id ? profileById[t.assignee_id] : null;
      const subs = subtasksByTaskId[t.id] || [];
      const doneCount = subs.filter(getSubDone).length;
      return { ...t, _areaObj: areaObj, _assignee: assignee, _subtasks: subs, _subDoneCount: doneCount };
    });
  }, [tasks, areaById, profileById, subtasksByTaskId]);

  /* ---------------- CRUD ---------------- */

  const createTask = useCallback(
    async (payload) => {
      setTaskError("");
      setInfo("");
      try {
        ensureSupabase();
        const ins = await supabase.from("tasks").insert(payload).select("*").single();
        if (ins.error) throw ins.error;
        setTasks((prev) => [ins.data, ...prev]);
        setInfo("Aufgabe angelegt.");
      } catch (e) {
        setTaskError(String(e?.message || e));
      }
    },
    [ensureSupabase]
  );

  const updateTask = useCallback(
    async (taskId, patch) => {
      setTaskError("");
      setInfo("");
      try {
        ensureSupabase();
        const res = await supabase.from("tasks").update(patch).eq("id", taskId).select("*").single();
        if (res.error) throw res.error;
        setTasks((prev) => prev.map((t) => (t.id === taskId ? res.data : t)));
      } catch (e) {
        setTaskError(String(e?.message || e));
      }
    },
    [ensureSupabase]
  );

  const deleteTask = useCallback(
    async (taskId) => {
      setTaskError("");
      setInfo("");
      try {
        ensureSupabase();
        await supabase.from("subtasks").delete().eq("task_id", taskId);
        const res = await supabase.from("tasks").delete().eq("id", taskId);
        if (res.error) throw res.error;
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
        setSubtasksByTaskId((prev) => {
          const n = { ...prev };
          delete n[taskId];
          return n;
        });
        setInfo("Aufgabe gelöscht.");
      } catch (e) {
        setTaskError(String(e?.message || e));
      }
    },
    [ensureSupabase]
  );

  const addSubtask = useCallback(
    async (taskId, title) => {
      setTaskError("");
      try {
        ensureSupabase();
        const payload = { task_id: taskId, title: (title || "").trim() };
        const res = await supabase.from("subtasks").insert(payload).select("*").single();
        if (res.error) throw res.error;
        setSubtasksByTaskId((prev) => {
          const next = { ...prev };
          next[taskId] = [...(next[taskId] || []), res.data];
          return next;
        });
      } catch (e) {
        setTaskError(String(e?.message || e));
      }
    },
    [ensureSupabase]
  );

  const toggleSubtaskDone = useCallback(
    async (sub) => {
      setTaskError("");
      try {
        ensureSupabase();
        const nextVal = !getSubDone(sub);
        const { field, value } = setSubDonePatch(sub, nextVal);
        const res = await supabase.from("subtasks").update({ [field]: value }).eq("id", sub.id).select("*").single();
        if (res.error) throw res.error;
        const tid = res.data.task_id || res.data.parent_task_id;
        setSubtasksByTaskId((prev) => {
          const next = { ...prev };
          next[tid] = (next[tid] || []).map((s) => (s.id === sub.id ? res.data : s));
          return next;
        });
      } catch (e) {
        setTaskError(String(e?.message || e));
      }
    },
    [ensureSupabase]
  );

  const deleteSubtask = useCallback(
    async (sub) => {
      setTaskError("");
      try {
        ensureSupabase();
        const tid = sub.task_id || sub.parent_task_id;
        const res = await supabase.from("subtasks").delete().eq("id", sub.id);
        if (res.error) throw res.error;
        setSubtasksByTaskId((prev) => {
          const next = { ...prev };
          next[tid] = (next[tid] || []).filter((s) => s.id !== sub.id);
          return next;
        });
      } catch (e) {
        setTaskError(String(e?.message || e));
      }
    },
    [ensureSupabase]
  );

  /* ---------- Guides ---------- */

  const [guideModal, setGuideModal] = useState({ open: false, guide: null, loading: false, error: "" });

  const openGuide = useCallback(async (guideId) => {
    setGuideModal({ open: true, guide: null, loading: true, error: "" });
    try {
      ensureSupabase();
      const res = await supabase.from("guides").select("*").eq("id", guideId).single();
      if (res.error) throw res.error;
      setGuideModal({ open: true, guide: res.data, loading: false, error: "" });
    } catch (e) {
      setGuideModal({ open: true, guide: null, loading: false, error: String(e?.message || e) });
    }
  }, [ensureSupabase]);

  const closeGuide = useCallback(() => setGuideModal({ open: false, guide: null, loading: false, error: "" }), []);

  const uploadGuideFile = useCallback(async ({ file, title, description, area_id }) => {
    setMetaError("");
    setInfo("");
    try {
      ensureSupabase();
      if (!file) throw new Error("Bitte Datei auswählen.");

      // 1) Datei in Storage hochladen (Bucket ist privat, daher später Signed-URL)
      const bucket = "guides";
      const filePath = (`guides/${Date.now()}_${file.name}`).replace(/\s+/g, "_");
      const up = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { upsert: true });

      if (up.error) throw up.error;

      // 2) Guide-Datensatz anlegen inkl. file_path / file_name
      const ins = await supabase
        .from("guides")
        .insert([
          {
            title: title?.trim() || file.name,
            description: description?.trim() || null,
            area_id: area_id || null,
            file_path: filePath,
            file_name: file.name,
          },
        ])
        .select("*")
        .single();

      if (ins.error) throw ins.error;

      setInfo("Anleitung hochgeladen.");
      await reloadMeta();
    } catch (e) {
      setMetaError(e?.message || String(e));
    }
  }, [ensureSupabase, reloadMeta]);

  const getGuideDownloadUrl = useCallback(async (g) => {
    ensureSupabase();
    const bucket = "guides";
    const path = g.file_path || g.storage_path;
    if (!path) return null;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
    if (!error) return data?.signedUrl || null;
    const pub = supabase.storage.from(bucket).getPublicUrl(path);
    return pub?.data?.publicUrl || null;
  }, [ensureSupabase]);


const updateGuide = useCallback(
  async (guideId, patch) => {
    try {
      ensureSupabase();
      const { data, error } = await supabase.from("guides").update(patch).eq("id", guideId).select("*").single();
      if (error) throw error;
      setGuides((prev) => prev.map((g) => (g.id === guideId ? data : g)));
      setInfoMsg("Anleitung aktualisiert.");
    } catch (e) {
      console.error(e);
      setMetaError(e?.message || "Fehler beim Aktualisieren der Anleitung.");
    }
  },
  [ensureSupabase]
);

const deleteGuide = useCallback(
  async (g) => {
    try {
      if (!isAdmin) return;
      if (!confirm(`Anleitung wirklich löschen?\n\n${g?.title || g?.id}`)) return;

      ensureSupabase();

      // erst Datei löschen (falls vorhanden)
      const path = g?.path || g?.file_path || g?.storage_path || null;
      if (path) {
        const { error: storageErr } = await supabase.storage.from("guides").remove([path]);
        // Storage-Delete kann fehlschlagen (z.B. bereits gelöscht) -> nicht hart abbrechen
        if (storageErr) console.warn("Storage remove:", storageErr.message);
      }

      const { error } = await supabase.from("guides").delete().eq("id", g.id);
      if (error) throw error;

      setGuides((prev) => prev.filter((x) => x.id !== g.id));
      setInfoMsg("Anleitung gelöscht.");
    } catch (e) {
      console.error(e);
      setMetaError(e?.message || "Fehler beim Löschen der Anleitung.");
    }
  },
  [ensureSupabase, isAdmin]
);

  /* ---------- Profiles / Areas ---------- */

  const upsertProfile = useCallback(async (profile) => {
    setMetaError("");
    setInfo("");
    try {
      ensureSupabase();
      const res = await supabase.from("profiles").upsert(profile).select("*").single();
      if (res.error) throw res.error;
      await loadMeta();
      setInfo("Profil gespeichert.");
    } catch (e) {
      setMetaError(String(e?.message || e));
    }
  }, [ensureSupabase, loadMeta]);

  const upsertArea = useCallback(async (area) => {
    setMetaError("");
    setInfo("");
    try {
      ensureSupabase();
      const res = await supabase.from("areas").upsert(area).select("*").single();
      if (res.error) throw res.error;
      await loadMeta();
      setInfo("Bereich gespeichert.");
    } catch (e) {
      setMetaError(String(e?.message || e));
    }
  }, [ensureSupabase, loadMeta]);


  const deleteArea = useCallback(async (areaId) => {
    setMetaError("");
    setInfo("");
    try {
      ensureSupabase();
      const res = await supabase.from("areas").delete().eq("id", areaId);
      if (res.error) throw res.error;
      await loadMeta();
      setInfo("Bereich gelöscht.");
    } catch (e) {
      setMetaError(String(e?.message || e));
    }
  }, [ensureSupabase, loadMeta]);
  /* ---------- Settings ---------- */

  const [userSettings, setUserSettings] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        if (!authUser?.id) return;
        const sRes = await supabase.from("user_settings").select("*").eq("user_id", authUser.id).maybeSingle();
        if (!sRes.error) setUserSettings(sRes.data || null);

          // optional: Layout aus DB laden, wenn Spalte existiert
          try {
            const rawLayout = sRes.data && sRes.data.layout_json;
            if (rawLayout) {
              const parsed = typeof rawLayout === "string" ? JSON.parse(rawLayout) : rawLayout;
              if (parsed && parsed.plan) setPlanLayouts(parsed.plan);
            }
          } catch {}
      } catch (_) {}
    })();
  }, [authUser?.id]);

  useEffect(() => {
    if (!userSettings) return;
    try {
      const root = document.documentElement;
      if (userSettings.primary_color) root.style.setProperty("--stenau-primary", userSettings.primary_color);
      if (userSettings.background_color) root.style.setProperty("--stenau-bg", userSettings.background_color);
      if (userSettings.background_image_url) {
        document.body.style.backgroundImage = `url(${userSettings.background_image_url})`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundAttachment = "fixed";
      } else {
        document.body.style.backgroundImage = "";
      }
    } catch (_) {}
  }, [userSettings]);

  const saveUserSettings = useCallback(async (patch) => {
    setMetaError("");
    setInfo("");
    try {
      ensureSupabase();
      if (!authUser?.id) throw new Error("Nicht angemeldet.");
      const res = await supabase.from("user_settings").upsert({ user_id: authUser.id, ...patch }).select("*").single();
      if (res.error) throw res.error;
      setUserSettings(res.data);
      setInfo("Einstellungen gespeichert.");
    } catch (e) {
      setMetaError(String(e?.message || e));
    }
  }, [ensureSupabase, authUser?.id]);

  /* ---------------- Render guards ---------------- */

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return (
      <div style={styles.page}>
        <div style={styles.wrap}>
          <div style={styles.panel}>
            <div style={styles.h2}>Supabase fehlt</div>
            <div style={styles.error}>
              Bitte setze NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel / .env.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div style={styles.page}>
        <div style={styles.wrap}>
          <div style={styles.panel}>
            <div style={styles.h2}>Nicht angemeldet</div>
            <div style={{ color: "#666", fontSize: 13 }}>
              Weiterleitung zur Login-Seite …
            </div>
            {metaError ? <div style={{ ...styles.error, marginTop: 12 }}>{metaError}</div> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <div style={styles.topBar}>
          <div>
            <div style={styles.brand}>Stenau Dashboard</div>
            <div style={styles.small}>
              Angemeldet als {currentProfile?.name || authUser.email || authUser.id} · {isAdmin ? "Admin" : "User"} · {fmtDateTime(now)} · {APP_VERSION}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button style={styles.btn} onClick={loadMeta} disabled={loadingMeta}>
              {loadingMeta ? "Lade…" : "Meta neu laden"}
            </button>
            <button style={styles.btn} onClick={loadTasksAndSubtasks} disabled={loadingTasks}>
              {loadingTasks ? "Lade…" : "Aufgaben neu laden"}
            </button>

            {tab === "plan" ? (
              <button style={styles.btn} onClick={toggleLayoutEdit}>
                {layoutEditMode ? "Layout speichern" : "Layout bearbeiten"}
              </button>
            ) : null}
            <button style={styles.btn} onClick={logout}>Logout</button>
          </div>
        </div>

        <div style={styles.tabs}>
          <button style={styles.tab(tab === "plan")} onClick={() => setTab("plan")}>Plan</button>
          <button style={styles.tab(tab === "kanboard")} onClick={() => setTab("kanboard")}>Kanboard</button>
          <button style={styles.tab(tab === "calendar")} onClick={() => setTab("calendar")}>Kalender</button>
          <button style={styles.tab(tab === "guides")} onClick={() => setTab("guides")}>Anleitungen</button>
          <button style={styles.tab(tab === "users")} onClick={() => setTab("users")}>Nutzer</button>
          <button style={styles.tab(tab === "settings")} onClick={() => setTab("settings")}>Einstellungen</button>
        </div>

        {metaError ? <div style={{ ...styles.error, marginTop: 12 }}>{metaError}</div> : null}
        {taskError ? <div style={{ ...styles.error, marginTop: 12 }}>{taskError}</div> : null}
        {info ? <div style={{ ...styles.ok, marginTop: 12 }}>{info}</div> : null}

        {tab === "plan" ? (
          <PlanPanel
            areas={areas}
            profiles={profiles}
            guides={guides}
            tasks={taskWithResolved}
            subtasks={subtasks}
            guideFiles={guideFiles}
            onCreateTask={createTask}
            onUpdateTask={updateTask}
            onDeleteTask={deleteTask}
            onAddSubtask={addSubtask}
            onToggleSubtask={toggleSubtaskDone}
            onDeleteSubtask={deleteSubtask}
            onDeleteSeries={handleDeleteSeries}
            onGuideOpen={openGuide}
            layoutEdit={layoutEditMode}
            planLayouts={planLayouts}
            setPlanLayouts={setPlanLayouts}
          />
        ) : null}

        {tab === "kanboard" ? (
          <KanboardPanel areas={areas} profiles={profiles} tasks={taskWithResolved} onUpdateTask={updateTask} onDeleteTask={deleteTask} />
        ) : null}

        {tab === "calendar" ? (
          <CalendarPanel areas={areas} profiles={profiles} tasks={taskWithResolved} onUpdateTask={updateTask} />
        ) : null}

        {tab === "guides" ? (
          <GuidesPanel areas={areas} guides={guides} isAdmin={isAdmin} onUpload={uploadGuideFile} onReload={loadMeta} onOpen={openGuide} getDownloadUrl={getGuideDownloadUrl} onUpdateGuide={updateGuide} onDeleteGuide={deleteGuide} />
        ) : null}

        {tab === "users" ? (
          <UsersPanel areas={areas} profiles={profiles} currentUserId={authUser.id} isAdmin={isAdmin} onUpsertProfile={upsertProfile} onUpsertArea={upsertArea} onDeleteArea={deleteArea} />
        ) : null}

        {tab === "settings" ? (
          <SettingsPanel settings={userSettings} onSave={saveUserSettings} />
        ) : null}

        {guideModal.open ? (
          <div style={styles.modalBackdrop} onMouseDown={closeGuide}>
            <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <div style={styles.h3}>{guideModal.loading ? "Lade…" : guideModal.guide?.title || "Anleitung"}</div>
                <button style={styles.btnSmall} onClick={closeGuide}>Schließen</button>
              </div>
              {guideModal.error ? <div style={styles.error}>{guideModal.error}</div> : null}
              {!guideModal.loading && guideModal.guide ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {guideModal.guide.description ? <div style={{ color: "#666", fontSize: 13 }}>{guideModal.guide.description}</div> : null}
                  {guideModal.guide.content ? (
                    <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.5 }}>{guideModal.guide.content}</div>
                  ) : (
                    <div style={{ color: "#666", fontSize: 13 }}>Kein Textinhalt.</div>
                  )}
                  {(guideModal.guide.path || guideModal.guide.storage_path) ? (
                    <GuideDownloadButton guide={guideModal.guide} getUrl={getGuideDownloadUrl} />
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- Components ---------------- */



function PlanPanel({
  areas,
  profiles,
  tasks,
  guides,
  subtasks,
  guideFiles,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onDeleteSeries,
  onGuideOpen,
  layoutEdit,
  planLayouts,
  setPlanLayouts,
}) {
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAreaId, setNewTaskAreaId] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");
  const [newTaskNotes, setNewTaskNotes] = useState("");
  const [selectedGuideIds, setSelectedGuideIds] = useState([]);

  // Serien
  const [newSeriesTitle, setNewSeriesTitle] = useState("");
  const [newSeriesAreaId, setNewSeriesAreaId] = useState("");
  const [newSeriesFrequency, setNewSeriesFrequency] = useState("monthly");
  const [newSeriesDayOfWeek, setNewSeriesDayOfWeek] = useState(1);
  const [newSeriesDayOfMonth, setNewSeriesDayOfMonth] = useState(1);
  const [newSeriesAssignee, setNewSeriesAssignee] = useState("");
  const [newSeriesNotes, setNewSeriesNotes] = useState("");
  const [newSeriesGuideIds, setNewSeriesGuideIds] = useState([]);

  const todoTasks = (tasks || []).filter((t) => t.status !== "done" && !t.is_series);
  const doneTasks = (tasks || []).filter((t) => t.status === "done" && !t.is_series);
  const seriesTasks = (tasks || []).filter((t) => t.is_series);

  function handleGuideMultiSelect(e) {
    const opts = Array.from(e.target.options);
    const ids = opts.filter((o) => o.selected).map((o) => o.value);
    setSelectedGuideIds(ids);
  }

  function handleSeriesGuideMultiSelect(e) {
    const opts = Array.from(e.target.options);
    const ids = opts.filter((o) => o.selected).map((o) => o.value);
    setNewSeriesGuideIds(ids);
  }

  async function handleCreateTask() {
    await onCreateTask({
      title: newTaskTitle,
      area_id: newTaskAreaId || null,
      assignee_profile_id: newTaskAssignee || null,
      due_at: newTaskDue ? new Date(newTaskDue).toISOString() : null,
      notes: newTaskNotes || null,
      guide_ids: selectedGuideIds || [],
    });

    setNewTaskTitle("");
    setNewTaskAreaId("");
    setNewTaskAssignee("");
    setNewTaskDue("");
    setNewTaskNotes("");
    setSelectedGuideIds([]);
  }

  async function handleCreateSeries() {
    await onCreateTask({
      is_series: true,
      title: newSeriesTitle,
      area_id: newSeriesAreaId || null,
      assignee_profile_id: newSeriesAssignee || null,
      notes: newSeriesNotes || null,
      guide_ids: newSeriesGuideIds || [],
      frequency: newSeriesFrequency,
      day_of_week: Number(newSeriesDayOfWeek),
      day_of_month: Number(newSeriesDayOfMonth),
    });

    setNewSeriesTitle("");
    setNewSeriesAreaId("");
    setNewSeriesFrequency("monthly");
    setNewSeriesDayOfWeek(1);
    setNewSeriesDayOfMonth(1);
    setNewSeriesAssignee("");
    setNewSeriesNotes("");
    setNewSeriesGuideIds([]);
  }

  const layoutsToUse = planLayouts && Object.keys(planLayouts).length ? planLayouts : DEFAULT_PLAN_LAYOUTS;

  return (
    <div style={styles.wrap}>
      <div style={styles.panel}>
        <ReactGridLayout
          className="stenau-grid"
          layouts={layoutsToUse}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={28}
          margin={[12, 12]}
          containerPadding={[0, 0]}
          isDraggable={!!layoutEdit}
          isResizable={!!layoutEdit}
          onLayoutChange={(current, all) => setPlanLayouts(all)}
          compactType="vertical"
          preventCollision={false}
        >
          <div key="create" className="gridCard">
            <h2 style={styles.h2}>Aufgabe anlegen</h2>
            <div style={styles.formRow}>
              <input
                style={styles.input}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Titel"
              />
              <input
                style={styles.input}
                value={newTaskDue}
                onChange={(e) => setNewTaskDue(e.target.value)}
                type="datetime-local"
              />
              <select style={styles.select} value={"todo"} disabled>
                <option value="todo">Zu erledigen</option>
              </select>
              <button style={styles.primaryBtn} onClick={handleCreateTask} disabled={!newTaskTitle}>
                Anlegen
              </button>
            </div>

            <div style={styles.formRow}>
              <select style={styles.select} value={newTaskAreaId} onChange={(e) => setNewTaskAreaId(e.target.value)}>
                <option value="">– Bereich –</option>
                {(areas || []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>

              <select
                style={styles.select}
                value={newTaskAssignee}
                onChange={(e) => setNewTaskAssignee(e.target.value)}
              >
                <option value="">– Zuständig –</option>
                {(profiles || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.email || p.id}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              style={styles.textarea}
              value={newTaskNotes}
              onChange={(e) => setNewTaskNotes(e.target.value)}
              placeholder="Notizen (optional)"
            />

            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Anleitungen (Mehrfachauswahl möglich)</div>
              <select
                multiple
                style={{ ...styles.select, height: 120 }}
                value={selectedGuideIds}
                onChange={handleGuideMultiSelect}
              >
                {(guides || []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Tipp: Strg/Cmd + Klick</div>
            </div>
          </div>

          <div key="tasks" className="gridCard">
            <h2 style={styles.h2}>Aufgaben</h2>
            <div style={styles.board}>
              <TaskColumn
                title={`Zu erledigen (${todoTasks.length})`}
                tasks={todoTasks}
                guides={guides}
                onUpdateTask={onUpdateTask}
                onDeleteTask={onDeleteTask}
                onAddSubtask={onAddSubtask}
                onToggleSubtask={onToggleSubtask}
                onDeleteSubtask={onDeleteSubtask}
                onGuideOpen={onGuideOpen}
              />
              <TaskColumn
                title={`Erledigt (${doneTasks.length})`}
                tasks={doneTasks}
                guides={guides}
                onUpdateTask={onUpdateTask}
                onDeleteTask={onDeleteTask}
                onAddSubtask={onAddSubtask}
                onToggleSubtask={onToggleSubtask}
                onDeleteSubtask={onDeleteSubtask}
                onGuideOpen={onGuideOpen}
              />
            </div>
          </div>

          <div key="series" className="gridCard">
            <h2 style={styles.h2}>Serien</h2>

            <div style={styles.formRow}>
              <input
                style={styles.input}
                value={newSeriesTitle}
                onChange={(e) => setNewSeriesTitle(e.target.value)}
                placeholder="Serien-Titel"
              />
              <select style={styles.select} value={newSeriesAreaId} onChange={(e) => setNewSeriesAreaId(e.target.value)}>
                <option value="">– Bereich –</option>
                {(areas || []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <select
                style={styles.select}
                value={newSeriesAssignee}
                onChange={(e) => setNewSeriesAssignee(e.target.value)}
              >
                <option value="">– Zuständig –</option>
                {(profiles || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.email || p.id}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.formRow}>
              <select
                style={styles.select}
                value={newSeriesFrequency}
                onChange={(e) => setNewSeriesFrequency(e.target.value)}
              >
                <option value="weekly">Wöchentlich</option>
                <option value="monthly">Monatlich</option>
              </select>

              {newSeriesFrequency === "weekly" ? (
                <select
                  style={styles.select}
                  value={newSeriesDayOfWeek}
                  onChange={(e) => setNewSeriesDayOfWeek(e.target.value)}
                >
                  <option value={1}>Montag</option>
                  <option value={2}>Dienstag</option>
                  <option value={3}>Mittwoch</option>
                  <option value={4}>Donnerstag</option>
                  <option value={5}>Freitag</option>
                  <option value={6}>Samstag</option>
                  <option value={0}>Sonntag</option>
                </select>
              ) : (
                <select
                  style={styles.select}
                  value={newSeriesDayOfMonth}
                  onChange={(e) => setNewSeriesDayOfMonth(e.target.value)}
                >
                  {Array.from({ length: 28 }).map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      Tag {i + 1}
                    </option>
                  ))}
                </select>
              )}

              <button style={styles.primaryBtn} onClick={handleCreateSeries} disabled={!newSeriesTitle}>
                Serie anlegen
              </button>
            </div>

            <textarea
              style={styles.textarea}
              value={newSeriesNotes}
              onChange={(e) => setNewSeriesNotes(e.target.value)}
              placeholder="Serien-Notizen (optional)"
            />

            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Anleitungen (Mehrfachauswahl möglich)</div>
              <select
                multiple
                style={{ ...styles.select, height: 110 }}
                value={newSeriesGuideIds}
                onChange={handleSeriesGuideMultiSelect}
              >
                {(guides || []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Tipp: Strg/Cmd + Klick</div>
            </div>

            <div style={{ marginTop: 12 }}>
              <h3 style={styles.h3}>Serienübersicht</h3>
              <div style={styles.seriesList}>
                {seriesTasks.map((s) => (
                  <div key={s.id} style={styles.seriesRow}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{s.title}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        {s.frequency === "weekly"
                          ? `Wöchentlich (Tag ${s.day_of_week})`
                          : `Monatlich (Tag ${s.day_of_month})`}
                      </div>
                    </div>
                    <button style={styles.dangerBtn} onClick={() => onDeleteSeries(s.id)}>
                      Löschen
                    </button>
                  </div>
                ))}
                {seriesTasks.length === 0 && <div style={{ fontSize: 12, opacity: 0.7 }}>Keine Serien angelegt.</div>}
              </div>
            </div>

            {layoutEdit ? (
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
                Layout-Modus aktiv: Boxen können verschoben und skaliert werden.
              </div>
            ) : null}
          </div>
        </ReactGridLayout>
      </div>

      <style jsx global>{`
        .stenau-grid .gridCard {
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid #dcdcdc;
          border-radius: 12px;
          padding: 14px;
          overflow: auto;
        }
        .react-grid-item.react-grid-placeholder {
          border-radius: 12px;
        }
        .react-resizable-handle {
          width: 14px;
          height: 14px;
          bottom: 2px;
          right: 2px;
          background: rgba(0, 0, 0, 0.25);
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
}
function TaskColumn({ title, tasks, guides, onUpdateTask, onDeleteTask, onAddSubtask, onToggleSubtask, onDeleteSubtask, onGuideOpen }) {
  const [subDraft, setSubDraft] = useState({});
  return (
    <div style={styles.panel}>
      <div style={styles.h3}>{title} ({(tasks || []).length})</div>
      <div style={{ display: "grid", gap: 10 }}>
        {(tasks || []).map((t) => {
          const color = t._areaObj?.color || t.color || "#94a3b8";
          const assigneeName =
            t._assignee?.name ||
            t._assignee?.full_name ||
            t._assignee?.email ||
            (t.assignee_id ? String(t.assignee_id) : "Unzugeordnet");
          const subs = t._subtasks || [];
          const doneCount = t._subDoneCount || 0;

          return (
            <div key={t.id} style={styles.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={styles.dot(color)} />
                <div style={{ fontWeight: 700 }}>{t.title}</div>
                {t._areaObj?.name ? <span style={styles.pill}>{t._areaObj.name}</span> : null}
                <div style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>{t.due_at ? fmtDateTime(t.due_at) : ""}</div>
              </div>

              <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                Zuständig: {assigneeName} · Unteraufgaben: {doneCount}/{subs.length}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <button style={styles.btnSmall} onClick={() => onUpdateTask(t.id, { status: safeLower(t.status) === "done" ? "todo" : "done" })}>
                  Status wechseln
                </button>
                <button style={styles.btnSmall} onClick={() => onDeleteTask(t.id)}>
                  Aufgabe löschen
                </button>
                {(t.guide_ids || []).map((gid) => {
                  const g = (guides || []).find((x) => x.id === gid);
                  return (
                    <button key={gid} style={styles.btnSmall} onClick={() => onGuideOpen(gid)}>
                      Anleitung: {g?.title || gid}
                    </button>
                  );
                })}
              </div>

              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input value={subDraft[t.id] || ""} onChange={(e) => setSubDraft((p) => ({ ...p, [t.id]: e.target.value }))} placeholder="Unteraufgabe hinzufügen…" style={styles.input} />
                  <button
                    style={styles.btnSmallPrimary}
                    onClick={() => {
                      const txt = (subDraft[t.id] || "").trim();
                      if (!txt) return;
                      onAddSubtask(t.id, txt);
                      setSubDraft((p) => ({ ...p, [t.id]: "" }));
                    }}
                  >
                    +
                  </button>
                </div>

                <div style={{ marginTop: 10 }}>
                  {subs.length === 0 ? <div style={{ fontSize: 13, color: "#666" }}>Keine Unteraufgaben</div> : null}
                  {subs.map((s) => (
                    <div key={s.id} style={styles.subRow}>
                      <input type="checkbox" checked={getSubDone(s)} onChange={() => onToggleSubtask(s)} />
                      <div style={{ fontSize: 13 }}>{s.title}</div>
                      <span style={styles.dot(s.color || "#94a3b8")} />
                      <button style={styles.btnSmall} onClick={() => onDeleteSubtask(s)}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanboardPanel({ areas, profiles, tasks, onUpdateTask, onDeleteTask }) {
  const [view, setView] = useState("status");
  const [areaFilter, setAreaFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");

  const members = useMemo(() => (profiles || []).map((p) => ({ id: p.id, label: p.name || p.email || p.id })).sort((a, b) => a.label.localeCompare(b.label, "de")), [profiles]);
  const areaOpts = useMemo(() => (areas || []).map((a) => ({ id: a.id, label: a.name })).sort((a, b) => a.label.localeCompare(b.label, "de")), [areas]);

  const filtered = useMemo(() => {
    return (tasks || []).filter((t) => {
      if (areaFilter && t.area_id !== areaFilter) return false;
      if (userFilter && (t.assignee_id || "") !== userFilter) return false;
      return true;
    });
  }, [tasks, areaFilter, userFilter]);

  const byStatus = useMemo(() => {
    const todo = [];
    const done = [];
    filtered.forEach((t) => (safeLower(t.status) === "done" ? done : todo).push(t));
    return { todo, done };
  }, [filtered]);

  const byPerson = useMemo(() => {
    const map = {};
    filtered.forEach((t) => {
      const key = t.assignee_id || "unassigned";
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [filtered]);

  return (
    <div style={styles.panel}>
      <div style={styles.h2}>Kanboard</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
        <button style={styles.btnSmallPrimary} onClick={() => setView("status")} disabled={view === "status"}>Status</button>
        <button style={styles.btnSmallPrimary} onClick={() => setView("people")} disabled={view === "people"}>Personen</button>

        <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} style={{ ...styles.select, width: 220 }}>
          <option value="">Alle Bereiche</option>
          {areaOpts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>

        <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} style={{ ...styles.select, width: 220 }}>
          <option value="">Alle Nutzer</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>

        <button style={styles.btnSmall} onClick={() => { setAreaFilter(""); setUserFilter(""); }}>Filter löschen</button>
      </div>

      <div style={styles.hr} />

      {view === "status" ? (
        <div style={styles.cols}>
          <KanColumn title="Zu erledigen" tasks={byStatus.todo} onUpdateTask={onUpdateTask} onDeleteTask={onDeleteTask} />
          <KanColumn title="Erledigt" tasks={byStatus.done} onUpdateTask={onUpdateTask} onDeleteTask={onDeleteTask} />
        </div>
      ) : (
        <PeopleBoard tasksByPerson={byPerson} members={members} onUpdateTask={onUpdateTask} />
      )}
    </div>
  );
}

function KanColumn({ title, tasks, onUpdateTask, onDeleteTask }) {
  return (
    <div style={styles.panel}>
      <div style={styles.h3}>{title} ({tasks.length})</div>
      <div style={{ display: "grid", gap: 10 }}>
        {tasks.map((t) => (
          <div key={t.id} style={styles.card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 700 }}>{t.title}</div>
              <div style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>{t.due_at ? fmtDate(t.due_at) : ""}</div>
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select value={safeLower(t.status) === "done" ? "done" : "todo"} onChange={(e) => onUpdateTask(t.id, { status: e.target.value })} style={{ ...styles.select, width: 160, padding: "8px 10px" }}>
                <option value="todo">Zu erledigen</option>
                <option value="done">Erledigt</option>
              </select>
              <button style={styles.btnSmall} onClick={() => onDeleteTask(t.id)}>Löschen</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PeopleBoard({ tasksByPerson, members, onUpdateTask }) {
  const cols = useMemo(() => {
    const keys = Object.keys(tasksByPerson || {});
    keys.sort((a, b) => {
      if (a === "unassigned") return -1;
      if (b === "unassigned") return 1;
      const la = members.find((m) => m.id === a)?.label || a;
      const lb = members.find((m) => m.id === b)?.label || b;
      return la.localeCompare(lb, "de");
    });
    return keys;
  }, [tasksByPerson, members]);

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", gap: 12, minWidth: 900 }}>
        {cols.map((key) => {
          const label = key === "unassigned" ? "Nicht zugeordnet" : members.find((m) => m.id === key)?.label || key;
          const list = tasksByPerson[key] || [];
          return (
            <div key={key} style={{ minWidth: 260, maxWidth: 260 }}>
              <div style={styles.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={styles.h4}>{label}</div>
                  <span style={styles.pill}>{list.length}</span>
                </div>
                <div style={{ height: 10 }} />
                {list.map((t) => (
                  <div key={t.id} style={{ border: "1px solid #eef2f7", borderRadius: 10, padding: 10, marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{t.title}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{t.due_at ? fmtDate(t.due_at) : ""}</div>
                    <div style={{ marginTop: 8 }}>
                      <button style={styles.btnSmall} onClick={() => onUpdateTask(t.id, { status: safeLower(t.status) === "done" ? "todo" : "done" })}>Status wechseln</button>
                    </div>
                  </div>
                ))}
                {list.length === 0 ? <div style={{ fontSize: 13, color: "#666" }}>—</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarPanel({ areas, profiles, tasks, onUpdateTask }) {
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [areaFilter, setAreaFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");

  const members = useMemo(() => (profiles || []).map((p) => ({ id: p.id, label: p.name || p.email || p.id })).sort((a, b) => a.label.localeCompare(b.label, "de")), [profiles]);
  const areaOpts = useMemo(() => (areas || []).map((a) => ({ id: a.id, label: a.name })).sort((a, b) => a.label.localeCompare(b.label, "de")), [areas]);

  const filtered = useMemo(() => {
    return (tasks || []).filter((t) => {
      if (!t.due_at) return false;
      if (areaFilter && t.area_id !== areaFilter) return false;
      if (userFilter && (t.assignee_id || "") !== userFilter) return false;
      return true;
    });
  }, [tasks, areaFilter, userFilter]);

  const monthLabel = useMemo(() => cursor.toLocaleDateString("de-DE", { month: "long", year: "numeric" }), [cursor]);

  const weekStart = useMemo(() => {
    const d = new Date(cursor);
    const day = d.getDay();
    const diff = (day + 6) % 7;
    return startOfDay(addDays(d, -diff));
  }, [cursor]);

  const daysMonthGrid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const firstDay = (first.getDay() + 6) % 7;
    const start = addDays(first, -firstDay);
    const days = [];
    for (let i = 0; i < 42; i++) days.push(addDays(start, i));
    return days;
  }, [cursor]);

  const tasksByDay = useMemo(() => {
    const map = {};
    filtered.forEach((t) => {
      const d = startOfDay(new Date(t.due_at));
      const key = d.toISOString().slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [filtered]);

  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));

  const dayKey = (d) => startOfDay(d).toISOString().slice(0, 10);

  return (
    <div style={styles.panel}>
      <div style={styles.h2}>Kalender</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button style={styles.btnSmallPrimary} onClick={() => setView("month")} disabled={view === "month"}>Monat</button>
        <button style={styles.btnSmallPrimary} onClick={() => setView("week")} disabled={view === "week"}>Woche</button>

        <button style={styles.btnSmall} onClick={() => setCursor((c) => (view === "month" ? new Date(c.getFullYear(), c.getMonth() - 1, 1) : addDays(c, -7)))}>←</button>
        <div style={{ fontWeight: 700 }}>{view === "month" ? monthLabel : `Woche ab ${fmtDate(weekStart)}`}</div>
        <button style={styles.btnSmall} onClick={() => setCursor((c) => (view === "month" ? new Date(c.getFullYear(), c.getMonth() + 1, 1) : addDays(c, 7)))}>→</button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} style={{ ...styles.select, width: 220 }}>
            <option value="">Alle Bereiche</option>
            {areaOpts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>

          <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} style={{ ...styles.select, width: 220 }}>
            <option value="">Alle Nutzer</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
      </div>

      <div style={styles.hr} />

      {view === "month" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => <div key={d} style={{ fontSize: 12, color: "#666", paddingLeft: 6 }}>{d}</div>)}
          {daysMonthGrid.map((d, idx) => {
            const k = dayKey(d);
            const list = tasksByDay[k] || [];
            const inMonth = d.getMonth() === cursor.getMonth();
            const isSel = isSameDay(d, selectedDay);
            return (
              <div
                key={idx}
                onClick={() => setSelectedDay(startOfDay(d))}
                style={{
                  border: "1px solid #e6e9f0",
                  borderRadius: 12,
                  padding: 8,
                  minHeight: 88,
                  cursor: "pointer",
                  background: isSel ? "#ecfdf5" : "#fff",
                  opacity: inMonth ? 1 : 0.55,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{d.getDate()}</div>
                  {list.length ? <span style={styles.pill}>{list.length}</span> : null}
                </div>
                <div style={{ height: 6 }} />
                {list.slice(0, 2).map((t) => (
                  <div key={t.id} style={{ fontSize: 12, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>• {t.title}</div>
                ))}
                {list.length > 2 ? <div style={{ fontSize: 12, color: "#666" }}>+{list.length - 2} …</div> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
          {Array.from({ length: 7 }).map((_, i) => {
            const d = addDays(weekStart, i);
            const k = dayKey(d);
            const list = tasksByDay[k] || [];
            const isSel = isSameDay(d, selectedDay);
            return (
              <div
                key={i}
                onClick={() => setSelectedDay(startOfDay(d))}
                style={{
                  border: "1px solid #e6e9f0",
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 130,
                  cursor: "pointer",
                  background: isSel ? "#ecfdf5" : "#fff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{fmtDate(d)}</div>
                  {list.length ? <span style={styles.pill}>{list.length}</span> : null}
                </div>
                <div style={{ height: 8 }} />
                {list.slice(0, 4).map((t) => (
                  <div key={t.id} style={{ fontSize: 12, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>• {t.title}</div>
                ))}
                {list.length > 4 ? <div style={{ fontSize: 12, color: "#666" }}>+{list.length - 4} …</div> : null}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ height: 12 }} />
      <DayDetail day={selectedDay} tasks={(tasksByDay[dayKey(selectedDay)] || []).slice()} onUpdateTask={onUpdateTask} />
    </div>
  );
}

function DayDetail({ day, tasks, onUpdateTask }) {
  return (
    <div style={styles.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={styles.h3}>Aufgaben am {fmtDate(day)}</div>
        <div style={styles.pill}>{tasks.length} Einträge</div>
      </div>
      <div style={{ height: 10 }} />
      {tasks.length === 0 ? <div style={{ color: "#666", fontSize: 13 }}>Keine Einträge.</div> : null}
      <div style={{ display: "grid", gap: 8 }}>
        {tasks.map((t) => (
          <div key={t.id} style={{ border: "1px solid #eef2f7", borderRadius: 10, padding: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ fontWeight: 700 }}>{t.title}</div>
              <div style={{ marginLeft: "auto", color: "#666", fontSize: 12 }}>{t.due_at ? fmtDateTime(t.due_at) : ""}</div>
              <span style={styles.pill}>{safeLower(t.status) === "done" ? "Erledigt" : "Offen"}</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <button style={styles.btnSmall} onClick={() => onUpdateTask(t.id, { status: safeLower(t.status) === "done" ? "todo" : "done" })}>Status wechseln</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GuidesPanel({ areas, guides, isAdmin, onUpload, onReload, onOpen, getDownloadUrl, onUpdateGuide, onDeleteGuide }) {
  const [filterArea, setFilterArea] = useState("");
  const [upload, setUpload] = useState({ file: null, title: "", description: "", area_id: "" });
  const [urlMap, setUrlMap] = useState({});
  const [loadingUrls, setLoadingUrls] = useState(false);
  const [editGuide, setEditGuide] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: "", description: "", area_id: "" });


  const areaOpts = useMemo(() => (areas || []).map((a) => ({ id: a.id, label: a.name })).sort((a, b) => a.label.localeCompare(b.label, "de")), [areas]);
  const areaNameById = useMemo(() => {
    const m = {};
    for (const a of (areas || [])) m[a.id] = a.name;
    return m;
  }, [areas]);


  const filtered = useMemo(() => {
    const list = guides || [];
    if (!filterArea) return list;
    return list.filter((g) => (g.area_id || "") === filterArea);
  }, [guides, filterArea]);

  const resolveUrls = async () => {
    setLoadingUrls(true);
    const next = {};
    for (const g of filtered.slice(0, 40)) {
      const url = await getDownloadUrl(g);
      if (url) next[g.id] = url;
    }
    setUrlMap(next);
    setLoadingUrls(false);
  };

  const openFileLink = async (g) => {
    if (!g?.file_path) return;
    const url = await getDownloadUrl(g);
    if (url) {
      setUrlMap((m) => ({ ...m, [g.id]: url }));
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div style={styles.panel}>
      <div style={styles.h2}>Anleitungen</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterArea} onChange={(e) => setFilterArea(e.target.value)} style={{ ...styles.select, width: 260 }}>
          <option value="">Alle Bereiche</option>
          {areaOpts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>

        <button style={styles.btnSmall} onClick={onReload}>Neu laden</button>
        <button style={styles.btnSmall} onClick={resolveUrls} disabled={loadingUrls}>{loadingUrls ? "Lade Links…" : "Datei-Links anzeigen"}</button>
      </div>

      <div style={styles.hr} />

      {isAdmin ? (
        <div style={styles.card}>
          <div style={styles.h3}>Upload</div>
          <div style={styles.grid3}>
            <input value={upload.title} onChange={(e) => setUpload((u) => ({ ...u, title: e.target.value }))} placeholder="Titel (optional)" style={styles.input} />
            <select value={upload.area_id} onChange={(e) => setUpload((u) => ({ ...u, area_id: e.target.value }))} style={styles.select}>
              <option value="">– Bereich –</option>
              {areaOpts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            <input type="file" onChange={(e) => setUpload((u) => ({ ...u, file: e.target.files?.[0] || null }))} style={styles.input} />
          </div>
          <div style={{ marginTop: 10 }}>
            <input value={upload.description} onChange={(e) => setUpload((u) => ({ ...u, description: e.target.value }))} placeholder="Beschreibung (optional)" style={styles.input} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button
              style={styles.btnPrimary}
              onClick={() =>
                onUpload({ file: upload.file, title: upload.title, description: upload.description, area_id: upload.area_id || null }).then(() =>
                  setUpload({ file: null, title: "", description: "", area_id: "" })
                )
              }
            >
              Hochladen
            </button>
          </div>
        </div>
      ) : (
        <div style={{ color: "#666", fontSize: 13 }}>Upload ist nur für Admin sichtbar.</div>
      )}

      <div style={{ height: 12 }} />

      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((g) => (
          <div key={g.id} style={styles.card}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700 }}>{g.title || "—"}</div>
              {g.area_id ? <span style={styles.pill}>Bereich: {areaNameById[g.area_id] || g.area_id}</span> : <span style={styles.pill}>Ohne Bereich</span>}
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={styles.btnSmall} onClick={() => onOpen(g.id)}>Öffnen</button>
                {isAdmin ? (
                  <button
                    style={styles.btnSmall}
                    onClick={() => {
                      setEditGuide(g);
                      setEditDraft({ title: g.title || "", description: g.description || "", area_id: g.area_id || "" });
                    }}
                  >
                    Bearbeiten
                  </button>
                ) : null}
                {isAdmin ? (
                  <button style={styles.btnDangerSmall} onClick={() => onDeleteGuide(g)}>Löschen</button>
                ) : null}
                {g.file_path ? (
                  <button style={styles.btnSmall} onClick={() => openFileLink(g)}>
                    Datei-Link
                  </button>
                ) : null}
                {urlMap[g.id] ? (
                  <a href={urlMap[g.id]} target="_blank" rel="noreferrer" style={{ ...styles.btnSmall, display: "inline-block", textDecoration: "none", color: "#111" }}>
                    Datei öffnen
                  </a>
                ) : null}
              </div>
            </div>
            {g.description ? <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>{g.description}</div> : null}
            {g.created_at ? <div style={{ marginTop: 6, color: "#666", fontSize: 12 }}>Erstellt: {fmtDateTime(g.created_at)}</div> : null}
            {(g.file_name || g.file_path) ? <div style={{ marginTop: 6, color: "#666", fontSize: 12 }}>Datei: {g.file_name || g.file_path}</div> : null}
          </div>
        ))}
        {filtered.length === 0 ? <div style={{ color: "#666", fontSize: 13 }}>Keine Anleitungen gefunden.</div> : null}
      </div>

{editGuide ? (
  <div style={styles.modalOverlay} onClick={() => setEditGuide(null)}>
    <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={styles.h3}>Anleitung bearbeiten</div>
        <button style={styles.btnSmall} onClick={() => setEditGuide(null)}>Schließen</button>
      </div>
      <div style={{ height: 10 }} />
      <div style={styles.grid3}>
        <input value={editDraft.title} onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Titel" style={styles.input} />
        <select value={editDraft.area_id} onChange={(e) => setEditDraft((d) => ({ ...d, area_id: e.target.value }))} style={styles.select}>
          <option value="">– Bereich –</option>
          {areaOpts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <div />
      </div>
      <div style={{ marginTop: 10 }}>
        <input value={editDraft.description} onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Beschreibung" style={styles.input} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button style={styles.btnSmall} onClick={() => setEditGuide(null)}>Abbrechen</button>
        <button
          style={styles.btnSmallPrimary}
          onClick={async () => {
            await onUpdateGuide(editGuide.id, {
              title: editDraft.title.trim() || null,
              description: editDraft.description.trim() || null,
              area_id: editDraft.area_id || null,
            });
            setEditGuide(null);
          }}
        >
          Speichern
        </button>
      </div>
    </div>
  </div>
) : null}

    </div>
  );
}

function UsersPanel({ areas, profiles, currentUserId, isAdmin, onUpsertProfile, onUpsertArea, onDeleteArea }) {
  const [draftNew, setDraftNew] = useState({ id: "", email: "", name: "", role: "user", area_id: "" });
  const [editId, setEditId] = useState("");
  const [edit, setEdit] = useState({ id: "", email: "", name: "", role: "user", area_id: "" });

  const areaOpts = useMemo(() => (areas || []).map((a) => ({ id: a.id, label: a.name, color: a.color || "#94a3b8" })).sort((a, b) => a.label.localeCompare(b.label, "de")), [areas]);

  const startEdit = (p) => {
    setEditId(p.id);
    setEdit({
      id: p.id,
      email: p.email || "",
      name: p.name || p.full_name || "",
      role: p.role || "user",
      area_id: p.area_id || "",
    });
  };

  // Backward-compat: older handlers referenced setInfoMsg.
  // In this panel we don't manage global alerts directly, so keep it as a safe no-op.
  const setInfoMsg = (msg) => {
    try {
      // eslint-disable-next-line no-console
      console.log(msg);
    } catch {}
  };

  return (
    <div style={styles.panel}>
      <div style={styles.h2}>Nutzer</div>
      <div style={{ color: "#666", fontSize: 13 }}>Quelle: profiles · Angemeldete ID: {currentUserId}</div>

      <div style={styles.hr} />

      {isAdmin ? (
        <div style={styles.card}>
          <div style={styles.h3}>Profil anlegen (für bestehenden Auth-User)</div>
          <div style={styles.grid3}>
            <input value={draftNew.id} onChange={(e) => setDraftNew((d) => ({ ...d, id: e.target.value }))} placeholder="User-ID (uuid)" style={styles.input} />
            <input value={draftNew.email} onChange={(e) => setDraftNew((d) => ({ ...d, email: e.target.value }))} placeholder="E-Mail" style={styles.input} />
            <input value={draftNew.name} onChange={(e) => setDraftNew((d) => ({ ...d, name: e.target.value }))} placeholder="Name" style={styles.input} />

            <select value={draftNew.role} onChange={(e) => setDraftNew((d) => ({ ...d, role: e.target.value }))} style={styles.select}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>

            <select value={draftNew.area_id} onChange={(e) => setDraftNew((d) => ({ ...d, area_id: e.target.value }))} style={styles.select}>
              <option value="">– Standard-Bereich –</option>
              {areaOpts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                style={styles.btnPrimary}
                onClick={() => {
                  onUpsertProfile({
                    id: draftNew.id.trim(),
                    email: draftNew.email.trim() || null,
                    name: draftNew.name.trim() || null,
                    role: draftNew.role || "user",
                    area_id: draftNew.area_id || null,
                  });
                  setDraftNew({ id: "", email: "", name: "", role: "user", area_id: "" });
                }}
              >
                Anlegen
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAdmin ? (
        <div style={{ ...styles.card, marginTop: 12 }}>
          <div style={styles.h3}>Bereiche verwalten</div>
          <AreaManager areas={areas} onUpsertArea={onUpsertArea} onDeleteArea={onDeleteArea} />
        </div>
      ) : null}

      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={styles.h3}>Liste</div>
        <div style={{ display: "grid", gap: 10 }}>
          {(profiles || []).map((p) => (
            <div key={p.id} style={{ border: "1px solid #eef2f7", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{p.name || p.full_name || "—"}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>{p.email || ""}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={styles.pill}>{p.role || "user"}</span>
                  {isAdmin ? <button style={styles.btnSmall} onClick={() => startEdit(p)}>Bearbeiten</button> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {isAdmin && editId ? (
        <div style={{ ...styles.modalBackdrop, zIndex: 60 }} onMouseDown={() => setEditId("")}>
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={styles.h3}>Profil bearbeiten</div>
              <button style={styles.btnSmall} onClick={() => setEditId("")}>Schließen</button>
            </div>

            <div style={styles.grid3}>
              <input value={edit.id} readOnly style={{ ...styles.input, background: "#f8fafc" }} />
              <input value={edit.email} onChange={(e) => setEdit((d) => ({ ...d, email: e.target.value }))} placeholder="E-Mail" style={styles.input} />
              <input value={edit.name} onChange={(e) => setEdit((d) => ({ ...d, name: e.target.value }))} placeholder="Name" style={styles.input} />

              <select value={edit.role} onChange={(e) => setEdit((d) => ({ ...d, role: e.target.value }))} style={styles.select}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>

              <select value={edit.area_id} onChange={(e) => setEdit((d) => ({ ...d, area_id: e.target.value }))} style={styles.select}>
                <option value="">– Standard-Bereich –</option>
                {areaOpts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  style={styles.btnPrimary}
                  onClick={() => {
                    onUpsertProfile({
                      id: edit.id,
                      email: edit.email.trim() || null,
                      name: edit.name.trim() || null,
                      role: edit.role || "user",
                      area_id: edit.area_id || null,
                    });
                    setEditId("");
                  }}
                >
                  Speichern
                </button>
              </div>
            </div>

            <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
              Einladungen/Passwort-Reset brauchen Admin-Server-Keys – bauen wir separat.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AreaManager({ areas, onUpsertArea, onDeleteArea }) {
  const [draft, setDraft] = useState({ name: "", color: "#1f7a1f" });
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState({ name: "", color: "#1f7a1f" });

  const startEdit = (a) => {
    setEditingId(a.id);
    setEdit({ name: a.name || "", color: a.color || "#1f7a1f" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEdit({ name: "", color: "#1f7a1f" });
  };

  const saveEdit = async () => {
    const name = (edit.name || "").trim();
    if (!name) return;
    await onUpsertArea({ id: editingId, name, color: edit.color || "#1f7a1f" });
    cancelEdit();
  };

  const createArea = async () => {
    const name = (draft.name || "").trim();
    if (!name) return;
    await onUpsertArea({ name, color: draft.color || "#1f7a1f" });
    setDraft({ name: "", color: "#1f7a1f" });
  };

  const doDelete = async (a) => {
    if (!onDeleteArea) return;
    const ok = window.confirm(`Bereich "${a.name}" wirklich löschen?`);
    if (!ok) return;
    await onDeleteArea(a.id);
    if (editingId === a.id) cancelEdit();
  };

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, marginTop: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Bereiche verwalten</div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="Bereichsname"
          style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
        />
        <input
          type="color"
          value={draft.color || "#1f7a1f"}
          onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
          style={{ width: 64, height: 38, borderRadius: 8, border: "1px solid #ddd" }}
          title="Farbe"
        />
        <button className="primary" onClick={createArea} style={{ padding: "10px 14px", borderRadius: 10 }}>
          Bereich speichern
        </button>
      </div>

      <div style={{ borderTop: "1px solid #eee", marginTop: 8 }}>
        {(areas || []).map((a) => {
          const isEdit = editingId === a.id;
          return (
            <div
              key={a.id}
              style={{
                display: "grid",
                gridTemplateColumns: "12px 1fr auto",
                gap: 10,
                padding: "10px 0",
                borderBottom: "1px solid #f0f0f0",
                alignItems: "center",
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: 99, background: a.color || "#999" }} />
              <div>
                {isEdit ? (
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      value={edit.name}
                      onChange={(e) => setEdit((x) => ({ ...x, name: e.target.value }))}
                      style={{ minWidth: 240, padding: 8, borderRadius: 8, border: "1px solid #ddd" }}
                    />
                    <input
                      type="color"
                      value={edit.color || "#1f7a1f"}
                      onChange={(e) => setEdit((x) => ({ ...x, color: e.target.value }))}
                      style={{ width: 56, height: 34, borderRadius: 8, border: "1px solid #ddd" }}
                    />
                    <button onClick={saveEdit} style={{ padding: "8px 10px", borderRadius: 10 }}>
                      Speichern
                    </button>
                    <button onClick={cancelEdit} style={{ padding: "8px 10px", borderRadius: 10 }}>
                      Abbrechen
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 600 }}>{a.name}</div>
                    <div style={{ color: "#888", fontSize: 12 }}>{a.id}</div>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                {!isEdit ? (
                  <>
                    <button onClick={() => startEdit(a)} style={{ padding: "8px 10px", borderRadius: 10 }}>
                      Umbenennen
                    </button>
                    <button onClick={() => doDelete(a)} style={{ padding: "8px 10px", borderRadius: 10 }}>
                      Löschen
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
        {(areas || []).length === 0 ? <div style={{ padding: 10, color: "#777" }}>Keine Bereiche vorhanden.</div> : null}
      </div>
    </div>
  );
}

function SettingsPanel({ settings, onSave }) {
  const [draft, setDraft] = useState(() => ({
    primary_color: settings?.primary_color || "#0b6b2a",
    background_color: settings?.background_color || "#f4f7fb",
    background_image_url: settings?.background_image_url || "",
  }));

  useEffect(() => {
    setDraft({
      primary_color: settings?.primary_color || "#0b6b2a",
      background_color: settings?.background_color || "#f4f7fb",
      background_image_url: settings?.background_image_url || "",
    });
  }, [settings]);

  return (
    <div style={styles.panel}>
      <div style={styles.h2}>Einstellungen</div>
      <div style={{ color: "#666", fontSize: 13 }}>
        Optional: Tabelle „user_settings“ (user_id, primary_color, background_color, background_image_url).
      </div>

      <div style={styles.hr} />

      <div style={styles.grid3}>
        <div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Primärfarbe</div>
          <input type="color" value={draft.primary_color} onChange={(e) => setDraft((d) => ({ ...d, primary_color: e.target.value }))} style={{ ...styles.input, padding: 6, height: 42 }} />
        </div>

        <div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Hintergrundfarbe</div>
          <input type="color" value={draft.background_color} onChange={(e) => setDraft((d) => ({ ...d, background_color: e.target.value }))} style={{ ...styles.input, padding: 6, height: 42 }} />
        </div>

        <div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Hintergrundbild URL</div>
          <input value={draft.background_image_url} onChange={(e) => setDraft((d) => ({ ...d, background_image_url: e.target.value }))} placeholder="https://…" style={styles.input} />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button style={styles.btnPrimary} onClick={() => onSave(draft)}>Speichern</button>
      </div>
    </div>
  );
}

function GuideDownloadButton({ guide, getUrl }) {
  const [loading, setLoading] = useState(false);
  const open = async () => {
    setLoading(true);
    const url = await getUrl(guide);
    setLoading(false);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };
  return (
    <button style={styles.btnSmall} onClick={open} disabled={loading}>
      {loading ? "Lade…" : "Datei öffnen"}
    </button>
  );
}

export default dynamic(() => Promise.resolve(DashboardPage), { ssr: false });
