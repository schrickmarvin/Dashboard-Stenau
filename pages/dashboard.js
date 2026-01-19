// Dashboard.js
// Standalone dashboard component/page (React) for Next.js + Supabase
// Includes RBAC (role-based access control) blocks + Admin user management UI.

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ---------------- Supabase ---------------- */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL || "", SUPABASE_ANON_KEY || "");

/* ---------------- Helpers ---------------- */
function can(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

function isAdminFallback(profile, permissions, user) {
  // Primary: JWT claim
  const jwtRole =
    user?.app_metadata?.role ||
    user?.user_metadata?.role ||
    null;

  if ((jwtRole ?? "").toLowerCase() === "admin") return true;

  // Secondary: permissions (wenn du die später wieder sauber lädst)
  if (can(permissions, "users.manage")) return true;

  // Last fallback: profiles.role (optional)
  return (profile?.role ?? "").toLowerCase() === "admin";
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

function fmtDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function startOfDayISO(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfDayISO(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/* ---------------- RBAC: Load auth context ---------------- */
async function loadMyAuthContext() {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw userErr;
  if (!user) return { user: null, profile: null, permissions: [] };

  // IMPORTANT: your profiles table uses 'id' as the user uuid.
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, email, name, role, role_id, is_active")
    .eq("id", user.id)
    .maybeSingle();

  // If profile is missing (e.g. trigger not set up yet), fail soft.
  if (pErr) {
    console.warn("profiles load failed:", pErr.message);
    return { user, profile: null, permissions: [] };
  }

  // If you added is_active, block disabled users in UI.
  if (profile && profile.is_active === false) {
    return { user, profile, permissions: ["__inactive__"] };
  }

  // Role permissions
  const { data: rolePerms, error: rpErr } = await supabase
    .from("role_permissions")
    .select("permissions:permission_id ( key )")
    .eq("role_id", profile?.role_id ?? "");

  if (rpErr) {
    // If RLS blocks this for non-admins, you'll want a SQL function/view.
    // For now, we fail soft.
    console.warn("role_permissions query blocked or failed:", rpErr.message);
  }

  // User overrides (optional)
  const { data: userPerms, error: upErr } = await supabase
    .from("user_permissions")
    .select("allowed, permissions:permission_id ( key )")
    .eq("user_id", user.id);

  if (upErr) {
    console.warn("user_permissions query blocked or failed:", upErr.message);
  }

  const roleKeys = (rolePerms ?? [])
    .map((x) => x?.permissions?.key)
    .filter(Boolean);

  const userAllowed = (userPerms ?? [])
    .filter((x) => x?.allowed)
    .map((x) => x?.permissions?.key)
    .filter(Boolean);

  const permissions = Array.from(new Set([...roleKeys, ...userAllowed]));
  return { user, profile: profile ?? null, permissions };
}

/* ---------------- Admin Users Panel ---------------- */
function UsersAdminPanel({ profile, permissions }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const isAdmin = isAdminFallback(profile, permissions, authUser);


  async function load() {
    setErr(null);
    setLoading(true);

    const { data: rolesData, error: rErr } = await supabase
      .from("roles")
      .select("id, key, name")
      .order("name", { ascending: true });

    if (rErr) {
      setLoading(false);
      setErr(rErr.message);
      return;
    }

    const { data: usersData, error: uErr } = await supabase
      .from("profiles")
      .select("id, email, name, role, role_id, is_active")
      .order("name", { ascending: true });

    if (uErr) {
      setLoading(false);
      setErr(uErr.message);
      return;
    }

    setRoles(rolesData ?? []);
    setUsers(usersData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if () load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) => {
      const s = `${u.name ?? ""} ${u.email ?? ""}`.toLowerCase();
      return s.includes(needle);
    });
  }, [users, q]);

  async function updateUser(id, patch) {
    setErr(null);

    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) {
      setErr(error.message);
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  if (!) {
    return (
      <div style={styles.panel}>
        <div style={styles.h3}>Nutzer</div>
        <div>Du hast keine Berechtigung, diesen Bereich zu öffnen.</div>
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.rowBetween}>
        <div style={styles.h3}>Nutzerverwaltung</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suchen…"
            style={styles.input}
          />
          <button style={styles.btn} onClick={load} disabled={loading}>
            {loading ? "Lade…" : "Neu laden"}
          </button>
        </div>
      </div>

      {err ? <div style={styles.error}>Fehler: {err}</div> : null}

      <div style={{ overflowX: "auto" }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>E-Mail</th>
              <th style={styles.th}>Rolle</th>
              <th style={styles.th}>Aktiv</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td style={styles.td}>
                  <input
                    value={u.name ?? ""}
                    onChange={(e) => updateUser(u.id, { name: e.target.value })}
                    style={styles.input}
                  />
                </td>
                <td style={styles.td}>{u.email ?? ""}</td>
                <td style={styles.td}>
                  <select
                    value={u.role_id ?? ""}
                    onChange={(e) =>
                      updateUser(u.id, { role_id: e.target.value || null })
                    }
                    style={styles.input}
                  >
                    <option value="">–</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={styles.td}>
                  <input
                    type="checkbox"
                    checked={u.is_active !== false}
                    onChange={(e) =>
                      updateUser(u.id, { is_active: e.target.checked })
                    }
                  />
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={4}>
                  Keine Nutzer gefunden.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, color: "#666", fontSize: 13 }}>
        Hinweis: Wenn du einen Nutzer deaktivierst, kann er sich zwar evtl. noch
        anmelden, aber wird im Dashboard blockiert (UI). Für eine harte Sperre
        kannst du zusätzlich Policies/Functions nutzen.
      </div>
    </div>
  );
}

/* ---------------- Guides (Anleitungen) ---------------- */
function GuidesPanel({ permissions }) {
  const [guides, setGuides] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const canRead = can(permissions, "guides.read") || permissions.length === 0;
  const canWrite = can(permissions, "guides.write");

  async function load() {
    setErr(null);
    setLoading(true);
    const { data, error } = await supabase
      .from("guides")
      .select("id, title, content, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }
    setGuides(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (canRead) load();
  }, [canRead]);

  async function createGuide() {
    if (!canWrite) return;
    if (!title.trim()) return;
    setErr(null);
    const { error } = await supabase
      .from("guides")
      .insert({ title: title.trim(), content: content.trim() });
    if (error) {
      setErr(error.message);
      return;
    }
    setTitle("");
    setContent("");
    load();
  }

  if (!canRead) {
    return (
      <div style={styles.panel}>
        <div style={styles.h3}>Anleitungen</div>
        <div>Keine Berechtigung.</div>
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.rowBetween}>
        <div style={styles.h3}>Anleitungen</div>
        <button style={styles.btn} onClick={load} disabled={loading}>
          {loading ? "Lade…" : "Neu laden"}
        </button>
      </div>

      {err ? <div style={styles.error}>Fehler: {err}</div> : null}

      {canWrite ? (
        <div style={{ ...styles.card, marginBottom: 14 }}>
          <div style={styles.h4}>Neue Anleitung</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titel"
              style={styles.input}
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Inhalt / Schritte"
              rows={5}
              style={styles.textarea}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button style={styles.btnPrimary} onClick={createGuide}>
                Anlegen
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
        {guides.map((g) => (
          <div key={g.id} style={styles.card}>
            <div style={styles.h4}>{g.title}</div>
            <div style={{ color: "#666", fontSize: 13, marginBottom: 8 }}>
              Erstellt: {fmtDateTime(g.created_at)}
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{g.content}</div>
          </div>
        ))}
        {guides.length === 0 ? (
          <div style={{ color: "#666" }}>Noch keine Anleitungen vorhanden.</div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- Tasks Board (Planke) ---------------- */
function TasksBoard({ permissions }) {
  const [tasks, setTasks] = useState([]);
  const [guides, setGuides] = useState([]);
  const [form, setForm] = useState({
    title: "",
    area: "",
    due_at: "",
    status: "todo",
    notes: "",
    guideIds: [],
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const canRead = can(permissions, "tasks.read") || permissions.length === 0;
  const canWrite = can(permissions, "tasks.write") || permissions.length === 0;

  async function loadAll() {
    setErr(null);
    setLoading(true);

    const { data: tData, error: tErr } = await supabase
      .from("tasks")
      .select(
        "id, title, area, due_at, status, notes, created_at, task_guides ( guide_id )"
      )
      .order("created_at", { ascending: false });

    if (tErr) {
      setErr(tErr.message);
      setLoading(false);
      return;
    }

    const { data: gData, error: gErr } = await supabase
      .from("guides")
      .select("id, title")
      .order("title", { ascending: true });

    if (gErr) {
      // Not fatal for tasks
      console.warn("guides load failed:", gErr.message);
    }

    setTasks(tData ?? []);
    setGuides(gData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (canRead) loadAll();
  }, [canRead]);

  const columns = useMemo(() => {
    const todo = [];
    const done = [];
    for (const t of tasks) {
      if ((t.status ?? "todo") === "done") done.push(t);
      else todo.push(t);
    }
    return { todo, done };
  }, [tasks]);

  async function createTask() {
    if (!canWrite) return;
    if (!form.title.trim()) return;

    setErr(null);

    const payload = {
      title: form.title.trim(),
      area: form.area || null,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      status: form.status || "todo",
      notes: form.notes || null,
    };

    const { data: inserted, error: insErr } = await supabase
      .from("tasks")
      .insert(payload)
      .select("id")
      .single();

    if (insErr) {
      setErr(insErr.message);
      return;
    }

    const taskId = inserted?.id;

    // Link selected guides (many-to-many) if table exists
    if (taskId && Array.isArray(form.guideIds) && form.guideIds.length > 0) {
      const rows = form.guideIds.map((gid) => ({ task_id: taskId, guide_id: gid }));
      const { error: linkErr } = await supabase.from("task_guides").insert(rows);
      if (linkErr) {
        console.warn("task_guides insert failed:", linkErr.message);
      }
    }

    setForm({
      title: "",
      area: "",
      due_at: "",
      status: "todo",
      notes: "",
      guideIds: [],
    });

    loadAll();
  }

  async function toggleStatus(task) {
    const next = (task.status ?? "todo") === "done" ? "todo" : "done";
    const { error } = await supabase
      .from("tasks")
      .update({ status: next })
      .eq("id", task.id);
    if (error) {
      setErr(error.message);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
  }

  function onGuideSelect(e) {
    const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
    setForm((f) => ({ ...f, guideIds: selected }));
  }

  if (!canRead) {
    return (
      <div style={styles.panel}>
        <div style={styles.h3}>Armaturenbrett</div>
        <div>Keine Berechtigung.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={styles.panel}>
        <div style={styles.h3}>Aufgabe anlegen</div>

        {err ? <div style={styles.error}>Fehler: {err}</div> : null}

        <div style={styles.taskFormGrid}>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Titel"
            style={styles.input}
            disabled={!canWrite}
          />

          <input
            value={form.area}
            onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
            placeholder="Bereich"
            style={styles.input}
            disabled={!canWrite}
          />

          <input
            type="datetime-local"
            value={form.due_at}
            onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))}
            style={styles.input}
            disabled={!canWrite}
          />

          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            style={styles.input}
            disabled={!canWrite}
          >
            <option value="todo">Zu erledigen</option>
            <option value="done">Erledigt</option>
          </select>

          <select
            multiple
            value={form.guideIds}
            onChange={onGuideSelect}
            style={{ ...styles.input, height: 94 }}
            disabled={!canWrite}
            title="Mehrfachauswahl: Strg/Cmd + Klick"
          >
            {guides.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>

          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Notizen"
            rows={4}
            style={styles.textarea}
            disabled={!canWrite}
          />

          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start" }}>
            <button style={styles.btnPrimary} onClick={createTask} disabled={!canWrite}>
              Anlegen
            </button>
          </div>
        </div>

        <div style={{ color: "#666", fontSize: 13, marginTop: 8 }}>
          Mehrfachauswahl bei Anleitungen: Strg/Cmd + Klick
        </div>
      </div>

      <div style={styles.columns}>
        <TaskColumn
          title="Zu erledigen"
          count={columns.todo.length}
          tasks={columns.todo}
          onToggle={toggleStatus}
        />
        <TaskColumn
          title="Erledigt"
          count={columns.done.length}
          tasks={columns.done}
          onToggle={toggleStatus}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button style={styles.btn} onClick={loadAll} disabled={loading}>
          {loading ? "Lade…" : "Neu laden"}
        </button>
      </div>
    </div>
  );
}

function TaskColumn({ title, count, tasks, onToggle }) {
  return (
    <div style={styles.col}>
      <div style={styles.colHeader}>
        <div style={styles.h3}>{title}</div>
        <div style={styles.badge}>{count}</div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {tasks.map((t) => (
          <div key={t.id} style={styles.card}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={styles.h4}>{t.title}</div>
              <span style={styles.pill}>{t.status === "done" ? "done" : "todo"}</span>
              <button style={{ ...styles.btn, marginLeft: "auto" }} onClick={() => onToggle(t)}>
                Status
              </button>
            </div>

            <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
              Bereich: {t.area ?? "–"} · Fällig: {t.due_at ? fmtDateTime(t.due_at) : "–"}
            </div>

            {t.notes ? (
              <textarea readOnly value={t.notes} style={{ ...styles.textarea, marginTop: 10 }} rows={4} />
            ) : null}

            <div style={{ marginTop: 10, color: "#666", fontSize: 13 }}>
              Unteraufgaben 0/0
            </div>
          </div>
        ))}

        {tasks.length === 0 ? (
          <div style={{ color: "#666" }}>Keine Einträge.</div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- Calendar ---------------- */
function CalendarPanel({ permissions }) {
  const canRead = can(permissions, "calendar.read") || permissions.length === 0;

  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function load() {
    setErr(null);
    setLoading(true);

    const from = startOfDayISO(date);
    const to = endOfDayISO(date);

    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, area, due_at, status")
      .gte("due_at", from)
      .lte("due_at", to)
      .order("due_at", { ascending: true });

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    setTasks(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (canRead) load();
  }, [date, canRead]);

  if (!canRead) {
    return (
      <div style={styles.panel}>
        <div style={styles.h3}>Kalender</div>
        <div>Keine Berechtigung.</div>
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.rowBetween}>
        <div style={styles.h3}>Kalender</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={styles.input}
          />
          <button style={styles.btn} onClick={load} disabled={loading}>
            {loading ? "Lade…" : "Neu laden"}
          </button>
        </div>
      </div>

      {err ? <div style={styles.error}>Fehler: {err}</div> : null}

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {tasks.map((t) => (
          <div key={t.id} style={styles.card}>
            <div style={styles.h4}>{t.title}</div>
            <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
              {t.due_at ? fmtDateTime(t.due_at) : "–"} · Bereich: {t.area ?? "–"} · Status: {t.status ?? "todo"}
            </div>
          </div>
        ))}
        {tasks.length === 0 ? (
          <div style={{ color: "#666" }}>Keine Aufgaben für {fmtDate(date)}.</div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- Main Component ---------------- */
export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("board");
  const [auth, setAuth] = useState({ user: null, profile: null, permissions: [] });
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  async function refreshAuth() {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const ctx = await loadMyAuthContext();
      setAuth(ctx);
    } catch (e) {
      setAuthError(e?.message || String(e));
      setAuth({ user: null, profile: null, permissions: [] });
    }
    setAuthLoading(false);
  }

  useEffect(() => {
    refreshAuth();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refreshAuth();
    });

    return () => {
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  const permissions = auth.permissions || [];
  const profile = auth.profile; // FIX: was previously undefined in render

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return (
      <div style={styles.page}>
        <div style={styles.panel}>
          <div style={styles.h3}>Konfiguration fehlt</div>
          <div>
            Bitte setze NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY.
          </div>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div style={styles.page}>
        <div style={styles.panel}>Lade…</div>
      </div>
    );
  }

  if (permissions.includes("__inactive__")) {
    return (
      <div style={styles.page}>
        <div style={styles.panel}>
          <div style={styles.h3}>Zugang deaktiviert</div>
          <div>Dein Zugang ist aktuell deaktiviert. Bitte melde dich bei der Administration.</div>
          <div style={{ marginTop: 12 }}>
            <button style={styles.btn} onClick={signOut}>Abmelden</button>
          </div>
        </div>
      </div>
    );
  }

  // If no user, show minimal login hint.
  if (!auth.user) {
    return (
      <div style={styles.page}>
        <div style={styles.panel}>
          <div style={styles.h3}>Bitte anmelden</div>
          <div style={{ color: "#666" }}>
            Du bist nicht eingeloggt. Öffne deine Login-Seite oder nutze dein bestehendes Auth-Flow.
          </div>
          {authError ? <div style={styles.error}>Fehler: {authError}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={styles.brand}>Armaturenbrett</div>

        <div style={styles.tabs}>
          <TabBtn active={activeTab === "board"} onClick={() => setActiveTab("board")}>Planke</TabBtn>
          <TabBtn active={activeTab === "calendar"} onClick={() => setActiveTab("calendar")}>Kalender</TabBtn>
          <TabBtn active={activeTab === "guides"} onClick={() => setActiveTab("guides")}>Anleitungen</TabBtn>

         {isAdminFallback(auth.profile, permissions, auth.user) ? (
  <TabBtn active={activeTab === "users"} onClick={() => setActiveTab("users")}>Nutzer</TabBtn>
) : null}


          <button style={styles.btn} onClick={refreshAuth}>Neu laden</button>
        </div>

        <div style={styles.right}>
          <div style={{ color: "#555", fontSize: 14 }}>
            {auth.profile?.email || auth.user.email}
          </div>
          <button style={styles.btn} onClick={signOut}>Abmelden</button>
        </div>
      </div>

      {authError ? <div style={{ ...styles.panel, ...styles.error }}>Fehler: {authError}</div> : null}

      {activeTab === "board" ? <TasksBoard permissions={permissions} /> : null}
      {activeTab === "calendar" ? <CalendarPanel permissions={permissions} /> : null}
      {activeTab === "guides" ? <GuidesPanel permissions={permissions} /> : null}
      {activeTab === "users" ? (
        <UsersAdminPanel profile={profile} permissions={permissions} />
      ) : null}

      <div style={{ height: 24 }} />
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.tab,
        ...(active ? styles.tabActive : null),
      }}
    >
      {children}
    </button>
  );
}

/* ---------------- Styles ---------------- */
const styles = {
  page: {
    minHeight: "100vh",
    background: "#f3f6fb",
    padding: 18,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
  },
  topbar: {
    display: "flex",
    gap: 14,
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  brand: {
    fontSize: 30,
    fontWeight: 800,
    letterSpacing: -0.5,
  },
  tabs: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  tab: {
    border: "1px solid #d8e0ef",
    background: "#fff",
    padding: "10px 14px",
    borderRadius: 999,
    cursor: "pointer",
    fontWeight: 600,
  },
  tabActive: {
    background: "#0b6b2a",
    borderColor: "#0b6b2a",
    color: "#fff",
  },
  right: {
    display: "flex",
    gap: 12,
    alignItems: "center",
  },
  panel: {
    background: "#fff",
    border: "1px solid #d8e0ef",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
    marginBottom: 14,
  },
  h3: {
    fontSize: 18,
    fontWeight: 800,
    marginBottom: 10,
  },
  h4: {
    fontSize: 16,
    fontWeight: 800,
    marginBottom: 4,
  },
  rowBetween: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  columns: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
  },
  col: {
    background: "transparent",
  },
  colHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 999,
    background: "#eef2fb",
    border: "1px solid #d8e0ef",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    color: "#333",
  },
  pill: {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid #d8e0ef",
    background: "#f7f9ff",
    fontWeight: 700,
  },
  card: {
    background: "#fff",
    border: "1px solid #d8e0ef",
    borderRadius: 18,
    padding: 14,
    boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
  },
  input: {
    padding: 10,
    borderRadius: 12,
    border: "1px solid #d8e0ef",
    outline: "none",
    background: "#fff",
    minWidth: 160,
  },
  textarea: {
    padding: 10,
    borderRadius: 12,
    border: "1px solid #d8e0ef",
    outline: "none",
    background: "#fff",
    width: "100%",
    resize: "vertical",
  },
  btn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #d8e0ef",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  },
  btnPrimary: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #0b6b2a",
    background: "#0b6b2a",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
  },
  error: {
    background: "#fff3f3",
    border: "1px solid #ffd2d2",
    color: "#a40000",
    padding: 12,
    borderRadius: 12,
    marginTop: 10,
    marginBottom: 10,
  },
  taskFormGrid: {
    display: "grid",
    gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1.2fr 1.6fr auto",
    gap: 10,
    alignItems: "start",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: 8,
    borderBottom: "1px solid #ddd",
    whiteSpace: "nowrap",
  },
  td: {
    padding: 8,
    borderBottom: "1px solid #eee",
    verticalAlign: "top",
  },
};
