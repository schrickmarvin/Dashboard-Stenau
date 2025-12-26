/* dashboard.js
   Clean, copy/paste-ready version (fixes: duplicate tabs, syntax errors, hooks misuse,
   and removes the tasks->areas embedded select that caused PostgREST 54001).
*/

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ---------------- Supabase ---------------- */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "");

/* ---------------- Constants ---------------- */

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

/* ---------------- Theme helpers ---------------- */

function getUiTheme(settings) {
  const theme = settings?.theme ?? "light";
  const accent = settings?.accent ?? "indigo";
  const background = settings?.background ?? "plain";

  const isDark = theme === "dark";

  const accentMap = {
    indigo: "#4f46e5",
    blue: "#2563eb",
    green: "#16a34a",
    orange: "#ea580c",
    red: "#dc2626",
    slate: "#334155"
  };

  const a = accentMap[accent] ?? accentMap.indigo;

  const pageBg =
    background === "gradient"
      ? isDark
        ? "radial-gradient(1200px 600px at 20% 0%, rgba(79,70,229,0.25), transparent 55%), radial-gradient(1000px 500px at 80% 20%, rgba(34,197,94,0.12), transparent 55%), #0b1220"
        : "radial-gradient(1200px 600px at 20% 0%, rgba(79,70,229,0.20), transparent 55%), radial-gradient(1000px 500px at 80% 20%, rgba(34,197,94,0.10), transparent 55%), #f6f7f9"
      : isDark
      ? "#0b1220"
      : "#f6f7f9";

  return {
    accent: a,

    pageBg,
    text: isDark ? "#e5e7eb" : "#0f172a",
    subText: isDark ? "rgba(229,231,235,0.70)" : "rgba(15,23,42,0.70)",
    border: isDark ? "1px solid rgba(148,163,184,0.25)" : "1px solid #e5e7eb",

    topbarBg: isDark ? "rgba(15,23,42,0.7)" : "rgba(255,255,255,0.85)",
    panelBg: isDark ? "rgba(2,6,23,0.55)" : "rgba(255,255,255,0.9)",
    cardBg: isDark ? "rgba(15,23,42,0.55)" : "#fafafa",

    inputBg: isDark ? "rgba(2,6,23,0.6)" : "white",
    navActiveBg: isDark ? "rgba(79,70,229,0.20)" : "#eef2ff"
  };
}

