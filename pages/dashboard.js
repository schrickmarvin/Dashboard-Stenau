// dashboard.js
import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ---------------- Supabase ---------------- */
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  // eslint-disable-next-line no-console
  console.error(
    "Missing Supabase env vars. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY"
  );
}

const supabase = createClient(SUPABASE_URL || "", SUPABASE_ANON || "");

/* ---------------- Helpers ---------------- */
const toISO = (value) => {
  if (!value) return null;
  // value can be "YYYY-MM-DDTHH:mm" (from input[type=datetime-local])
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

const startOfWeek = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Monday as first day
  const day = d.getDay(); // 0 Sun, 1 Mon ...
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d;
};

const endOfWeek = () => {
  const d = startOfWeek();
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
};

const fmtDateTime = (iso) => {
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

const makeLocalDateTimeValue = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

/* ---------------- UI Constants ---------------- */
const TABS = [
  { key: "board", label: "Board" },
  { key: "list", label: "Liste" },
  { key: "calendar", label: "Kalender" },
  { key: "timeline", label: "Timeline" },
  { key: "areas", label: "Bereiche" },
  { key: "guides", label: "Anleitung" },
  { key: "settings", label: "Einstellungen" },
];

const DUE_BUCKETS = [
  { value: "heute", label: "Heute" },
  { value: "diese_woche", label: "Diese Woche" },
  { value: "alle", label: "Alle" },
];

const THEMES = [
  { value: "hell", label: "Hell" },
  { value: "dunkel", label: "Dunkel" },
];

const BACKGROUNDS = [
  { value: "soft", label: "Soft" },
  { value: "neutral", label: "Neutral" },
  { value: "clear", label: "Clear" },
];

const ACCENTS = [
  { value: "green", label: "green" },
  { value: "blue", label: "blue" },
  { value: "orange", label: "orange" },
  { value: "purple", label: "purple" },
  { value: "gray", label: "gray" },
];

/* ---------------- Main Component ---------------- */
export default function Dashboard() {
  /* ---------- Auth ---------- */
  const [session, setSession] = useState(null);
  const user = session?.user || null;

  /* ---------- Global UI State ---------- */
  const [activeTab, setActiveTab] = useState("board");
  const [globalError, setGlobalError] = useState("");

  /* ---------- Design (local + DB) ---------- */
  const [theme, setTheme] = useState(
    localStorage.getItem("ui_theme") || "hell"
  );
  const [background, setBackground] = useState(
    localStorage.getItem("ui_background") || "soft"
  );
  const [accent, setAccent] = useState(
    localStorage.getItem("ui_accent") || "green"
  );

  /* ---------- Filters ---------- */
  const [filterAreaId, setFilterAreaId] = useState("");
  const [filterDueBucket, setFilterDueBucket] = useState("heute");
  const [search, setSearch] = useState("");

  /* ---------- Data ---------- */
  const [areas, setAreas] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [calendarItems, setCalendarItems] = useState([]);
  const [guides, setGuides] = useState([]);
  const [subtasks, setSubtasks] = useState([]);

  /* ---------- Create Task ---------- */
  const [newTitle, setNewTitle] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [newDueAtLocal, setNewDueAtLocal] = useState(makeLocalDateTimeValue());
  const [newDueBucket, setNewDueBucket] = useState("heute");
  const [newStatus, setNewStatus] = useState("open"); // open | done
  const [newGuideId, setNewGuideId] = useState("");

  /* ---------- Areas ---------- */
  const [newAreaName, setNewAreaName] = useState("");

  /* ---------- Guides ---------- */
  const [guideTitle, setGuideTitle] = useState("");
  const [guideContent, setGuideContent] = useState("");
  const [selectedGuideId, setSelectedGuideId] = useState("");
  const [uploadingGuideFile, setUploadingGuideFile] = useState(false);
  const [guideFiles, setGuideFiles] = useState([]);

  /* ---------- Subtasks ---------- */
  const [subtaskTaskId, setSubtaskTaskId] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskGuideId, setSubtaskGuideId] = useState("");

  /* ---------------- Effects: Auth ---------------- */
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session || null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession || null);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  /* ---------------- Effects: Persist Design Local ---------------- */
  useEffect(() => {
    localStorage.setItem("ui_theme", theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem("ui_background", background);
  }, [background]);
  useEffect(() => {
    localStorage.setItem("ui_accent", accent);
  }, [accent]);

  /* ---------------- Effects: Load all data when logged in ---------------- */
  useEffect(() => {
    if (!user) return;
    (async () => {
      setGlobalError("");
      await Promise.all([
        loadAreas(),
        loadGuides(),
        loadTasks(),
        loadCalendar(),
        loadSubtasks(),
        loadUserSettings(),
      ]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /* ---------------- Effects: reload tasks when filters change ---------------- */
  useEffect(() => {
    if (!user) return;
    loadTasks();
    loadCalendar(); // calendar uses due_at; keep in sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAreaId, filterDueBucket, search]);

  /* ---------------- Data Loaders ---------------- */
  const loadAreas = async () => {
    setGlobalError("");
    const { data, error } = await supabase
      .from("areas")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      setGlobalError(`Bereiche laden fehlgeschlagen: ${error.message}`);
      return;
    }
    setAreas(data || []);
    // set default area for create form if empty
    if (!newAreaId && (data || []).length > 0) setNewAreaId(data[0].id);
  };

  const loadTasks = async () => {
    setGlobalError("");

    // base query
    let query = supabase
      .from("tasks")
      .select(
        "id,title,status,area_id,due_at,due_day,is_series,repeat_enabled,guide_id,created_at,areas(name)"
      )
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    // area filter
    if (filterAreaId) query = query.eq("area_id", filterAreaId);

    // due bucket filter (uses due_at)
    if (filterDueBucket === "heute") {
      query = query
        .gte("due_at", startOfToday().toISOString())
        .lte("due_at", endOfToday().toISOString());
    }
    if (filterDueBucket === "diese_woche") {
      query = query
        .gte("due_at", startOfWeek().toISOString())
        .lte("due_at", endOfWeek().toISOString());
    }

    // search
    if (search?.trim()) query = query.ilike("title", `%${search.trim()}%`);

    const { data, error } = await query;

    if (error) {
      setGlobalError(`Aufgaben laden fehlgeschlagen: ${error.message}`);
      return;
    }
    setTasks(data || []);
  };

  const loadCalendar = async () => {
    setGlobalError("");

    // simplest: calendar reads from tasks (due_at not null)
    let query = supabase
      .from("tasks")
      .select("id,title,area_id,due_at,status,areas(name)")
      .not("due_at", "is", null)
      .order("due_at", { ascending: true });

    if (filterAreaId) query = query.eq("area_id", filterAreaId);

    // same bucket filter, so calendar matches left filter
    if (filterDueBucket === "heute") {
      query = query
        .gte("due_at", startOfToday().toISOString())
        .lte("due_at", endOfToday().toISOString());
    }
    if (filterDueBucket === "diese_woche") {
      query = query
        .gte("due_at", startOfWeek().toISOString())
        .lte("due_at", endOfWeek().toISOString());
    }

    if (search?.trim()) query = query.ilike("title", `%${search.trim()}%`);

    const { data, error } = await query;

    if (error) {
      setGlobalError(`Kalender laden fehlgeschlagen: ${error.message}`);
      return;
    }
    setCalendarItems(data || []);
  };

  const loadGuides = async () => {
    setGlobalError("");
    const { data, error } = await supabase
      .from("guides")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setGlobalError(`Anleitungen laden fehlgeschlagen: ${error.message}`);
      return;
    }
    setGuides(data || []);
  };

  const loadGuideFiles = async (gid) => {
    if (!gid) {
      setGuideFiles([]);
      return;
    }
    const { data, error } = await supabase
      .from("guide_files")
      .select("*")
      .eq("guide_id", gid)
      .order("created_at", { ascending: false });

    if (error) {
      setGlobalError(`Guide-Dateien laden fehlgeschlagen: ${error.message}`);
      return;
    }
    setGuideFiles(data || []);
  };

  const loadSubtasks = async () => {
    setGlobalError("");
    const { data, error } = await supabase
      .from("subtasks")
      .select("id,title,task_id,guide_id,done,created_at,tasks(title)")
      .order("created_at", { ascending: false });

    if (error) {
      setGlobalError(`Unteraufgaben laden fehlgeschlagen: ${error.message}`);
      return;
    }
    setSubtasks(data || []);
  };

  const loadUserSettings = async () => {
    // safe approach: select first, then apply; no upsert needed
    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return; // keep local settings

    if (data) {
      if (data.theme) setTheme(data.theme);
      if (data.background) setBackground(data.background);
      if (data.accent) setAccent(data.accent);
    }
  };

  /* ---------------- Mutations ---------------- */
  const createTask = async () => {
    setGlobalError("");
    const title = newTitle.trim();
    if (!title) return;

    // determine due_at from bucket
    let dueAtIso = toISO(newDueAtLocal);

    // if bucket is "Heute" but date not set, keep now
    if (!dueAtIso) dueAtIso = new Date().toISOString();

    const payload = {
      title,
      area_id: newAreaId || null,
      due_at: dueAtIso,
      status: newStatus === "done" ? "done" : "open",
      user_id: user.id,
      guide_id: newGuideId || null,
      // keep due_day for your views if used
      due_day: dueAtIso ? new Date(dueAtIso).toISOString().slice(0, 10) : null,
    };

    const { error } = await supabase.from("tasks").insert([payload]);

    if (error) {
      setGlobalError(`Aufgabe anlegen fehlgeschlagen: ${error.message}`);
      return;
    }

    setNewTitle("");
    await Promise.all([loadTasks(), loadCalendar()]);
  };

  const setTaskStatus = async (taskId, status) => {
    setGlobalError("");
    const next = status === "done" ? "done" : "open";
    const { error } = await supabase
      .from("tasks")
      .update({ status: next })
      .eq("id", taskId);

    if (error) {
      setGlobalError(`Status ändern fehlgeschlagen: ${error.message}`);
      return;
    }
    await Promise.all([loadTasks(), loadCalendar()]);
  };

  const deleteTask = async (taskId) => {
    setGlobalError("");
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) {
      setGlobalError(`Aufgabe löschen fehlgeschlagen: ${error.message}`);
      return;
    }
    await Promise.all([loadTasks(), loadCalendar(), loadSubtasks()]);
  };

  const createArea = async () => {
    setGlobalError("");
    const name = newAreaName.trim();
    if (!name) return;

    const { error } = await supabase.from("areas").insert([{ name }]);
    if (error) {
      setGlobalError(`Bereich anlegen fehlgeschlagen: ${error.message}`);
      return;
    }
    setNewAreaName("");
    await loadAreas();
  };

  const deleteArea = async (areaId) => {
    setGlobalError("");

    // protect: if tasks exist -> block
    const { count, error: cntErr } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("area_id", areaId);

    if (cntErr) {
      setGlobalError(`Bereich prüfen fehlgeschlagen: ${cntErr.message}`);
      return;
    }
    if ((count || 0) > 0) {
      setGlobalError("Bereich kann nicht gelöscht werden, solange Aufgaben darin existieren.");
      return;
    }

    const { error } = await supabase.from("areas").delete().eq("id", areaId);
    if (error) {
      setGlobalError(`Bereich löschen fehlgeschlagen: ${error.message}`);
      return;
    }
    if (filterAreaId === areaId) setFilterAreaId("");
    await loadAreas();
  };

  const saveGuide = async () => {
    setGlobalError("");
    const title = guideTitle.trim();
    if (!title) return;

    const payload = {
      title,
      content: guideContent || null,
      user_id: user.id,
    };

    const { data, error } = await supabase.from("guides").insert([payload]).select("*").single();

    if (error) {
      setGlobalError(`Anleitung speichern fehlgeschlagen: ${error.message}`);
      return;
    }

    setGuideTitle("");
    setGuideContent("");
    await loadGuides();

    // auto select new guide
    if (data?.id) {
      setSelectedGuideId(data.id);
      await loadGuideFiles(data.id);
    }
  };

  const onSelectGuide = async (gid) => {
    setSelectedGuideId(gid);
    await loadGuideFiles(gid);
  };

  const uploadGuideFile = async (file) => {
    if (!file || !selectedGuideId) return;
    setGlobalError("");
    setUploadingGuideFile(true);
    try {
      // store file in bucket: guides
      const ext = file.name.split(".").pop();
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${selectedGuideId}/${Date.now()}_${safeName}`;

      const { error: upErr } = await supabase.storage
        .from("guides")
        .upload(path, file, { upsert: false });

      if (upErr) {
        setGlobalError(`Upload fehlgeschlagen: ${upErr.message}`);
        return;
      }

      // record in guide_files
      const { error: dbErr } = await supabase.from("guide_files").insert([
        {
          guide_id: selectedGuideId,
          path,
          filename: file.name,
          mime_type: file.type || null,
          user_id: user.id,
        },
      ]);

      if (dbErr) {
        setGlobalError(`Datei speichern fehlgeschlagen: ${dbErr.message}`);
        return;
      }

      await loadGuideFiles(selectedGuideId);
    } finally {
      setUploadingGuideFile(false);
    }
  };

  const getGuideFileUrl = (path) => {
    if (!path) return "";
    const { data } = supabase.storage.from("guides").getPublicUrl(path);
    return data?.publicUrl || "";
  };

  const deleteGuideFile = async (fileRow) => {
    if (!fileRow?.id) return;
    setGlobalError("");

    const path = fileRow.path;

    // remove storage file first (best effort)
    if (path) {
      await supabase.storage.from("guides").remove([path]);
    }

    const { error } = await supabase.from("guide_files").delete().eq("id", fileRow.id);
    if (error) {
      setGlobalError(`Datei löschen fehlgeschlagen: ${error.message}`);
      return;
    }
    await loadGuideFiles(selectedGuideId);
  };

  const createSubtask = async () => {
    setGlobalError("");
    const t = subtaskTitle.trim();
    if (!t || !subtaskTaskId) return;

    const payload = {
      task_id: subtaskTaskId,
      title: t,
      guide_id: subtaskGuideId || null,
      done: false,
      user_id: user.id,
    };

    const { error } = await supabase.from("subtasks").insert([payload]);
    if (error) {
      setGlobalError(`Unteraufgabe anlegen fehlgeschlagen: ${error.message}`);
      return;
    }
    setSubtaskTitle("");
    await loadSubtasks();
  };

  const toggleSubtaskDone = async (sid, done) => {
    setGlobalError("");
    const { error } = await supabase.from("subtasks").update({ done: !!done }).eq("id", sid);
    if (error) {
      setGlobalError(`Unteraufgabe Status ändern fehlgeschlagen: ${error.message}`);
      return;
    }
    await loadSubtasks();
  };

  const deleteSubtask = async (sid) => {
    setGlobalError("");
    const { error } = await supabase.from("subtasks").delete().eq("id", sid);
    if (error) {
      setGlobalError(`Unteraufgabe löschen fehlgeschlagen: ${error.message}`);
      return;
    }
    await loadSubtasks();
  };

  const saveUserSettings = async () => {
    setGlobalError("");
    // safe approach: select -> insert or update (no upsert / ON CONFLICT)
    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      setGlobalError(`Einstellungen lesen fehlgeschlagen: ${error.message}`);
      return;
    }

    const payload = {
      user_id: user.id,
      theme,
      background,
      accent,
      updated_at: new Date().toISOString(),
    };

    if (data?.user_id) {
      const { error: upErr } = await supabase
        .from("user_settings")
        .update(payload)
        .eq("user_id", user.id);
      if (upErr) {
        setGlobalError(`Einstellungen speichern fehlgeschlagen: ${upErr.message}`);
        return;
      }
    } else {
      const { error: insErr } = await supabase.from("user_settings").insert([payload]);
      if (insErr) {
        setGlobalError(`Einstellungen speichern fehlgeschlagen: ${insErr.message}`);
        return;
      }
    }
  };

  /* ---------------- Auth UI Actions ---------------- */
  const signOut = async () => {
    setGlobalError("");
    await supabase.auth.signOut();
  };

  /* ---------------- Derived ---------------- */
  const accentColor = useMemo(() => {
    // simple mapping
    switch (accent) {
      case "blue":
        return "#2563eb";
      case "orange":
        return "#f97316";
      case "purple":
        return "#7c3aed";
      case "gray":
        return "#374151";
      case "green":
      default:
        return "#0a7a1e";
    }
  }, [accent]);

  const ui = useMemo(() => {
    const isDark = theme === "dunkel";

    const bg = (() => {
      if (background === "clear") return isDark ? "#0b1220" : "#f6f7fb";
      if (background === "neutral") return isDark ? "#0f172a" : "#f2f4f7";
      return isDark ? "#0c1526" : "#eef2ff"; // soft
    })();

    const card = isDark ? "#0f1b33" : "#ffffff";
    const text = isDark ? "#e5e7eb" : "#111827";
    const sub = isDark ? "#9ca3af" : "#6b7280";
    const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(17,24,39,0.10)";

    return { isDark, bg, card, text, sub, border };
  }, [theme, background]);

  const counts = useMemo(() => {
    const todayFrom = startOfToday().toISOString();
    const todayTo = endOfToday().toISOString();
    const weekFrom = startOfWeek().toISOString();
    const weekTo = endOfWeek().toISOString();

    const inRange = (t, from, to) => t?.due_at && t.due_at >= from && t.due_at <= to;

    const tasksToday = tasks.filter((t) => inRange(t, todayFrom, todayTo));
    const tasksWeek = tasks.filter((t) => inRange(t, weekFrom, weekTo));
    const open = tasks.filter((t) => (t.status || "open") !== "done");

    return {
      today: tasksToday.length,
      week: tasksWeek.length,
      open: open.length,
    };
  }, [tasks]);

  const boardOpen = useMemo(() => tasks.filter((t) => (t.status || "open") !== "done"), [tasks]);
  const boardDone = useMemo(() => tasks.filter((t) => (t.status || "open") === "done"), [tasks]);

  const subtasksByTask = useMemo(() => {
    const map = new Map();
    for (const s of subtasks) {
      const key = s.task_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    return map;
  }, [subtasks]);

  /* ---------------- Styles ---------------- */
  const styles = {
    page: {
      minHeight: "100vh",
      background: ui.bg,
      color: ui.text,
      fontFamily:
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,Arial,sans-serif',
    },
    container: { maxWidth: 1280, margin: "0 auto", padding: 18 },
    grid: {
      display: "grid",
      gridTemplateColumns: "320px 1fr",
      gap: 18,
      alignItems: "start",
    },
    card: {
      background: ui.card,
      border: `1px solid ${ui.border}`,
      borderRadius: 16,
      padding: 16,
      boxShadow: ui.isDark ? "none" : "0 10px 30px rgba(0,0,0,0.06)",
    },
    h: { margin: 0, fontSize: 18, fontWeight: 600 },
    small: { color: ui.sub, fontSize: 13 },
    btn: {
      background: accentColor,
      color: "#fff",
      border: "none",
      padding: "10px 14px",
      borderRadius: 12,
      cursor: "pointer",
      fontWeight: 600,
      whiteSpace: "nowrap",
    },
    btnGhost: {
      background: "transparent",
      color: ui.text,
      border: `1px solid ${ui.border}`,
      padding: "10px 14px",
      borderRadius: 12,
      cursor: "pointer",
      fontWeight: 600,
      whiteSpace: "nowrap",
    },
    input: {
      width: "100%",
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${ui.border}`,
      background: ui.isDark ? "#0b1427" : "#ffffff",
      color: ui.text,
      outline: "none",
    },
    select: {
      width: "100%",
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${ui.border}`,
      background: ui.isDark ? "#0b1427" : "#ffffff",
      color: ui.text,
      outline: "none",
    },
    tabs: { display: "flex", gap: 10, flexWrap: "wrap" },
    tab: (active) => ({
      padding: "8px 12px",
      borderRadius: 999,
      border: `1px solid ${ui.border}`,
      background: active ? accentColor : ui.card,
      color: active ? "#fff" : ui.text,
      cursor: "pointer",
      fontWeight: 600,
      fontSize: 13,
    }),
    row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
    pill: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 10px",
      borderRadius: 999,
      border: `1px solid ${ui.border}`,
      fontSize: 13,
      color: ui.sub,
    },
    danger: {
      background: "transparent",
      color: "#ef4444",
      border: "1px solid rgba(239,68,68,0.35)",
      padding: "8px 12px",
      borderRadius: 12,
      cursor: "pointer",
      fontWeight: 600,
    },
    hr: { border: 0, borderTop: `1px solid ${ui.border}`, margin: "14px 0" },
  };

  /* ---------------- Login Screen ---------------- */
  if (!user) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.container, maxWidth: 760, paddingTop: 70 }}>
          <div style={{ ...styles.card, padding: 22 }}>
            <div style={styles.row}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
                  Anmeldung
                </div>
                <div style={styles.small}>Armaturenbrett</div>
              </div>
              <div style={styles.small}>Design ist bereits wählbar</div>
            </div>

            <LoginBox
              supabase={supabase}
              styles={styles}
              accentColor={accentColor}
              theme={theme}
              setTheme={setTheme}
              background={background}
              setBackground={setBackground}
              accent={accent}
              setAccent={setAccent}
            />

            <div style={{ marginTop: 14, ...styles.small }}>
              Hinweis: Nach Login werden Einstellungen zusätzlich in der DB gespeichert.
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- App Shell ---------------- */
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Top Tabs */}
        <div style={{ ...styles.row, justifyContent: "space-between", marginBottom: 12 }}>
          <div style={styles.tabs}>
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                style={styles.tab(activeTab === t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={styles.row}>
            <span style={styles.pill}>{user.email}</span>
            <button type="button" style={styles.btnGhost} onClick={signOut}>
              Abmelden
            </button>
          </div>
        </div>

        {globalError ? (
          <div
            style={{
              ...styles.card,
              borderColor: "rgba(239,68,68,0.4)",
              background: ui.isDark ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.06)",
              color: ui.text,
              marginBottom: 12,
            }}
          >
            {globalError}
          </div>
        ) : null}

        <div style={styles.grid}>
          {/* Left Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={styles.card}>
              <div style={{ ...styles.h, marginBottom: 10 }}>Übersicht</div>
              <div style={{ display: "grid", gap: 10 }}>
                <MiniStat label="Aufgaben heute" value={counts.today} styles={styles} />
                <MiniStat label="Diese Woche" value={counts.week} styles={styles} />
                <MiniStat label="Offen" value={counts.open} styles={styles} />
              </div>
            </div>

            <div style={styles.card}>
              <div style={{ ...styles.h, marginBottom: 10 }}>Navigation</div>
              <div style={{ display: "grid", gap: 10 }}>
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    style={{
                      ...styles.btnGhost,
                      background: activeTab === t.key ? accentColor : "transparent",
                      color: activeTab === t.key ? "#fff" : ui.text,
                    }}
                    onClick={() => setActiveTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.card}>
              <div style={{ ...styles.h, marginBottom: 10 }}>Filter</div>

              <div style={{ display: "grid", gap: 10 }}>
                <select
                  style={styles.select}
                  value={filterAreaId}
                  onChange={(e) => setFilterAreaId(e.target.value)}
                >
                  <option value="">Alle Bereiche</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>

                <select
                  style={styles.select}
                  value={filterDueBucket}
                  onChange={(e) => setFilterDueBucket(e.target.value)}
                >
                  {DUE_BUCKETS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>

                <input
                  style={styles.input}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Suche..."
                />
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Create Task */}
            <div style={styles.card}>
              <div style={{ ...styles.h, marginBottom: 10 }}>Aufgabe anlegen</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 220px 220px 180px 170px 140px", gap: 10 }}>
                <input
                  style={styles.input}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Titel"
                />

                <select
                  style={styles.select}
                  value={newAreaId}
                  onChange={(e) => setNewAreaId(e.target.value)}
                >
                  <option value="">Bereich wählen...</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>

                <input
                  style={styles.input}
                  type="datetime-local"
                  value={newDueAtLocal}
                  onChange={(e) => setNewDueAtLocal(e.target.value)}
                />

                <select
                  style={styles.select}
                  value={newDueBucket}
                  onChange={(e) => setNewDueBucket(e.target.value)}
                >
                  {DUE_BUCKETS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>

                <select
                  style={styles.select}
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                >
                  <option value="open">Zu erledigen</option>
                  <option value="done">Erledigt</option>
                </select>

                <button type="button" style={styles.btn} onClick={createTask}>
                  Anlegen
                </button>
              </div>

              <div style={{ marginTop: 10, maxWidth: 420 }}>
                <select
                  style={styles.select}
                  value={newGuideId}
                  onChange={(e) => setNewGuideId(e.target.value)}
                >
                  <option value="">Anleitung verknüpfen (optional)</option>
                  {guides.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginTop: 8, ...styles.small }}>
                Kalender nutzt due_at. Filter nutzt Bereich und Zeitraum.
              </div>
            </div>

            {/* Active Tab Content */}
            {activeTab === "board" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={styles.card}>
                  <div style={{ ...styles.h, marginBottom: 10 }}>Zu erledigen</div>
                  {boardOpen.length === 0 ? (
                    <div style={styles.small}>Keine Aufgaben</div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {boardOpen.map((t) => (
                        <TaskCard
                          key={t.id}
                          t={t}
                          styles={styles}
                          accentColor={accentColor}
                          onDone={() => setTaskStatus(t.id, "done")}
                          onOpen={() => setTaskStatus(t.id, "open")}
                          onDelete={() => deleteTask(t.id)}
                          subtasks={subtasksByTask.get(t.id) || []}
                          guides={guides}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div style={styles.card}>
                  <div style={{ ...styles.h, marginBottom: 10 }}>Erledigt</div>
                  {boardDone.length === 0 ? (
                    <div style={styles.small}>Keine Aufgaben</div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {boardDone.map((t) => (
                        <TaskCard
                          key={t.id}
                          t={t}
                          styles={styles}
                          accentColor={accentColor}
                          onDone={() => setTaskStatus(t.id, "done")}
                          onOpen={() => setTaskStatus(t.id, "open")}
                          onDelete={() => deleteTask(t.id)}
                          subtasks={subtasksByTask.get(t.id) || []}
                          guides={guides}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "list" && (
              <div style={styles.card}>
                <div style={{ ...styles.h, marginBottom: 10 }}>Liste</div>
                {tasks.length === 0 ? (
                  <div style={styles.small}>Keine Aufgaben</div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: ui.sub }}>
                          <th style={{ padding: "10px 8px" }}>Aufgabe</th>
                          <th style={{ padding: "10px 8px" }}>Bereich</th>
                          <th style={{ padding: "10px 8px" }}>Datum/Uhrzeit</th>
                          <th style={{ padding: "10px 8px" }}>Status</th>
                          <th style={{ padding: "10px 8px" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.map((t) => (
                          <tr key={t.id} style={{ borderTop: `1px solid ${ui.border}` }}>
                            <td style={{ padding: "10px 8px" }}>{t.title}</td>
                            <td style={{ padding: "10px 8px" }}>
                              {t.areas?.name || ""}
                            </td>
                            <td style={{ padding: "10px 8px" }}>
                              {fmtDateTime(t.due_at)}
                            </td>
                            <td style={{ padding: "10px 8px" }}>
                              {(t.status || "open") === "done" ? "Erledigt" : "Zu erledigen"}
                            </td>
                            <td style={{ padding: "10px 8px", textAlign: "right" }}>
                              {(t.status || "open") === "done" ? (
                                <button
                                  style={styles.btnGhost}
                                  type="button"
                                  onClick={() => setTaskStatus(t.id, "open")}
                                >
                                  Wieder öffnen
                                </button>
                              ) : (
                                <button
                                  style={styles.btn}
                                  type="button"
                                  onClick={() => setTaskStatus(t.id, "done")}
                                >
                                  Erledigt
                                </button>
                              )}
                              <span style={{ marginLeft: 10 }}>
                                <button
                                  style={styles.danger}
                                  type="button"
                                  onClick={() => deleteTask(t.id)}
                                >
                                  Löschen
                                </button>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === "calendar" && (
              <div style={styles.card}>
                <div style={{ ...styles.h, marginBottom: 10 }}>Kalender</div>
                {calendarItems.length === 0 ? (
                  <div style={styles.small}>
                    Keine Kalender-Einträge (keine Aufgaben mit due_at im aktuellen Filter).
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {calendarItems.map((c) => (
                      <div
                        key={c.id}
                        style={{
                          border: `1px solid ${ui.border}`,
                          borderRadius: 14,
                          padding: 12,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ fontWeight: 700 }}>{c.title}</div>
                          <div style={styles.small}>{fmtDateTime(c.due_at)}</div>
                        </div>
                        <div style={{ marginTop: 6, ...styles.small }}>
                          Bereich: {c.areas?.name || "-"} · Status:{" "}
                          {(c.status || "open") === "done" ? "Erledigt" : "Zu erledigen"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "timeline" && (
              <div style={styles.card}>
                <div style={{ ...styles.h, marginBottom: 10 }}>Timeline</div>
                <div style={styles.small}>
                  Aktuell einfache Darstellung nach due_at. Später können wir hier eine echte Zeitachse bauen.
                </div>
                <div style={styles.hr} />
                {calendarItems.length === 0 ? (
                  <div style={styles.small}>Keine Einträge</div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {calendarItems.map((c) => (
                      <div
                        key={c.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          border: `1px solid ${ui.border}`,
                          borderRadius: 14,
                          padding: 12,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700 }}>{c.title}</div>
                          <div style={styles.small}>{c.areas?.name || "-"}</div>
                        </div>
                        <div style={styles.small}>{fmtDateTime(c.due_at)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "areas" && (
              <div style={styles.card}>
                <div style={{ ...styles.h, marginBottom: 10 }}>Bereiche</div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    style={styles.input}
                    value={newAreaName}
                    onChange={(e) => setNewAreaName(e.target.value)}
                    placeholder="Neuer Bereichname..."
                  />
                  <button type="button" style={styles.btn} onClick={createArea}>
                    Anlegen
                  </button>
                </div>

                <div style={styles.hr} />

                <div style={{ display: "grid", gap: 10 }}>
                  {areas.map((a) => (
                    <div
                      key={a.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                        border: `1px solid ${ui.border}`,
                        borderRadius: 14,
                        padding: 12,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            background: accentColor,
                            display: "inline-block",
                          }}
                        />
                        <div>{a.name}</div>
                      </div>

                      <button
                        type="button"
                        style={styles.danger}
                        onClick={() => deleteArea(a.id)}
                      >
                        Löschen
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "guides" && (
              <div style={styles.card}>
                <div style={{ ...styles.h, marginBottom: 10 }}>Anleitung</div>

                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 14 }}>
                  {/* Create + select */}
                  <div style={{ border: `1px solid ${ui.border}`, borderRadius: 16, padding: 14 }}>
                    <div style={{ fontWeight: 700, marginBottom: 10 }}>Anleitung anlegen</div>

                    <input
                      style={styles.input}
                      value={guideTitle}
                      onChange={(e) => setGuideTitle(e.target.value)}
                      placeholder="Titel (z. B. Twence anmelden)"
                    />

                    <div style={{ height: 10 }} />

                    <textarea
                      style={{ ...styles.input, minHeight: 140, resize: "vertical" }}
                      value={guideContent}
                      onChange={(e) => setGuideContent(e.target.value)}
                      placeholder="Inhalt / Hinweis / Ansprechpartner / Link..."
                    />

                    <div style={{ height: 10 }} />

                    <button type="button" style={{ ...styles.btn, width: "100%" }} onClick={saveGuide}>
                      Anleitung speichern
                    </button>

                    <div style={styles.hr} />

                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Vorhandene Anleitungen</div>
                    <select
                      style={styles.select}
                      value={selectedGuideId}
                      onChange={(e) => onSelectGuide(e.target.value)}
                    >
                      <option value="">— auswählen —</option>
                      {guides.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title}
                        </option>
                      ))}
                    </select>

                    <div style={{ marginTop: 10, ...styles.small }}>
                      Zielbild: Hauptaufgabe → Unteraufgabe → Verweis zur Anleitung.
                      Die Verknüpfung ist bereits über guide_id möglich.
                    </div>
                  </div>

                  {/* Upload + list */}
                  <div style={{ border: `1px solid ${ui.border}`, borderRadius: 16, padding: 14 }}>
                    <div style={{ fontWeight: 700, marginBottom: 10 }}>Dateien hochladen</div>

                    <div style={styles.small}>Bucket: guides</div>
                    <div style={{ height: 8 }} />

                    <input
                      type="file"
                      disabled={!selectedGuideId || uploadingGuideFile}
                      onChange={(e) => uploadGuideFile(e.target.files?.[0])}
                    />

                    <div style={{ marginTop: 10, ...styles.small }}>
                      {selectedGuideId ? "Dateien zur ausgewählten Anleitung:" : "Bitte Anleitung auswählen."}
                    </div>

                    <div style={{ height: 10 }} />

                    {guideFiles.length === 0 ? (
                      <div style={styles.small}>Keine Dateien</div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {guideFiles.map((f) => {
                          const url = getGuideFileUrl(f.path);
                          return (
                            <div
                              key={f.id}
                              style={{
                                border: `1px solid ${ui.border}`,
                                borderRadius: 14,
                                padding: 12,
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 10,
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {f.filename || f.path}
                                </div>
                                {url ? (
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ ...styles.small, color: accentColor, textDecoration: "none" }}
                                  >
                                    Öffnen
                                  </a>
                                ) : (
                                  <div style={styles.small}>Kein Public-URL verfügbar</div>
                                )}
                              </div>
                              <button type="button" style={styles.danger} onClick={() => deleteGuideFile(f)}>
                                Löschen
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div style={styles.hr} />

                {/* Subtasks */}
                <div style={{ border: `1px solid ${ui.border}`, borderRadius: 16, padding: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>Unteraufgabe anlegen</div>

                  <div style={{ display: "grid", gridTemplateColumns: "320px 1fr 280px 140px", gap: 10 }}>
                    <select
                      style={styles.select}
                      value={subtaskTaskId}
                      onChange={(e) => setSubtaskTaskId(e.target.value)}
                    >
                      <option value="">Hauptaufgabe wählen...</option>
                      {tasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>

                    <input
                      style={styles.input}
                      value={subtaskTitle}
                      onChange={(e) => setSubtaskTitle(e.target.value)}
                      placeholder="Unteraufgabe..."
                    />

                    <select
                      style={styles.select}
                      value={subtaskGuideId}
                      onChange={(e) => setSubtaskGuideId(e.target.value)}
                    >
                      <option value="">Anleitung verknüpfen (optional)</option>
                      {guides.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title}
                        </option>
                      ))}
                    </select>

                    <button type="button" style={styles.btn} onClick={createSubtask}>
                      Anlegen
                    </button>
                  </div>

                  <div style={{ marginTop: 12, ...styles.small }}>
                    Verknüpfung Unteraufgabe → Anleitung läuft über guide_id in subtasks.
                  </div>

                  <div style={styles.hr} />

                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Vorhandene Unteraufgaben</div>
                  {subtasks.length === 0 ? (
                    <div style={styles.small}>Keine Unteraufgaben</div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {subtasks.map((s) => (
                        <div
                          key={s.id}
                          style={{
                            border: `1px solid ${ui.border}`,
                            borderRadius: 14,
                            padding: 12,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700 }}>
                              {s.done ? "✓ " : ""}{s.title}
                            </div>
                            <div style={styles.small}>
                              Hauptaufgabe: {s.tasks?.title || "-"}
                            </div>
                          </div>
                          <div style={styles.row}>
                            <button
                              type="button"
                              style={styles.btnGhost}
                              onClick={() => toggleSubtaskDone(s.id, !s.done)}
                            >
                              {s.done ? "Offen" : "Erledigt"}
                            </button>
                            <button type="button" style={styles.danger} onClick={() => deleteSubtask(s.id)}>
                              Löschen
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "settings" && (
              <div style={styles.card}>
                <div style={{ ...styles.h, marginBottom: 10 }}>Einstellungen</div>

                <div style={{ display: "grid", gridTemplateColumns: "260px 260px 260px 160px", gap: 10 }}>
                  <div>
                    <div style={styles.small}>Theme</div>
                    <select style={styles.select} value={theme} onChange={(e) => setTheme(e.target.value)}>
                      {THEMES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div style={styles.small}>Hintergrund</div>
                    <select
                      style={styles.select}
                      value={background}
                      onChange={(e) => setBackground(e.target.value)}
                    >
                      {BACKGROUNDS.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div style={styles.small}>Akzent</div>
                    <select style={styles.select} value={accent} onChange={(e) => setAccent(e.target.value)}>
                      {ACCENTS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <button type="button" style={styles.btn} onClick={saveUserSettings}>
                      Speichern
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 12, ...styles.small }}>
                  Benachrichtigungen bauen wir als nächsten Schritt (pro User ein/aus).
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Subcomponents ---------------- */
function MiniStat({ label, value, styles }) {
  return (
    <div style={{ ...styles.card, padding: 12, borderRadius: 14 }}>
      <div style={styles.small}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function TaskCard({ t, styles, onDone, onOpen, onDelete, subtasks, guides }) {
  const isDone = (t.status || "open") === "done";
  const guideTitle = t.guide_id ? guides.find((g) => g.id === t.guide_id)?.title : "";

  return (
    <div
      style={{
        border: `1px solid ${styles.card.border || "rgba(0,0,0,0.08)"}`,
        borderRadius: 14,
        padding: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 800 }}>{t.title}</div>
        <div style={styles.small}>{t.due_at ? fmtDateTime(t.due_at) : ""}</div>
      </div>

      <div style={{ marginTop: 6, ...styles.small }}>
        Bereich: {t.areas?.name || "-"} · Status: {isDone ? "Erledigt" : "Zu erledigen"}
        {guideTitle ? ` · Anleitung: ${guideTitle}` : ""}
      </div>

      {subtasks?.length ? (
        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
          {subtasks.slice(0, 4).map((s) => (
            <div key={s.id} style={styles.small}>
              {s.done ? "✓ " : "• "}
              {s.title}
            </div>
          ))}
          {subtasks.length > 4 ? <div style={styles.small}>…</div> : null}
        </div>
      ) : null}

      <div style={{ marginTop: 10, display: "flex", gap: 10, justifyContent: "flex-end" }}>
        {isDone ? (
          <button type="button" style={styles.btnGhost} onClick={onOpen}>
            Wieder öffnen
          </button>
        ) : (
          <button type="button" style={styles.btn} onClick={onDone}>
            Erledigt
          </button>
        )}
        <button type="button" style={styles.danger} onClick={onDelete}>
          Löschen
        </button>
      </div>
    </div>
  );
}

function LoginBox({
  supabase,
  styles,
  theme,
  setTheme,
  background,
  setBackground,
  accent,
  setAccent,
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login"); // login | signup
  const [msg, setMsg] = useState("");

  const onSubmit = async () => {
    setMsg("");
    const e = email.trim();
    const p = password;
    if (!e || !p) return;

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: e, password: p });
      if (error) setMsg(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email: e, password: p });
      if (error) setMsg(error.message);
      else setMsg("Konto erstellt. Falls E-Mail-Bestätigung aktiv ist: bitte bestätigen.");
    }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "grid", gap: 10 }}>
        <input
          style={styles.input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-Mail"
        />
        <input
          style={styles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Passwort"
        />

        <button type="button" style={{ ...styles.btn, width: "100%" }} onClick={onSubmit}>
          {mode === "login" ? "Anmelden" : "Neues Konto erstellen"}
        </button>

        <button
          type="button"
          style={{ ...styles.btnGhost, width: "100%" }}
          onClick={() => setMode((m) => (m === "login" ? "signup" : "login"))}
        >
          {mode === "login" ? "Neues Konto erstellen" : "Zur Anmeldung"}
        </button>

        {msg ? <div style={{ ...styles.small, color: "#ef4444" }}>{msg}</div> : null}

        <div style={styles.hr} />

        <div style={styles.small}>Design</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={styles.small}>Theme</div>
            <select style={styles.select} value={theme} onChange={(e) => setTheme(e.target.value)}>
              {THEMES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={styles.small}>Hintergrund</div>
            <select
              style={styles.select}
              value={background}
              onChange={(e) => setBackground(e.target.value)}
            >
              {BACKGROUNDS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <div style={styles.small}>Akzent</div>
            <select style={styles.select} value={accent} onChange={(e) => setAccent(e.target.value)}>
              {ACCENTS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
