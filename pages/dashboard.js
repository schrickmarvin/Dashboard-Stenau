// pages/dashboard.js
// Next.js (pages router) + Supabase dashboard
// Features: Auth context, Tasks + Subtasks (optional guide link), Calendar (day), Guides, Areas (admin-only), Users (admin-only)
// Important: getServerSideProps forces SSR so Next won't try to prerender /dashboard (prevents env-related export errors).

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ---------- Prevent static export/prerender ---------- */
export async function getServerSideProps() {
  return { props: {} };
}

/* ---------------- Supabase ---------------- */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------------- Helpers ---------------- */
function can(perms, key) {
  return Array.isArray(perms) && perms.includes(key);
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
  return d.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
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
  if (!user) return { user: null, profile: null, permissions: [] };

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, email, name, role, role_id, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (pErr) throw pErr;

  if (profile && profile.is_active === false) {
    return { user, profile, permissions: ["__inactive__"] };
  }

  // Role permissions (soft-fail if RLS blocks)
  const { data: rolePerms, error: rpErr } = await supabase
    .from("role_permissions")
    .select("permissions:permission_id ( key )")
    .eq("role_id", profile?.role_id ?? "");

  if (rpErr) console.warn("role_permissions blocked/failed:", rpErr.message);

  // User overrides (optional)
  const { data: userPerms, error: upErr } = await supabase
    .from("user_permissions")
    .select("allowed, permissions:permission_id ( key )")
    .eq("user_id", user.id);

  if (upErr) console.warn("user_permissions blocked/failed:", upErr.message);

  const roleKeys = (rolePerms ?? []).map((x) => x?.permissions?.key).filter(Boolean);
  const userAllowed = (userPerms ?? []).filter((x) => x?.allowed).map((x) => x?.permissions?.key).filter(Boolean);

  // Default behavior you wanted: if no permissions table yet / blocked by RLS, everyone can read+write tasks/guides/calendar.
  const merged = Array.from(new Set([...roleKeys, ...userAllowed]));
  return { user, profile: profile || null, permissions: merged };
}

