// pages/dashboard.js
import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Falls dein Storage-Bucket anders heißt, hier ändern:
const GUIDES_BUCKET = "guides";

const TABS = [
  { id: "board", label: "Board" },
  { id: "list", label: "Liste" },
  { id: "calendar", label: "Kalender" },
  { id: "timeline", label: "Timeline" },
  { id: "guides", label: "Anleitungen" },
  { id: "internal", label: "Intern" } // „Chef Cockpit“ nicht klar erkennbar
];

const STATUSES = [
  { id: "todo", label: "Zu erledigen" },
  { id: "doing", label: "In Arbeit" },
  { id: "done", label: "Erledigt" }
];

const PERIODS = [
  { id: "Heute", label: "Heute" },
  { id: "Diese Woche", label: "Diese Woche" },
  { id: "Monat", label: "Monat" },
  { id: "Jahr", label: "Jahr" }
];

function safeStr(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function toISODate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Mo=0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isEmailAdmin(email) {
  // Minimal: erster User (du) = Admin
  // Wenn du später richtige Rollen willst, machen wir das über profiles.role
  return !!email && email.toLowerCase().includes("@");
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("board");

  const [areas, setAreas] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [subtasksByTask, setSubtasksByTask] = useState({});
  const [guides, setGuides] = useState([]);

  const [loadingData, setLoadingData] = useState(false);

  // Filter
  const [filterArea, setFilterArea] = useState("ALL");
  const [filterPeriod, setFilterPeriod] = useState("ALL");
  const [search, setSearch] = useState("");

  // Create Task
  const [newTitle, setNewTitle] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [newPeriod, setNewPeriod] = useState("Heute");
  const [newStatus, setNewStatus] = useState("todo");
  const [newDueDate, setNewDueDate] = useState(toISODate(new Date())); // optional: falls du due_date nutzt
  const [newDueBucket, setNewDueBucket] = useState("Heute"); // optional: falls du due_bucket nutzt

  // Subtask quick add
  const [subtaskDraft, setSubtaskDraft] = useState({}); // taskId -> text
  const [expandedTaskId, setExpandedTaskId] = useState(null);

  // Calendar
  const [weekAnchor, setWeekAnchor] = useState(new Date());

  // Guides
  const [guideAreaId, setGuideAreaId] = useState("");
  const [guideTitle, setGuideTitle] = useState("");
  const [guideContent, setGuideContent] = useState("");

  // ---------- AUTH ----------
  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      setAuthLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      if (typeof window !== "undefined") window.location.href = "/";
    }
  }, [authLoading, user]);

  async function signOut() {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") window.location.href = "/";
  }

  // ---------- LOAD DATA ----------
  const loadAreas = useCallback(async () => {
    const { data, error } = await supabase.from("areas").select("id,name").order("name", { ascending: true });
    if (error) throw error;
    setAreas(Array.isArray(data) ? data : []);
  }, []);

  const loadTasks = useCallback(async () => {
    // Wir versuchen mehrere Spaltenvarianten – je nachdem, wie dein Schema heißt.
    // Erwartet mindestens: id, title, status, period, area_id
    const { data, error } = await supabase
      .from("tasks")
      .select("id,title,status,period,area_id,due_date,due_bucket,created_at,areas(name)")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const normalized = (Array.isArray(data) ? data : []).map((t) => ({
      id: t.id,
      title: safeStr(t.title),
      status: t.status || "todo",
      period: t.period || "Heute",
      area_id: t.area_id || null,
      area_name: t.areas?.name || "",
      due_date: t.due_date || null, // wenn vorhanden
      due_bucket: t.due_bucket || null // wenn vorhanden
    }));

    setTasks(normalized);
  }, []);

  const loadSubtasksForTasks = useCallback(async (taskIds) => {
    if (!taskIds.length) {
      setSubtasksByTask({});
      return;
    }

    const { data, error } = await supabase
      .from("subtasks")
      .select("id,task_id,title,status,created_at")
      .in("task_id", taskIds)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const map = {};
    for (const s of Array.isArray(data) ? data : []) {
      const tid = s.task_id;
      if (!map[tid]) map[tid] = [];
      map[tid].push({
        id: s.id,
        task_id: s.task_id,
        title: safeStr(s.title),
        status: s.status || "todo"
      });
    }
    setSubtasksByTask(map);
  }, []);

  const loadGuides = useCallback(async () => {
    // Wir lesen nur Standardfelder – falls deine Tabelle mehr hat, ist egal.
    const { data, error } = await supabase
      .from("guides")
      .select("id,title,content,area_id,file_path,created_at,areas(name)")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const normalized = (Array.isArray(data) ? data : []).map((g) => ({
      id: g.id,
      title: safeStr(g.title),
      content: safeStr(g.content),
      area_id: g.area_id || null,
      area_name: g.areas?.name || "",
      file_path: g.file_path || null,
      created_at: g.created_at
    }));

    setGuides(normalized);
  }, []);

  const reloadAll = useCallback(async () => {
    setLoadingData(true);
    try {
      await loadAreas();
      await loadTasks();
      // Subtasks brauchen Task-IDs
      const ids = tasks.length ? tasks.map((t) => t.id) : [];
      // Wichtig: tasks state ist async – daher nach loadTasks direkt nochmal aus DB:
      const { data: freshTasks } = await supabase
        .from("tasks")
        .select("id")
        .order("created_at", { ascending: false });
      const freshIds = (Array.isArray(freshTasks) ? freshTasks : []).map((x) => x.id);
      await loadSubtasksForTasks(freshIds);
      await loadGuides();
    } catch (e) {
      alert("Fehler beim Laden: " + (e?.message || e));
    } finally {
      setLoadingData(false);
    }
  }, [loadAreas, loadTasks, loadSubtasksForTasks, loadGuides, tasks.length]);

  useEffect(() => {
    if (!user) return;
    reloadAll();
  }, [user, reloadAll]);

  // ---------- CREATE TASK ----------
  async function createTask() {
    const title = safeStr(newTitle).trim();
    if (!title) return alert("Bitte Titel eingeben.");
    if (!newAreaId) return alert("Bitte Bereich auswählen.");

    // Wir insertieren defensiv: wenn due_date / due_bucket nicht existieren, ignoriert PostgREST es NICHT,
    // sondern würde Fehler werfen. Deshalb testen wir zuerst per try/catch mit minimal payload.
    const base = {
      title,
      area_id: newAreaId,
      period: newPeriod,
      status: newStatus
    };

    // optionaler Versuch: due_date + due_bucket
    const tryPayload = {
      ...base,
      due_date: newDueDate,
      due_bucket: newDueBucket
    };

    let insertError = null;

    // Versuch 1: mit due_date + due_bucket
    {
      const { error } = await supabase.from("tasks").insert(tryPayload);
      if (!error) {
        setNewTitle("");
        setNewStatus("todo");
        setNewPeriod("Heute");
        setNewDueDate(toISODate(new Date()));
        setNewDueBucket("Heute");
        await reloadAll();
        return;
      }
      insertError = error;
    }

    // Versuch 2: nur base
    {
      const { error } = await supabase.from("tasks").insert(base);
      if (!error) {
        setNewTitle("");
        setNewStatus("todo");
        setNewPeriod("Heute");
        setNewDueDate(toISODate(new Date()));
        setNewDueBucket("Heute");
        await reloadAll();
        return;
      }
      insertError = error;
    }

    alert("Fehler beim Anlegen: " + (insertError?.message || insertError));
  }

  async function updateTaskStatus(taskId, status) {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
    if (error) return alert("Fehler: " + error.message);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
  }

  // ---------- SUBTASKS ----------
  async function addSubtask(taskId) {
    const title = safeStr(subtaskDraft[taskId]).trim();
    if (!title) return;

    const { error } = await supabase.from("subtasks").insert({
      task_id: taskId,
      title,
      status: "todo"
    });

    if (error) return alert("Fehler Unteraufgabe: " + error.message);

    setSubtaskDraft((p) => ({ ...p, [taskId]: "" }));
    await reloadAll();
  }

  async function updateSubtaskStatus(subtaskId, status) {
    const { error } = await supabase.from("subtasks").update({ status }).eq("id", subtaskId);
    if (error) return alert("Fehler: " + error.message);
    await reloadAll();
  }

  async function deleteSubtask(subtaskId) {
    const ok = confirm("Unteraufgabe wirklich löschen?");
    if (!ok) return;
    const { error } = await supabase.from("subtasks").delete().eq("id", subtaskId);
    if (error) return alert("Fehler: " + error.message);
    await reloadAll();
  }

  // ---------- GUIDES ----------
  async function createGuide() {
    const title = safeStr(guideTitle).trim();
    if (!title) return alert("Bitte Titel eingeben.");
    if (!guideAreaId) return alert("Bitte Bereich auswählen.");

    const payload = {
      title,
      content: safeStr(guideContent),
      area_id: guideAreaId
    };

    // Falls deine guides Tabelle created_by hat, versuchen wir es optional
    const tryPayload = { ...payload, created_by: user?.id };

    let lastErr = null;
    {
      const { error } = await supabase.from("guides").insert(tryPayload);
      if (!error) {
        setGuideTitle("");
        setGuideContent("");
        await reloadAll();
        return;
      }
      lastErr = error;
    }
    {
      const { error } = await supabase.from("guides").insert(payload);
      if (!error) {
        setGuideTitle("");
        setGuideContent("");
        await reloadAll();
        return;
      }
      lastErr = error;
    }

    alert("Fehler Anleitung: " + (lastErr?.message || lastErr));
  }

  async function uploadGuideFile(guideId, file) {
    if (!file) return;

    // alles erlauben (Supabase blockt nur nach Größe/Policy)
    const ext = file.name.split(".").pop() || "file";
    const path = `guide_${guideId}/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;

    const { error: upErr } = await supabase.storage.from(GUIDES_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream"
    });

    if (upErr) return alert("Upload Fehler: " + upErr.message);

    // in DB speichern (file_path)
    const { error: dbErr } = await supabase.from("guides").update({ file_path: path }).eq("id", guideId);
    if (dbErr) return alert("DB Fehler: " + dbErr.message);

    await reloadAll();
  }

  function getGuideDownloadUrl(file_path) {
    if (!file_path) return null;
    const { data } = supabase.storage.from(GUIDES_BUCKET).getPublicUrl(file_path);
    return data?.publicUrl || null;
  }

  // ---------- FILTERED TASKS ----------
  const filteredTasks = useMemo(() => {
    let list = [...tasks];

    if (filterArea !== "ALL") list = list.filter((t) => t.area_id === filterArea);
    if (filterPeriod !== "ALL") list = list.filter((t) => t.period === filterPeriod);

    const q = safeStr(search).trim().toLowerCase();
    if (q) list = list.filter((t) => safeStr(t.title).toLowerCase().includes(q));

    return list;
  }, [tasks, filterArea, filterPeriod, search]);

  const counts = useMemo(() => {
    const open = filteredTasks.filter((t) => t.status !== "done").length;
    const today = filteredTasks.filter((t) => (t.due_bucket === "Heute" || t.period === "Heute") && t.status !== "done").length;
    const week = filteredTasks.filter((t) => (t.due_bucket === "Diese Woche" || t.period === "Diese Woche") && t.status !== "done").length;
    return { today, week, open };
  }, [filteredTasks]);

  // ---------- CALENDAR DATA ----------
  const weekStart = useMemo(() => startOfWeek(weekAnchor), [weekAnchor]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const tasksByDate = useMemo(() => {
    // Wenn due_date vorhanden → nach Datum mappen.
    // Wenn nicht → grob nach due_bucket/period: Heute in heute, Diese Woche verteilt.
    const map = {};
    for (const d of weekDays) map[toISODate(d)] = [];

    for (const t of filteredTasks) {
      if (t.due_date) {
        const key = safeStr(t.due_date).slice(0, 10);
        if (map[key]) map[key].push(t);
        continue;
      }

      const bucket = t.due_bucket || t.period || "";
      if (bucket === "Heute") {
        const key = toISODate(new Date());
        if (map[key]) map[key].push(t);
      } else if (bucket === "Diese Woche") {
        // einfache Verteilung: Montag
        const key = toISODate(weekStart);
        if (map[key]) map[key].push(t);
      }
    }

    return map;
  }, [filteredTasks, weekDays, weekStart]);

  // ---------- INTERNAL ----------
  const isAdmin = useMemo(() => isEmailAdmin(user?.email), [user?.email]);

  if (authLoading) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Dashboard</h1>
        <p>Lade…</p>
      </div>
    );
  }
  if (!user) return null;

  return (
    <div style={{ fontFamily: "system-ui", minHeight: "100vh", background: "#f6f7f9" }}>
      {/* Topbar */}
      <div
        style={{
          background: "white",
          borderBottom: "1px solid #e5e7eb",
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Dashboard</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Angemeldet als: {user.email}</div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={reloadAll} style={btn()}>
            Neu laden
          </button>
          <button onClick={signOut} style={btn()}>
            Abmelden
          </button>
        </div>
      </div>

      <div style={{ display: "flex" }}>
        {/* Sidebar */}
        <div style={{ width: 270, padding: 14, borderRight: "1px solid #e5e7eb", background: "white" }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>Übersicht</div>

          <div style={{ display: "grid", gap: 8 }}>
            <StatCard label="Aufgaben heute" value={counts.today} />
            <StatCard label="Diese Woche" value={counts.week} />
            <StatCard label="Offen" value={counts.open} />
          </div>

          <div style={{ marginTop: 16, fontSize: 12, opacity: 0.7 }}>Navigation</div>
          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            {TABS.filter((t) => (t.id === "internal" ? isAdmin : true)).map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  textAlign: "left",
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: activeTab === t.id ? "#eef2ff" : "white",
                  cursor: "pointer"
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 16, fontSize: 12, opacity: 0.7 }}>Filter</div>

          <select value={filterArea} onChange={(e) => setFilterArea(e.target.value)} style={input()}>
            <option value="ALL">Alle Bereiche</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} style={input()}>
            <option value="ALL">Alle Zeiträume</option>
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>

          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Suche…" style={input()} />

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
            {loadingData ? "Lade Daten…" : `${filteredTasks.length} Aufgabe(n)`}
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, padding: 18 }}>
          {/* Tabs oben */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {TABS.filter((t) => (t.id === "internal" ? isAdmin : true)).map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: activeTab === t.id ? "white" : "transparent",
                  cursor: "pointer"
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Create Task */}
          {(activeTab === "board" || activeTab === "list" || activeTab === "calendar" || activeTab === "timeline") && (
            <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Aufgabe anlegen</div>

              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.5fr 0.5fr 0.5fr 0.35fr", gap: 10 }}>
                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Titel" style={input()} />

                <select value={newAreaId} onChange={(e) => setNewAreaId(e.target.value)} style={input()}>
                  <option value="">Bereich auswählen</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>

                <select value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} style={input()}>
                  {PERIODS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>

                <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} style={input()}>
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>

                {/* optional: due_date (wenn Spalte vorhanden) */}
                <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} style={input()} />

                {/* optional: due_bucket (wenn Spalte vorhanden) */}
                <select value={newDueBucket} onChange={(e) => setNewDueBucket(e.target.value)} style={input()}>
                  <option value="Heute">Heute</option>
                  <option value="Diese Woche">Diese Woche</option>
                  <option value="Monat">Monat</option>
                  <option value="Jahr">Jahr</option>
                </select>

                <button onClick={createTask} style={btn()}>
                  Anlegen
                </button>
              </div>

              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                Hinweis: Datum/Bucket werden nur genutzt, wenn die Spalten in deiner tasks-Tabelle existieren.
              </div>
            </div>
          )}

          {activeTab === "board" && (
            <BoardView
              tasks={filteredTasks}
              subtasksByTask={subtasksByTask}
              expandedTaskId={expandedTaskId}
              setExpandedTaskId={setExpandedTaskId}
              subtaskDraft={subtaskDraft}
              setSubtaskDraft={setSubtaskDraft}
              onTaskMove={updateTaskStatus}
              onAddSubtask={addSubtask}
              onSubtaskStatus={updateSubtaskStatus}
              onDeleteSubtask={deleteSubtask}
            />
          )}

          {activeTab === "list" && (
            <ListView
              tasks={filteredTasks}
              subtasksByTask={subtasksByTask}
              expandedTaskId={expandedTaskId}
              setExpandedTaskId={setExpandedTaskId}
              subtaskDraft={subtaskDraft}
              setSubtaskDraft={setSubtaskDraft}
              onTaskMove={updateTaskStatus}
              onAddSubtask={addSubtask}
              onSubtaskStatus={updateSubtaskStatus}
              onDeleteSubtask={deleteSubtask}
            />
          )}

          {activeTab === "calendar" && (
            <CalendarView
              weekStart={weekStart}
              weekDays={weekDays}
              tasksByDate={tasksByDate}
              onPrevWeek={() => setWeekAnchor(addDays(weekAnchor, -7))}
              onNextWeek={() => setWeekAnchor(addDays(weekAnchor, 7))}
            />
          )}

          {activeTab === "timeline" && <TimelineView tasks={filteredTasks} />}

          {activeTab === "guides" && (
            <GuidesView
              areas={areas}
              guides={guides}
              guideAreaId={guideAreaId}
              setGuideAreaId={setGuideAreaId}
              guideTitle={guideTitle}
              setGuideTitle={setGuideTitle}
              guideContent={guideContent}
              setGuideContent={setGuideContent}
              onCreateGuide={createGuide}
              onUploadFile={uploadGuideFile}
              getUrl={getGuideDownloadUrl}
            />
          )}

          {activeTab === "internal" && isAdmin && <InternalView areas={areas} tasks={tasks} guides={guides} />}
        </div>
      </div>
    </div>
  );
}

function btn() {
  return {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    cursor: "pointer",
    background: "white"
  };
}

function input() {
  return {
    padding: 10,
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    width: "100%"
  };
}

function StatCard({ label, value }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

// ---------- BOARD ----------
function BoardView({
  tasks,
  subtasksByTask,
  expandedTaskId,
  setExpandedTaskId,
  subtaskDraft,
  setSubtaskDraft,
  onTaskMove,
  onAddSubtask,
  onSubtaskStatus,
  onDeleteSubtask
}) {
  const cols = [
    { id: "todo", title: "Zu erledigen" },
    { id: "doing", title: "In Arbeit" },
    { id: "done", title: "Erledigt" }
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
      {cols.map((col) => (
        <div key={col.id} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 800 }}>{col.title}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{tasks.filter((t) => t.status === col.id).length}</div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {tasks
              .filter((t) => t.status === col.id)
              .map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  subtasks={subtasksByTask[t.id] || []}
                  expanded={expandedTaskId === t.id}
                  onToggle={() => setExpandedTaskId(expandedTaskId === t.id ? null : t.id)}
                  draft={subtaskDraft[t.id] || ""}
                  setDraft={(val) => setSubtaskDraft((p) => ({ ...p, [t.id]: val }))}
                  onAdd={() => onAddSubtask(t.id)}
                  onMove={onTaskMove}
                  onSubtaskStatus={onSubtaskStatus}
                  onDeleteSubtask={onDeleteSubtask}
                />
              ))}

            {tasks.filter((t) => t.status === col.id).length === 0 && <div style={{ fontSize: 12, opacity: 0.7 }}>Keine Aufgaben</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- LIST ----------
function ListView({
  tasks,
  subtasksByTask,
  expandedTaskId,
  setExpandedTaskId,
  subtaskDraft,
  setSubtaskDraft,
  onTaskMove,
  onAddSubtask,
  onSubtaskStatus,
  onDeleteSubtask
}) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>Aufgabenliste</div>

      <div style={{ width: "100%", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
              <th style={{ padding: 10 }}>Aufgabe</th>
              <th style={{ padding: 10 }}>Bereich</th>
              <th style={{ padding: 10 }}>Zeitraum</th>
              <th style={{ padding: 10 }}>Status</th>
              <th style={{ padding: 10 }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td style={{ padding: 12, opacity: 0.7 }} colSpan={5}>
                  Keine Aufgaben
                </td>
              </tr>
            ) : (
              tasks.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: 10 }}>{t.title}</td>
                  <td style={{ padding: 10 }}>{t.area_name || "—"}</td>
                  <td style={{ padding: 10 }}>{t.period || "—"}</td>
                  <td style={{ padding: 10 }}>
                    <select value={t.status} onChange={(e) => onTaskMove(t.id, e.target.value)} style={{ ...input(), padding: 8 }}>
                      <option value="todo">Zu erledigen</option>
                      <option value="doing">In Arbeit</option>
                      <option value="done">Erledigt</option>
                    </select>
                  </td>
                  <td style={{ padding: 10 }}>
                    <button onClick={() => setExpandedTaskId(expandedTaskId === t.id ? null : t.id)} style={btn()}>
                      {expandedTaskId === t.id ? "Zuklappen" : "Öffnen"}
                    </button>

                    {expandedTaskId === t.id && (
                      <div style={{ marginTop: 10 }}>
                        <TaskSubtasks
                          taskId={t.id}
                          subtasks={subtasksByTask[t.id] || []}
                          draft={subtaskDraft[t.id] || ""}
                          setDraft={(val) => setSubtaskDraft((p) => ({ ...p, [t.id]: val }))}
                          onAdd={() => onAddSubtask(t.id)}
                          onSubtaskStatus={onSubtaskStatus}
                          onDeleteSubtask={onDeleteSubtask}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- TASK CARD + SUBTASKS ----------
function TaskCard({ task, subtasks, expanded, onToggle, draft, setDraft, onAdd, onMove, onSubtaskStatus, onDeleteSubtask }) {
  const done = subtasks.filter((s) => s.status === "done").length;
  const total = subtasks.length;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>{task.title}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {(task.area_name || "—")} • {task.period || "—"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
            Unteraufgaben: {done}/{total}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 140 }}>
          <select value={task.status} onChange={(e) => onMove(task.id, e.target.value)} style={{ ...input(), padding: 8 }}>
            <option value="todo">Zu erledigen</option>
            <option value="doing">In Arbeit</option>
            <option value="done">Erledigt</option>
          </select>
          <button onClick={onToggle} style={btn()}>
            {expanded ? "Zuklappen" : "Details"}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 10 }}>
          <TaskSubtasks
            taskId={task.id}
            subtasks={subtasks}
            draft={draft}
            setDraft={setDraft}
            onAdd={onAdd}
            onSubtaskStatus={onSubtaskStatus}
            onDeleteSubtask={onDeleteSubtask}
          />
        </div>
      )}
    </div>
  );
}

function TaskSubtasks({ taskId, subtasks, draft, setDraft, onAdd, onSubtaskStatus, onDeleteSubtask }) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Unteraufgaben</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Neue Unteraufgabe…"
          style={input()}
        />
        <button onClick={onAdd} style={btn()}>
          Hinzufügen
        </button>
      </div>

      {subtasks.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.7 }}>Noch keine Unteraufgaben</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {subtasks.map((s) => (
            <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14 }}>{s.title}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Status: {s.status}</div>
              </div>

              <select
                value={s.status}
                onChange={(e) => onSubtaskStatus(s.id, e.target.value)}
                style={{ ...input(), padding: 8, width: 160 }}
              >
                <option value="todo">Zu erledigen</option>
                <option value="doing">In Arbeit</option>
                <option value="done">Erledigt</option>
              </select>

              <button onClick={() => onDeleteSubtask(s.id)} style={btn()}>
                Löschen
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Task-ID: {taskId}</div>
    </div>
  );
}

// ---------- CALENDAR ----------
function CalendarView({ weekStart, weekDays, tasksByDate, onPrevWeek, onNextWeek }) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 800 }}>Kalender (Woche)</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onPrevWeek} style={btn()}>
            ◀ Woche
          </button>
          <button onClick={onNextWeek} style={btn()}>
            Woche ▶
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
        Start: {toISODate(weekStart)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8 }}>
        {weekDays.map((d) => {
          const key = toISODate(d);
          const items = tasksByDate[key] || [];
          return (
            <div key={key} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "#fafafa" }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{key}</div>
              {items.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.7 }}>—</div>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {items.map((t) => (
                    <div key={t.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{t.title}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{t.area_name || "—"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
        Hinweis: Wenn deine tasks-Tabelle keine due_date Spalte hat, wird „Heute/Diese Woche“ grob angezeigt.
      </div>
    </div>
  );
}

// ---------- TIMELINE ----------
function TimelineView({ tasks }) {
  const grouped = useMemo(() => {
    const g = { Heute: [], "Diese Woche": [], Monat: [], Jahr: [], Sonstiges: [] };
    for (const t of tasks) {
      const p = t.period || "Sonstiges";
      if (g[p]) g[p].push(t);
      else g.Sonstiges.push(t);
    }
    return g;
  }, [tasks]);

  const order = ["Heute", "Diese Woche", "Monat", "Jahr", "Sonstiges"];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {order.map((k) => (
        <div key={k} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Timeline: {k}</div>
          {grouped[k].length === 0 ? (
            <div style={{ fontSize: 12, opacity: 0.7 }}>Keine Aufgaben</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {grouped[k].map((t) => (
                <div key={t.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "#fafafa" }}>
                  <div style={{ fontWeight: 700 }}>{t.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{t.area_name || "—"} • Status: {t.status}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- GUIDES ----------
function GuidesView({
  areas,
  guides,
  guideAreaId,
  setGuideAreaId,
  guideTitle,
  setGuideTitle,
  guideContent,
  setGuideContent,
  onCreateGuide,
  onUploadFile,
  getUrl
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Anleitung anlegen</div>

        <div style={{ display: "grid", gridTemplateColumns: "0.6fr 1fr 0.4fr", gap: 10, marginBottom: 10 }}>
          <select value={guideAreaId} onChange={(e) => setGuideAreaId(e.target.value)} style={input()}>
            <option value="">Bereich auswählen</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <input value={guideTitle} onChange={(e) => setGuideTitle(e.target.value)} placeholder="Titel" style={input()} />

          <button onClick={onCreateGuide} style={btn()}>
            Speichern
          </button>
        </div>

        <textarea
          value={guideContent}
          onChange={(e) => setGuideContent(e.target.value)}
          placeholder="Anleitungstext…"
          style={{ ...input(), minHeight: 140 }}
        />
      </div>

      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Anleitungen</div>

        {guides.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.7 }}>Noch keine Anleitungen</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {guides.map((g) => {
              const url = getUrl(g.file_path);
              return (
                <div key={g.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{g.title}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{g.area_name || "—"}</div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <label style={{ fontSize: 12, opacity: 0.85, cursor: "pointer" }}>
                        Datei hochladen
                        <input
                          type="file"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) onUploadFile(g.id, f);
                            e.target.value = "";
                          }}
                        />
                      </label>

                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                          Datei öffnen
                        </a>
                      ) : (
                        <div style={{ fontSize: 12, opacity: 0.7 }}>Keine Datei</div>
                      )}
                    </div>
                  </div>

                  {g.content ? (
                    <div style={{ marginTop: 10, whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.35 }}>
                      {g.content}
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>Kein Text</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
          Upload: alle gängigen Formate (PDF, DOCX, XLSX, PNG, JPG, ZIP, …) – abhängig von Storage-Policy und Dateigröße.
        </div>
      </div>
    </div>
  );
}

// ---------- INTERNAL (Admin/Cockpit) ----------
function InternalView({ areas, tasks, guides }) {
  const tasksByArea = useMemo(() => {
    const m = {};
    for (const a of areas) m[a.name] = 0;
    for (const t of tasks) m[t.area_name || "—"] = (m[t.area_name || "—"] || 0) + 1;
    return m;
  }, [areas, tasks]);

  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Intern</div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>
          Aufgaben gesamt: {tasks.length} • Erledigt: {doneCount} • Anleitungen: {guides.length}
        </div>
      </div>

      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Aufgaben je Bereich</div>
        <div style={{ display: "grid", gap: 8 }}>
          {Object.keys(tasksByArea).sort().map((k) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "#fafafa" }}>
              <div>{k}</div>
              <div style={{ fontWeight: 800 }}>{tasksByArea[k]}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 12, opacity: 0.7 }}>
        Später können wir hier echte Admin-Funktionen einbauen (Benutzerverwaltung, Rechte, Audit-Log), ohne dass es nach „Chef Cockpit“ aussieht.
      </div>
    </div>
  );
}
