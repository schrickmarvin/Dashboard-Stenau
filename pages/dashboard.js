import textwrap, os, re, json, pathlib, datetime
content = r'''// pages/dashboard.js
// Next.js + Supabase Dashboard
// Tabs: Planke (Tasks), Kalender, Anleitungen, Bereiche, Nutzer (Admin)
// Bereich-Logik: tasks.area_id -> areas
// Guides-Logik: task_guides (many-to-many)

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ---------------- Supabase ---------------- */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL || "", SUPABASE_ANON_KEY || "");

/* ---------------- Helpers ---------------- */
function fmtDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function startOfDayISO(dateStr) {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function endOfDayISO(dateStr) {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

async function loadMyAuthContext() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  const user = data?.user || null;
  if (!user) return { user: null, profile: null };

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, email, name, role_id, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (pErr) throw pErr;

  return { user, profile: profile || null };
}

/* ---------------- Areas Tab ---------------- */
function AreasPanel() {
  const [areas, setAreas] = useState([]);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function load() {
    setErr(null);
    setLoading(true);
    const { data, error } = await supabase
      .from("areas")
      .select("id, key, name, created_at")
      .order("name", { ascending: true });
    if (error) setErr(error.message);
    setAreas(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createArea() {
    setErr(null);
    const k = newKey.trim();
    const n = newName.trim();
    if (!k || !n) return;

    const { error } = await supabase.from("areas").insert({ key: k, name: n });
    if (error) return setErr(error.message);

    setNewKey("");
    setNewName("");
    load();
  }

  async function updateArea(id, patch) {
    setErr(null);
    const { error } = await supabase.from("areas").update(patch).eq("id", id);
    if (error) return setErr(error.message);
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  async function deleteArea(id) {
    setErr(null);
    const ok = window.confirm("Bereich wirklich löschen?");
    if (!ok) return;
    const { error } = await supabase.from("areas").delete().eq("id", id);
    if (error) return setErr(error.message);
    setAreas((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div style={styles.panel}>
      <div style={styles.rowBetween}>
        <div style={styles.h3}>Bereiche</div>
        <button style={styles.btn} onClick={load} disabled={loading}>
          {loading ? "Lade…" : "Neu laden"}
        </button>
      </div>

      {err ? <div style={styles.error}>Fehler: {err}</div> : null}

      <div style={{ ...styles.card, marginTop: 10, marginBottom: 12 }}>
        <div style={styles.h4}>Neuen Bereich anlegen</div>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", gap: 10 }}>
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Key (z.B. A, B)"
            style={styles.input}
          />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name (z.B. Bereich A)"
            style={styles.input}
          />
          <button style={styles.btnPrimary} onClick={createArea}>
            Anlegen
          </button>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Key</th>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Erstellt</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => (
              <tr key={a.id}>
                <td style={styles.td}>
                  <input
                    value={a.key ?? ""}
                    onChange={(e) => updateArea(a.id, { key: e.target.value })}
                    style={styles.input}
                  />
                </td>
                <td style={styles.td}>
                  <input
                    value={a.name ?? ""}
                    onChange={(e) => updateArea(a.id, { name: e.target.value })}
                    style={styles.input}
                  />
                </td>
                <td style={styles.td}>{a.created_at ? fmtDateTime(a.created_at) : "–"}</td>
                <td style={styles.td}>
                  <button style={styles.btn} onClick={() => deleteArea(a.id)}>
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
            {areas.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={4}>
                  Keine Bereiche vorhanden.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, color: "#666", fontSize: 13 }}>
        Hinweis: Wenn du einen Bereich löschst, können Tasks mit diesem Bereich ggf. keinen Namen mehr anzeigen.
      </div>
    </div>
  );
}

/* ---------------- Guides ---------------- */
function GuidesPanel({ canWrite }) {
  const [guides, setGuides] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setErr(null);
    setLoading(true);
    const { data, error } = await supabase
      .from("guides")
      .select("id, title, content, created_at")
      .order("created_at", { ascending: false });
    if (error) setErr(error.message);
    setGuides(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createGuide() {
    if (!canWrite) return;
    if (!title.trim()) return;
    setErr(null);
    const { error } = await supabase
      .from("guides")
      .insert({ title: title.trim(), content: content.trim() });
    if (error) return setErr(error.message);
    setTitle("");
    setContent("");
    load();
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
        <div style={{ ...styles.card, marginBottom: 12 }}>
          <div style={styles.h4}>Neue Anleitung</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titel"
            style={styles.input}
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Inhalt"
            style={styles.textarea}
            rows={5}
          />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button style={styles.btnPrimary} onClick={createGuide}>
              Anlegen
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 10 }}>
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

/* ---------------- Tasks ---------------- */
function TasksBoard() {
  const [tasks, setTasks] = useState([]);
  const [areas, setAreas] = useState([]);
  const [guides, setGuides] = useState([]);

  const [form, setForm] = useState({
    title: "",
    area_id: "",
    due_at: "",
    status: "todo",
    guideIds: [],
  });

  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadAll() {
    setErr(null);
    setLoading(true);

    const { data: tData, error: tErr } = await supabase
      .from("tasks")
      .select(
        `
        id, title, status, due_at, area_id, created_at,
        areas ( id, key, name ),
        task_guides ( guide_id )
      `
      )
      .order("created_at", { ascending: false });

    if (tErr) {
      setErr(tErr.message);
      setLoading(false);
      return;
    }

    const { data: aData, error: aErr } = await supabase
      .from("areas")
      .select("id, key, name")
      .order("name", { ascending: true });
    if (aErr) console.warn("areas load failed:", aErr.message);

    const { data: gData, error: gErr } = await supabase
      .from("guides")
      .select("id, title")
      .order("title", { ascending: true });
    if (gErr) console.warn("guides load failed:", gErr.message);

    setTasks(tData || []);
    setAreas(aData || []);
    setGuides(gData || []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

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
    if (!form.title.trim()) return;

    setErr(null);

    const payload = {
      title: form.title.trim(),
      area_id: form.area_id || null,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      status: form.status || "todo",
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

    if (taskId && Array.isArray(form.guideIds) && form.guideIds.length > 0) {
      const rows = form.guideIds.map((gid) => ({ task_id: taskId, guide_id: gid }));
      const { error: linkErr } = await supabase.from("task_guides").insert(rows);
      if (linkErr) console.warn("task_guides insert failed:", linkErr.message);
    }

    setForm({
      title: "",
      area_id: "",
      due_at: "",
      status: "todo",
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

    if (error) return setErr(error.message);

    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: next } : t))
    );
  }

  function onGuideSelect(e) {
    const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
    setForm((f) => ({ ...f, guideIds: selected }));
  }

  return (
    <div>
      <div style={styles.panel}>
        <div style={styles.rowBetween}>
          <div style={styles.h3}>Aufgabe anlegen</div>
          <button style={styles.btn} onClick={loadAll} disabled={loading}>
            {loading ? "Lade…" : "Neu laden"}
          </button>
        </div>

        {err ? <div style={styles.error}>Fehler: {err}</div> : null}

        <div style={styles.taskFormGrid}>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Titel"
            style={styles.input}
          />

          <select
            value={form.area_id}
            onChange={(e) => setForm((f) => ({ ...f, area_id: e.target.value }))}
            style={styles.input}
          >
            <option value="">– Bereich –</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <input
            type="datetime-local"
            value={form.due_at}
            onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))}
            style={styles.input}
          />

          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            style={styles.input}
          >
            <option value="todo">Zu erledigen</option>
            <option value="done">Erledigt</option>
          </select>

          <select
            multiple
            value={form.guideIds}
            onChange={onGuideSelect}
            style={{ ...styles.input, height: 94 }}
            title="Mehrfachauswahl: Strg/Cmd + Klick"
          >
            {guides.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start" }}>
            <button style={styles.btnPrimary} onClick={createTask}>
              Anlegen
            </button>
          </div>
        </div>
      </div>

      <div style={styles.columns}>
        <TaskColumn title="Zu erledigen" tasks={columns.todo} onToggle={toggleStatus} />
        <TaskColumn title="Erledigt" tasks={columns.done} onToggle={toggleStatus} />
      </div>
    </div>
  );
}

function TaskColumn({ title, tasks, onToggle }) {
  return (
    <div style={styles.col}>
      <div style={styles.colHeader}>
        <div style={styles.h3}>{title}</div>
        <div style={styles.badge}>{tasks.length}</div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {tasks.map((t) => (
          <div key={t.id} style={styles.card}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={styles.h4}>{t.title}</div>
              <button style={{ ...styles.btn, marginLeft: "auto" }} onClick={() => onToggle(t)}>
                Status
              </button>
            </div>

            <div style={{ color: "#666", fontSize: 13, marginTop: 6 }}>
              Bereich: {t.areas?.name ?? "–"} · Fällig: {t.due_at ? fmtDateTime(t.due_at) : "–"}
            </div>
          </div>
        ))}
        {tasks.length === 0 ? <div style={{ color: "#666" }}>Keine Einträge.</div> : null}
      </div>
    </div>
  );
}

/* ---------------- Calendar ---------------- */
function CalendarPanel() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tasks, setTasks] = useState([]);
  const [err, setErr] = useState(null);

  async function load() {
    setErr(null);
    const from = startOfDayISO(date);
    const to = endOfDayISO(date);

    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, due_at, status, area_id, areas ( name )")
      .gte("due_at", from)
      .lte("due_at", to)
      .order("due_at", { ascending: true });

    if (error) return setErr(error.message);
    setTasks(data || []);
  }

  useEffect(() => {
    load();
  }, [date]);

  return (
    <div style={styles.panel}>
      <div style={styles.rowBetween}>
        <div style={styles.h3}>Kalender</div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={styles.input} />
      </div>

      {err ? <div style={styles.error}>Fehler: {err}</div> : null}

      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        {tasks.map((t) => (
          <div key={t.id} style={styles.card}>
            <div style={styles.h4}>{t.title}</div>
            <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
              {t.due_at ? fmtDateTime(t.due_at) : "–"} · Bereich: {t.areas?.name ?? "–"} · Status:{" "}
              {t.status ?? "todo"}
            </div>
          </div>
        ))}
        {tasks.length === 0 ? <div style={{ color: "#666" }}>Keine Aufgaben für diesen Tag.</div> : null}
      </div>
    </div>
  );
}

/* ---------------- Users Admin Panel ---------------- */
function UsersAdminPanel() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function load() {
    setErr(null);
    setLoading(true);

    const { data: rolesData, error: rErr } = await supabase
      .from("roles")
      .select("id, key, name")
      .order("name", { ascending: true });

    if (rErr) {
      setErr(rErr.message);
      setLoading(false);
      return;
    }

    const { data: usersData, error: uErr } = await supabase
      .from("profiles")
      .select("id, email, name, role_id, is_active")
      .order("name", { ascending: true });

    if (uErr) {
      setErr(uErr.message);
      setLoading(false);
      return;
    }

    setRoles(rolesData || []);
    setUsers(usersData || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) =>
      `${u.name ?? ""} ${u.email ?? ""}`.toLowerCase().includes(needle)
    );
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

  return (
    <div style={styles.panel}>
      <div style={styles.rowBetween}>
        <div style={styles.h3}>Nutzerverwaltung</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen…" style={styles.input} />
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
                    onChange={(e) => updateUser(u.id, { role_id: e.target.value || null })}
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
                    onChange={(e) => updateUser(u.id, { is_active: e.target.checked })}
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
    </div>
  );
}

/* ---------------- Main ---------------- */
export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("board");
  const [auth, setAuth] = useState({ user: null, profile: null });
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [isAdminDb, setIsAdminDb] = useState(false);

  async function refreshAuth() {
    setAuthLoading(true);
    setAuthError(null);

    try {
      const ctx = await loadMyAuthContext();
      setAuth(ctx);

      // Admin check via DB roles (profiles.role_id -> roles.key = 'admin')
      if (ctx?.user?.id && ctx?.profile?.role_id) {
        const { data, error } = await supabase
          .from("roles")
          .select("key")
          .eq("id", ctx.profile.role_id)
          .maybeSingle();
        if (error) {
          console.warn("roles lookup failed:", error.message);
          setIsAdminDb(false);
        } else {
          setIsAdminDb((data?.key || "").toLowerCase() === "admin");
        }
      } else {
        setIsAdminDb(false);
      }
    } catch (e) {
      console.error("Auth init failed:", e);
      setAuth({ user: null, profile: null });
      setAuthError(e?.message || String(e));
      setIsAdminDb(false);
    } finally {
      setAuthLoading(false);
    }
  }

  useEffect(() => {
    refreshAuth();
    const { data: sub } = supabase.auth.onAuthStateChange(() => refreshAuth());
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return (
      <div style={styles.page}>
        <div style={styles.panel}>
          <div style={styles.h3}>Konfiguration fehlt</div>
          <div>Bitte NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY setzen.</div>
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

  if (!auth.user) {
    return (
      <div style={styles.page}>
        <div style={styles.panel}>
          <div style={styles.h3}>Bitte anmelden</div>
          {authError ? <div style={styles.error}>Fehler: {authError}</div> : null}
          <div style={{ color: "#666" }}>
            Du bist nicht eingeloggt. Nutze deine Login-Seite (oder den bestehenden Auth-Flow).
          </div>
        </div>
      </div>
    );
  }

  if (auth.profile?.is_active === false) {
    return (
      <div style={styles.page}>
        <div style={styles.panel}>
          <div style={styles.h3}>Zugang deaktiviert</div>
          <div>Dein Zugang ist deaktiviert. Bitte melde dich bei der Administration.</div>
          <div style={{ marginTop: 12 }}>
            <button style={styles.btn} onClick={signOut}>
              Abmelden
            </button>
          </div>
        </div>
      </div>
    );
  }

  const admin = isAdminDb;

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={styles.brand}>Armaturenbrett</div>

        <div style={styles.tabs}>
          <TabBtn active={activeTab === "board"} onClick={() => setActiveTab("board")}>Planke</TabBtn>
          <TabBtn active={activeTab === "calendar"} onClick={() => setActiveTab("calendar")}>Kalender</TabBtn>
          <TabBtn active={activeTab === "guides"} onClick={() => setActiveTab("guides")}>Anleitungen</TabBtn>
          <TabBtn active={activeTab === "areas"} onClick={() => setActiveTab("areas")}>Bereiche</TabBtn>
          {admin ? (
            <TabBtn active={activeTab === "users"} onClick={() => setActiveTab("users")}>Nutzer</TabBtn>
          ) : null}
          <button style={styles.btn} onClick={refreshAuth}>Neu laden</button>
        </div>

        <div style={styles.right}>
          <div style={{ color: "#555", fontSize: 14 }}>{auth.profile?.email || auth.user.email}</div>
          <button style={styles.btn} onClick={signOut}>Abmelden</button>
        </div>
      </div>

      {authError ? <div style={{ ...styles.panel, ...styles.error }}>Fehler: {authError}</div> : null}

      {activeTab === "board" ? <TasksBoard /> : null}
      {activeTab === "calendar" ? <CalendarPanel /> : null}
      {activeTab === "guides" ? <GuidesPanel canWrite={true} /> : null}
      {activeTab === "areas" ? <AreasPanel /> : null}
      {activeTab === "users" ? (admin ? <UsersAdminPanel /> : null) : null}

      <div style={{ height: 20 }} />
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
  brand: { fontSize: 30, fontWeight: 800, letterSpacing: -0.5 },
  tabs: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  tab: {
    border: "1px solid #d8e0ef",
    background: "#fff",
    padding: "10px 14px",
    borderRadius: 999,
    cursor: "pointer",
    fontWeight: 600,
  },
  tabActive: { background: "#0b6b2a", borderColor: "#0b6b2a", color: "#fff" },
  right: { display: "flex", gap: 12, alignItems: "center" },
  panel: {
    background: "#fff",
    border: "1px solid #d8e0ef",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
    marginBottom: 14,
  },
  h3: { fontSize: 18, fontWeight: 800, marginBottom: 10 },
  h4: { fontSize: 16, fontWeight: 800, marginBottom: 8 },
  rowBetween: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  columns: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  colHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
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
    width: "100%",
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
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" },
  td: { padding: 8, borderBottom: "1px solid #eee" },
  taskFormGrid: {
    display: "grid",
    gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1.2fr auto",
    gap: 10,
    alignItems: "start",
  },
};
'''
path = "/mnt/data/dashboard.js"
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
path