/* ---------------- Areas Panel (admin-only) ---------------- */
function AreasPanel({ permissions }) {
  const isAdmin = can(permissions, "areas.manage") || can(permissions, "users.manage");

  const [areas, setAreas] = useState([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#0b6b2a");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function load() {
    setErr(null);
    setLoading(true);
    const { data, error } = await supabase.from("areas").select("id, name, color, created_at").order("name");
    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }
    setAreas(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createArea() {
    if (!isAdmin) return;
    const n = name.trim();
    if (!n) return;
    setErr(null);
    const { error } = await supabase.from("areas").insert({ name: n, color: color || null });
    if (error) {
      setErr(error.message);
      return;
    }
    setName("");
    load();
  }

  async function updateArea(id, patch) {
    if (!isAdmin) return;
    setErr(null);
    const { error } = await supabase.from("areas").update(patch).eq("id", id);
    if (error) {
      setErr(error.message);
      return;
    }
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  async function deleteArea(id) {
    if (!isAdmin) return;
    if (!confirm("Bereich wirklich löschen?")) return;
    setErr(null);
    const { error } = await supabase.from("areas").delete().eq("id", id);
    if (error) {
      setErr(error.message);
      return;
    }
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

      {!isAdmin ? (
        <div style={{ color: "#666" }}>
          Bereiche sind sichtbar, aber nur Admins dürfen Bereiche anlegen/ändern/löschen.
        </div>
      ) : (
        <div style={{ ...styles.card, marginTop: 10, marginBottom: 12 }}>
          <div style={styles.h4}>Neuen Bereich anlegen</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={styles.input} />
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={styles.colorInput} />
            <button style={styles.btnPrimary} onClick={createArea}>
              Anlegen
            </button>
          </div>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Farbe</th>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => (
              <tr key={a.id}>
                <td style={styles.td}>
                  <span style={{ ...styles.colorDot, background: a.color || "#d8e0ef" }} />
                  {isAdmin ? (
                    <input
                      type="color"
                      value={a.color || "#0b6b2a"}
                      onChange={(e) => updateArea(a.id, { color: e.target.value })}
                      style={styles.colorInput}
                    />
                  ) : null}
                </td>
                <td style={styles.td}>
                  {isAdmin ? (
                    <input
                      value={a.name}
                      onChange={(e) => updateArea(a.id, { name: e.target.value })}
                      style={styles.input}
                    />
                  ) : (
                    a.name
                  )}
                </td>
                <td style={styles.td}>
                  {isAdmin ? (
                    <button style={styles.btnDanger} onClick={() => deleteArea(a.id)}>
                      Löschen
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {areas.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={3}>
                  Keine Bereiche vorhanden.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, color: "#666", fontSize: 13 }}>
        Hinweis: Aufgaben dürfen weiterhin frei einen Bereichstext haben. Wenn du Bereiche pflegst, nutzen wir bevorzugt area_id.
      </div>
    </div>
  );
}

/* ---------------- Users Panel (admin-only UI) ---------------- */
function UsersAdminPanel({ permissions }) {
  const isAdmin = can(permissions, "users.manage");
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
      .select("id, email, name, role, role_id, is_active")
      .order("name", { ascending: true });

    if (uErr) {
      setErr(uErr.message);
      setLoading(false);
      return;
    }

    setRoles(rolesData ?? []);
    setUsers(usersData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) => (`${u.name ?? ""} ${u.email ?? ""}`).toLowerCase().includes(needle));
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

  if (!isAdmin) {
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
                  <input value={u.name ?? ""} onChange={(e) => updateUser(u.id, { name: e.target.value })} style={styles.input} />
                </td>
                <td style={styles.td}>{u.email ?? ""}</td>
                <td style={styles.td}>
                  <select value={u.role_id ?? ""} onChange={(e) => updateUser(u.id, { role_id: e.target.value || null })} style={styles.input}>
                    <option value="">–</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={styles.td}>
                  <input type="checkbox" checked={u.is_active !== false} onChange={(e) => updateUser(u.id, { is_active: e.target.checked })} />
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
        Hinweis: Deaktiviert blockiert im UI. Für harte Sperre braucht es RLS/Policies oder Admin API.
      </div>
    </div>
  );
}

/* ---------------- Guides ---------------- */
function GuidesPanel({ permissions }) {
  // Everyone can read/write by default (unless you later enforce perms in RLS)
  const canRead = can(permissions, "guides.read") || permissions.length === 0;
  const canWrite = can(permissions, "guides.write") || permissions.length === 0;

  const [guides, setGuides] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function load() {
    setErr(null);
    setLoading(true);
    const { data, error } = await supabase.from("guides").select("id, title, content, created_at").order("created_at", { ascending: false });
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
    const { error } = await supabase.from("guides").insert({ title: title.trim(), content: content.trim() });
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
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel" style={styles.input} />
            <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Inhalt / Schritte" rows={5} style={styles.textarea} />
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
            <div style={{ color: "#666", fontSize: 13, marginBottom: 8 }}>Erstellt: {fmtDateTime(g.created_at)}</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{g.content}</div>
          </div>
        ))}
        {guides.length === 0 ? <div style={{ color: "#666" }}>Noch keine Anleitungen vorhanden.</div> : null}
      </div>
    </div>
  );
}

/* ---------------- Tasks (Board) ---------------- */
function TasksBoard({ permissions }) {
  // Default: everyone can read+write unless you add enforced perms later
  const canRead = can(permissions, "tasks.read") || permissions.length === 0;
  const canWrite = can(permissions, "tasks.write") || permissions.length === 0;

  const [tasks, setTasks] = useState([]);
  const [areas, setAreas] = useState([]);
  const [guides, setGuides] = useState([]);

  const [form, setForm] = useState({
    title: "",
    due_at: "",
    status: "todo",
    area_id: "",
    area_text: "",
    guideIds: [],
  });

  const [subFormByTask, setSubFormByTask] = useState({}); // { [taskId]: {title, guide_id}}
  const [subtasksByTask, setSubtasksByTask] = useState({}); // { [taskId]: subtasks[] }

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function loadAll() {
    setErr(null);
    setLoading(true);

    const { data: areasData } = await supabase.from("areas").select("id, name, color").order("name");

    const { data: guidesData } = await supabase.from("guides").select("id, title").order("title");

    const { data: tData, error: tErr } = await supabase
      .from("tasks")
      .select("id, title, status, due_at, area_id, area, is_series, series_parent_id, created_at")
      .order("created_at", { ascending: false });

    if (tErr) {
      setErr(tErr.message);
      setLoading(false);
      return;
    }

    const taskIds = (tData ?? []).map((t) => t.id);
    if (taskIds.length) {
      const { data: stData, error: stErr } = await supabase
        .from("subtasks")
        .select("id, task_id, title, is_done, guide_id, created_at")
        .in("task_id", taskIds)
        .order("created_at", { ascending: true });

      if (!stErr) {
        const by = {};
        for (const s of stData ?? []) {
          if (!by[s.task_id]) by[s.task_id] = [];
          by[s.task_id].push(s);
        }
        setSubtasksByTask(by);
      } else {
        console.warn("subtasks load failed:", stErr.message);
        setSubtasksByTask({});
      }
    } else {
      setSubtasksByTask({});
    }

    setAreas(areasData ?? []);
    setGuides(guidesData ?? []);
    setTasks(tData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (canRead) loadAll();
  }, [canRead]);

  const areaById = useMemo(() => {
    const m = new Map();
    for (const a of areas) m.set(a.id, a);
    return m;
  }, [areas]);

  function taskAreaLabel(t) {
    if (t.area_id && areaById.has(t.area_id)) return areaById.get(t.area_id).name;
    return t.area ?? "–";
  }
  function taskAreaColor(t) {
    if (t.area_id && areaById.has(t.area_id)) return areaById.get(t.area_id).color || "#d8e0ef";
    return "#d8e0ef";
  }

  const columns = useMemo(() => {
    const todo = [];
    const done = [];
    for (const t of tasks) {
      if ((t.status ?? "todo") === "done") done.push(t);
      else todo.push(t);
    }
    return { todo, done };
  }, [tasks]);

  function onGuideSelect(e) {
    const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
    setForm((f) => ({ ...f, guideIds: selected }));
  }

  async function createTask() {
    if (!canWrite) return;
    if (!form.title.trim()) return;

    setErr(null);

    const payload = {
      title: form.title.trim(),
      status: form.status || "todo",
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      area_id: form.area_id ? form.area_id : null,
      area: form.area_id ? null : (form.area_text || null),
    };

    const { data: inserted, error: insErr } = await supabase.from("tasks").insert(payload).select("id").single();
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

    setForm({ title: "", due_at: "", status: "todo", area_id: "", area_text: "", guideIds: [] });
    loadAll();
  }

  async function toggleStatus(task) {
    const next = (task.status ?? "todo") === "done" ? "todo" : "done";
    const { error } = await supabase.from("tasks").update({ status: next }).eq("id", task.id);
    if (error) {
      setErr(error.message);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
  }

  async function deleteTask(taskId) {
    if (!canWrite) return;
    if (!confirm("Aufgabe wirklich löschen?")) return;
    setErr(null);
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) {
      setErr(error.message);
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setSubtasksByTask((prev) => {
      const n = { ...prev };
      delete n[taskId];
      return n;
    });
  }

  function setSubForm(taskId, patch) {
    setSubFormByTask((prev) => ({ ...prev, [taskId]: { title: "", guide_id: "", ...(prev[taskId] || {}), ...patch } }));
  }

  async function addSubtask(taskId) {
    if (!canWrite) return;
    const f = subFormByTask[taskId] || {};
    const title = (f.title || "").trim();
    if (!title) return;

    const payload = {
      task_id: taskId,
      title,
      guide_id: f.guide_id ? f.guide_id : None,
    };
    # can't use None in JS string; we'll handle below
  }

  // helper must be inside component but JS can't have Python; define real below
  async function addSubtaskReal(taskId) {
    if (!canWrite) return;
    const f = subFormByTask[taskId] || {};
    const title = (f.title || "").trim();
    if (!title) return;

    setErr(null);
    const payload = {
      task_id: taskId,
      title,
      guide_id: f.guide_id ? f.guide_id : null,
    };

    const { data: inserted, error } = await supabase.from("subtasks").insert(payload).select("id, task_id, title, is_done, guide_id, created_at").single();
    if (error) {
      setErr(error.message);
      return;
    }

    setSubtasksByTask((prev) => {
      const list = [...(prev[taskId] || []), inserted];
      return { ...prev, [taskId]: list };
    });
    setSubForm(taskId, { title: "", guide_id: "" });
  }

  async function toggleSubtask(taskId, sub) {
    if (!canWrite) return;
    const next = !sub.is_done;
    setErr(null);
    const { error } = await supabase.from("subtasks").update({ is_done: next }).eq("id", sub.id);
    if (error) {
      setErr(error.message);
      return;
    }
    setSubtasksByTask((prev) => {
      const list = (prev[taskId] || []).map((s) => (s.id === sub.id ? { ...s, is_done: next } : s));
      return { ...prev, [taskId]: list };
    });
  }

  async function deleteSubtask(taskId, subId) {
    if (!canWrite) return;
    if (!confirm("Unteraufgabe löschen?")) return;
    setErr(null);
    const { error } = await supabase.from("subtasks").delete().eq("id", subId);
    if (error) {
      setErr(error.message);
      return;
    }
    setSubtasksByTask((prev) => {
      const list = (prev[taskId] || []).filter((s) => s.id !== subId);
      return { ...prev, [taskId]: list };
    });
  }

  if (!canRead) {
    return (
      <div style={styles.panel}>
        <div style={styles.h3}>Planke</div>
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

          <select
            value={form.area_id}
            onChange={(e) => setForm((f) => ({ ...f, area_id: e.target.value, area_text: "" }))}
            style={styles.input}
            disabled={!canWrite}
            title="Wenn du keinen Bereich auswählst, kannst du rechts frei tippen."
          >
            <option value="">Bereich auswählen…</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <input
            value={form.area_text}
            onChange={(e) => setForm((f) => ({ ...f, area_text: e.target.value, area_id: "" }))}
            placeholder="Bereich frei eintippen"
            style={styles.input}
            disabled={!canWrite}
          />

          <input type="datetime-local" value={form.due_at} onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))} style={styles.input} disabled={!canWrite} />

          <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={styles.input} disabled={!canWrite}>
            <option value="todo">Zu erledigen</option>
            <option value="done">Erledigt</option>
          </select>

          <select multiple value={form.guideIds} onChange={onGuideSelect} style={{ ...styles.input, height: 94 }} disabled={!canWrite} title="Mehrfachauswahl: Strg/Cmd + Klick">
            {guides.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start" }}>
            <button style={styles.btnPrimary} onClick={createTask} disabled={!canWrite}>
              Anlegen
            </button>
          </div>
        </div>

        <div style={{ color: "#666", fontSize: 13, marginTop: 8 }}>Mehrfachauswahl bei Anleitungen: Strg/Cmd + Klick</div>
      </div>

      <div style={styles.columns}>
        <TaskColumn
          title="Zu erledigen"
          count={columns.todo.length}
          tasks={columns.todo}
          guides={guides}
          subtasksByTask={subtasksByTask}
          subFormByTask={subFormByTask}
          setSubForm={setSubForm}
          onToggle={toggleStatus}
          onDelete={deleteTask}
          onAddSubtask={addSubtaskReal}
          onToggleSubtask={toggleSubtask}
          onDeleteSubtask={deleteSubtask}
        />
        <TaskColumn
          title="Erledigt"
          count={columns.done.length}
          tasks={columns.done}
          guides={guides}
          subtasksByTask={subtasksByTask}
          subFormByTask={subFormByTask}
          setSubForm={setSubForm}
          onToggle={toggleStatus}
          onDelete={deleteTask}
          onAddSubtask={addSubtaskReal}
          onToggleSubtask={toggleSubtask}
          onDeleteSubtask={deleteSubtask}
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

function TaskColumn({
  title,
  count,
  tasks,
  guides,
  subtasksByTask,
  subFormByTask,
  setSubForm,
  onToggle,
  onDelete,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
}) {
  const guideTitleById = useMemo(() => {
    const m = new Map();
    for (const g of guides || []) m.set(g.id, g.title);
    return m;
  }, [guides]);

  return (
    <div style={styles.col}>
      <div style={styles.colHeader}>
        <div style={styles.h3}>{title}</div>
        <div style={styles.badge}>{count}</div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {tasks.map((t) => {
          const subs = subtasksByTask[t.id] || [];
          const doneCount = subs.filter((s) => !!s.is_done).length;
          const totalCount = subs.length;
          const sf = subFormByTask[t.id] || { title: "", guide_id: "" };

          return (
            <div key={t.id} style={styles.card}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={styles.h4}>{t.title}</div>
                <span style={styles.pill}>{t.status === "done" ? "done" : "todo"}</span>
                {t.is_series ? <span style={styles.pillSeries} title="Serien-Master (Vorlage)">Serie Master</span> : null}
                {t.series_parent_id ? <span style={styles.pillSeries} title="Serien-Instanz (aus Vorlage erzeugt)">Serie</span> : null}

                <button style={{ ...styles.btn, marginLeft: "auto" }} onClick={() => onToggle(t)}>
                  Status
                </button>
                <button style={styles.btnDanger} onClick={() => onDelete(t.id)} title="Löschen">
                  ✕
                </button>
              </div>

              <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
                Bereich: {t.area ?? "–"} · Fällig: {t.due_at ? fmtDateTime(t.due_at) : "–"}
              </div>

              <div style={{ marginTop: 10, color: "#666", fontSize: 13 }}>
                Unteraufgaben {doneCount}/{totalCount}
              </div>

              {totalCount > 0 ? (
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {subs.map((s) => (
                    <div key={s.id} style={styles.subRow}>
                      <input type="checkbox" checked={!!s.is_done} onChange={() => onToggleSubtask(t.id, s)} />
                      <div style={{ flex: 1, opacity: s.is_done ? 0.65 : 1, textDecoration: s.is_done ? "line-through" : "none" }}>
                        {s.title}
                        {s.guide_id ? (
                          <span style={styles.subGuidePill} title="Verknüpfte Anleitung">
                            Anleitung: {guideTitleById.get(s.guide_id) || "—"}
                          </span>
                        ) : null}
                      </div>
                      <button style={styles.btnDanger} onClick={() => onDeleteSubtask(t.id, s.id)} title="Unteraufgabe löschen">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div style={{ ...styles.subCreate, marginTop: 10 }}>
                <input
                  value={sf.title || ""}
                  onChange={(e) => setSubForm(t.id, { title: e.target.value })}
                  placeholder="Unteraufgabe"
                  style={styles.input}
                />
                <select value={sf.guide_id || ""} onChange={(e) => setSubForm(t.id, { guide_id: e.target.value })} style={styles.input} title="Optional: Anleitung verknüpfen">
                  <option value="">Anleitung (optional)…</option>
                  {(guides || []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
                <button style={styles.btnPrimary} onClick={() => onAddSubtask(t.id)}>
                  +
                </button>
              </div>
            </div>
          );
        })}

        {tasks.length === 0 ? <div style={{ color: "#666" }}>Keine Einträge.</div> : null}
      </div>
    </div>
  );
}

/* ---------------- Calendar ---------------- */
function CalendarPanel({ permissions }) {
  const canRead = can(permissions, "calendar.read") || permissions.length === 0;

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
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
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={styles.input} />
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
        {tasks.length === 0 ? <div style={{ color: "#666" }}>Keine Aufgaben für {fmtDate(date)}.</div> : null}
      </div>
    </div>
  );
}

/* ---------------- Main ---------------- */
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
    const { data: sub } = supabase.auth.onAuthStateChange(() => refreshAuth());
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  const permissions = auth.permissions || [];
  const isAdmin = can(permissions, "users.manage") || can(permissions, "areas.manage");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return (
      <div style={styles.page}>
        <div style={styles.panel}>
          <div style={styles.h3}>Konfiguration fehlt</div>
          <div>Bitte setze NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel (Project Settings → Environment Variables).</div>
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
            <button style={styles.btn} onClick={signOut}>
              Abmelden
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!auth.user) {
    return (
      <div style={styles.page}>
        <div style={styles.panel}>
          <div style={styles.h3}>Bitte anmelden</div>
          <div style={{ color: "#666" }}>Du bist nicht eingeloggt. Öffne deine Login-Seite oder nutze dein bestehendes Auth-Flow.</div>
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
          <TabBtn active={activeTab === "board"} onClick={() => setActiveTab("board")}>
            Planke
          </TabBtn>
          <TabBtn active={activeTab === "calendar"} onClick={() => setActiveTab("calendar")}>
            Kalender
          </TabBtn>
          <TabBtn active={activeTab === "guides"} onClick={() => setActiveTab("guides")}>
            Anleitungen
          </TabBtn>
          <TabBtn active={activeTab === "areas"} onClick={() => setActiveTab("areas")}>
            Bereiche
          </TabBtn>

          {isAdmin ? (
            <TabBtn active={activeTab === "users"} onClick={() => setActiveTab("users")}>
              Nutzer
            </TabBtn>
          ) : null}

          <button style={styles.btn} onClick={refreshAuth}>
            Neu laden
          </button>
        </div>

        <div style={styles.right}>
          <div style={{ color: "#555", fontSize: 14 }}>{auth.profile?.email || auth.user.email}</div>
          <button style={styles.btn} onClick={signOut}>
            Abmelden
          </button>
        </div>
      </div>

      {authError ? <div style={{ ...styles.panel, ...styles.error }}>Fehler: {authError}</div> : null}

      {activeTab === "board" ? <TasksBoard permissions={permissions} /> : null}
      {activeTab === "calendar" ? <CalendarPanel permissions={permissions} /> : null}
      {activeTab === "guides" ? <GuidesPanel permissions={permissions} /> : null}
      {activeTab === "areas" ? <AreasPanel permissions={permissions} /> : null}
      {activeTab === "users" ? <UsersAdminPanel permissions={permissions} /> : null}

      <div style={{ height: 24 }} />
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ ...styles.tab, ...(active ? styles.tabActive : null) }}>
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
  h4: { fontSize: 16, fontWeight: 800, marginBottom: 4 },
  rowBetween: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },

  columns: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  col: { background: "transparent" },
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

  pill: { fontSize: 12, padding: "4px 10px", borderRadius: 999, border: "1px solid #d8e0ef", background: "#f7f9ff", fontWeight: 700 },
  pillSeries: { fontSize: 12, padding: "4px 10px", borderRadius: 999, border: "1px dashed #d8e0ef", background: "#fff", fontWeight: 800 },

  card: {
    background: "#fff",
    border: "1px solid #d8e0ef",
    borderRadius: 18,
    padding: 14,
    boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
  },

  input: { padding: 10, borderRadius: 12, border: "1px solid #d8e0ef", outline: "none", background: "#fff", minWidth: 160 },
  textarea: { padding: 10, borderRadius: 12, border: "1px solid #d8e0ef", outline: "none", background: "#fff", width: "100%", resize: "vertical" },
  colorInput: { height: 36, width: 44, border: "1px solid #d8e0ef", borderRadius: 10, background: "#fff" },

  btn: { padding: "10px 14px", borderRadius: 12, border: "1px solid #d8e0ef", background: "#fff", cursor: "pointer", fontWeight: 700 },
  btnPrimary: { padding: "10px 14px", borderRadius: 12, border: "1px solid #0b6b2a", background: "#0b6b2a", color: "#fff", cursor: "pointer", fontWeight: 800 },
  btnDanger: { padding: "10px 12px", borderRadius: 12, border: "1px solid #ffd2d2", background: "#fff3f3", color: "#a40000", cursor: "pointer", fontWeight: 800 },

  error: { background: "#fff3f3", border: "1px solid #ffd2d2", color: "#a40000", padding: 12, borderRadius: 12, marginTop: 10, marginBottom: 10 },

  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0 },
  th: { textAlign: "left", fontSize: 13, color: "#555", padding: 10, borderBottom: "1px solid #e8eef8" },
  td: { padding: 10, borderBottom: "1px solid #f1f5fb", verticalAlign: "middle" },

  taskFormGrid: { display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1fr 1.2fr auto", gap: 10, alignItems: "start" },

  subCreate: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  subRow: { display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", border: "1px solid #eef2fb", borderRadius: 12, background: "#fbfcff" },
  subGuidePill: { marginLeft: 10, fontSize: 12, padding: "2px 8px", borderRadius: 999, border: "1px solid #d8e0ef", background: "#fff", color: "#333" },

  colorDot: { width: 14, height: 14, borderRadius: 999, display: "inline-block", marginRight: 10, border: "1px solid #d8e0ef" },
};
