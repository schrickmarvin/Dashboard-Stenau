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
  { id: "guides", label: "Anleitungen" }
];

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null); // { user_id, role, display_name }
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("board");

  // Daten
  const [areas, setAreas] = useState([]); // {id,name}
  const [tasks, setTasks] = useState([]); // tasks aus DB
  const [users, setUsers] = useState([]); // profiles-Liste (nur admin)
  const [profileAreas, setProfileAreas] = useState([]); // {user_id, area_id}

  // UI: Task anlegen
  const [newTitle, setNewTitle] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [newPeriod, setNewPeriod] = useState("Heute");
  const [newStatus, setNewStatus] = useState("todo");

  // UI: Bereich anlegen (Admin)
  const [newAreaName, setNewAreaName] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    );

    return () => authListener.subscription.unsubscribe();
  }, []);

  // Wenn User da: Profil + Daten laden
  useEffect(() => {
    if (!user) return;
    (async () => {
      await loadAll();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function loadAll() {
    setLoading(true);

    // 1) eigenes Profil laden
    const { data: pData, error: pErr } = await supabase
      .from("profiles")
      .select("user_id, role, display_name")
      .eq("user_id", user.id)
      .single();

    if (pErr) {
      alert("Fehler Profil laden: " + pErr.message);
      setLoading(false);
      return;
    }
    setProfile(pData);

    // 2) Bereiche laden (RLS filtert automatisch)
    const { data: aData, error: aErr } = await supabase
      .from("areas")
      .select("id, name")
      .order("name", { ascending: true });

    if (aErr) {
      alert("Fehler Bereiche laden: " + aErr.message);
      setLoading(false);
      return;
    }
    setAreas(aData ?? []);

    // default area fürs Anlegen
    if (!newAreaId && (aData ?? []).length) setNewAreaId(aData[0].id);

    // 3) Aufgaben laden (RLS filtert automatisch)
    const { data: tData, error: tErr } = await supabase
      .from("tasks")
      .select("id, title, area_id, period, status, created_at")
      .order("created_at", { ascending: false });

    if (tErr) {
      alert(
        "Fehler beim Laden der Aufgaben: " +
          tErr.message +
          "\n\nHinweis: Dieses Dashboard erwartet in 'tasks' die Spalten: title, area_id, period, status."
      );
      setLoading(false);
      return;
    }
    setTasks(tData ?? []);

    // 4) Admin-Daten (nur wenn admin)
    if (pData.role === "admin") {
      const { data: uData, error: uErr } = await supabase
        .from("profiles")
        .select("user_id, role, display_name, created_at")
        .order("created_at", { ascending: true });

      if (uErr) {
        alert("Admin: Fehler Benutzer laden: " + uErr.message);
        setLoading(false);
        return;
      }
      setUsers(uData ?? []);

      const { data: paData, error: paErr } = await supabase
        .from("profile_areas")
        .select("user_id, area_id");

      if (paErr) {
        alert("Admin: Fehler Zuweisungen laden: " + paErr.message);
        setLoading(false);
        return;
      }
      setProfileAreas(paData ?? []);
    } else {
      setUsers([]);
      setProfileAreas([]);
    }

    setLoading(false);
  }

  const isAdmin = profile?.role === "admin";

  const tabs = useMemo(() => {
    const base = [...TABS];
    if (isAdmin) base.push({ id: "admin", label: "Verwaltung" });
    return base;
  }, [isAdmin]);

  const counts = useMemo(() => {
    const today = tasks.filter((t) => t.period === "Heute" && t.status !== "done").length;
    const week = tasks.filter((t) => t.period === "Diese Woche" && t.status !== "done").length;
    const open = tasks.filter((t) => t.status !== "done").length;
    return { today, week, open };
  }, [tasks]);

  const tasksByStatus = useMemo(() => {
    return {
      todo: tasks.filter((t) => t.status === "todo"),
      doing: tasks.filter((t) => t.status === "doing"),
      done: tasks.filter((t) => t.status === "done")
    };
  }, [tasks]);

  async function createTask() {
    if (!newTitle.trim()) {
      alert("Bitte Titel eingeben");
      return;
    }
    if (!newAreaId) {
      alert("Bitte Bereich wählen");
      return;
    }

    const payload = {
      title: newTitle.trim(),
      area_id: newAreaId,
      period: newPeriod,
      status: newStatus
      // created_by wird per Trigger gesetzt
    };

    const { error } = await supabase.from("tasks").insert(payload);
    if (error) {
      alert("Fehler Aufgabe anlegen: " + error.message);
      return;
    }

    setNewTitle("");
    await loadAll();
  }

  async function updateTaskStatus(taskId, status) {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
    if (error) {
      alert("Fehler Status ändern: " + error.message);
      return;
    }
    await loadAll();
  }

  async function createArea() {
    if (!newAreaName.trim()) return alert("Bitte Bereichsname eingeben");
    const { error } = await supabase.from("areas").insert({ name: newAreaName.trim() });
    if (error) return alert("Fehler Bereich anlegen: " + error.message);
    setNewAreaName("");
    await loadAll();
  }

  async function setUserRole(userId, role) {
    const { error } = await supabase.from("profiles").update({ role }).eq("user_id", userId);
    if (error) return alert("Fehler Rolle setzen: " + error.message);
    await loadAll();
  }

  function userHasArea(userId, areaId) {
    return profileAreas.some((x) => x.user_id === userId && x.area_id === areaId);
  }

  async function toggleUserArea(userId, areaId) {
    const has = userHasArea(userId, areaId);

    if (has) {
      const { error } = await supabase
        .from("profile_areas")
        .delete()
        .eq("user_id", userId)
        .eq("area_id", areaId);

      if (error) return alert("Fehler Zuweisung entfernen: " + error.message);
    } else {
      const { error } = await supabase.from("profile_areas").insert({ user_id: userId, area_id: areaId });
      if (error) return alert("Fehler Zuweisung hinzufügen: " + error.message);
    }

    await loadAll();
  }

  if (loading) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Armaturenbrett</h1>
        <p>Lade…</p>
      </div>
    );
  }

  // Nicht eingeloggt → zurück zur Login-Seite
  if (!user) {
    if (typeof window !== "undefined") window.location.href = "/";
    return null;
  }

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
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Angemeldet als: {user.email}
            {profile?.role ? ` • Rolle: ${profile.role}` : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={loadAll}
            style={{ padding: "10px 12px", cursor: "pointer", border: "1px solid #e5e7eb", background: "white" }}
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
            {tabs.map((t) => (
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
        </div>

        {/* Main */}
        <div style={{ flex: 1, padding: 18 }}>
          {/* Tabs oben */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {tabs.map((t) => (
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

          {/* Board */}
          {activeTab === "board" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Aufgabe anlegen</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 200px 160px 160px 140px", gap: 10 }}>
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
                    <option value="">(keine Bereiche)</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={newPeriod}
                    onChange={(e) => setNewPeriod(e.target.value)}
                    style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
                  >
                    <option>Heute</option>
                    <option>Diese Woche</option>
                    <option>Monat</option>
                    <option>Jahr</option>
                  </select>

                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
                  >
                    <option value="todo">Zu erledigen</option>
                    <option value="doing">In Arbeit</option>
                    <option value="done">Erledigt</option>
                  </select>

                  <button
                    onClick={createTask}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", background: "white", cursor: "pointer" }}
                  >
                    Anlegen
                  </button>
                </div>
              </div>

              <BoardView tasksByStatus={tasksByStatus} areas={areas} onMove={updateTaskStatus} />
            </div>
          )}

          {/* Liste */}
          {activeTab === "list" && <ListView tasks={tasks} areas={areas} onMove={updateTaskStatus} />}

          {/* Kalender / Timeline / Anleitungen placeholder */}
          {activeTab === "calendar" && (
            <Placeholder title="Kalender" text="Hier kommt die Wochen-/Monatsansicht rein." />
          )}
          {activeTab === "timeline" && (
            <Placeholder title="Zeitleiste" text="Hier kommt die Zeitachse für Monat/Jahr-Aufgaben rein." />
          )}
          {activeTab === "guides" && (
            <Placeholder title="Anleitungen" text="Hier kommt der Anleitungsbereich mit Upload rein." />
          )}

          {/* ADMIN */}
          {activeTab === "admin" && isAdmin && (
            <AdminView
              areas={areas}
              users={users}
              profileAreas={profileAreas}
              newAreaName={newAreaName}
              setNewAreaName={setNewAreaName}
              createArea={createArea}
              setUserRole={setUserRole}
              toggleUserArea={toggleUserArea}
              userHasArea={userHasArea}
            />
          )}

          {activeTab === "admin" && !isAdmin && (
            <Placeholder title="Verwaltung" text="Kein Zugriff (nur Admin)." />
          )}
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

function BoardView({ tasksByStatus, areas, onMove }) {
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
            <div style={{ fontSize: 12, opacity: 0.7 }}>{tasksByStatus[col.id]?.length ?? 0}</div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {(tasksByStatus[col.id] ?? []).map((t) => (
              <TaskCard key={t.id} task={t} areas={areas} onMove={onMove} />
            ))}
            {(tasksByStatus[col.id] ?? []).length === 0 && (
              <div style={{ fontSize: 12, opacity: 0.6 }}>Keine Aufgaben</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskCard({ task, areas, onMove }) {
  const areaName = areas.find((a) => a.id === task.area_id)?.name ?? "(kein Bereich)";
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{task.title}</div>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
        {areaName} • {task.period}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {task.status !== "todo" && (
          <button onClick={() => onMove(task.id, "todo")} style={miniBtn()}>
            Zu erledigen
          </button>
        )}
        {task.status !== "doing" && (
          <button onClick={() => onMove(task.id, "doing")} style={miniBtn()}>
            In Arbeit
          </button>
        )}
        {task.status !== "done" && (
          <button onClick={() => onMove(task.id, "done")} style={miniBtn()}>
            Erledigt
          </button>
        )}
      </div>
    </div>
  );
}

function miniBtn() {
  return {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "white",
    cursor: "pointer",
    fontSize: 12
  };
}

function ListView({ tasks, areas, onMove }) {
  function statusLabel(status) {
    if (status === "todo") return "Zu erledigen";
    if (status === "doing") return "In Arbeit";
    if (status === "done") return "Erledigt";
    return status;
  }

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
                <td style={{ padding: 10 }}>{t.title}</td>
                <td style={{ padding: 10 }}>{areas.find((a) => a.id === t.area_id)?.name ?? "(kein Bereich)"}</td>
                <td style={{ padding: 10 }}>{t.period}</td>
                <td style={{ padding: 10 }}>{statusLabel(t.status)}</td>
                <td style={{ padding: 10 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {t.status !== "todo" && (
                      <button onClick={() => onMove(t.id, "todo")} style={miniBtn()}>
                        Zu erledigen
                      </button>
                    )}
                    {t.status !== "doing" && (
                      <button onClick={() => onMove(t.id, "doing")} style={miniBtn()}>
                        In Arbeit
                      </button>
                    )}
                    {t.status !== "done" && (
                      <button onClick={() => onMove(t.id, "done")} style={miniBtn()}>
                        Erledigt
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 12, opacity: 0.7 }}>
                  Keine Aufgaben vorhanden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminView({
  areas,
  users,
  profileAreas,
  newAreaName,
  setNewAreaName,
  createArea,
  setUserRole,
  toggleUserArea,
  userHasArea
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Bereiche</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={newAreaName}
            onChange={(e) => setNewAreaName(e.target.value)}
            placeholder="Neuer Bereich (z.B. Disposition)"
            style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 10, minWidth: 280 }}
          />
          <button
            onClick={createArea}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", background: "white", cursor: "pointer" }}
          >
            Bereich anlegen
          </button>
        </div>

        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
          Hinweis: Bereiche können aktuell nur Admins anlegen (Sicherheit). Wenn du willst, öffnen wir das später für Mitarbeiter.
        </div>
      </div>

      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Benutzer & Zuweisungen</div>

        <div style={{ width: "100%", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: 10 }}>Name</th>
                <th style={{ padding: 10 }}>User-ID</th>
                <th style={{ padding: 10 }}>Rolle</th>
                <th style={{ padding: 10 }}>Bereiche</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} style={{ borderBottom: "1px solid #f1f5f9", verticalAlign: "top" }}>
                  <td style={{ padding: 10 }}>{u.display_name || "(ohne Name)"}</td>
                  <td style={{ padding: 10, fontFamily: "monospace", fontSize: 12 }}>{u.user_id}</td>
                  <td style={{ padding: 10 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        onClick={() => setUserRole(u.user_id, "user")}
                        style={{
                          ...miniBtn(),
                          background: u.role === "user" ? "#eef2ff" : "white"
                        }}
                      >
                        user
                      </button>
                      <button
                        onClick={() => setUserRole(u.user_id, "admin")}
                        style={{
                          ...miniBtn(),
                          background: u.role === "admin" ? "#eef2ff" : "white"
                        }}
                      >
                        admin
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: 10 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {areas.map((a) => {
                        const active = userHasArea(u.user_id, a.id);
                        return (
                          <button
                            key={a.id}
                            onClick={() => toggleUserArea(u.user_id, a.id)}
                            style={{
                              ...miniBtn(),
                              background: active ? "#eef2ff" : "white"
                            }}
                          >
                            {a.name}
                          </button>
                        );
                      })}
                      {areas.length === 0 && <span style={{ fontSize: 12, opacity: 0.7 }}>(noch keine Bereiche)</span>}
                    </div>

                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                      Zugewiesen:{" "}
                      {profileAreas
                        .filter((x) => x.user_id === u.user_id)
                        .map((x) => areas.find((a) => a.id === x.area_id)?.name)
                        .filter(Boolean)
                        .join(", ") || "(keine)"}
                    </div>
                  </td>
                </tr>
              ))}

              {users.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 12, opacity: 0.7 }}>
                    Keine Benutzer gefunden. (Hinweis: Ein Benutzer taucht erst auf, wenn er sich einmal registriert/eingeloggt hat.)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
          Einladen per E-Mail machen wir später sauber über eine kleine Server-API (Service Role), sonst wäre es unsicher im Browser.
        </div>
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
