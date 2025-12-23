// pages/dashboard.js
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const TABS = [
  { id: "board", label: "Planke" },
  { id: "list", label: "Liste" },
  { id: "calendar", label: "Kalender" },
  { id: "timeline", label: "Zeitleiste" },
  { id: "guides", label: "Anleitungen" },
  { id: "areas", label: "Bereiche" }
];

const DUE_BUCKETS = [
  { value: "Heute", label: "Heute" },
  { value: "Diese Woche", label: "Diese Woche" },
  { value: "Monat", label: "Monat" }
];

const STATUS = [
  { value: "todo", label: "Zu erledigen" },
  { value: "doing", label: "In Arbeit" },
  { value: "done", label: "Erledigt" }
];

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("board");

  // Data
  const [areas, setAreas] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [guides, setGuides] = useState([]);

  // UI state
  const [filterAreaId, setFilterAreaId] = useState("all");
  const [filterDue, setFilterDue] = useState("all");
  const [search, setSearch] = useState("");

  // Create Task
  const [newTitle, setNewTitle] = useState("");
  const [newAreaId, setNewAreaId] = use rightAreaDefault(areas);
  const [newDueBucket, setNewDueBucket] = useState("Heute");
  const [newStatus, setNewStatus] = useState("todo");
  const [busyCreateTask, setBusyCreateTask] = useState(false);

  // Create Subtask
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [busyCreateSubtask, setBusyCreateSubtask] = useState(false);

  // Create Guide (metadata + optional file upload)
  const [guideTitle, setGuideTitle] = useState("");
  const [guideAreaId, setGuideAreaId] = use rightAreaDefault(areas);
  const [guideContent, setGuideContent] = useState("");
  const [guideFile, setGuideFile] = useState(null);
  const [busyCreateGuide, setBusyCreateGuide] = useState(false);

  // Login check
  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  // Load all data (when user exists)
  useEffect(() => {
    if (!user) return;
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  // Default area helpers (avoid hooks bug when areas load later)
  useEffect(() => {
    if (!newAreaId && areas?.length) setNewAreaId(areas[0].id);
    if (!guideAreaId && areas?.length) setGuideAreaId(areas[0].id);
    if (!selectedTaskId && tasks?.length) setSelectedTaskId(tasks[0].id);
  }, [areas, tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build maps
  const areaNameById = useMemo(() => {
    const m = new Map();
    (areas ?? []).forEach((a) => m.set(a.id, a.name));
    return m;
  }, [areas]);

  const subtasksByTaskId = useMemo(() => {
    const m = new Map();
    (subtasks ?? []).forEach((s) => {
      const list = m.get(s.task_id) ?? [];
      list.push(s);
      m.set(s.task_id, list);
    });
    return m;
  }, [subtasks]);

  // Filtered tasks
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

  // Counts
  const counts = useMemo(() => {
    const open = filteredTasks.filter((t) => t.status !== "done").length;
    const today = filteredTasks.filter((t) => t.due_bucket === "Heute" && t.status !== "done").length;
    const week = filteredTasks.filter((t) => t.due_bucket === "Diese Woche" && t.status !== "done").length;
    return { open, today, week };
  }, [filteredTasks]);

  // Create task
  async function createTask() {
    if (!newTitle.trim()) {
      alert("Bitte einen Titel eingeben.");
      return;
    }
    if (!newAreaId) {
      alert("Bitte einen Bereich auswählen.");
      return;
    }

    setBusyCreateTask(true);

    const payload = {
      title: newTitle.trim(),
      area_id: newAreaId,
      status: newStatus,
      due_bucket: newDueBucket,
      period: newDueBucket, // Minimal: period = due_bucket
      subtasks_done: 0,
      subtasks_total: 0,
      created_by: user?.id ?? null,
      user_id: user?.id ?? null,
      due_date: null
    };

    const { error } = await supabase.from("tasks").insert(payload);
    setBusyCreateTask(false);

    if (error) {
      alert("Fehler beim Anlegen: " + error.message);
      return;
    }

    setNewTitle("");
    await reloadAll();
  }

  // Update task status
  async function setTaskStatus(taskId, status) {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
    if (error) {
      alert("Fehler beim Update: " + error.message);
      return;
    }
    await reloadAll();
  }

  // Delete task
  async function deleteTask(taskId) {
    if (!confirm("Aufgabe wirklich löschen?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) {
      alert("Fehler beim Löschen: " + error.message);
      return;
    }
    await reloadAll();
  }

  // Create subtask
  async function createSubtask() {
    if (!selectedTaskId) {
      alert("Bitte zuerst eine Aufgabe auswählen.");
      return;
    }
    if (!newSubtaskTitle.trim()) {
      alert("Bitte einen Unteraufgaben-Titel eingeben.");
      return;
    }

    setBusyCreateSubtask(true);

    const payload = {
      task_id: selectedTaskId,
      title: newSubtaskTitle.trim(),
      status: "todo",
      is_done: false
    };

    const { error } = await supabase.from("subtasks").insert(payload);
    setBusyCreateSubtask(false);

    if (error) {
      alert("Fehler beim Anlegen: " + error.message);
      return;
    }

    setNewSubtaskTitle("");

    // Recalc subtasks counters on task (simple)
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

    if (error) {
      alert("Fehler beim Update: " + error.message);
      return;
    }

    await recomputeTaskSubtasks(subtask.task_id);
    await reloadAll();
  }

  async function recomputeTaskSubtasks(taskId) {
    // Pull subtasks for this task
    const { data, error } = await supabase
      .from("subtasks")
      .select("id,is_done,status")
      .eq("task_id", taskId);

    if (error) return;

    const total = (data ?? []).length;
    const done = (data ?? []).filter((s) => (s.is_done ?? false) || s.status === "done").length;

    await supabase
      .from("tasks")
      .update({ subtasks_total: total, subtasks_done: done })
      .eq("id", taskId);
  }

  // Create guide (with optional upload to bucket "guides")
  async function createGuide() {
    if (!guideTitle.trim()) {
      alert("Bitte einen Titel eingeben.");
      return;
    }
    if (!guideAreaId) {
      alert("Bitte einen Bereich auswählen.");
      return;
    }

    setBusyCreateGuide(true);

    let file_path = null;

    // Optional file upload
    if (guideFile) {
      const safeName = guideFile.name.replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
      const path = `${user?.id ?? "user"}/${Date.now()}_${safeName}`;

      const { error: upErr } = await supabase.storage.from("guides").upload(path, guideFile, {
        upsert: false
      });

      if (upErr) {
        setBusyCreateGuide(false);
        alert("Upload-Fehler: " + upErr.message);
        return;
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

    if (error) {
      alert("Fehler beim Speichern: " + error.message);
      return;
    }

    setGuideTitle("");
    setGuideContent("");
    setGuideFile(null);
    await reloadAll();
  }

  async function openGuideFile(file_path) {
    if (!file_path) return;

    const { data, error } = await supabase.storage.from("guides").createSignedUrl(file_path, 60 * 10);
    if (error) {
      alert("Fehler beim Öffnen: " + error.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  if (loading) {
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
    <div style={styles.page}>
      {/* Topbar */}
      <div style={styles.topbar}>
        <div>
          <div style={styles.topTitle}>Armaturenbrett</div>
          <div style={styles.topSub}>Angemeldet als: {user.email}</div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button style={styles.btnGhost} onClick={reloadAll}>Neu laden</button>
          <button style={styles.btn} onClick={signOut}>Abmelden</button>
        </div>
      </div>

      <div style={styles.body}>
        {/* Sidebar */}
        <div style={styles.sidebar}>
          <div style={styles.sidebarSectionTitle}>Übersicht</div>
          <div style={{ display: "grid", gap: 10 }}>
            <StatCard label="Aufgaben heute" value={counts.today} />
            <StatCard label="Diese Woche" value={counts.week} />
            <StatCard label="Offen" value={counts.open} />
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={styles.sidebarSectionTitle}>Navigation</div>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    ...styles.navBtn,
                    background: activeTab === t.id ? "#eef2ff" : "white"
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={styles.sidebarSectionTitle}>Filter</div>

            <select
              value={filterAreaId}
              onChange={(e) => setFilterAreaId(e.target.value)}
              style={styles.select}
            >
              <option value="all">Alle Bereiche</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>

            <select
              value={filterDue}
              onChange={(e) => setFilterDue(e.target.value)}
              style={styles.select}
            >
              <option value="all">Alle Zeiträume</option>
              {DUE_BUCKETS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suche…"
              style={styles.input}
            />
          </div>
        </div>

        {/* Main */}
        <div style={styles.main}>
          {/* Tabs Row */}
          <div style={styles.tabRow}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  ...styles.pill,
                  background: activeTab === t.id ? "white" : "transparent"
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
                tasks={filteredTasks}
                areaNameById={areaNameById}
                onStatus={setTaskStatus}
                onDelete={deleteTask}
                subtasksByTaskId={subtasksByTaskId}
                onToggleSubtask={toggleSubtaskDone}
              />

              <SubtaskBar
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
              tasks={filteredTasks}
              areaNameById={areaNameById}
              onStatus={setTaskStatus}
              onDelete={deleteTask}
            />
          )}

          {activeTab === "calendar" && (
            <Placeholder
              title="Kalender"
              text="Minimaler Platzhalter. Später können wir due_date nutzen und eine echte Monats-/Wochenansicht bauen."
            />
          )}

          {activeTab === "timeline" && (
            <TimelineView tasks={filteredTasks} areaNameById={areaNameById} />
          )}

          {activeTab === "guides" && (
            <GuidesView
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

          {activeTab === "areas" && <AreasView areas={areas} />}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Components ---------------- */

function StatCard({ label, value }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

function CreateTaskBar({
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
    <div style={styles.card}>
      <div style={styles.cardTitle}>Aufgabe anlegen</div>

      <div style={styles.row}>
        <input
          style={{ ...styles.input, flex: 1 }}
          placeholder="Titel"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />

        <select style={styles.selectInline} value={newAreaId} onChange={(e) => setNewAreaId(e.target.value)}>
          <option value="">Bereich auswählen</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        <select style={styles.selectInline} value={newDueBucket} onChange={(e) => setNewDueBucket(e.target.value)}>
          {DUE_BUCKETS.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>

        <select style={styles.selectInline} value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
          {STATUS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <button style={styles.btnWide} onClick={onCreate} disabled={busy}>
          {busy ? "…" : "Anlegen"}
        </button>
      </div>
    </div>
  );
}

function BoardView({ tasks, areaNameById, onStatus, onDelete, subtasksByTaskId, onToggleSubtask }) {
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
          <div key={col.id} style={styles.col}>
            <div style={styles.colHeader}>
              <div style={styles.colTitle}>{col.title}</div>
              <div style={styles.colCount}>{colTasks.length}</div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {colTasks.length === 0 ? (
                <div style={styles.empty}>Keine Aufgaben</div>
              ) : (
                colTasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    areaName={areaNameById.get(t.area_id) ?? "—"}
                    onStatus={onStatus}
                    onDelete={onDelete}
                    subtasks={(subtasksByTaskId.get(t.id) ?? []).slice(0, 6)}
                    onToggleSubtask={onToggleSubtask}
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

function TaskCard({ task, areaName, onStatus, onDelete, subtasks, onToggleSubtask }) {
  const total = Number(task.subtasks_total ?? 0);
  const done = Number(task.subtasks_done ?? 0);
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div style={styles.taskCard}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 650 }}>{task.title}</div>

        <div style={{ display: "flex", gap: 6 }}>
          <select
            style={styles.miniSelect}
            value={task.status}
            onChange={(e) => onStatus(task.id, e.target.value)}
          >
            <option value="todo">Zu erledigen</option>
            <option value="doing">In Arbeit</option>
            <option value="done">Erledigt</option>
          </select>

          <button style={styles.miniBtnDanger} onClick={() => onDelete(task.id)}>✕</button>
        </div>
      </div>

      <div style={styles.meta}>
        {areaName} • {task.due_bucket ?? "—"}
      </div>

      <div style={styles.progressText}>
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
                textDecoration: (s.is_done ?? false) ? "line-through" : "none",
                opacity: (s.is_done ?? false) ? 0.7 : 1
              }}
              title="Klicken = erledigt/unerledigt"
            >
              <span>{(s.is_done ?? false) ? "✓" : "•"}</span>
              <span style={{ flex: 1, textAlign: "left" }}>{s.title}</span>
            </button>
          ))}
          {(Number(task.subtasks_total ?? 0) > subtasks.length) ? (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Weitere Unteraufgaben in der Liste/Details (später).
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SubtaskBar({ tasks, selectedTaskId, setSelectedTaskId, newSubtaskTitle, setNewSubtaskTitle, busy, onCreate }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>Unteraufgabe anlegen</div>

      <div style={styles.row}>
        <select
          style={{ ...styles.selectInline, flex: 1 }}
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
          style={{ ...styles.input, flex: 2 }}
          placeholder="Unteraufgabe…"
          value={newSubtaskTitle}
          onChange={(e) => setNewSubtaskTitle(e.target.value)}
        />

        <button style={styles.btnWide} onClick={onCreate} disabled={busy}>
          {busy ? "…" : "Anlegen"}
        </button>
      </div>
    </div>
  );
}

function ListView({ tasks, areaNameById, onStatus, onDelete }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>Liste</div>

      <div style={{ width: "100%", overflowX: "auto" }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Aufgabe</th>
              <th style={styles.th}>Bereich</th>
              <th style={styles.th}>Zeitraum</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} style={styles.tr}>
                <td style={styles.td}>{t.title}</td>
                <td style={styles.td}>{areaNameById.get(t.area_id) ?? "—"}</td>
                <td style={styles.td}>{t.due_bucket ?? "—"}</td>
                <td style={styles.td}>
                  <select
                    style={styles.miniSelect}
                    value={t.status}
                    onChange={(e) => onStatus(t.id, e.target.value)}
                  >
                    <option value="todo">Zu erledigen</option>
                    <option value="doing">In Arbeit</option>
                    <option value="done">Erledigt</option>
                  </select>
                </td>
                <td style={{ ...styles.td, width: 50 }}>
                  <button style={styles.miniBtnDanger} onClick={() => onDelete(t.id)}>✕</button>
                </td>
              </tr>
            ))}
            {tasks.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={5}>
                  <div style={styles.empty}>Keine Aufgaben</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TimelineView({ tasks, areaNameById }) {
  // Simple grouping by period (text)
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
    <div style={styles.card}>
      <div style={styles.cardTitle}>Zeitleiste (minimal)</div>

      <div style={{ display: "grid", gap: 14 }}>
        {groups.map(([k, list]) => (
          <div key={k} style={styles.timelineBlock}>
            <div style={styles.timelineTitle}>{k}</div>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {list.map((t) => (
                <div key={t.id} style={styles.timelineItem}>
                  <div style={{ fontWeight: 650 }}>{t.title}</div>
                  <div style={styles.meta}>{areaNameById.get(t.area_id) ?? "—"} • {labelStatus(t.status)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 ? <div style={styles.empty}>Keine Einträge</div> : null}
      </div>
    </div>
  );
}

function GuidesView({
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
      <div style={styles.card}>
        <div style={styles.cardTitle}>Anleitung anlegen</div>

        <div style={styles.rowWrap}>
          <input
            style={{ ...styles.input, flex: 2 }}
            placeholder="Titel"
            value={guideTitle}
            onChange={(e) => setGuideTitle(e.target.value)}
          />

          <select
            style={{ ...styles.selectInline, flex: 1 }}
            value={guideAreaId}
            onChange={(e) => setGuideAreaId(e.target.value)}
          >
            <option value="">Bereich auswählen</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          <input
            type="file"
            onChange={(e) => setGuideFile(e.target.files?.[0] ?? null)}
            style={{ ...styles.file, flex: 1 }}
          />

          <button style={styles.btnWide} onClick={onCreate} disabled={busy}>
            {busy ? "…" : "Speichern"}
          </button>
        </div>

        <textarea
          style={styles.textarea}
          placeholder="Kurzbeschreibung / Inhalt (optional)…"
          value={guideContent}
          onChange={(e) => setGuideContent(e.target.value)}
        />
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>Anleitungen</div>

        <div style={{ display: "grid", gap: 10 }}>
          {guides.length === 0 ? (
            <div style={styles.empty}>Noch keine Anleitungen.</div>
          ) : (
            guides.map((g) => (
              <div key={g.id} style={styles.guideRow}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 650 }}>{g.title}</div>
                  <div style={styles.meta}>
                    {areaNameById.get(g.area_id) ?? "—"} • {new Date(g.created_at).toLocaleString()}
                  </div>
                  {g.content ? <div style={{ marginTop: 6, opacity: 0.9 }}>{g.content}</div> : null}
                </div>

                {g.file_path ? (
                  <button style={styles.btnGhost} onClick={() => onOpenFile(g.file_path)}>
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

function AreasView({ areas }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>Bereiche</div>

      {areas.length === 0 ? (
        <div style={styles.empty}>Keine Bereiche vorhanden.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {areas.map((a) => (
            <div key={a.id} style={styles.areaRow}>
              <div style={{ fontWeight: 650 }}>{a.name}</div>
              <div style={styles.meta}>{a.id}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Placeholder({ title, text }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{title}</div>
      <div style={{ opacity: 0.85 }}>{text}</div>
    </div>
  );
}

/* ---------------- Helpers ---------------- */

// NOTE: small helper to avoid "hooks in loops" mistakes from earlier versions
function rightAreaDefault(areas) {
  // placeholder for initialization in state (cannot depend on areas directly here)
  // will be set via useEffect when areas load
  return "";
}

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
    minHeight: "100vh",
    background: "#f6f7f9"
  },
  topbar: {
    background: "white",
    borderBottom: "1px solid #e5e7eb",
    padding: "14px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between"
  },
  topTitle: { fontSize: 18, fontWeight: 650 },
  topSub: { fontSize: 12, opacity: 0.7 },

  body: { display: "flex" },
  sidebar: {
    width: 260,
    padding: 14,
    borderRight: "1px solid #e5e7eb",
    background: "white",
    minHeight: "calc(100vh - 60px)"
  },
  main: { flex: 1, padding: 18 },

  sidebarSectionTitle: { fontSize: 12, opacity: 0.7, marginBottom: 10 },

  navBtn: {
    textAlign: "left",
    padding: "10px 10px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    cursor: "pointer"
  },

  tabRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 },
  pill: {
    padding: "10px 12px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    cursor: "pointer"
  },

  statCard: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" },
  statLabel: { fontSize: 12, opacity: 0.7 },
  statValue: { fontSize: 22, fontWeight: 750 },

  card: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 12
  },
  cardTitle: { fontWeight: 750, marginBottom: 10 },

  row: { display: "flex", gap: 10, alignItems: "center" },
  rowWrap: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },

  input: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    outline: "none"
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    marginTop: 8
  },
  selectInline: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    outline: "none"
  },
  textarea: {
    width: "100%",
    minHeight: 120,
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    outline: "none"
  },
  file: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fafafa"
  },

  btn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "white",
    cursor: "pointer"
  },
  btnGhost: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fafafa",
    cursor: "pointer"
  },
  btnWide: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "white",
    cursor: "pointer",
    minWidth: 110
  },

  board: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 },
  col: { background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 },
  colHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  colTitle: { fontWeight: 750 },
  colCount: { fontSize: 12, opacity: 0.7 },

  taskCard: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" },
  meta: { fontSize: 12, opacity: 0.75, marginTop: 6 },
  progressText: { fontSize: 12, opacity: 0.85, marginTop: 8 },

  miniSelect: { padding: "6px 8px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white" },
  miniBtnDanger: {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "white",
    cursor: "pointer"
  },

  subtaskRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "white",
    cursor: "pointer"
  },

  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb", fontSize: 12, opacity: 0.8 },
  td: { padding: 10, borderBottom: "1px solid #f1f5f9", verticalAlign: "top" },
  tr: {},

  empty: { padding: 10, opacity: 0.7, fontSize: 13 },

  timelineBlock: { border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#fafafa" },
  timelineTitle: { fontWeight: 750 },
  timelineItem: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "white" },

  guideRow: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 12,
    background: "#fafafa"
  },

  areaRow: {
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 12,
    background: "#fafafa"
  }
};
