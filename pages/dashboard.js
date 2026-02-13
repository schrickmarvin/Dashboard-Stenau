// pages/dashboard.js
import { useEffect, useMemo, useCallback, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/**
 * Stenau Dashboard – Single-file implementation (Next.js pages router)
 * Features:
 * - Login (Supabase Auth)
 * - Tasks: create, list, status toggle
 * - Subtasks (supports is_done/done/status fallback)
 * - Guides: list + open (content)
 * - Areas: list (for filter + create form)
 * - Kanboard: Status view + People view (overview who has which tasks)
 * - Calendar (month list) - tolerant (no hard dependency on tasks.description)
 * - User settings panel (colors/background) – optional table, tolerant
 *
 * IMPORTANT:
 * This file is designed to compile even if some DB columns/tables differ.
 * It uses defensive selects and fallbacks.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const styles = {
  page: { minHeight: "100vh", padding: 20, background: "#f3f6fb" },
  shell: { maxWidth: 1250, margin: "0 auto" },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    background: "white",
    border: "1px solid #e5e7eb",
  },
  h1: { margin: 0, fontSize: 20 },
  tabs: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 },
  tab: {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "white",
    cursor: "pointer",
    fontSize: 14,
  },
  tabActive: { background: "#0b6b2a", color: "white", borderColor: "#0b6b2a" },
  panel: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    background: "white",
    border: "1px solid #e5e7eb",
  },
  row: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  input: {
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    fontSize: 14,
    outline: "none",
    minWidth: 210,
  },
  select: {
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    fontSize: 14,
    outline: "none",
    minWidth: 210,
    background: "white",
  },
  btn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "white",
    cursor: "pointer",
    fontSize: 14,
  },
  btnPrimary: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #0b6b2a",
    background: "#0b6b2a",
    color: "white",
    cursor: "pointer",
    fontSize: 14,
  },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
  card: {
    padding: 12,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "white",
  },
  cardClickable: {
    padding: 12,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "white",
    cursor: "pointer",
  },
  small: { color: "#6b7280", fontSize: 13 },
  error: {
    padding: 10,
    borderRadius: 10,
    background: "#ffe6e6",
    border: "1px solid #ffb3b3",
    color: "#8a1f1f",
    marginTop: 10,
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    fontSize: 12,
    color: "#374151",
    background: "#fafafa",
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.35)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    zIndex: 50,
  },
  modal: {
    width: "min(900px, 100%)",
    maxHeight: "85vh",
    overflow: "auto",
    background: "white",
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    padding: 14,
  },
  modalHeader: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" },
  split: { display: "grid", gridTemplateColumns: "1.3fr .7fr", gap: 12 },
  col: { display: "grid", gap: 10 },
};

function fmtShort(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("de-DE");
}

function fmtDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function isSubDone(sub) {
  if (!sub) return false;
  if (typeof sub.is_done === "boolean") return sub.is_done;
  if (typeof sub.done === "boolean") return sub.done;
  if (typeof sub.completed === "boolean") return sub.completed;
  if (typeof sub.status === "string") return sub.status === "done";
  return false;
}

async function safeSelect(table, selectStr = "*", opts = {}) {
  // opts: { orderBy, ascending }
  try {
    let q = supabase.from(table).select(selectStr);
    if (opts.orderBy) q = q.order(opts.orderBy, { ascending: opts.ascending ?? true });
    const { data, error } = await q;
    if (error) return { data: null, error };
    return { data: data || null, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

async function safeUpdate(table, values, match) {
  try {
    const { error } = await supabase.from(table).update(values).match(match);
    return { error: error || null };
  } catch (e) {
    return { error: e };
  }
}

async function safeInsert(table, values) {
  try {
    const { data, error } = await supabase.from(table).insert(values).select("*");
    if (error) return { data: null, error };
    return { data: data || null, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

async function loadProfiles() {
  // Try common profile tables, return best effort
  const candidates = ["profiles", "users_profile", "user_profiles", "users"];
  for (const t of candidates) {
    const r = await safeSelect(t, "*", { orderBy: "name", ascending: true });
    if (!r.error && Array.isArray(r.data)) return { table: t, rows: r.data };
  }
  return { table: null, rows: [] };
}

function displayUser(u) {
  if (!u) return "—";
  return u.name || u.full_name || u.display_name || u.email || u.username || u.id;
}

function buildUserMap(rows) {
  const map = new Map();
  for (const u of rows || []) map.set(u.id, displayUser(u));
  return map;
}

export default function DashboardPage() {
  const [session, setSession] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authErr, setAuthErr] = useState("");

  const [tab, setTab] = useState("plan"); // plan | kanboard | calendar | guides | users | settings
  const [me, setMe] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [areas, setAreas] = useState([]);
  const [guides, setGuides] = useState([]);
  const [members, setMembers] = useState([]);
  const [membersTable, setMembersTable] = useState(null);

  const [tasks, setTasks] = useState([]);
  const [subtasks, setSubtasks] = useState([]); // flat list

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const userMap = useMemo(() => buildUserMap(members), [members]);
  const areaMap = useMemo(() => {
    const m = new Map();
    for (const a of areas) m.set(a.id, a);
    return m;
  }, [areas]);

  // Auth bootstrap
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshMeta = useCallback(async () => {
    setErr("");
    const [areasR, guidesR, profR] = await Promise.all([
      safeSelect("areas", "*", { orderBy: "name", ascending: true }),
      safeSelect("guides", "*", { orderBy: "title", ascending: true }),
      loadProfiles(),
    ]);

    setAreas(Array.isArray(areasR.data) ? areasR.data : []);
    setGuides(Array.isArray(guidesR.data) ? guidesR.data : []);
    setMembers(profR.rows || []);
    setMembersTable(profR.table);

    // me + admin flag best effort
    const uid = session?.user?.id || null;
    if (!uid) return;
    const mine = (profR.rows || []).find((r) => r.id === uid) || { id: uid, email: session.user.email };
    setMe(mine);

    // role / is_admin best effort
    const admin =
      mine?.is_admin === true ||
      mine?.role === "admin" ||
      mine?.roles?.includes?.("admin") === true ||
      (Array.isArray(mine?.roles) && mine.roles.includes("admin"));
    setIsAdmin(Boolean(admin));
  }, [session?.user?.id]);

  const refreshTasks = useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      // tasks (tolerant)
      const tasksR = await safeSelect("tasks", "*", { orderBy: "due_at", ascending: true });
      if (tasksR.error) throw tasksR.error;

      // subtasks: try with a couple of common columns
      let subsR = await safeSelect("subtasks", "*", { orderBy: "created_at", ascending: true });
      // if table missing, keep empty (no throw)
      if (subsR.error) subsR = { data: [] };

      setTasks(Array.isArray(tasksR.data) ? tasksR.data : []);
      setSubtasks(Array.isArray(subsR.data) ? subsR.data : []);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    refreshMeta();
    refreshTasks();
  }, [session, refreshMeta, refreshTasks]);

  const signIn = useCallback(async () => {
    setAuthErr("");
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPass });
    if (error) setAuthErr(error.message);
  }, [authEmail, authPass]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // Derived helpers
  const tasksWithSubs = useMemo(() => {
    const byTask = new Map();
    for (const s of subtasks) {
      const tid = s.task_id || s.parent_task_id || s.taskId;
      if (!tid) continue;
      if (!byTask.has(tid)) byTask.set(tid, []);
      byTask.get(tid).push(s);
    }
    return (tasks || []).map((t) => ({
      ...t,
      __subtasks: byTask.get(t.id) || [],
    }));
  }, [tasks, subtasks]);

  if (!session) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <div style={{ ...styles.panel, maxWidth: 520, margin: "80px auto" }}>
            <div style={{ fontSize: 18, marginBottom: 8 }}>Login</div>
            <div style={styles.small}>Bitte mit deinem Dashboard-Account anmelden.</div>
            {authErr ? <div style={styles.error}>Fehler: {authErr}</div> : null}
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <input style={styles.input} placeholder="E-Mail" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
              <input
                style={styles.input}
                placeholder="Passwort"
                value={authPass}
                type="password"
                onChange={(e) => setAuthPass(e.target.value)}
              />
              <button style={styles.btnPrimary} onClick={signIn}>
                Anmelden
              </button>
            </div>
            <div style={{ marginTop: 10, ...styles.small }}>
              Hinweis: Wenn „Failed to fetch“ kommt, prüfe die Vercel ENV: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.topbar}>
          <div>
            <div style={styles.h1}>Stenau Dashboard</div>
            <div style={styles.small}>
              Angemeldet als {me ? displayUser(me) : session.user.email} {isAdmin ? "· Admin" : ""}
            </div>
          </div>
          <div style={styles.row}>
            <button style={styles.btn} onClick={() => refreshMeta()}>
              Meta neu laden
            </button>
            <button style={styles.btn} onClick={() => refreshTasks()}>
              Aufgaben neu laden
            </button>
            <button style={styles.btn} onClick={signOut}>
              Logout
            </button>
          </div>
        </div>

        <div style={styles.tabs}>
          <button style={{ ...styles.tab, ...(tab === "plan" ? styles.tabActive : null) }} onClick={() => setTab("plan")}>
            Plan
          </button>
          <button style={{ ...styles.tab, ...(tab === "kanboard" ? styles.tabActive : null) }} onClick={() => setTab("kanboard")}>
            Kanboard
          </button>
          <button style={{ ...styles.tab, ...(tab === "calendar" ? styles.tabActive : null) }} onClick={() => setTab("calendar")}>
            Kalender
          </button>
          <button style={{ ...styles.tab, ...(tab === "guides" ? styles.tabActive : null) }} onClick={() => setTab("guides")}>
            Anleitungen
          </button>
          <button style={{ ...styles.tab, ...(tab === "users" ? styles.tabActive : null) }} onClick={() => setTab("users")}>
            Nutzer
          </button>
          <button style={{ ...styles.tab, ...(tab === "settings" ? styles.tabActive : null) }} onClick={() => setTab("settings")}>
            Einstellungen
          </button>
        </div>

        {err ? <div style={styles.error}>Fehler: {err}</div> : null}
        {loading ? <div style={{ ...styles.panel, color: "#6b7280" }}>Lade…</div> : null}

        {tab === "plan" ? (
          <TasksPanel
            tasks={tasksWithSubs}
            areas={areas}
            guides={guides}
            members={members}
            userMap={userMap}
            areaMap={areaMap}
            isAdmin={isAdmin}
            currentUserId={session.user.id}
            onChanged={refreshTasks}
          />
        ) : null}

        {tab === "kanboard" ? (
          <KanboardPanel
            tasks={tasksWithSubs}
            areas={areas}
            members={members}
            userMap={userMap}
            areaMap={areaMap}
            isAdmin={isAdmin}
            currentUserId={session.user.id}
            onChanged={refreshTasks}
          />
        ) : null}

        {tab === "calendar" ? (
          <CalendarPanel
            tasks={tasksWithSubs}
            areas={areas}
            members={members}
            userMap={userMap}
            areaMap={areaMap}
          />
        ) : null}

        {tab === "guides" ? <GuidesPanel guides={guides} onChanged={refreshMeta} /> : null}

        {tab === "users" ? (
          <UsersPanel
            members={members}
            membersTable={membersTable}
            isAdmin={isAdmin}
            currentUserEmail={session.user.email}
            onRefresh={refreshMeta}
          />
        ) : null}

        {tab === "settings" ? <UserSettingsPanel userId={session.user.id} /> : null}

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

/* ---------------- Tasks Panel (Plan) ---------------- */

function TasksPanel({ tasks, areas, guides, members, userMap, areaMap, isAdmin, currentUserId, onChanged }) {
  const [form, setForm] = useState({
    title: "",
    due_at: "",
    area_id: "",
    status: "todo",
    assignee_id: "",
    notes: "",
  });
  const [subDraft, setSubDraft] = useState({}); // taskId -> title

  const createTask = useCallback(async () => {
    if (!form.title.trim()) return;
    const payload = {
      title: form.title.trim(),
      status: form.status || "todo",
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      area_id: form.area_id || null,
      assignee_id: form.assignee_id || null,
      notes: form.notes || null,
    };
    const r = await safeInsert("tasks", payload);
    if (r.error) return alert(r.error.message || String(r.error));
    setForm((f) => ({ ...f, title: "", notes: "" }));
    onChanged();
  }, [form, onChanged]);

  const toggleTask = useCallback(
    async (t) => {
      const next = t.status === "done" ? "todo" : "done";
      const r = await safeUpdate("tasks", { status: next }, { id: t.id });
      if (r.error) return alert(r.error.message || String(r.error));
      onChanged();
    },
    [onChanged]
  );

  const addSubtask = useCallback(
    async (taskId) => {
      const title = (subDraft[taskId] || "").trim();
      if (!title) return;
      // insert best effort for various schemas
      const base = { title, task_id: taskId };
      let r = await safeInsert("subtasks", { ...base, is_done: false });
      if (r.error) r = await safeInsert("subtasks", { ...base, done: false });
      if (r.error) r = await safeInsert("subtasks", { ...base, status: "todo" });
      if (r.error) return alert(r.error.message || String(r.error));
      setSubDraft((m) => ({ ...m, [taskId]: "" }));
      onChanged();
    },
    [subDraft, onChanged]
  );

  const toggleSubtask = useCallback(
    async (sub) => {
      const tid = sub.id;
      const done = !isSubDone(sub);

      // try update fields in order
      let r = await safeUpdate("subtasks", { is_done: done }, { id: tid });
      if (r.error) r = await safeUpdate("subtasks", { done }, { id: tid });
      if (r.error) r = await safeUpdate("subtasks", { completed: done }, { id: tid });
      if (r.error) r = await safeUpdate("subtasks", { status: done ? "done" : "todo" }, { id: tid });
      if (r.error) return alert(r.error.message || String(r.error));

      onChanged();
    },
    [onChanged]
  );

  return (
    <div style={styles.panel}>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ fontSize: 16 }}>Aufgabe anlegen</div>

        <div style={styles.grid3}>
          <input style={styles.input} placeholder="Titel" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <input
            style={styles.input}
            type="datetime-local"
            value={form.due_at}
            onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))}
          />
          <select style={styles.select} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            <option value="todo">Zu erledigen</option>
            <option value="done">Erledigt</option>
          </select>

          <select style={styles.select} value={form.area_id} onChange={(e) => setForm((f) => ({ ...f, area_id: e.target.value }))}>
            <option value="">– Bereich –</option>
            {(areas || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.title || a.id}
              </option>
            ))}
          </select>

          <select
            style={styles.select}
            value={form.assignee_id}
            onChange={(e) => setForm((f) => ({ ...f, assignee_id: e.target.value }))}
            title="Zuständig"
          >
            <option value="">– Zuständig –</option>
            {(members || []).map((m) => (
              <option key={m.id} value={m.id}>
                {displayUser(m)}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button style={styles.btnPrimary} onClick={createTask}>
              Anlegen
            </button>
          </div>
        </div>

        <textarea
          style={{ ...styles.input, minWidth: "auto" }}
          placeholder="Notizen (optional)"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />

        <div style={{ height: 8 }} />

        <div style={styles.grid2}>
          <TaskColumn
            title="Zu erledigen"
            tasks={(tasks || []).filter((t) => t.status !== "done")}
            areaMap={areaMap}
            guides={guides}
            userMap={userMap}
            onToggle={toggleTask}
            subDraft={subDraft}
            setSubDraft={setSubDraft}
            onSubAdd={addSubtask}
            onSubToggle={toggleSubtask}
          />
          <TaskColumn
            title="Erledigt"
            tasks={(tasks || []).filter((t) => t.status === "done")}
            areaMap={areaMap}
            guides={guides}
            userMap={userMap}
            onToggle={toggleTask}
            subDraft={subDraft}
            setSubDraft={setSubDraft}
            onSubAdd={addSubtask}
            onSubToggle={toggleSubtask}
          />
        </div>

        <div style={styles.small}>
          Hinweis: Unteraufgaben-Checkbox nutzt Fallback-Felder (is_done/done/completed/status). Wenn du standardisieren willst: `subtasks.is_done`.
        </div>
      </div>
    </div>
  );
}

function TaskColumn({ title, tasks, areaMap, userMap, onToggle, subDraft, setSubDraft, onSubAdd, onSubToggle }) {
  const [openTask, setOpenTask] = useState(null);

  return (
    <div style={styles.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 15 }}>
          {title} <span style={styles.small}>({(tasks || []).length})</span>
        </div>
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {(tasks || []).map((t) => {
          const area = t.area_id ? areaMap.get(t.area_id) : null;
          const subs = t.__subtasks || [];
          const doneCount = subs.filter(isSubDone).length;

          return (
            <div key={t.id} style={styles.cardClickable} onClick={() => setOpenTask(t)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontWeight: 600 }}>{t.title}</div>
                {area ? <span style={styles.pill}>{area.name || area.title}</span> : null}
                <span style={{ marginLeft: "auto", ...styles.small }}>{t.due_at ? fmtShort(t.due_at) : "—"}</span>
              </div>

              <div style={{ marginTop: 6, ...styles.small }}>
                Zuständig: {t.assignee_id ? userMap.get(t.assignee_id) || t.assignee_id : "Unzugeordnet"} · Unteraufgaben: {doneCount}/{subs.length}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
                <button style={styles.btn} onClick={() => onToggle(t)}>
                  Status wechseln
                </button>
              </div>

              <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    style={{ ...styles.input, minWidth: "auto", flex: 1 }}
                    placeholder="Unteraufgabe hinzufügen…"
                    value={subDraft[t.id] || ""}
                    onChange={(e) => setSubDraft((m) => ({ ...m, [t.id]: e.target.value }))}
                  />
                  <button style={styles.btnPrimary} onClick={() => onSubAdd(t.id)}>
                    +
                  </button>
                </div>

                {subs.length > 0 ? (
                  <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                    {subs.slice(0, 5).map((s) => (
                      <label key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                        <input type="checkbox" checked={isSubDone(s)} onChange={() => onSubToggle(s)} />
                        <span style={{ textDecoration: isSubDone(s) ? "line-through" : "none" }}>{s.title}</span>
                      </label>
                    ))}
                    {subs.length > 5 ? <div style={styles.small}>… +{subs.length - 5} weitere</div> : null}
                  </div>
                ) : (
                  <div style={{ marginTop: 8, ...styles.small }}>Keine Unteraufgaben</div>
                )}
              </div>
            </div>
          );
        })}

        {(tasks || []).length === 0 ? <div style={styles.small}>Keine Einträge</div> : null}
      </div>

      {openTask ? (
        <TaskModal task={openTask} areaMap={areaMap} userMap={userMap} onClose={() => setOpenTask(null)} />
      ) : null}
    </div>
  );
}

