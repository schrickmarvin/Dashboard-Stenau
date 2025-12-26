// pages/dashboard.js
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const TABS = [
  { id: "board", label: "Board" },
  { id: "list", label: "Liste" },
  { id: "calendar", label: "Kalender" },
  { id: "timeline", label: "Timeline" },
  { id: "guides", label: "Anleitungen" },
  { id: "areas", label: "Bereiche" },
  { id: "settings", label: "Einstellungen" }
];

const DUE_BUCKETS = [
  { value: "Heute", label: "Heute" },
  { value: "Diese Woche", label: "Diese Woche" },
  { value: "Monat", label: "Monat" },
  { value: "Jahr", label: "Jahr" }
];

const STATUS = [
  { value: "todo", label: "Zu erledigen" },
  { value: "doing", label: "In Arbeit" },
  { value: "done", label: "Erledigt" }
];

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [activeTab, setActiveTab] = useState("board");

  // Data
  const [areas, setAreas] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [guides, setGuides] = useState([]);

  // Filters
  const [filterAreaId, setFilterAreaId] = useState("all");
  const [filterDue, setFilterDue] = useState("all");
  const [search, setSearch] = useState("");

  // Create task
  const [newTitle, setNewTitle] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [newDueBucket, setNewDueBucket] = useState("Heute");
  const [newStatus, setNewStatus] = useState("todo");
  const [busyCreateTask, setBusyCreateTask] = useState(false);

  // Subtasks
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [busyCreateSubtask, setBusyCreateSubtask] = useState(false);

  // Guides create
  const [guideTitle, setGuideTitle] = useState("");
  const [guideAreaId, setGuideAreaId] = useState("");
  const [guideContent, setGuideContent] = useState("");
  const [guideFile, setGuideFile] = useState(null);
  const [busyCreateGuide, setBusyCreateGuide] = useState(false);

  // Settings
  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Auth check
  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      setLoadingAuth(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  // Load data after login
  useEffect(() => {
    if (!user) return;
    reloadAll();
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Set defaults when areas/tasks arrive
  useEffect(() => {
    if (!newAreaId && areas.length) setNewAreaId(areas[0].id);
    if (!guideAreaId && areas.length) setGuideAreaId(areas[0].id);
    if (!selectedTaskId && tasks.length) setSelectedTaskId(tasks[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, tasks]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function reloadAll() {
    // Areas
    const { data: aData, error: aErr } = await supabase
      .from("areas")
      .select("id,name,created_at")
      .order("name", { ascending: true });

    if (aErr) {
      alert("Fehler beim Laden der Bereiche: " + aErr.message);
      return;
    }
    setAreas(aData ?? []);

    // Tasks
    const { data: tData, error: tErr } = await supabase
      .from("tasks")
      .select(
        "id,title,area_id,status,due_bucket,period,subtasks_done,subtasks_total,created_at,created_by,user_id,due_date"
      )
      .order("created_at", { ascending: false });

    if (tErr) {
      alert("Fehler beim Laden der Aufgaben: " + tErr.message);
      return;
    }
    setTasks(tData ?? []);

    // Subtasks
    const { data: stData, error: stErr } = await supabase
      .from("subtasks")
      .select("id,task_id,title,status,is_done,created_at,updated_at")
      .order("created_at", { ascending: true });

    if (stErr) {
      alert("Fehler beim Laden der Unteraufgaben: " + stErr.message);
      return;
    }
    setSubtasks(stData ?? []);

    // Guides
    const { data: gData, error: gErr } = await supabase
      .from("guides")
      .select("id,title,content,area_id,file_path,created_at")
      .order("created_at", { ascending: false });

    if (gErr) {
      alert("Fehler beim Laden der Anleitungen: " + gErr.message);
      return;
    }
    setGuides(gData ?? []);
  }

  async function loadSettings() {
    if (!user?.id) return;
    setSettingsLoading(true);

    const { data, error } = await supabase
      .from("user_settings")
      .select(
        "user_id,theme,accent,background,notifications_enabled,notifications_email,notifications_desktop"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    // If not exists -> create defaults
    if (!data && !error) {
      const { data: insData, error: insErr } = await supabase
        .from("user_settings")
        .insert({ user_id: user.id })
        .select(
          "user_id,theme,accent,background,notifications_enabled,notifications_email,notifications_desktop"
        )
        .single();

      if (insErr) alert("Fehler beim Anlegen der Einstellungen: " + insErr.message);
      setSettings(insErr ? null : insData);
      setSettingsLoading(false);
      return;
    }

    if (error) alert("Fehler beim Laden der Einstellungen: " + error.message);
    setSettings(data ?? null);
    setSettingsLoading(false);
  }

  async function saveSettings(patch) {
    if (!user?.id) return;
    if (!settings) return;

    setSettingsSaving(true);
    const next = { ...settings, ...patch };
    setSettings(next);

    const { error } = await supabase.from("user_settings").update(patch).eq("user_id", user.id);

    setSettingsSaving(false);

    if (error) {
      alert("Fehler beim Speichern: " + error.message);
      await loadSettings();
    }
  }

  const ui = useMemo(() => getUiTheme(settings), [settings]);

  const areaNameById = useMemo(() => {
    const m = new Map();
    (areas ?? []).forEach((a) => m.set(a.id, a.name));
    return m;
  }, [areas]);

  const guidesByAreaId = useMemo(() => {
    const m = new Map();
    (guides ?? []).forEach((g) => {
      const list = m.get(g.area_id) ?? [];
      list.push(g);
      m.set(g.area_id, list);
    });
    return m;
  }, [guides]);

  const subtasksByTaskId = useMemo(() => {
    const m = new Map();
    (subtasks ?? []).forEach((s) => {
      const list = m.get(s.task_id) ?? [];
      list.push(s);
      m.set(s.task_id, list);
    });
    return m;
  }, [subtasks]);

  const filteredTasks = useMemo(() => {
    const q = (search ?? "").trim().toLowerCase();
    return (tasks ?? []).filter((t) => {
      if (filterAreaId !== "all" && t.area_id !== filterAreaId) return false;
      if (filterDue !== "all" && t.due_bucket !== filterDue) return false;

      if (!q) return true;

      const areaName = areaNameById.get(t.area_id) ?? "";
      const hay = `${t.title ?? ""} ${areaName} ${t.status ?? ""} ${t.due_bucket ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [tasks, filterAreaId, filterDue, search, areaNameById]);

  const counts = useMemo(() => {
    const open = filteredTasks.filter((t) => t.status !== "done").length;
    const today = filteredTasks.filter((t) => t.due_bucket === "Heute" && t.status !== "done").length;
    const week = filteredTasks.filter((t) => t.due_bucket === "Diese Woche" && t.status !== "done").length;
    return { open, today, week };
  }, [filteredTasks]);

  async function createTask() {
    if (!newTitle.trim()) return alert("Bitte einen Titel eingeben.");
    if (!newAreaId) return alert("Bitte einen Bereich auswählen.");

    setBusyCreateTask(true);

    const payload = {
      title: newTitle.trim(),
      area_id: newAreaId,
      status: newStatus,
      due_bucket: newDueBucket,
      period: newDueBucket,
      subtasks_done: 0,
      subtasks_total: 0,
      created_by: user?.id ?? null,
      user_id: user?.id ?? null,
      due_date: null
    };

    const { error } = await supabase.from("tasks").insert(payload);
    setBusyCreateTask(false);

    if (error) return alert("Fehler beim Anlegen: " + error.message);

    setNewTitle("");
    await reloadAll();
  }

  async function setTaskStatus(taskId, status) {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
    if (error) return alert("Fehler beim Update: " + error.message);
    await reloadAll();
  }

  async function deleteTask(taskId) {
    if (!confirm("Aufgabe wirklich löschen?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) return alert("Fehler beim Löschen: " + error.message);
    await reloadAll();
  }

  async function createSubtask() {
    if (!selectedTaskId) return alert("Bitte zuerst eine Aufgabe auswählen.");
    if (!newSubtaskTitle.trim()) return alert("Bitte einen Unteraufgaben-Titel eingeben.");

    setBusyCreateSubtask(true);

    const payload = {
      task_id: selectedTaskId,
      title: newSubtaskTitle.trim(),
      status: "todo",
      is_done: false
    };

    const { error } = await supabase.from("subtasks").insert(payload);
    setBusyCreateSubtask(false);

    if (error) return alert("Fehler beim Anlegen: " + error.message);

    setNewSubtaskTitle("");
    await recomputeTaskSubtasks(selectedTaskId);
    await reloadAll();
  }

  async function toggleSubtaskDone(subtask) {
    const newDone = !(subtask.is_done ?? false);
    const newStatus = newDone ? "done" : "todo";

    const { error } = await supabase
      .from("subtasks")
      .update({ is_done: newDone, status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", subtask.id);

    if (error) return alert("Fehler beim Update: " + error.message);

    await recomputeTaskSubtasks(subtask.task_id);
    await reloadAll();
  }

  async function recomputeTaskSubtasks(taskId) {
    const { data, error } = await supabase
      .from("subtasks")
      .select("id,is_done,status")
      .eq("task_id", taskId);

    if (error) return;

    const total = (data ?? []).length;
    const done = (data ?? []).filter((s) => (s.is_done ?? false) || s.status === "done").length;

    await supabase.from("tasks").update({ subtasks_total: total, subtasks_done: done }).eq("id", taskId);
  }

  async function createGuide() {
    if (!guideTitle.trim()) return alert("Bitte einen Titel eingeben.");
    if (!guideAreaId) return alert("Bitte einen Bereich auswählen.");

    setBusyCreateGuide(true);

    let file_path = null;

    if (guideFile) {
      const safeName = guideFile.name.replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
      const path = `${user?.id ?? "user"}/${Date.now()}_${safeName}`;

      const { error: upErr } = await supabase.storage.from("guides").upload(path, guideFile, {
        upsert: false
      });

      if (upErr) {
        setBusyCreateGuide(false);
        return alert("Upload-Fehler: " + upErr.message);
      }

      file_path = path;
    }

    const payload = {
      title: guideTitle.trim(),
      content: guideContent.trim() || null,
      area_id: guideAreaId,
      file_path
    };

    const { error } = await supabase.from("guides").insert(payload);
    setBusyCreateGuide(false);

    if (error) return alert("Fehler beim Speichern: " + error.message);

    setGuideTitle("");
    setGuideContent("");
    setGuideFile(null);
    await reloadAll();
  }

  async function openGuideFile(file_path) {
    if (!file_path) return;

    const { data, error } = await supabase.storage.from("guides").createSignedUrl(file_path, 60 * 10);
    if (error) return alert("Fehler beim Öffnen: " + error.message);

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  if (loadingAuth) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Armaturenbrett</h1>
        <p>Lade…</p>
      </div>
    );
  }

  if (!user) {
    if (typeof window !== "undefined") window.location.href = "/";
    return null;
  }

  return (
    <div style={{ ...styles.page, background: ui.pageBg, color: ui.text }}>
      {/* Topbar */}
      <div style={{ ...styles.topbar, background: ui.topbarBg, borderBottom: ui.border }}>
        <div>
          <div style={{ ...styles.topTitle, color: ui.text }}>Armaturenbrett</div>
          <div style={{ ...styles.topSub, color: ui.subText }}>Angemeldet als: {user.email}</div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button style={styles.btnGhost} onClick={reloadAll}>
            Neu laden
          </button>
          <button style={styles.btn} onClick={signOut}>
            Abmelden
          </button>
        </div>
      </div>

      <div style={styles.body}>
        {/* Sidebar */}
        <div style={{ ...styles.sidebar, background: ui.panelBg, borderRight: ui.border }}>
          <div style={{ ...styles.sidebarSectionTitle, color: ui.subText }}>Übersicht</div>

          <div style={{ display: "grid", gap: 10 }}>
            <StatCard label="Aufgaben heute" value={counts.today} ui={ui} />
            <StatCard label="Diese Woche" value={counts.week} ui={ui} />
            <StatCard label="Offen" value={counts.open} ui={ui} />
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ ...styles.sidebarSectionTitle, color: ui.subText }}>Navigation</div>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    ...styles.navBtn,
                    border: ui.border,
                    background: activeTab === t.id ? ui.navActiveBg : ui.panelBg,
                    color: ui.text
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ ...styles.sidebarSectionTitle, color: ui.subText }}>Filter</div>

            <select
              value={filterAreaId}
              onChange={(e) => setFilterAreaId(e.target.value)}
              style={{ ...styles.select, border: ui.border, background: ui.inputBg, color: ui.text }}
            >
              <option value="all">Alle Bereiche</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            <select
              value={filterDue}
              onChange={(e) => setFilterDue(e.target.value)}
              style={{ ...styles.select, border: ui.border, background: ui.inputBg, color: ui.text }}
            >
              <option value="all">Alle Zeiträume</option>
              {DUE_BUCKETS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suche…"
              style={{ ...styles.input, border: ui.border, background: ui.inputBg, color: ui.text, width: "100%", marginTop: 8 }}
            />
          </div>
        </div>

        {/* Main */}
        <div style={styles.main}>
          {/* Tab pills */}
          <div style={styles.tabRow}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  ...styles.pill,
                  border: ui.border,
                  color: ui.text,
                  background: activeTab === t.id ? ui.panelBg : "transparent"
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === "board" && (
            <div style={{ display: "grid", gap: 12 }}>
              <CreateTaskBar
                ui={ui}
                areas={areas}
                newTitle={newTitle}
                setNewTitle={setNewTitle}
                newAreaId={newAreaId}
                setNewAreaId={setNewAreaId}
                newDueBucket={newDueBucket}
                setNewDueBucket={setNewDueBucket}
                newStatus={newStatus}
                setNewStatus={setNewStatus}
                busy={busyCreateTask}
                onCreate={createTask}
              />

              <BoardView
                ui={ui}
                tasks={filteredTasks}
                areaNameById={areaNameById}
                onStatus={setTaskStatus}
                onDelete={deleteTask}
                subtasksByTaskId={subtasksByTaskId}
                onToggleSubtask={toggleSubtaskDone}
                guidesByAreaId={guidesByAreaId}
                onOpenGuideFile={openGuideFile}
              />

              <SubtaskBar
                ui={ui}
                tasks={tasks}
                selectedTaskId={selectedTaskId}
                setSelectedTaskId={setSelectedTaskId}
                newSubtaskTitle={newSubtaskTitle}
                setNewSubtaskTitle={setNewSubtaskTitle}
                busy={busyCreateSubtask}
                onCreate={createSubtask}
              />
            </div>
          )}

          {activeTab === "list" && (
            <ListView ui={ui} tasks={filteredTasks} areaNameById={areaNameById} onStatus={setTaskStatus} onDelete={deleteTask} />
          )}

          {activeTab === "calendar" && (
            <Placeholder ui={ui} title="Kalender" text="Minimaler Platzhalter. Später nutzen wir due_date für eine echte Monats-/Wochenansicht." />
          )}

          {activeTab === "timeline" && <TimelineView ui={ui} tasks={filteredTasks} areaNameById={areaNameById} />}

          {activeTab === "guides" && (
            <GuidesView
              ui={ui}
              areas={areas}
              guides={guides}
              areaNameById={areaNameById}
              guideTitle={guideTitle}
              setGuideTitle={setGuideTitle}
              guideAreaId={guideAreaId}
              setGuideAreaId={setGuideAreaId}
              guideContent={guideContent}
              setGuideContent={setGuideContent}
              setGuideFile={setGuideFile}
              busy={busyCreateGuide}
              onCreate={createGuide}
              onOpenFile={openGuideFile}
            />
          )}

          {activeTab === "areas" && <AreasView ui={ui} areas={areas} />}

          {activeTab === "settings" && (
            <SettingsView
              ui={ui}
              settings={settings}
              loading={settingsLoading}
              saving={settingsSaving}
              onChange={saveSettings}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Components ---------------- */

function StatCard({ label, value, ui }) {
  return (
    <div style={{ ...styles.statCard, background: ui.cardBg, border: ui.border, color: ui.text }}>
      <div style={{ ...styles.statLabel, color: ui.subText }}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

function CreateTaskBar({
  ui,
  areas,
  newTitle,
  setNewTitle,
  newAreaId,
  setNewAreaId,
  newDueBucket,
  setNewDueBucket,
  newStatus,
  setNewStatus,
  busy,
  onCreate
}) {
  return (
    <div style={{ ...styles.card, background: ui.panelBg, border: ui.border }}>
      <div style={{ ...styles.cardTitle, color: ui.text }}>Aufgabe anlegen</div>

      <div style={styles.rowWrap}>
        <input
          style={{ ...styles.input, border: ui.border, background: ui.inputBg, color: ui.text, flex: 2 }}
          placeholder="Titel"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />

        <select
          style={{ ...styles.selectInline, border: ui.border, background: ui.inputBg, color: ui.text, flex: 1 }}
          value={newAreaId}
          onChange={(e) => setNewAreaId(e.target.value)}
        >
          <option value="">Bereich auswählen</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <select
          style={{ ...styles.selectInline, border: ui.border, background: ui.inputBg, color: ui.text, flex: 1 }}
          value={newDueBucket}
          onChange={(e) => setNewDueBucket(e.target.value)}
        >
          {DUE_BUCKETS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>

        <select
          style={{ ...styles.selectInline, border: ui.border, background: ui.inputBg, color: ui.text, flex: 1 }}
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value)}
        >
          {STATUS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <button style={styles.btnWide} onClick={onCreate} disabled={busy}>
          {busy ? "…" : "Anlegen"}
        </button>
      </div>
    </div>
  );
}

function BoardView({
  ui,
  tasks,
  areaNameById,
  onStatus,
  onDelete,
  subtasksByTaskId,
  onToggleSubtask,
  guidesByAreaId,
  onOpenGuideFile
}) {
  const cols = [
    { id: "todo", title: "Zu erledigen" },
    { id: "doing", title: "In Arbeit" },
    { id: "done", title: "Erledigt" }
  ];

  return (
    <div style={styles.board}>
      {cols.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.id);
        return (
          <div key={col.id} style={{ ...styles.col, background: ui.panelBg, border: ui.border }}>
            <div style={styles.colHeader}>
              <div style={{ ...styles.colTitle, color: ui.text }}>{col.title}</div>
              <div style={{ ...styles.colCount, color: ui.subText }}>{colTasks.length}</div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {colTasks.length === 0 ? (
                <div style={{ ...styles.empty, color: ui.subText }}>Keine Aufgaben</div>
              ) : (
                colTasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    ui={ui}
                    task={t}
                    areaName={areaNameById.get(t.area_id) ?? "—"}
                    onStatus={onStatus}
                    onDelete={onDelete}
                    subtasks={(subtasksByTaskId.get(t.id) ?? []).slice(0, 6)}
                    onToggleSubtask={onToggleSubtask}
                    guides={(guidesByAreaId.get(t.area_id) ?? []).slice(0, 3)}
                    onOpenGuideFile={onOpenGuideFile}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskCard({ ui, task, areaName, onStatus, onDelete, subtasks, onToggleSubtask, guides, onOpenGuideFile }) {
  const total = Number(task.subtasks_total ?? 0);
  const done = Number(task.subtasks_done ?? 0);
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div style={{ ...styles.taskCard, background: ui.cardBg, border: ui.border }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 650, color: ui.text }}>{task.title}</div>

        <div style={{ display: "flex", gap: 6 }}>
          <select
            style={{ ...styles.miniSelect, border: ui.border, background: ui.inputBg, color: ui.text }}
            value={task.status}
            onChange={(e) => onStatus(task.id, e.target.value)}
         
