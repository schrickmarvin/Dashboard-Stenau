import { useEffect, useMemo, useRef, useState } from "react";
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
  { id: "admin", label: "Chef Cockpit" }
];

const STATUS = [
  { id: "todo", label: "To do" },
  { id: "doing", label: "In Arbeit" },
  { id: "done", label: "Erledigt" }
];

const DUE_BUCKETS = ["Heute", "Diese Woche", "Monat", "Jahr"];

function isAdminEmail(email) {
  const adminList = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return adminList.includes((email || "").toLowerCase());
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [activeTab, setActiveTab] = useState("board");
  const [toast, setToast] = useState("");

  const [areas, setAreas] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [guides, setGuides] = useState([]);

  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState("");

  const [filterAreaId, setFilterAreaId] = useState("all");
  const [filterDue, setFilterDue] = useState("all");
  const [search, setSearch] = useState("");

  const [newTitle, setNewTitle] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [newDue, setNewDue] = useState("Heute");
  const [newStatus, setNewStatus] = useState("todo");
  const [creatingTask, setCreatingTask] = useState(false);

  const [selectedTask, setSelectedTask] = useState(null);
  const [subtasks, setSubtasks] = useState([]);
  const [subtasksLoading, setSubtasksLoading] = useState(false);
  const [subtasksError, setSubtasksError] = useState("");
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [savingSubtask, setSavingSubtask] = useState(false);

  const [newAreaName, setNewAreaName] = useState("");
  const [savingArea, setSavingArea] = useState(false);

  const [newGuideTitle, setNewGuideTitle] = useState("");
  const [newGuideText, setNewGuideText] = useState("");
  const [newGuideAreaId, setNewGuideAreaId] = useState("");
  const [uploadingGuide, setUploadingGuide] = useState(false);
  const fileRef = useRef(null);

  const isAdmin = useMemo(() => isAdminEmail(user?.email), [user?.email]);

  const counts = useMemo(() => {
    const list = tasks;
    return {
      today: list.filter((t) => t.due === "Heute" && t.status !== "done").length,
      week: list.filter((t) => t.due === "Diese Woche" && t.status !== "done").length,
      open: list.filter((t) => t.status !== "done").length
    };
  }, [tasks]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      setLoadingAuth(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      try {
        authListener?.subscription?.unsubscribe?.();
      } catch {}
    };
  }, []);

  async function ensureDesktopNotifications() {
    try {
      if (!("Notification" in window)) return false;
      if (Notification.permission === "granted") return true;
      if (Notification.permission === "denied") return false;
      const p = await Notification.requestPermission();
      return p === "granted";
    } catch {
      return false;
    }
  }

  function notifyDesktop(title, body) {
    try {
      if (!("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      new Notification(title, { body });
    } catch {}
  }

  function showToast(msg) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  }

  function normalize(str) {
    return (str || "").toLowerCase();
  }

  const filteredTasks = useMemo(() => {
    let list = [...tasks];

    if (filterAreaId !== "all") list = list.filter((t) => t.area_id === filterAreaId);
    if (filterDue !== "all") list = list.filter((t) => t.due === filterDue);

    if (search.trim()) {
      const q = normalize(search.trim());
      list = list.filter((t) => {
        return (
          normalize(t.title).includes(q) ||
          normalize(t.area).includes(q) ||
          normalize(t.due).includes(q)
        );
      });
    }

    return list;
  }, [tasks, filterAreaId, filterDue, search]);

  async function reloadAreas() {
    const { data, error } = await supabase
      .from("areas")
      .select("id,name,created_at")
      .order("name", { ascending: true });

    if (error) {
      setAreas([]);
      setDataError(error.message);
      return;
    }

    const list = data || [];
    setAreas(list);

    if (!newAreaId && list.length) setNewAreaId(list[0].id);
    if (!newGuideAreaId && list.length) setNewGuideAreaId(list[0].id);
  }

  async function reloadTasks() {
    if (!user) return;

    setLoadingData(true);
    setDataError("");

    const { data, error } = await supabase
      .from("tasks")
      .select("id,title,status,due_bucket,subtasks_done,subtasks_total,created_at,area_id,areas(name)")
      .order("created_at", { ascending: false });

    if (error) {
      setDataError(error.message);
      setTasks([]);
      setLoadingData(false);
      return;
    }

    const mapped = (data || []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      due: t.due_bucket,
      area: t.areas?.name || "Ohne Bereich",
      area_id: t.area_id || null,
      subtasksDone: t.subtasks_done ?? 0,
      subtasksTotal: t.subtasks_total ?? 0,
      created_at: t.created_at
    }));

    setTasks(mapped);
    setLoadingData(false);
  }

  async function reloadGuides() {
    const { data, error } = await supabase
      .from("guides")
      .select("id,title,content,area_id,file_path,created_at,areas(name)")
      .order("created_at", { ascending: false });

    if (error) {
      setGuides([]);
      setDataError(error.message);
      return;
    }

    setGuides(
      (data || []).map((g) => ({
        id: g.id,
        title: g.title,
        content: g.content || "",
        area_id: g.area_id || null,
        area: g.areas?.name || "Ohne Bereich",
        file_path: g.file_path || "",
        created_at: g.created_at
      }))
    );
  }

  useEffect(() => {
    if (!user) return;
    (async () => {
      await reloadAreas();
      await reloadTasks();
      await reloadGuides();
      await ensureDesktopNotifications();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } catch {}
    window.location.href = "/";
  }

  async function createTask() {
    if (!newTitle.trim()) return alert("Bitte Titel eingeben.");
    if (!newAreaId) return alert("Bitte Bereich auswählen.");

    setCreatingTask(true);
    setDataError("");

    const payload = {
      title: newTitle.trim(),
      area_id: newAreaId,
      status: newStatus,
      due_bucket: newDue,
      subtasks_done: 0,
      subtasks_total: 0
    };

    const { error } = await supabase.from("tasks").insert(payload);

    if (error) {
      setDataError(error.message);
      setCreatingTask(false);
      return;
    }

    setNewTitle("");
    setNewDue("Heute");
    setNewStatus("todo");

    await reloadTasks();
    showToast("Aufgabe angelegt");
    notifyDesktop("Neue Aufgabe", payload.title);

    setCreatingTask(false);
  }

  async function setTaskStatus(taskId, status) {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
    if (error) return alert(error.message);

    await reloadTasks();
    showToast("Status geändert");
    notifyDesktop("Status geändert", `Aufgabe → ${statusLabel(status)}`);
    if (selectedTask?.id === taskId) setSelectedTask((p) => (p ? { ...p, status } : p));
  }

  async function openTask(task) {
    setSelectedTask(task);
    setSubtasks([]);
    setSubtasksError("");
    setNewSubtaskTitle("");
    await loadSubtasks(task.id);
  }

  function closeTask() {
    setSelectedTask(null);
    setSubtasks([]);
    setSubtasksError("");
    setNewSubtaskTitle("");
  }

  async function loadSubtasks(taskId) {
    setSubtasksLoading(true);
    setSubtasksError("");

    const { data, error } = await supabase
      .from("subtasks")
      .select("id,title,is_done,created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });

    if (error) {
      setSubtasksError(error.message);
      setSubtasks([]);
      setSubtasksLoading(false);
      return;
    }

    setSubtasks(data || []);
    setSubtasksLoading(false);
    await recalcAndStoreTaskProgress(taskId);
  }

  async function recalcAndStoreTaskProgress(taskId) {
    const { data, error } = await supabase
      .from("subtasks")
      .select("id,is_done")
      .eq("task_id", taskId);

    if (error) return;

    const total = (data || []).length;
    const done = (data || []).filter((s) => !!s.is_done).length;

    await supabase.from("tasks").update({ subtasks_total: total, subtasks_done: done }).eq("id", taskId);

    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, subtasksTotal: total, subtasksDone: done } : t))
    );

    if (selectedTask?.id === taskId) {
      setSelectedTask((prev) => (prev ? { ...prev, subtasksTotal: total, subtasksDone: done } : prev));
    }
  }

  async function addSubtask() {
    if (!selectedTask) return;
    const title = newSubtaskTitle.trim();
    if (!title) return alert("Bitte Unteraufgabe eingeben.");

    setSavingSubtask(true);
    setSubtasksError("");

    const { error } = await supabase.from("subtasks").insert({
      task_id: selectedTask.id,
      title,
      is_done: false
    });

    if (error) {
      setSubtasksError(error.message);
      setSavingSubtask(false);
      return;
    }

    setNewSubtaskTitle("");
    await loadSubtasks(selectedTask.id);
    await reloadTasks();
    showToast("Unteraufgabe hinzugefügt");
    setSavingSubtask(false);
  }

  async function toggleSubtaskDone(subtaskId, isDone) {
    if (!selectedTask) return;

    const { error } = await supabase.from("subtasks").update({ is_done: isDone }).eq("id", subtaskId);
    if (error) return alert(error.message);

    setSubtasks((prev) => prev.map((s) => (s.id === subtaskId ? { ...s, is_done: isDone } : s)));
    await recalcAndStoreTaskProgress(selectedTask.id);
    await reloadTasks();
    showToast("Unteraufgabe aktualisiert");
  }

  async function deleteSubtask(subtaskId) {
    if (!selectedTask) return;
    if (!window.confirm("Unteraufgabe wirklich löschen?")) return;

    const { error } = await supabase.from("subtasks").delete().eq("id", subtaskId);
    if (error) return alert(error.message);

    setSubtasks((prev) => prev.filter((s) => s.id !== subtaskId));
    await recalcAndStoreTaskProgress(selectedTask.id);
    await reloadTasks();
    showToast("Unteraufgabe gelöscht");
  }

  async function addArea() {
    const name = newAreaName.trim();
    if (!name) return alert("Bitte Bereichsname eingeben.");

    setSavingArea(true);
    const { error } = await supabase.from("areas").insert({ name });
    if (error) {
      alert(error.message);
      setSavingArea(false);
      return;
    }
    setNewAreaName("");
    await reloadAreas();
    showToast("Bereich angelegt");
    setSavingArea(false);
  }

  async function createGuide() {
    const title = newGuideTitle.trim();
    if (!title) return alert("Bitte Titel eingeben.");

    setUploadingGuide(true);
    setDataError("");

    let file_path = "";
    const file = fileRef.current?.files?.[0];

    if (file) {
      const safeName = `${Date.now()}_${file.name}`.replace(/\s+/g, "_");
      const path = `${newGuideAreaId || "general"}/${safeName}`;

      const up = await supabase.storage.from("guides").upload(path, file, { upsert: true });
      if (up.error) {
        setDataError(up.error.message);
        setUploadingGuide(false);
        return;
      }
      file_path = path;
    }

    const { error } = await supabase.from("guides").insert({
      title,
      content: newGuideText || "",
      area_id: newGuideAreaId || null,
      file_path
    });

    if (error) {
      setDataError(error.message);
      setUploadingGuide(false);
      return;
    }

    setNewGuideTitle("");
    setNewGuideText("");
    if (fileRef.current) fileRef.current.value = "";
    await reloadGuides();
    showToast("Anleitung gespeichert");
    notifyDesktop("Anleitung gespeichert", title);
    setUploadingGuide(false);
  }

  function getGuideFileUrl(file_path) {
    if (!file_path) return "";
    const { data } = supabase.storage.from("guides").getPublicUrl(file_path);
    return data?.publicUrl || "";
  }

  if (loadingAuth) {
    return (
      <div style={{ padding: 30, fontFamily: "system-ui" }}>
        <h1>Dashboard</h1>
        <p>Lade…</p>
      </div>
    );
  }

  if (!user) {
    window.location.href = "/";
    return null;
  }

  const visibleTabs = isAdmin ? TABS : TABS.filter((t) => t.id !== "admin");

  return (
    <div style={{ fontFamily: "system-ui", minHeight: "100vh", background: "#f6f7f9" }}>
      <div
        style={{
          background: "white",
          borderBottom: "1px solid #e5e7eb",
          padding: "14px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Dashboard</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Angemeldet als: {user.email}
            {isAdmin ? " • Chef" : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={async () => {
              const ok = await ensureDesktopNotifications();
              showToast(ok ? "Desktop-Benachrichtigungen aktiv" : "Benachrichtigungen nicht erlaubt");
            }}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "white",
              cursor: "pointer",
              fontSize: 12
            }}
          >
            Benachrichtigungen
          </button>

          <button onClick={signOut} style={{ padding: "8px 12px", cursor: "pointer" }}>
            Logout
          </button>
        </div>
      </div>

      <div style={{ display: "flex" }}>
        <div
          style={{
            width: 260,
            background: "white",
            padding: 14,
            borderRight: "1px solid #e5e7eb"
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>Übersicht</div>
          <div style={{ display: "grid", gap: 8 }}>
            <StatCard label="Aufgaben heute" value={counts.today} />
            <StatCard label="Diese Woche" value={counts.week} />
            <StatCard label="Offen" value={counts.open} />
          </div>

          <div style={{ marginTop: 18, fontSize: 12, opacity: 0.7 }}>Navigation</div>
          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            {visibleTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  width: "100%",
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

          <div style={{ marginTop: 18, fontSize: 12, opacity: 0.7 }}>Filter</div>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <select
              value={filterAreaId}
              onChange={(e) => setFilterAreaId(e.target.value)}
              style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
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
              style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
            >
              <option value="all">Alle Zeiträume</option>
              {DUE_BUCKETS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suche…"
              style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
            />
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button
              onClick={async () => {
                setLoadingData(true);
                await reloadTasks();
                await reloadGuides();
                setLoadingData(false);
                showToast("Neu geladen");
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "white",
                cursor: "pointer",
                flex: 1
              }}
            >
              Neu laden
            </button>
          </div>

          {dataError ? (
            <div style={{ marginTop: 10, color: "darkred", fontSize: 12 }}>{dataError}</div>
          ) : null}
        </div>

        <div style={{ flex: 1, padding: 18 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {visibleTabs.map((t) => (
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

          {(activeTab === "board" || activeTab === "list") && (
            <div
              style={{
                background: "white",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 12,
                marginBottom: 14
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Aufgabe anlegen</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 220px 160px 160px 140px", gap: 8 }}>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Titel"
                  style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
                />

                <select
                  value={newAreaId}
                  onChange={(e) => setNewAreaId(e.target.value)}
                  style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
                >
                  {areas.length === 0 && <option value="">(keine Bereiche)</option>}
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>

                <select
                  value={newDue}
                  onChange={(e) => setNewDue(e.target.value)}
                  style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
                >
                  {DUE_BUCKETS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>

                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
                >
                  {STATUS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>

                <button
                  onClick={createTask}
                  disabled={creatingTask}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: creatingTask ? "#f3f4f6" : "white",
                    cursor: creatingTask ? "not-allowed" : "pointer"
                  }}
                >
                  {creatingTask ? "Speichere…" : "Anlegen"}
                </button>
              </div>
            </div>
          )}

          {activeTab === "board" && (
            <BoardView tasks={filteredTasks} onSetStatus={setTaskStatus} onOpenTask={openTask} />
          )}
          {activeTab === "list" && (
            <ListView tasks={filteredTasks} onSetStatus={setTaskStatus} onOpenTask={openTask} />
          )}
          {activeTab === "calendar" && <CalendarPlaceholder tasks={filteredTasks} />}
          {activeTab === "timeline" && <TimelinePlaceholder tasks={filteredTasks} />}
          {activeTab === "guides" && (
            <GuidesView
              areas={areas}
              guides={guides}
              newGuideTitle={newGuideTitle}
              setNewGuideTitle={setNewGuideTitle}
              newGuideText={newGuideText}
              setNewGuideText={setNewGuideText}
              newGuideAreaId={newGuideAreaId}
              setNewGuideAreaId={setNewGuideAreaId}
              fileRef={fileRef}
              uploadingGuide={uploadingGuide}
              createGuide={createGuide}
              getGuideFileUrl={getGuideFileUrl}
              dataError={dataError}
            />
          )}
          {activeTab === "admin" && isAdmin && (
            <AdminView
              areas={areas}
              tasks={tasks}
              newAreaName={newAreaName}
              setNewAreaName={setNewAreaName}
              addArea={addArea}
              savingArea={savingArea}
            />
          )}
          {activeTab === "admin" && !isAdmin && (
            <Placeholder title="Kein Zugriff" text="Dieser Bereich ist nur für den Chef/Admin sichtbar." />
          )}
        </div>
      </div>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={closeTask}
          onSetStatus={setTaskStatus}
          subtasks={subtasks}
          subtasksLoading={subtasksLoading}
          subtasksError={subtasksError}
          newSubtaskTitle={newSubtaskTitle}
          setNewSubtaskTitle={setNewSubtaskTitle}
          addSubtask={addSubtask}
          savingSubtask={savingSubtask}
          toggleSubtaskDone={toggleSubtaskDone}
          deleteSubtask={deleteSubtask}
        />
      )}

      {toast ? (
        <div
          style={{
            position: "fixed",
            bottom: 16,
            right: 16,
            background: "black",
            color: "white",
            padding: "10px 12px",
            borderRadius: 12,
            opacity: 0.9,
            zIndex: 999
          }}
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Components ---------- */

function StatCard({ label, value }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function BoardView({ tasks, onSetStatus, onOpenTask }) {
  const cols = [
    { id: "todo", title: "To do" },
    { id: "doing", title: "In Arbeit" },
    { id: "done", title: "Erledigt" }
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
      {cols.map((col) => (
        <div key={col.id} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>{col.title}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{tasks.filter((t) => t.status === col.id).length}</div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {tasks
              .filter((t) => t.status === col.id)
              .map((t) => (
                <TaskCard key={t.id} task={t} onSetStatus={onSetStatus} onOpenTask={onOpenTask} />
              ))}

            {tasks.filter((t) => t.status === col.id).length === 0 && (
              <div style={{ fontSize: 12, opacity: 0.6, padding: 8 }}>Keine Aufgaben</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskCard({ task, onSetStatus, onOpenTask }) {
  const progress = task.subtasksTotal > 0 ? Math.round((task.subtasksDone / task.subtasksTotal) * 100) : 0;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{task.title}</div>
        <button
          onClick={() => onOpenTask(task)}
          style={{
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "white",
            cursor: "pointer",
            fontSize: 12,
            height: 30
          }}
        >
          Details
        </button>
      </div>

      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
        {task.area} • {task.due}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <button onClick={() => onSetStatus(task.id, "todo")} style={smallBtn(task.status === "todo")}>
          To do
        </button>
        <button onClick={() => onSetStatus(task.id, "doing")} style={smallBtn(task.status === "doing")}>
          In Arbeit
        </button>
        <button onClick={() => onSetStatus(task.id, "done")} style={smallBtn(task.status === "done")}>
          Erledigt
        </button>
      </div>

      <div style={{ fontSize: 12, opacity: 0.8 }}>
        Unteraufgaben: {task.subtasksDone}/{task.subtasksTotal} ({progress}%)
      </div>
    </div>
  );
}

function smallBtn(active) {
  return {
    padding: "6px 8px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: active ? "#eef2ff" : "white",
    cursor: "pointer",
    fontSize: 12
  };
}

function ListView({ tasks, onSetStatus, onOpenTask }) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Aufgabenliste</div>

      <div style={{ width: "100%", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
              <th style={{ padding: 10 }}>Aufgabe</th>
              <th style={{ padding: 10 }}>Bereich</th>
              <th style={{ padding: 10 }}>Zeitraum</th>
              <th style={{ padding: 10 }}>Status</th>
              <th style={{ padding: 10 }}>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: 10 }}>
                  <button
                    onClick={() => onOpenTask(t)}
                    style={{
                      border: "1px solid #e5e7eb",
                      background: "white",
                      borderRadius: 8,
                      padding: "6px 8px",
                      cursor: "pointer",
                      marginRight: 8
                    }}
                  >
                    Details
                  </button>
                  {t.title}
                </td>
                <td style={{ padding: 10 }}>{t.area}</td>
                <td style={{ padding: 10 }}>{t.due}</td>
                <td style={{ padding: 10 }}>{statusLabel(t.status)}</td>
                <td style={{ padding: 10 }}>
                  <select
                    value={t.status}
                    onChange={(e) => onSetStatus(t.id, e.target.value)}
                    style={{ padding: 6, border: "1px solid #e5e7eb", borderRadius: 8 }}
                  >
                    <option value="todo">To do</option>
                    <option value="doing">In Arbeit</option>
                    <option value="done">Erledigt</option>
                  </select>
                </td>
              </tr>
            ))}

            {tasks.length === 0 && (
              <tr>
                <td colSpan="5" style={{ padding: 10, opacity: 0.7 }}>
                  Keine Aufgaben gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusLabel(status) {
  if (status === "todo") return "To do";
  if (status === "doing") return "In Arbeit";
  if (status === "done") return "Erledigt";
  return status;
}

function Placeholder({ title, text }) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ opacity: 0.8 }}>{text}</div>
    </div>
  );
}

function CalendarPlaceholder({ tasks }) {
  const grouped = useMemo(() => {
    const map = {};
    for (const t of tasks) {
      map[t.due] = map[t.due] || [];
      map[t.due].push(t);
    }
    return map;
  }, [tasks]);

  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Kalender (vereinfachte Übersicht)</div>
      <div style={{ display: "grid", gap: 10 }}>
        {Object.keys(grouped).length === 0 ? (
          <div style={{ opacity: 0.7 }}>Keine Aufgaben</div>
        ) : (
          Object.entries(grouped).map(([bucket, list]) => (
            <div key={bucket} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{bucket}</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {list.map((t) => (
                  <li key={t.id}>
                    {t.title} ({t.area})
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TimelinePlaceholder({ tasks }) {
  const order = ["Heute", "Diese Woche", "Monat", "Jahr"];
  const sorted = [...tasks].sort((a, b) => order.indexOf(a.due) - order.indexOf(b.due));

  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Timeline (vereinfacht)</div>
      <div style={{ display: "grid", gap: 10 }}>
        {sorted.length === 0 ? (
          <div style={{ opacity: 0.7 }}>Keine Aufgaben</div>
        ) : (
          sorted.map((t) => (
            <div key={t.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 700 }}>{t.title}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                {t.due} • {t.area} • {statusLabel(t.status)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function GuidesView({
  areas,
  guides,
  newGuideTitle,
  setNewGuideTitle,
  newGuideText,
  setNewGuideText,
  newGuideAreaId,
  setNewGuideAreaId,
  fileRef,
  uploadingGuide,
  createGuide,
  getGuideFileUrl,
  dataError
}) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Anleitung erstellen</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 10, marginBottom: 10 }}>
          <input
            value={newGuideTitle}
            onChange={(e) => setNewGuideTitle(e.target.value)}
            placeholder="Titel"
            style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
          />

          <select
            value={newGuideAreaId}
            onChange={(e) => setNewGuideAreaId(e.target.value)}
            style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
          >
            {areas.length === 0 && <option value="">(keine Bereiche)</option>}
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <textarea
          value={newGuideText}
          onChange={(e) => setNewGuideText(e.target.value)}
          placeholder="Text / Anleitung…"
          rows={6}
          style={{ width: "100%", padding: 10, border: "1px solid #e5e7eb", borderRadius: 10, marginBottom: 10 }}
        />

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input ref={fileRef} type="file" />
          <button
            onClick={createGuide}
            disabled={uploadingGuide}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: uploadingGuide ? "#f3f4f6" : "white",
              cursor: uploadingGuide ? "not-allowed" : "pointer"
            }}
          >
            {uploadingGuide ? "Speichere…" : "Speichern"}
          </button>
        </div>

        {dataError ? <div style={{ marginTop: 10, color: "darkred", fontSize: 12 }}>{dataError}</div> : null}
      </div>

      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Anleitungen</div>

        {guides.length === 0 ? (
          <div style={{ opacity: 0.7 }}>Noch keine Anleitungen vorhanden.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {guides.map((g) => {
              const url = getGuideFileUrl(g.file_path);
              return (
                <div key={g.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 700 }}>{g.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                    {g.area} • {new Date(g.created_at).toLocaleString()}
                  </div>

                  {g.content ? <div style={{ whiteSpace: "pre-wrap", marginBottom: 8 }}>{g.content}</div> : null}

                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer">
                      Datei öffnen
                    </a>
                  ) : (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Keine Datei</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminView({ areas, tasks, newAreaName, setNewAreaName, addArea, savingArea }) {
  const perArea = useMemo(() => {
    const map = {};
    for (const a of areas) map[a.id] = 0;
    for (const t of tasks) if (t.area_id) map[t.area_id] = (map[t.area_id] || 0) + 1;
    return map;
  }, [areas, tasks]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Bereiche verwalten</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={newAreaName}
            onChange={(e) => setNewAreaName(e.target.value)}
            placeholder="Neuer Bereich"
            style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 10, minWidth: 260 }}
          />
          <button
            onClick={addArea}
            disabled={savingArea}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: savingArea ? "#f3f4f6" : "white",
              cursor: savingArea ? "not-allowed" : "pointer"
            }}
          >
            {savingArea ? "Speichere…" : "Anlegen"}
          </button>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {areas.map((a) => (
            <div key={a.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 700 }}>{a.name}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Aufgaben in diesem Bereich: {perArea[a.id] || 0}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TaskModal({
  task,
  onClose,
  onSetStatus,
  subtasks,
  subtasksLoading,
  subtasksError,
  newSubtaskTitle,
  setNewSubtaskTitle,
  addSubtask,
  savingSubtask,
  toggleSubtaskDone,
  deleteSubtask
}) {
  const progress = task.subtasksTotal > 0 ? Math.round((task.subtasksDone / task.subtasksTotal) * 100) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
        zIndex: 50
      }}
    >
      <div
        style={{
          width: "min(860px, 96vw)",
          background: "white",
          borderRadius: 14,
          border: "1px solid #e5e7eb",
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
          padding: 14
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{task.title}</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {task.area} • {task.due} • Status: {statusLabel(task.status)}
            </div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
              Unteraufgaben: {task.subtasksDone}/{task.subtasksTotal} ({progress}%)
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "white",
              cursor: "pointer"
            }}
          >
            Schließen
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button onClick={() => onSetStatus(task.id, "todo")} style={smallBtn(task.status === "todo")}>
            To do
          </button>
          <button onClick={() => onSetStatus(task.id, "doing")} style={smallBtn(task.status === "doing")}>
            In Arbeit
          </button>
          <button onClick={() => onSetStatus(task.id, "done")} style={smallBtn(task.status === "done")}>
            Erledigt
          </button>
        </div>

        <hr style={{ margin: "14px 0" }} />

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>Unteraufgaben</div>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              placeholder="Neue Unteraufgabe"
              style={{ flex: 1, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
            />
            <button
              onClick={addSubtask}
              disabled={savingSubtask}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: savingSubtask ? "#f3f4f6" : "white",
                cursor: savingSubtask ? "not-allowed" : "pointer"
              }}
            >
              {savingSubtask ? "Speichere…" : "Hinzufügen"}
            </button>
          </div>

          {subtasksError ? <div style={{ color: "darkred", fontSize: 12 }}>{subtasksError}</div> : null}

          {subtasksLoading ? (
            <div style={{ fontSize: 12, opacity: 0.7 }}>Lade Unteraufgaben…</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {subtasks.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.7 }}>Keine Unteraufgaben vorhanden.</div>
              ) : (
                subtasks.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      border: "1px solid #e5e7eb",
                      borderRadius: 12,
                      padding: 10,
                      background: "#fafafa"
                    }}
                  >
                    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={!!s.is_done}
                        onChange={(e) => toggleSubtaskDone(s.id, e.target.checked)}
                      />
                      <span style={{ textDecoration: s.is_done ? "line-through" : "none", opacity: s.is_done ? 0.7 : 1 }}>
                        {s.title}
                      </span>
                    </label>

                    <button
                      onClick={() => deleteSubtask(s.id)}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: "white",
                        cursor: "pointer",
                        fontSize: 12
                      }}
                    >
                      Löschen
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