function TaskModal({ task, areaMap, userMap, onClose }) {
  const area = task.area_id ? areaMap.get(task.area_id) : null;
  const subs = task.__subtasks || [];

  return (
    <div style={styles.modalBackdrop} onMouseDown={onClose}>
      <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{task.title}</div>
          <button style={styles.btn} onClick={onClose}>
            Schließen
          </button>
        </div>

        <div style={{ marginTop: 10, ...styles.small }}>
          Bereich: {area ? area.name || area.title : "—"} · Zuständig:{" "}
          {task.assignee_id ? userMap.get(task.assignee_id) || task.assignee_id : "Unzugeordnet"} · Status: {task.status || "—"}
        </div>

        <div style={{ marginTop: 10, ...styles.small }}>Fällig: {task.due_at ? fmtDateTime(task.due_at) : "—"}</div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Notizen</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{task.notes || task.description || "—"}</div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Unteraufgaben ({subs.length})</div>
          {subs.length ? (
            <div style={{ display: "grid", gap: 6 }}>
              {subs.map((s) => (
                <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={styles.pill}>{isSubDone(s) ? "Erledigt" : "Offen"}</span>
                  <span>{s.title}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={styles.small}>Keine Unteraufgaben</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Kanboard Panel ---------------- */

function KanboardPanel({ tasks, areas, members, userMap, areaMap, isAdmin, currentUserId, onChanged }) {
  const [mode, setMode] = useState("status"); // status | people
  const [areaFilter, setAreaFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");

  const filtered = useMemo(() => {
    return (tasks || []).filter((t) => {
      if (areaFilter && t.area_id !== areaFilter) return false;
      if (userFilter && t.assignee_id !== userFilter) return false;
      return true;
    });
  }, [tasks, areaFilter, userFilter]);

  const columns = useMemo(() => {
    const todo = filtered.filter((t) => t.status !== "done");
    const done = filtered.filter((t) => t.status === "done");
    return { todo, done };
  }, [filtered]);

  const setAssignee = useCallback(
    async (taskId, assigneeId) => {
      const r = await safeUpdate("tasks", { assignee_id: assigneeId || null }, { id: taskId });
      if (r.error) return alert(r.error.message || String(r.error));
      onChanged();
    },
    [onChanged]
  );

  const claimMe = useCallback(
    async (taskId) => {
      const r = await safeUpdate("tasks", { assignee_id: currentUserId }, { id: taskId });
      if (r.error) return alert(r.error.message || String(r.error));
      onChanged();
    },
    [currentUserId, onChanged]
  );

  const openCountByUser = useMemo(() => {
    const m = new Map();
    for (const t of filtered.filter((x) => x.status !== "done")) {
      const uid = t.assignee_id || "__unassigned__";
      m.set(uid, (m.get(uid) || 0) + 1);
    }
    return m;
  }, [filtered]);

  const peopleColumns = useMemo(() => {
    const cols = [];
    cols.push({ id: "__unassigned__", title: "Nicht zugeordnet" });

    for (const u of members || []) cols.push({ id: u.id, title: displayUser(u) });

    return cols;
  }, [members]);

  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <button style={{ ...styles.btn, ...(mode === "status" ? styles.tabActive : null) }} onClick={() => setMode("status")}>
          Status
        </button>
        <button style={{ ...styles.btn, ...(mode === "people" ? styles.tabActive : null) }} onClick={() => setMode("people")}>
          Personen
        </button>

        <span style={{ width: 10 }} />

        <select style={styles.select} value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
          <option value="">Alle Bereiche</option>
          {(areas || []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name || a.title || a.id}
            </option>
          ))}
        </select>

        <select style={styles.select} value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
          <option value="">Alle Nutzer</option>
          {(members || []).map((m) => (
            <option key={m.id} value={m.id}>
              {displayUser(m)}
            </option>
          ))}
        </select>
      </div>

      {mode === "status" ? (
        <div style={{ marginTop: 12, ...styles.grid2 }}>
          <KanColumn
            title="Zu erledigen"
            tasks={columns.todo}
            areaMap={areaMap}
            userMap={userMap}
            members={members}
            isAdmin={isAdmin}
            onAssignee={setAssignee}
            onClaimMe={claimMe}
            showAssignForUnassigned
          />
          <KanColumn
            title="Erledigt"
            tasks={columns.done}
            areaMap={areaMap}
            userMap={userMap}
            members={members}
            isAdmin={isAdmin}
            onAssignee={setAssignee}
            onClaimMe={claimMe}
            showAssignForUnassigned={false}
          />
        </div>
      ) : (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "320px", gap: 12 }}>
            {peopleColumns.map((col) => {
              const list =
                col.id === "__unassigned__"
                  ? filtered.filter((t) => t.status !== "done" && !t.assignee_id)
                  : filtered.filter((t) => t.status !== "done" && t.assignee_id === col.id);

              return (
                <div key={col.id} style={styles.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 700 }}>{col.title}</div>
                    <span style={styles.pill}>{list.length}</span>
                  </div>

                  <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                    {list.map((t) => (
                      <KanTaskCard
                        key={t.id}
                        task={t}
                        areaMap={areaMap}
                        userMap={userMap}
                        members={members}
                        isAdmin={isAdmin}
                        onAssignee={setAssignee}
                        onClaimMe={claimMe}
                        allowAssign={!t.assignee_id} // only unassigned can be assigned here
                      />
                    ))}
                    {list.length === 0 ? <div style={styles.small}>—</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, ...styles.small }}>
        Personen-Ansicht ist als Überblick gedacht: Zugeordnete Aufgaben bleiben Übersicht; nur unzugeordnete sind direkt zuweisbar.
      </div>
    </div>
  );
}

function KanColumn({ title, tasks, areaMap, userMap, members, isAdmin, onAssignee, onClaimMe, showAssignForUnassigned }) {
  return (
    <div style={styles.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <span style={styles.pill}>{(tasks || []).length}</span>
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {(tasks || []).map((t) => (
          <KanTaskCard
            key={t.id}
            task={t}
            areaMap={areaMap}
            userMap={userMap}
            members={members}
            isAdmin={isAdmin}
            onAssignee={onAssignee}
            onClaimMe={onClaimMe}
            allowAssign={showAssignForUnassigned && !t.assignee_id && t.status !== "done"}
          />
        ))}
        {(tasks || []).length === 0 ? <div style={styles.small}>—</div> : null}
      </div>
    </div>
  );
}

function KanTaskCard({ task, areaMap, userMap, members, isAdmin, onAssignee, onClaimMe, allowAssign }) {
  const [open, setOpen] = useState(false);
  const area = task.area_id ? areaMap.get(task.area_id) : null;
  const subs = task.__subtasks || [];
  const doneCount = subs.filter(isSubDone).length;

  return (
    <>
      <div style={styles.cardClickable} onClick={() => setOpen(true)}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontWeight: 600 }}>{task.title}</div>
          {area ? <span style={styles.pill}>{area.name || area.title}</span> : null}
          <span style={{ marginLeft: "auto", ...styles.small }}>{task.due_at ? fmtShort(task.due_at) : "—"}</span>
        </div>

        <div style={{ marginTop: 6, ...styles.small }}>
          Zuständig: {task.assignee_id ? userMap.get(task.assignee_id) || task.assignee_id : "Unzugeordnet"} · Unteraufgaben: {doneCount}/{subs.length}
        </div>

        {allowAssign ? (
          <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
            {isAdmin ? (
              <select style={styles.select} value={task.assignee_id || ""} onChange={(e) => onAssignee(task.id, e.target.value || null)}>
                <option value="">– Zuständig wählen –</option>
                {(members || []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {displayUser(m)}
                  </option>
                ))}
              </select>
            ) : (
              <button style={styles.btnPrimary} onClick={() => onClaimMe(task.id)}>
                Mir zuweisen
              </button>
            )}
          </div>
        ) : null}
      </div>

      {open ? <TaskModal task={task} areaMap={areaMap} userMap={userMap} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/* ---------------- Calendar Panel ---------------- */

function CalendarPanel({ tasks, areaMap, userMap }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const monthTasks = useMemo(() => {
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setMonth(end.getMonth() + 1);
    return (tasks || [])
      .filter((t) => {
        if (!t.due_at) return false;
        const d = new Date(t.due_at);
        return d >= start && d < end;
      })
      .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  }, [tasks, cursor]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const t of monthTasks) {
      const key = fmtShort(t.due_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    return Array.from(map.entries());
  }, [monthTasks]);

  const monthLabel = useMemo(() => cursor.toLocaleDateString("de-DE", { year: "numeric", month: "long" }), [cursor]);

  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <button style={styles.btn} onClick={() => setCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
          ←
        </button>
        <div style={{ fontWeight: 700 }}>{monthLabel}</div>
        <button style={styles.btn} onClick={() => setCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
          →
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        {grouped.length === 0 ? <div style={styles.small}>Keine Aufgaben in diesem Monat.</div> : null}

        <div style={{ display: "grid", gap: 12 }}>
          {grouped.map(([day, list]) => (
            <div key={day} style={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 700 }}>{day}</div>
                <span style={styles.pill}>{list.length}</span>
              </div>

              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {list.map((t) => {
                  const area = t.area_id ? areaMap.get(t.area_id) : null;
                  return (
                    <div key={t.id} style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontWeight: 600 }}>{t.title}</div>
                        {area ? <span style={styles.pill}>{area.name || area.title}</span> : null}
                        <span style={{ marginLeft: "auto", ...styles.small }}>{t.status === "done" ? "Erledigt" : "Offen"}</span>
                      </div>
                      <div style={{ marginTop: 4, ...styles.small }}>
                        Zuständig: {t.assignee_id ? userMap.get(t.assignee_id) || t.assignee_id : "Unzugeordnet"} · {t.due_at ? fmtDateTime(t.due_at) : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Guides Panel ---------------- */

function GuidesPanel({ guides, onChanged }) {
  const [open, setOpen] = useState(null);

  return (
    <div style={styles.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700 }}>Anleitungen</div>
        <button style={styles.btn} onClick={onChanged}>
          Neu laden
        </button>
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {(guides || []).map((g) => (
          <div key={g.id} style={styles.cardClickable} onClick={() => setOpen(g)}>
            <div style={{ fontWeight: 600 }}>{g.title || g.name || "Anleitung"}</div>
            <div style={styles.small}>{(g.content || "").slice(0, 120) || "—"}</div>
          </div>
        ))}
        {(guides || []).length === 0 ? <div style={styles.small}>Keine Anleitungen vorhanden.</div> : null}
      </div>

      {open ? (
        <div style={styles.modalBackdrop} onMouseDown={() => setOpen(null)}>
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ fontWeight: 700 }}>{open.title || open.name || "Anleitung"}</div>
              <button style={styles.btn} onClick={() => setOpen(null)}>
                Schließen
              </button>
            </div>
            <div style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{open.content || "—"}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Users Panel ---------------- */

function UsersPanel({ members, membersTable, isAdmin, currentUserEmail, onRefresh }) {
  return (
    <div style={styles.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700 }}>Nutzer</div>
        <button style={styles.btn} onClick={onRefresh}>
          Neu laden
        </button>
      </div>

      <div style={{ marginTop: 8, ...styles.small }}>
        Quelle: {membersTable || "—"} · Angemeldete E-Mail: {currentUserEmail}
      </div>

      {!isAdmin ? <div style={{ marginTop: 10, ...styles.small }}>Hinweis: Admin-Funktionen sind nur für Admins sichtbar.</div> : null}

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {(members || []).map((m) => (
          <div key={m.id} style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{displayUser(m)}</div>
                <div style={styles.small}>{m.email || "—"}</div>
              </div>
              <div style={styles.small}>{m.role || (m.is_admin ? "admin" : "")}</div>
            </div>
          </div>
        ))}
        {(members || []).length === 0 ? <div style={styles.small}>Keine Nutzer gefunden (prüfe RLS/Policies).</div> : null}
      </div>
    </div>
  );
}

/* ---------------- User Settings Panel ---------------- */

function UserSettingsPanel({ userId }) {
  const [draft, setDraft] = useState({
    primary_color: "#0b6b2a",
    background_color: "#f3f6fb",
    background_image_url: "",
  });
  const [status, setStatus] = useState("");
  const [tableOk, setTableOk] = useState(true);

  const load = useCallback(async () => {
    setStatus("");
    // Optional table "user_settings" expected: user_id, primary_color, background_color, background_image_url
    const r = await safeSelect("user_settings", "*");
    if (r.error) {
      setTableOk(false);
      return;
    }
    const row = (r.data || []).find((x) => x.user_id === userId);
    if (row) {
      setDraft({
        primary_color: row.primary_color || "#0b6b2a",
        background_color: row.background_color || "#f3f6fb",
        background_image_url: row.background_image_url || "",
      });
    }
    setTableOk(true);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async () => {
    setStatus("");
    // Upsert pattern (best effort)
    try {
      const { error } = await supabase.from("user_settings").upsert({ user_id: userId, ...draft });
      if (error) {
        setStatus("Fehler: " + error.message);
      } else {
        setStatus("Gespeichert.");
      }
    } catch (e) {
      setStatus("Fehler: " + (e?.message || String(e)));
    }
  }, [userId, draft]);

  return (
    <div style={styles.panel}>
      <div style={{ fontWeight: 700 }}>Einstellungen</div>
      {!tableOk ? (
        <div style={{ marginTop: 10, ...styles.small }}>
          Hinweis: Tabelle <code>user_settings</code> nicht gefunden oder keine Rechte. Dieser Bereich ist optional.
        </div>
      ) : null}

      <div style={{ marginTop: 12, ...styles.grid3 }}>
        <div>
          <div style={styles.small}>Primärfarbe</div>
          <input type="color" value={draft.primary_color} onChange={(e) => setDraft((d) => ({ ...d, primary_color: e.target.value }))} />
        </div>

        <div>
          <div style={styles.small}>Hintergrundfarbe</div>
          <input type="color" value={draft.background_color} onChange={(e) => setDraft((d) => ({ ...d, background_color: e.target.value }))} />
        </div>

        <div>
          <div style={styles.small}>Hintergrundbild-URL (optional)</div>
          <input
            style={{ ...styles.input, minWidth: "auto" }}
            value={draft.background_image_url}
            onChange={(e) => setDraft((d) => ({ ...d, background_image_url: e.target.value }))}
            placeholder="https://..."
          />
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
        <button style={styles.btnPrimary} onClick={save} disabled={!tableOk}>
          Speichern
        </button>
        <button style={styles.btn} onClick={load}>
          Neu laden
        </button>
        {status ? <span style={styles.small}>{status}</span> : null}
      </div>
    </div>
  );
}
