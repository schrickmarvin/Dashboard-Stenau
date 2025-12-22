// pages/dashboard.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
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

const STATUS = [
  { id: "todo", label: "Zu erledigen" },
  { id: "doing", label: "In Arbeit" },
  { id: "done", label: "Erledigt" }
];

const PERIODS = ["Heute", "Diese Woche", "Monat", "Jahr"];

export default function Dashboard() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [activeTab, setActiveTab] = useState("board");

  const [areas, setAreas] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [filterArea, setFilterArea] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [search, setSearch] = useState("");

  // Form: neue Aufgabe
  const [newTitle, setNewTitle] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [newPeriod, setNewPeriod] = useState("Heute");
  const [newStatus, setNewStatus] = useState("todo");
  const [savingTask, setSavingTask] = useState(false);

  // Bereiche UI
  const [newAreaName, setNewAreaName] = useState("");
  const [savingArea, setSavingArea] = useState(false);
  const [editingAreaId, setEditingAreaId] = useState(null);
  const [editingAreaName, setEditingAreaName] = useState("");

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      const u = data.user ?? null;
      setUser(u);
      setLoadingAuth(false);
      if (!u) router.replace("/");
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (!u) router.replace("/");
    });

    return () => {
      mounted = false;
      try {
        authListener?.subscription?.unsubscribe?.();
      } catch {}
    };
  }, [router]);

  useEffect(() => {
    if (!user) return;
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function reloadAll() {
    setLoadingData(true);

    const { data: areasData, error: areasErr } = await supabase
      .from("areas")
      .select("id,name,created_at")
      .order("name", { ascending: true });

    if (areasErr) {
      console.error(areasErr);
      alert("Fehler beim Laden der Bereiche: " + areasErr.message);
      setLoadingData(false);
      return;
    }

    setAreas(areasData ?? []);

    const { data: tasksData, error: tasksErr } = await supabase
      .from("tasks")
      .select("id,title,area_id,period,status,created_at")
      .order("created_at", { ascending: false });

    if (tasksErr) {
      console.error(tasksErr);
      alert(
        "Fehler beim Laden der Aufgaben: " +
          tasksErr.message +
          "\n\nHinweis: Dieses Dashboard erwartet in 'tasks' die Spalten: title, area_id, period, status."
      );
      setLoadingData(false);
      return;
    }

    setTasks(tasksData ?? []);

    if ((areasData ?? []).length > 0 && !newAreaId) setNewAreaId(areasData[0].id);

    setLoadingData(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  async function createTask() {
    if (!newTitle.trim()) {
      alert("Bitte Titel eingeben");
      return;
    }
    if (!newAreaId) {
      alert("Bitte einen Bereich auswählen");
      return;
    }

    setSavingTask(true);
    const payload = {
      title: newTitle.trim(),
      area_id: newAreaId,
      period: newPeriod,
      status: newStatus
    };

    const { error } = await supabase.from("tasks").insert(payload);
    setSavingTask(false);

    if (error) {
      alert("Konnte Aufgabe nicht anlegen: " + error.message);
      return;
    }

    setNewTitle("");
    await reloadAll();
  }

  async function updateTaskStatus(taskId, status) {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
    if (error) {
      alert("Konnte Status nicht ändern: " + error.message);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
  }

  async function deleteTask(taskId) {
    if (!confirm("Aufgabe wirklich löschen?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) {
      alert("Konnte Aufgabe nicht löschen: " + error.message);
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  // ==========================
  // BEREICHE CRUD
  // ==========================
  async function createArea() {
    const name = newAreaName.trim();
    if (!name) {
      alert("Bitte Bereichsname eingeben");
      return;
    }
    setSavingArea(true);
    const { error } = await supabase.from("areas").insert({ name });
    setSavingArea(false);

    if (error) {
      alert("Bereich konnte nicht angelegt werden: " + error.message);
      return;
    }

    setNewAreaName("");
    await reloadAll();
  }

  function startEditArea(area) {
    setEditingAreaId(area.id);
    setEditingAreaName(area.name ?? "");
  }

  function cancelEditArea() {
    setEditingAreaId(null);
    setEditingAreaName("");
  }

  async function saveEditArea() {
    const name = editingAreaName.trim();
    if (!editingAreaId) return;
    if (!name) {
      alert("Name darf nicht leer sein");
      return;
    }

    setSavingArea(true);
    const { error } = await supabase.from("areas").update({ name }).eq("id", editingAreaId);
    setSavingArea(false);

    if (error) {
      alert("Bereich konnte nicht gespeichert werden: " + error.message);
      return;
    }

    cancelEditArea();
    await reloadAll();
  }

  async function deleteArea(area) {
    const ok = confirm(
      `Bereich wirklich löschen?\n\n"${area.name}"\n\nAchtung: Aufgaben in diesem Bereich müssen vorher gelöscht oder umgezogen werden.`
    );
    if (!ok) return;

    setSavingArea(true);
    const { error } = await supabase.from("areas").delete().eq("id", area.id);
    setSavingArea(false);

    if (error) {
      alert("Bereich konnte nicht gelöscht werden: " + error.message);
      return;
    }

    await reloadAll();
  }

  const areaNameById = useMemo(() => {
    const m = new Map();
    for (const a of areas) m.set(a.id, a.name);
    return m;
  }, [areas]);

  const filteredTasks = useMemo(() => {
    const s = search.trim().toLowerCase();

    return tasks.filter((t) => {
      if (filterArea !== "all" && t.area_id !== filterArea) return false;
      if (filterPeriod !== "all" && t.period !== filterPeriod) return false;
      if (s) {
        const areaName = (areaNameById.get(t.area_id) ?? "").toLowerCase();
        const title = (t.title ?? "").toLowerCase();
        if (!title.includes(s) && !areaName.includes(s)) return false;
      }
      return true;
    });
  }, [tasks, filterArea, filterPeriod, search, areaNameById]);

  const counts = useMemo(() => {
    const today = filteredTasks.filter((t) => t.period === "Heute" && t.status !== "done").length;
    const week = filteredTasks.filter((t) => t.period === "Diese Woche" && t.status !== "done").length;
    const open = filteredTasks.filter((t) => t.status !== "done").length;
    return { today, week, open };
  }, [filteredTasks]);

  if (loadingAuth) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Armaturenbrett</h1>
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
          <div style={{ fontSize: 18, fontWeight: 600 }}>Armaturenbrett</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Angemeldet als: {user.email}</div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={reloadAll}
            style={{ padding: "10px 12px", cursor: "pointer" }}
            disabled={loadingData}
          >
            Neu laden
          </button>
          <button onClick={signOut} style={{ padding: "10px 12px", cursor: "pointer" }}>
            Abmelden
          </button>
        </div>
      </div>

      <div style={{ display: "flex" }}>
        {/* Sidebar */}
        <div
          style={{
            width: 260,
            padding: 14,
            borderRight: "1px solid #e5e7eb",
            background: "white"
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
            {TABS.map((t) => (
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

          {activeTab !== "areas" && (
            <>
              <div style={{ marginTop: 18, fontSize: 12, opacity: 0.7 }}>Filter</div>

              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                <select
                  value={filterArea}
                  onChange={(e) => setFilterArea(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                >
                  <option value="all">Alle Bereiche</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>

                <select
                  value={filterPeriod}
                  onChange={(e) => setFilterPeriod(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                >
                  <option value="all">Alle Zeiträume</option>
                  {PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                <input
                  placeholder="Suche…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                />
              </div>
            </>
          )}
        </div>

        {/* Main */}
        <div style={{ flex: 1, padding: 18 }}>
          {/* Tabs oben */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {TABS.map((t) => (
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

          {loadingData ? (
            <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
              Lade Daten…
            </div>
          ) : (
            <>
              {(activeTab === "board" || activeTab === "list") && (
                <TaskCreator
                  areas={areas}
                  title={newTitle}
                  setTitle={setNewTitle}
                  areaId={newAreaId}
                  setAreaId={setNewAreaId}
                  period={newPeriod}
                  setPeriod={setNewPeriod}
                  status={newStatus}
                  setStatus={setNewStatus}
                  saving={savingTask}
                  onCreate={createTask}
                />
              )}

              {activeTab === "board" && (
                <BoardView
                  tasks={filteredTasks}
                  areaNameById={areaNameById}
                  onSetStatus={updateTaskStatus}
                  onDelete={deleteTask}
                />
              )}
              {activeTab === "list" && (
                <ListView
                  tasks={filteredTasks}
                  areaNameById={areaNameById}
                  onSetStatus={updateTaskStatus}
                  onDelete={deleteTask}
                />
              )}
              {activeTab === "calendar" && <Placeholder title="Kalender" text="Kommt als nächstes." />}
              {activeTab === "timeline" && <Placeholder title="Zeitleiste" text="Kommt als nächstes." />}
              {activeTab === "guides" && <Placeholder title="Anleitungen" text="Kommt als nächstes." />}

              {activeTab === "areas" && (
                <AreasView
                  areas={areas}
                  newAreaName={newAreaName}
                  setNewAreaName={setNewAreaName}
                  savingArea={savingArea}
                  onCreateArea={createArea}
                  editingAreaId={editingAreaId}
                  editingAreaName={editingAreaName}
                  setEditingAreaName={setEditingAreaName}
                  onStartEdit={startEditArea}
                  onCancelEdit={cancelEditArea}
                  onSaveEdit={saveEditArea}
                  onDeleteArea={deleteArea}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskCreator({
  areas,
  title,
  setTitle,
  areaId,
  setAreaId,
  period,
  setPeriod,
  status,
  setStatus,
  saving,
  onCreate
}) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 12,
        marginBottom: 12
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Aufgabe anlegen</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 220px 160px 180px 120px", gap: 10 }}>
        <input
          placeholder="Titel"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
        />

        <select
          value={areaId}
          onChange={(e) => setAreaId(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
        >
          {areas.length === 0 && <option value="">(keine Bereiche)</option>}
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
        >
          {PERIODS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
        >
          {STATUS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <button
          onClick={onCreate}
          disabled={saving || areas.length === 0}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", cursor: "pointer" }}
        >
          {saving ? "…" : "Anlegen"}
        </button>
      </div>

      {areas.length === 0 && (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
          Hinweis: Du hast noch keine Bereiche. Lege zuerst mindestens einen Bereich an (Tab "Bereiche").
        </div>
      )}
    </div>
  );
}

function AreasView({
  areas,
  newAreaName,
  setNewAreaName,
  savingArea,
  onCreateArea,
  editingAreaId,
  editingAreaName,
  setEditingAreaName,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDeleteArea
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Bereich anlegen</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            placeholder="z. B. Disposition"
            value={newAreaName}
            onChange={(e) => setNewAreaName(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", flex: 1 }}
          />
          <button
            onClick={onCreateArea}
            disabled={savingArea}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", cursor: "pointer" }}
          >
            {savingArea ? "…" : "Anlegen"}
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
          Hinweis: Anlegen/Ändern/Löschen klappt nur, wenn dein User in profiles die Rolle "admin" hat.
        </div>
      </div>

      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Bereiche</div>

        <div style={{ display: "grid", gap: 8 }}>
          {areas.map((a) => (
            <div
              key={a.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 10,
                background: "#fafafa"
              }}
            >
              <div style={{ width: 280, fontSize: 12, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis" }}>
                {a.id}
              </div>

              {editingAreaId === a.id ? (
                <>
                  <input
                    value={editingAreaName}
                    onChange={(e) => setEditingAreaName(e.target.value)}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", flex: 1 }}
                  />
                  <button
                    onClick={onSaveEdit}
                    disabled={savingArea}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", cursor: "pointer" }}
                  >
                    Speichern
                  </button>
                  <button
                    onClick={onCancelEdit}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", cursor: "pointer" }}
                  >
                    Abbrechen
                  </button>
                </>
              ) : (
                <>
                  <div style={{ flex: 1, fontWeight: 700 }}>{a.name}</div>
                  <button
                    onClick={() => onStartEdit(a)}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", cursor: "pointer" }}
                  >
                    Umbenennen
                  </button>
                  <button
                    onClick={() => onDeleteArea(a)}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", cursor: "pointer" }}
                  >
                    Löschen
                  </button>
                </>
              )}
            </div>
          ))}

          {areas.length === 0 && <div style={{ fontSize: 12, opacity: 0.7 }}>Noch keine Bereiche vorhanden.</div>}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function BoardView({ tasks, areaNameById, onSetStatus, onDelete }) {
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
            <div style={{ fontWeight: 700 }}>{col.title}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{tasks.filter((t) => t.status === col.id).length}</div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {tasks
              .filter((t) => t.status === col.id)
              .map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  areaName={areaNameById.get(t.area_id) ?? "—"}
                  onSetStatus={onSetStatus}
                  onDelete={onDelete}
                />
              ))}
            {tasks.filter((t) => t.status === col.id).length === 0 && (
              <div style={{ fontSize: 12, opacity: 0.7 }}>Keine Aufgaben</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskCard({ task, areaName, onSetStatus, onDelete }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{task.title}</div>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>
        {areaName} • {task.period}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          value={task.status}
          onChange={(e) => onSetStatus(task.id, e.target.value)}
          style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}
        >
          <option value="todo">Zu erledigen</option>
          <option value="doing">In Arbeit</option>
          <option value="done">Erledigt</option>
        </select>

        <button
          onClick={() => onDelete(task.id)}
          style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb", cursor: "pointer" }}
        >
          Löschen
        </button>
      </div>
    </div>
  );
}

function ListView({ tasks, areaNameById, onSetStatus, onDelete }) {
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
              <th style={{ padding: 10 }}></th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: 10 }}>{t.title}</td>
                <td style={{ padding: 10 }}>{areaNameById.get(t.area_id) ?? "—"}</td>
                <td style={{ padding: 10 }}>{t.period}</td>
                <td style={{ padding: 10 }}>
                  <select
                    value={t.status}
                    onChange={(e) => onSetStatus(t.id, e.target.value)}
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}
                  >
                    <option value="todo">Zu erledigen</option>
                    <option value="doing">In Arbeit</option>
                    <option value="done">Erledigt</option>
                  </select>
                </td>
                <td style={{ padding: 10 }}>
                  <button
                    onClick={() => onDelete(t.id)}
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb", cursor: "pointer" }}
                  >
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 10, opacity: 0.7 }}>
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

function Placeholder({ title, text }) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ opacity: 0.8 }}>{text}</div>
    </div>
  );
}