/* ---------------- Main Component ---------------- */

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

  // Create subtask
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

    supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      if (error) console.error("getUser error:", error);
      setUser(data?.user ?? null);
      setLoadingAuth(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setLoadingAuth(false);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // Load after login
  useEffect(() => {
    if (!user) return;
    reloadAll();
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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

  /* ---------------- Data load ---------------- */

  async function reloadAll() {
    // IMPORTANT: No embedded select like areas(name) -> avoids PostgREST 54001
    try {
      // Areas
      const { data: aData, error: aErr } = await supabase
        .from("areas")
        .select("id,name")
        .order("name", { ascending: true });

      if (aErr) {
        console.error("areas load error:", aErr);
        alert("Fehler beim Laden der Bereiche: " + aErr.message);
        setAreas([]);
      } else {
        setAreas(aData ?? []);
      }

      // Tasks
      const { data: tData, error: tErr } = await supabase
        .from("tasks")
        .select("id,title,status,period,area_id,due_date,due_bucket,created_at,subtasks_done,subtasks_total,created_by")
        .order("created_at", { ascending: false });

      if (tErr) {
        console.error("tasks load error:", tErr);
        alert("Fehler beim Laden der Aufgaben: " + tErr.message);
        setTasks([]);
      } else {
        setTasks(tData ?? []);
      }

      // Subtasks
      const { data: sData, error: sErr } = await supabase
        .from("subtasks")
        .select("id,task_id,title,is_done,status,created_at,updated_at")
        .order("created_at", { ascending: false });

      if (sErr) {
        console.error("subtasks load error:", sErr);
        alert("Fehler beim Laden der Unteraufgaben: " + sErr.message);
        setSubtasks([]);
      } else {
        setSubtasks(sData ?? []);
      }

      // Guides
      const { data: gData, error: gErr } = await supabase
        .from("guides")
        .select("id,area_id,title,content,file_path,created_at")
        .order("created_at", { ascending: false });

      if (gErr) {
        console.error("guides load error:", gErr);
        alert("Fehler beim Laden der Anleitungen: " + gErr.message);
        setGuides([]);
      } else {
        setGuides(gData ?? []);
      }
    } catch (e) {
      console.error("reloadAll fatal:", e);
      alert("Unerwarteter Fehler beim Laden: " + (e?.message ?? String(e)));
    }
  }

  /* ---------------- Settings ---------------- */

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

  /* ---------------- Derived maps ---------------- */

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
      return `${t.title ?? ""} ${areaName} ${t.due_bucket ?? ""}`.toLowerCase().includes(q);
    });
  }, [tasks, filterAreaId, filterDue, search, areaNameById]);

  const counts = useMemo(() => {
    const open = filteredTasks.filter((t) => t.status !== "done").length;
    const today = filteredTasks.filter((t) => t.due_bucket === "Heute" && t.status !== "done").length;
    const week = filteredTasks.filter((t) => t.due_bucket === "Diese Woche" && t.status !== "done").length;
    return { open, today, week };
  }, [filteredTasks]);

  /* ---------------- Mutations ---------------- */

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
      created_by: user?.id ?? null
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
      is_done: false,
      status: "todo"
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
      area_id: guideAreaId,
      content: (guideContent ?? "").trim(),
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

  /* ---------------- Render ---------------- */

  if (loadingAuth) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <div style={{ fontSize: 16 }}>Lade…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Nicht eingeloggt</div>
        <div style={{ marginTop: 10, opacity: 0.8 }}>
          Bitte über die Login-Seite anmelden.
        </div>
      </div>
    );
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
          <button style={{ ...styles.btnGhost, border: ui.border, background: ui.inputBg, color: ui.text }} onClick={reloadAll}>
            Neu laden
          </button>
          <button style={{ ...styles.btn, border: ui.border, background: ui.panelBg, color: ui.text }} onClick={signOut}>
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

          {/* Views */}
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
            <ListView
              ui={ui}
              tasks={filteredTasks}
              areaNameById={areaNameById}
              onStatus={setTaskStatus}
              onDelete={deleteTask}
            />
          )}

          {activeTab === "calendar" && (
            <Placeholder
              ui={ui}
              title="Kalender"
              text="Minimaler Platzhalter. Später nutzen wir due_date für eine echte Monats-/Wochenansicht."
            />
          )}

          {activeTab === "timeline" && (
            <TimelineView ui={ui} tasks={filteredTasks} areaNameById={areaNameById} />
          )}

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

        <button
          style={{
            ...styles.btnWide,
            border: ui.border,
            background: ui.panelBg,
            color: ui.text,
            minWidth: 120
          }}
          onClick={onCreate}
          disabled={busy}
        >
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
          >
            <option value="todo">Zu erledigen</option>
            <option value="doing">In Arbeit</option>
            <option value="done">Erledigt</option>
          </select>

          <button
            style={{ ...styles.miniBtnDanger, border: ui.border, background: ui.inputBg, color: ui.text }}
            onClick={() => onDelete(task.id)}
            title="Löschen"
          >
            ✕
          </button>
        </div>
      </div>

      <div style={{ ...styles.meta, color: ui.subText }}>
        {areaName} • {task.due_bucket ?? "—"}
      </div>

      <div style={{ ...styles.progressText, color: ui.subText }}>
        Unteraufgaben: {done}/{total} {total > 0 ? `(${progress}%)` : ""}
      </div>

      {subtasks.length > 0 ? (
        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
          {subtasks.map((s) => (
            <button
              key={s.id}
              onClick={() => onToggleSubtask(s)}
              style={{
                ...styles.subtaskRow,
                border: ui.border,
                background: ui.inputBg,
                color: ui.text,
                textDecoration: (s.is_done ?? false) ? "line-through" : "none",
                opacity: (s.is_done ?? false) ? 0.7 : 1
              }}
              title="Klicken = erledigt/unerledigt"
            >
              <span>{(s.is_done ?? false) ? "✓" : "•"}</span>
              <span style={{ flex: 1, textAlign: "left" }}>{s.title}</span>
            </button>
          ))}
          {Number(task.subtasks_total ?? 0) > subtasks.length ? (
            <div style={{ fontSize: 12, opacity: 0.75, color: ui.subText }}>
              Weitere Unteraufgaben sind in der Liste (später).
            </div>
          ) : null}
        </div>
      ) : null}

      {guides?.length ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: ui.subText, marginBottom: 6 }}>Anleitungen</div>
          <div style={{ display: "grid", gap: 6 }}>
            {guides.map((g) => (
              <button
                key={g.id}
                onClick={() => (g.file_path ? onOpenGuideFile(g.file_path) : null)}
                style={{
                  ...styles.btnGhost,
                  border: ui.border,
                  background: ui.inputBg,
                  color: ui.text,
                  textAlign: "left"
                }}
                title={g.file_path ? "Datei öffnen" : "Keine Datei hinterlegt"}
              >
                {g.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SubtaskBar({
  ui,
  tasks,
  selectedTaskId,
  setSelectedTaskId,
  newSubtaskTitle,
  setNewSubtaskTitle,
  busy,
  onCreate
}) {
  return (
    <div style={{ ...styles.card, background: ui.panelBg, border: ui.border }}>
      <div style={{ ...styles.cardTitle, color: ui.text }}>Unteraufgabe anlegen</div>

      <div style={styles.rowWrap}>
        <select
          style={{ ...styles.selectInline, border: ui.border, background: ui.inputBg, color: ui.text, flex: 1 }}
          value={selectedTaskId}
          onChange={(e) => setSelectedTaskId(e.target.value)}
        >
          <option value="">Aufgabe auswählen</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>

        <input
          style={{ ...styles.input, border: ui.border, background: ui.inputBg, color: ui.text, flex: 2 }}
          placeholder="Unteraufgabe…"
          value={newSubtaskTitle}
          onChange={(e) => setNewSubtaskTitle(e.target.value)}
        />

        <button
          style={{ ...styles.btnWide, border: ui.border, background: ui.panelBg, color: ui.text, minWidth: 120 }}
          onClick={onCreate}
          disabled={busy}
        >
          {busy ? "…" : "Anlegen"}
        </button>
      </div>
    </div>
  );
}

function ListView({ ui, tasks, areaNameById, onStatus, onDelete }) {
  return (
    <div style={{ ...styles.card, background: ui.panelBg, border: ui.border }}>
      <div style={{ ...styles.cardTitle, color: ui.text }}>Liste</div>

      <div style={{ width: "100%", overflowX: "auto" }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, color: ui.subText, borderBottom: ui.border }}>Aufgabe</th>
              <th style={{ ...styles.th, color: ui.subText, borderBottom: ui.border }}>Bereich</th>
              <th style={{ ...styles.th, color: ui.subText, borderBottom: ui.border }}>Zeitraum</th>
              <th style={{ ...styles.th, color: ui.subText, borderBottom: ui.border }}>Status</th>
              <th style={{ ...styles.th, color: ui.subText, borderBottom: ui.border }}></th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} style={styles.tr}>
                <td style={{ ...styles.td, color: ui.text }}>{t.title}</td>
                <td style={{ ...styles.td, color: ui.text }}>{areaNameById.get(t.area_id) ?? "—"}</td>
                <td style={{ ...styles.td, color: ui.text }}>{t.due_bucket ?? "—"}</td>
                <td style={{ ...styles.td, color: ui.text }}>
                  <select
                    style={{ ...styles.miniSelect, border: ui.border, background: ui.inputBg, color: ui.text }}
                    value={t.status}
                    onChange={(e) => onStatus(t.id, e.target.value)}
                  >
                    <option value="todo">Zu erledigen</option>
                    <option value="doing">In Arbeit</option>
                    <option value="done">Erledigt</option>
                  </select>
                </td>
                <td style={{ ...styles.td, width: 50 }}>
                  <button
                    style={{ ...styles.miniBtnDanger, border: ui.border, background: ui.inputBg, color: ui.text }}
                    onClick={() => onDelete(t.id)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {tasks.length === 0 ? (
              <tr>
                <td style={{ ...styles.td, color: ui.subText }} colSpan={5}>
                  <div style={{ ...styles.empty, color: ui.subText }}>Keine Einträge</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TimelineView({ ui, tasks, areaNameById }) {
  const groups = useMemo(() => {
    const m = new Map();
    tasks.forEach((t) => {
      const key = t.period ?? t.due_bucket ?? "—";
      const list = m.get(key) ?? [];
      list.push(t);
      m.set(key, list);
    });
    return Array.from(m.entries());
  }, [tasks]);

  return (
    <div style={{ ...styles.card, background: ui.panelBg, border: ui.border }}>
      <div style={{ ...styles.cardTitle, color: ui.text }}>Zeitleiste (minimal)</div>

      <div style={{ display: "grid", gap: 14 }}>
        {groups.map(([k, list]) => (
          <div key={k} style={{ ...styles.timelineBlock, border: ui.border, background: ui.cardBg }}>
            <div style={{ ...styles.timelineTitle, color: ui.text }}>{k}</div>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {list.map((t) => (
                <div key={t.id} style={{ ...styles.timelineItem, border: ui.border, background: ui.inputBg }}>
                  <div style={{ fontWeight: 650, color: ui.text }}>{t.title}</div>
                  <div style={{ ...styles.meta, color: ui.subText }}>
                    {areaNameById.get(t.area_id) ?? "—"} • {labelStatus(t.status)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 ? <div style={{ ...styles.empty, color: ui.subText }}>Keine Einträge</div> : null}
      </div>
    </div>
  );
}

function GuidesView({
  ui,
  areas,
  guides,
  areaNameById,
  guideTitle,
  setGuideTitle,
  guideAreaId,
  setGuideAreaId,
  guideContent,
  setGuideContent,
  setGuideFile,
  busy,
  onCreate,
  onOpenFile
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...styles.card, background: ui.panelBg, border: ui.border }}>
        <div style={{ ...styles.cardTitle, color: ui.text }}>Anleitung anlegen</div>

        <div style={styles.rowWrap}>
          <input
            style={{ ...styles.input, border: ui.border, background: ui.inputBg, color: ui.text, flex: 2 }}
            placeholder="Titel"
            value={guideTitle}
            onChange={(e) => setGuideTitle(e.target.value)}
          />

          <select
            style={{ ...styles.selectInline, border: ui.border, background: ui.inputBg, color: ui.text, flex: 1 }}
            value={guideAreaId}
            onChange={(e) => setGuideAreaId(e.target.value)}
          >
            <option value="">Bereich auswählen</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <input
            type="file"
            onChange={(e) => setGuideFile(e.target.files?.[0] ?? null)}
            style={{ ...styles.file, border: ui.border, background: ui.inputBg, color: ui.text, flex: 1 }}
          />

          <button
            style={{ ...styles.btnWide, border: ui.border, background: ui.panelBg, color: ui.text, minWidth: 120 }}
            onClick={onCreate}
            disabled={busy}
          >
            {busy ? "…" : "Speichern"}
          </button>
        </div>

        <textarea
          style={{ ...styles.textarea, border: ui.border, background: ui.inputBg, color: ui.text }}
          placeholder="Kurzbeschreibung / Inhalt (optional)…"
          value={guideContent}
          onChange={(e) => setGuideContent(e.target.value)}
        />
      </div>

      <div style={{ ...styles.card, background: ui.panelBg, border: ui.border }}>
        <div style={{ ...styles.cardTitle, color: ui.text }}>Anleitungen</div>

        <div style={{ display: "grid", gap: 10 }}>
          {guides.length === 0 ? (
            <div style={{ ...styles.empty, color: ui.subText }}>Noch keine Anleitungen.</div>
          ) : (
            guides.map((g) => (
              <div key={g.id} style={{ ...styles.guideRow, border: ui.border, background: ui.cardBg }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 650, color: ui.text }}>{g.title}</div>
                  <div style={{ ...styles.meta, color: ui.subText }}>
                    {areaNameById.get(g.area_id) ?? "—"} • {new Date(g.created_at).toLocaleString()}
                  </div>
                  {g.content ? (
                    <div style={{ marginTop: 6, opacity: 0.9, color: ui.text }}>{g.content}</div>
                  ) : null}
                </div>

                {g.file_path ? (
                  <button
                    style={{ ...styles.btnGhost, border: ui.border, background: ui.inputBg, color: ui.text }}
                    onClick={() => onOpenFile(g.file_path)}
                  >
                    Datei öffnen
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AreasView({ ui, areas }) {
  return (
    <div style={{ ...styles.card, background: ui.panelBg, border: ui.border }}>
      <div style={{ ...styles.cardTitle, color: ui.text }}>Bereiche</div>

      {areas.length === 0 ? (
        <div style={{ ...styles.empty, color: ui.subText }}>Keine Bereiche vorhanden.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {areas.map((a) => (
            <div key={a.id} style={{ ...styles.areaRow, border: ui.border, background: ui.cardBg }}>
              <div style={{ fontWeight: 650, color: ui.text }}>{a.name}</div>
              <div style={{ ...styles.meta, color: ui.subText }}>{a.id}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Placeholder({ ui, title, text }) {
  return (
    <div style={{ ...styles.card, background: ui.panelBg, border: ui.border }}>
      <div style={{ ...styles.cardTitle, color: ui.text }}>{title}</div>
      <div style={{ opacity: 0.85, color: ui.subText }}>{text}</div>
    </div>
  );
}

function SettingsView({ ui, settings, loading, saving, onChange }) {
  const s = settings ?? {
    theme: "light",
    accent: "indigo",
    background: "plain",
    notifications_enabled: false,
    notifications_email: false,
    notifications_desktop: false
  };

  return (
    <div style={{ ...styles.card, background: ui.panelBg, border: ui.border }}>
      <div style={{ ...styles.cardTitle, color: ui.text }}>Einstellungen</div>

      {loading ? (
        <div style={{ ...styles.empty, color: ui.subText }}>Lade…</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: ui.subText }}>Theme</div>
            <select
              value={s.theme ?? "light"}
              onChange={(e) => onChange({ theme: e.target.value })}
              style={{ ...styles.selectInline, border: ui.border, background: ui.inputBg, color: ui.text }}
              disabled={saving}
            >
              <option value="light">Hell</option>
              <option value="dark">Dunkel</option>
            </select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: ui.subText }}>Akzentfarbe</div>
            <select
              value={s.accent ?? "indigo"}
              onChange={(e) => onChange({ accent: e.target.value })}
              style={{ ...styles.selectInline, border: ui.border, background: ui.inputBg, color: ui.text }}
              disabled={saving}
            >
              <option value="indigo">Indigo</option>
              <option value="blue">Blau</option>
              <option value="green">Grün</option>
              <option value="orange">Orange</option>
              <option value="red">Rot</option>
              <option value="slate">Slate</option>
            </select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: ui.subText }}>Hintergrund</div>
            <select
              value={s.background ?? "plain"}
              onChange={(e) => onChange({ background: e.target.value })}
              style={{ ...styles.selectInline, border: ui.border, background: ui.inputBg, color: ui.text }}
              disabled={saving}
            >
              <option value="plain">Einfarbig</option>
              <option value="gradient">Gradient</option>
            </select>
          </div>

          <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
            <label style={{ display: "flex", gap: 10, alignItems: "center", color: ui.text }}>
              <input
                type="checkbox"
                checked={!!s.notifications_enabled}
                onChange={(e) => onChange({ notifications_enabled: e.target.checked })}
                disabled={saving}
              />
              Benachrichtigungen aktiv
            </label>

            <label style={{ display: "flex", gap: 10, alignItems: "center", color: ui.text }}>
              <input
                type="checkbox"
                checked={!!s.notifications_email}
                onChange={(e) => onChange({ notifications_email: e.target.checked })}
                disabled={saving || !s.notifications_enabled}
              />
              E-Mail Benachrichtigung
            </label>

            <label style={{ display: "flex", gap: 10, alignItems: "center", color: ui.text }}>
              <input
                type="checkbox"
                checked={!!s.notifications_desktop}
                onChange={(e) => onChange({ notifications_desktop: e.target.checked })}
                disabled={saving || !s.notifications_enabled}
              />
              Desktop Benachrichtigung
            </label>
          </div>

          {saving ? <div style={{ fontSize: 12, color: ui.subText }}>Speichere…</div> : null}
        </div>
      )}
    </div>
  );
}

/* ---------------- Helpers ---------------- */

function labelStatus(s) {
  if (s === "todo") return "Zu erledigen";
  if (s === "doing") return "In Arbeit";
  if (s === "done") return "Erledigt";
  return s ?? "—";
}

/* ---------------- Styles ---------------- */

const styles = {
  page: {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    minHeight: "100vh"
  },
  topbar: {
    padding: "14px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    backdropFilter: "blur(8px)"
  },
  topTitle: { fontSize: 18, fontWeight: 650 },
  topSub: { fontSize: 12, opacity: 0.7 },

  body: { display: "flex" },
  sidebar: {
    width: 260,
    padding: 14,
    minHeight: "calc(100vh - 60px)"
  },
  main: { flex: 1, padding: 18 },

  sidebarSectionTitle: { fontSize: 12, opacity: 0.7, marginBottom: 10 },

  navBtn: {
    textAlign: "left",
    padding: "10px 10px",
    borderRadius: 12,
    cursor: "pointer"
  },

  tabRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 },
  pill: {
    padding: "10px 12px",
    borderRadius: 999,
    cursor: "pointer"
  },

  statCard: { borderRadius: 12, padding: 12 },
  statLabel: { fontSize: 12, opacity: 0.7 },
  statValue: { fontSize: 22, fontWeight: 750 },

  card: {
    borderRadius: 14,
    padding: 12
  },
  cardTitle: { fontWeight: 750, marginBottom: 10 },

  rowWrap: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },

  input: {
    padding: "10px 12px",
    borderRadius: 12,
    outline: "none"
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    marginTop: 8
  },
  selectInline: {
    padding: "10px 12px",
    borderRadius: 12,
    outline: "none"
  },
  textarea: {
    width: "100%",
    minHeight: 120,
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 12,
    outline: "none"
  },
  file: {
    padding: "10px 12px",
    borderRadius: 12
  },

  btn: {
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer"
  },
  btnGhost: {
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer"
  },
  btnWide: {
    padding: "10px 14px",
    borderRadius: 12,
    cursor: "pointer"
  },

  board: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 },
  col: { borderRadius: 14, padding: 12 },
  colHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  colTitle: { fontWeight: 750 },
  colCount: { fontSize: 12, opacity: 0.7 },

  taskCard: { borderRadius: 12, padding: 12 },
  meta: { fontSize: 12, opacity: 0.75, marginTop: 6 },
  progressText: { fontSize: 12, opacity: 0.85, marginTop: 8 },

  miniSelect: { padding: "6px 8px", borderRadius: 10 },
  miniBtnDanger: {
    padding: "6px 10px",
    borderRadius: 10,
    cursor: "pointer"
  },

  subtaskRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    padding: "8px 10px",
    borderRadius: 10,
    cursor: "pointer"
  },

  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: 10, fontSize: 12, opacity: 0.8 },
  td: { padding: 10, borderBottom: "1px solid rgba(148,163,184,0.15)", verticalAlign: "top" },
  tr: {},

  empty: { padding: 10, opacity: 0.7, fontSize: 13 },

  timelineBlock: { borderRadius: 14, padding: 12 },
  timelineTitle: { fontWeight: 750 },
  timelineItem: { borderRadius: 12, padding: 10 },

  guideRow: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    borderRadius: 14,
    padding: 12
  },

  areaRow: {
    borderRadius: 14,
    padding: 12
  }
};
