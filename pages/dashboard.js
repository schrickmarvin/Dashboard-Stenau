// pages/dashboard.js
// Standalone dashboard page (React) for Next.js + Supabase

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

function safeLower(v) {
  return String(v ?? "").trim().toLowerCase();
}

/* ---------------- Auth context ---------------- */
async function loadMyAuthContext() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  const user = data?.user || null;
  if (!user) return { user: null, profile: null, role: null, isAdmin: false };

  // Your profiles table uses id = auth.uid()
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, email, name, role, role_id, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (pErr) throw pErr;

  // If is_active exists and user disabled
  if (profile && profile.is_active === false) {
    return { user, profile, role: null, isAdmin: false, inactive: true };
  }

  let role = null;
  if (profile?.role_id) {
    const { data: r, error: rErr } = await supabase
      .from("roles")
      .select("id, key, name")
      .eq("id", profile.role_id)
      .maybeSingle();
    if (!rErr) role = r;
  }

  const roleKey = safeLower(role?.key || profile?.role);
  const isAdmin = roleKey === "admin";

  return { user, profile: profile || null, role, isAdmin, inactive: false };
}

/* ---------------- Areas (A/B) ---------------- */
// Option 2: fixed areas A/B (plus whatever exists in table `areas`)
async function loadAreas() {
  const { data, error } = await supabase
    .from("areas")
    .select("id, name, color")
    .order("name", { ascending: true });

  if (error) {
    console.warn("areas load failed:", error.message);
    return [];
  }

  return (data || []).map((a) => ({
    id: a.id,
    name: a.name,
    color: a.color || null,
  }));
}

/* ---------------- Admin: Users Panel ---------------- */
function UsersAdminPanel({ isAdmin }) {
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

    setRoles(rolesData || []);
    setUsers(usersData || []);
    setLoading(false);
  }

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) => `${u.name ?? ""} ${u.email ?? ""}`.toLowerCase().includes(needle));
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

/* ---------------- Guides (Anleitungen) ---------------- */
function GuidesPanel({ isAdmin }) {
  const [guides, setGuides] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

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
    setGuides(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createGuide() {
    if (!isAdmin) return;
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

  return (
    <div style={styles.panel}>
      <div style={styles.rowBetween}>
        <div style={styles.h3}>Anleitungen</div>
        <button style={styles.btn} onClick={load} disabled={loading}>
          {loading ? "Lade…" : "Neu laden"}
        </button>
      </div>

      {err ? <div style={styles.error}>Fehler: {err}</div> : null}

      {isAdmin ? (
        <div style={{ ...styles.card, marginBottom: 14 }}>
          <div style={styles.h4}>Neue Anleitung</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel" style={styles.input} />
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
            <div style={{ color: "#666", fontSize: 13, marginBottom: 8 }}>Erstellt: {fmtDateTime(g.created_at)}</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{g.content}</div>
          </div>
        ))}

        {guides.length === 0 ? <div style={{ color: "#666" }}>Noch keine Anleitungen vorhanden.</div> : null}
      </div>
    </div>
  );
}

/* ---------------- Areas (Bereiche) ---------------- */
function AreasPanel({ isAdmin }) {
  const [areas, setAreas] = useState([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#0b6b2a");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function load() {
    setErr(null);
    setLoading(true);
    const list = await loadAreas();
    setAreas(list);
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

    const { error } = await supabase.from("areas").insert({ name: n, color: (color || null) });
    if (error) {
      setErr(error.message);
      return;
    }
    setName("");
    setColor("#0b6b2a");
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

  return (
    <div style={styles.panel}>
      <div style={styles.rowBetween}>
        <div style={styles.h3}>Bereiche</div>
        <button style={styles.btn} onClick={load} disabled={loading}>
          {loading ? "Lade…" : "Neu laden"}
        </button>
      </div>

      {err ? <div style={styles.error}>Fehler: {err}</div> : null}

      {isAdmin ? (
        <div style={{ ...styles.card, marginBottom: 14 }}>
          <div style={styles.h4}>Neuen Bereich anlegen</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 220px auto", gap: 10, alignItems: "center" }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (z.B. LVP, PPK, Containerdienst)"
              style={styles.input}
            />
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={styles.input} />
            <button style={styles.btnPrimary} onClick={createArea}>
              Anlegen
            </button>
          </div>
          <div style={{ marginTop: 8, color: "#666", fontSize: 13 }}>
            Hinweis: Aufgaben-Bereich ist frei eintippbar. Wenn der Text genau zu einem Bereich passt, wird automatisch die Farbe gezogen.
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 12, color: "#666", fontSize: 13 }}>
          Du kannst bei Aufgaben den Bereich frei eintippen. Bereiche/Farben pflegt nur die Administration.
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Farbe</th>
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => (
              <tr key={a.id}>
                <td style={styles.td}>
                  {isAdmin ? (
                    <input value={a.name || ""} onChange={(e) => updateArea(a.id, { name: e.target.value })} style={styles.input} />
                  ) : (
                    a.name
                  )}
                </td>
                <td style={styles.td}>
                  {isAdmin ? (
                    <input type="color" value={a.color || "#0b6b2a"} onChange={(e) => updateArea(a.id, { color: e.target.value })} style={styles.input} />
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 14, height: 14, borderRadius: 999, background: a.color || "#d8e0ef", border: "1px solid #d8e0ef" }} />
                      {a.color || "–"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {areas.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={2}>
                  Keine Bereiche vorhanden.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Tasks Board (Planke) ---------------- */
function TasksBoard({ isAdmin }) {
  const [areas, setAreas] = useState([]);
  const [guides, setGuides] = useState([]);
  const [tasks, setTasks] = useState([]);

  const [form, setForm] = useState({
    title: "",
    area: "",
    due_at: "",
    status: "todo",
    guideIds: [],
  });

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function loadAll() {
    setErr(null);
    setLoading(true);

    // Tasks: use area_id, due_at, status, title
    const { data: tData, error: tErr } = await supabase
      .from("tasks")
      .select("id, title, area, area_id, due_at, status, created_at")
      .order("created_at", { ascending: false });

    if (tErr) {
      setErr(tErr.message);
      setLoading(false);
      return;
    }

    const [areasList, guidesRes] = await Promise.all([
      loadAreas(),
      supabase.from("guides").select("id, title").order("title", { ascending: true }),
    ]);

    if (guidesRes.error) {
      console.warn("guides load failed:", guidesRes.error.message);
    }

    const areaByIdTmp = new Map((areasList || []).map((a) => [a.id, a]));
    const areaByNameTmp = new Map((areasList || []).map((a) => [String(a.name || "").toLowerCase(), a]));

    const decoratedTasks = (tData || []).map((t) => {
      const areaObj = t.area_id
        ? areaByIdTmp.get(t.area_id)
        : (t.area ? areaByNameTmp.get(String(t.area).toLowerCase()) : null);
      const areaLabel = areaObj?.name || t.area || "";
      const areaColor = areaObj?.color || null;
      return { ...t, area_label: areaLabel, area_color: areaColor };
    });

    setTasks(decoratedTasks);
    setAreas(areasList || []);
    setGuides(guidesRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  const areaById = useMemo(() => {
    const m = new Map();
    for (const a of areas) m.set(a.id, a);
    return m;
  }, [areas]);

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
    if (!form.title.trim()) return;
    setErr(null);
    const areaText = (form.area || "").trim();
    const matched = areaText
      ? (areas || []).find((a) => String(a.name || "").toLowerCase() === areaText.toLowerCase())
      : null;

    const payload = {
      title: form.title.trim(),
      status: form.status || "todo",
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      area_id: matched ? matched.id : null,
      area: areaText || null,
    };

    const { data: inserted, error: insErr } = await supabase.from("tasks").insert(payload).select("id").single();

    if (insErr) {
      setErr(insErr.message);
      return;
    }

    const taskId = inserted?.id;

    // Many-to-many task_guides (optional)
    if (taskId && Array.isArray(form.guideIds) && form.guideIds.length > 0) {
      const rows = form.guideIds.map((gid) => ({ task_id: taskId, guide_id: gid }));
      const { error: linkErr } = await supabase.from("task_guides").insert(rows);
      if (linkErr) console.warn("task_guides insert failed:", linkErr.message);
    }

    setForm({ title: "", area: "", due_at: "", status: "todo", guideIds: [] });
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
          />

          <input
            value={form.area}
            onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
            placeholder="Bereich"
            list="areas-list"
            style={styles.input}
          />
          <datalist id="areas-list">
            {areas.map((a) => (
              <option key={a.id} value={a.name} />
            ))}
          </datalist>

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

        <div style={{ color: "#666", fontSize: 13, marginTop: 8 }}>Mehrfachauswahl bei Anleitungen: Strg/Cmd + Klick</div>
      </div>

      <div style={styles.columns}>
        <TaskColumn title="Zu erledigen" count={columns.todo.length} tasks={columns.todo} onToggle={toggleStatus} areaById={areaById} />
        <TaskColumn title="Erledigt" count={columns.done.length} tasks={columns.done} onToggle={toggleStatus} areaById={areaById} />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button style={styles.btn} onClick={loadAll} disabled={loading}>
          {loading ? "Lade…" : "Neu laden"}
        </button>
      </div>

      {!isAdmin ? (
        <div style={{ marginTop: 10, color: "#666", fontSize: 13 }}>
          Hinweis: Aufgaben anlegen ist für alle Nutzer erlaubt. Admin-Funktionen findest du im Tab „Nutzer“.
        </div>
      ) : null}
    </div>
  );
}

function TaskColumn({ title, count, tasks, onToggle, areaById }) {
  return (
    <div style={styles.col}>
      <div style={styles.colHeader}>
        <div style={styles.h3}>{title}</div>
        <div style={styles.badge}>{count}</div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {tasks.map((t) => {
          const areaName = t.area || (t.area_id ? areaById.get(t.area_id)?.name : "–");
          return (
            <div key={t.id} style={styles.card}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={styles.h4}>{t.title}</div>
              {t.area_color ? (
                <span title={t.area || t.area_label || ""} style={{...styles.areaDot, background: t.area_color}} />
              ) : null}
                <span style={styles.pill}>{t.status === "done" ? "done" : "todo"}</span>
                <button style={{ ...styles.btn, marginLeft: "auto" }} onClick={() => onToggle(t)}>
                  Status
                </button>
              </div>

              <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
                Bereich: {areaName} · Fällig: {t.due_at ? fmtDateTime(t.due_at) : "–"}
              </div>

              <div style={{ marginTop: 10, color: "#666", fontSize: 13 }}>Unteraufgaben 0/0</div>
            </div>
          );
        })}

        {tasks.length === 0 ? <div style={{ color: "#666" }}>Keine Einträge.</div> : null}
      </div>
    </div>
  );
}

/* ---------------- Calendar ---------------- */

function CalendarPanel() {
  const [view, setView] = useState("month"); // "month" | "week"
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [selectedDay, setSelectedDay] = useState(() => new Date().toISOString().slice(0, 10)); // YYYY-MM-DD

  const [areas, setAreas] = useState([]);
  const [users, setUsers] = useState([]);

  const [areaFilter, setAreaFilter] = useState(""); // area_id
  const [userFilter, setUserFilter] = useState(""); // profile id (assignee_id)

  const [tasksByDay, setTasksByDay] = useState({});
  const [dayTasks, setDayTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dayLoading, setDayLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    loadAreas().then(setAreas).catch(() => setAreas([]));
    supabase
      .from("profiles")
      .select("id, name, email")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.warn("profiles load failed:", error.message);
          setUsers([]);
        } else {
          setUsers(data || []);
        }
      });
  }, []);

  const userById = useMemo(() => {
    const m = new Map();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  function startOfWeek(dateStr) {
    // Monday as start of week (de-DE)
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return new Date();
    const day = d.getDay(); // 0 Sun ... 6 Sat
    const diff = (day === 0 ? -6 : 1) - day; // move to Monday
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function dayKey(d) {
    return new Date(d).toISOString().slice(0, 10);
  }

  async function loadMonth() {
    setErr(null);
    setLoading(true);

    const [y, m] = month.split("-").map((x) => Number(x));
    const from = new Date(y, (m || 1) - 1, 1, 0, 0, 0, 0).toISOString();
    const to = new Date(y, (m || 1), 0, 23, 59, 59, 999).toISOString();

    let q = supabase
      .from("tasks")
      .select("id, title, area, area_id, due_at, status, assignee_id")
      .gte("due_at", from)
      .lte("due_at", to);

    // Filter: Bereich
    if (areaFilter) {
      const a = (areas || []).find((x) => x.id === areaFilter);
      if (a?.name) q = q.or(`area_id.eq.${areaFilter},area.ilike.${a.name}`);
      else q = q.eq("area_id", areaFilter);
    }

    // Filter: Nutzer (Assignee)
    if (userFilter) {
      q = q.eq("assignee_id", userFilter);
    }

    const { data, error } = await q.order("due_at", { ascending: true });

    if (error) {
      setErr(error.message);
      setTasksByDay({});
      setLoading(false);
      return;
    }

    const map = {};
    for (const t of data || []) {
      if (!t.due_at) continue;
      const k = new Date(t.due_at).toISOString().slice(0, 10);
      if (!map[k]) map[k] = [];
      map[k].push(t);
    }

    setTasksByDay(map);
    setLoading(false);
  }

  async function loadDay(dayStr) {
    setErr(null);
    setDayLoading(true);

    const from = startOfDayISO(dayStr);
    const to = endOfDayISO(dayStr);

    let q = supabase
      .from("tasks")
      .select("id, title, area, area_id, due_at, status, assignee_id")
      .gte("due_at", from)
      .lte("due_at", to);

    if (areaFilter) {
      const a = (areas || []).find((x) => x.id === areaFilter);
      if (a?.name) q = q.or(`area_id.eq.${areaFilter},area.ilike.${a.name}`);
      else q = q.eq("area_id", areaFilter);
    }
    if (userFilter) {
      q = q.eq("assignee_id", userFilter);
    }

    const { data, error } = await q.order("due_at", { ascending: true });

    if (error) {
      setErr(error.message);
      setDayTasks([]);
      setDayLoading(false);
      return;
    }

    setDayTasks(data || []);
    setDayLoading(false);
  }

  // Reload data when month/week or filters change
  useEffect(() => {
    loadMonth();
    // keep right panel in sync
    loadDay(selectedDay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, areaFilter, userFilter, areas.length]);

  useEffect(() => {
    loadDay(selectedDay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay]);

  // Month grid
  const monthGrid = useMemo(() => {
    const [y, m] = month.split("-").map((x) => Number(x));
    const first = new Date(y, (m || 1) - 1, 1);
    const last = new Date(y, (m || 1), 0);

    // Start from Monday
    const start = startOfWeek(first.toISOString());
    // End on Sunday
    const end = addDays(startOfWeek(addDays(last, 1).toISOString()), 7 - 1);

    const days = [];
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      days.push(new Date(d));
    }
    return days;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  // Week grid
  const weekStart = useMemo(() => startOfWeek(selectedDay), [selectedDay]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  function goPrev() {
    if (view === "week") {
      setSelectedDay(dayKey(addDays(weekStart, -7)));
      return;
    }
    const d = new Date(`${month}-01T00:00:00`);
    d.setMonth(d.getMonth() - 1);
    setMonth(d.toISOString().slice(0, 7));
  }

  function goNext() {
    if (view === "week") {
      setSelectedDay(dayKey(addDays(weekStart, 7)));
      return;
    }
    const d = new Date(`${month}-01T00:00:00`);
    d.setMonth(d.getMonth() + 1);
    setMonth(d.toISOString().slice(0, 7));
  }

  function onPickDay(d) {
    const k = dayKey(d);
    setSelectedDay(k);
    setMonth(k.slice(0, 7));
  }

  return (
    <div style={styles.panel}>
      <div style={styles.rowBetween}>
        <div style={styles.h3}>Kalender</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button style={styles.btn} onClick={() => setView("month")} disabled={view === "month"}>
              Monat
            </button>
            <button style={styles.btn} onClick={() => setView("week")} disabled={view === "week"}>
              Woche
            </button>
          </div>

          <button style={styles.btn} onClick={goPrev}>◀</button>

          {view === "month" ? (
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={styles.input}
              title="Monat wählen"
            />
          ) : (
            <input
              type="date"
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              style={styles.input}
              title="Woche (Datum) wählen"
            />
          )}

          <button style={styles.btn} onClick={goNext}>▶</button>

          <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} style={styles.input} title="Bereich filtern">
            <option value="">Alle Bereiche</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} style={styles.input} title="Nutzer filtern">
            <option value="">Alle Nutzer</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>

          <button style={styles.btn} onClick={() => { loadMonth(); loadDay(selectedDay); }} disabled={loading || dayLoading}>
            {loading || dayLoading ? "Lade…" : "Neu laden"}
          </button>
        </div>
      </div>

      {err ? <div style={styles.error}>Fehler: {err}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "1.65fr 1fr", gap: 14, marginTop: 12 }}>
        <div style={{ ...styles.card, padding: 12 }}>
          {view === "month" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 8 }}>
                {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((w) => (
                  <div key={w} style={{ fontWeight: 800, color: "#555", fontSize: 13, padding: "0 4px" }}>
                    {w}
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                {monthGrid.map((d) => {
                  const k = dayKey(d);
                  const inMonth = k.startsWith(month);
                  const items = tasksByDay[k] || [];
                  const isSel = k === selectedDay;

                  return (
                    <div
                      key={k}
                      onClick={() => onPickDay(d)}
                      style={{
                        border: "1px solid #d8e0ef",
                        borderRadius: 12,
                        padding: 10,
                        minHeight: 84,
                        background: isSel ? "#eef9f0" : inMonth ? "#fff" : "#f7f9ff",
                        cursor: "pointer",
                      }}
                      title={k}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontWeight: 800 }}>{d.getDate()}</div>
                        {items.length ? <div style={styles.badge}>{items.length}</div> : null}
                      </div>

                      {items.slice(0, 2).map((t) => (
                        <div key={t.id} style={{ marginTop: 6, fontSize: 12, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          • {t.title}
                        </div>
                      ))}
                      {items.length > 2 ? (
                        <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>+ {items.length - 2} mehr</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 8 }}>
                {weekDays.map((d) => {
                  const k = dayKey(d);
                  const items = tasksByDay[k] || [];
                  const isSel = k === selectedDay;
                  return (
                    <div
                      key={k}
                      onClick={() => onPickDay(d)}
                      style={{
                        border: "1px solid #d8e0ef",
                        borderRadius: 12,
                        padding: 10,
                        minHeight: 110,
                        background: isSel ? "#eef9f0" : "#fff",
                        cursor: "pointer",
                      }}
                      title={k}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontWeight: 800, fontSize: 13 }}>
                          {["So","Mo","Di","Mi","Do","Fr","Sa"][d.getDay()]} {d.getDate().toString().padStart(2, "0")}.{(d.getMonth()+1).toString().padStart(2, "0")}
                        </div>
                        {items.length ? <div style={styles.badge}>{items.length}</div> : null}
                      </div>

                      {items.slice(0, 3).map((t) => (
                        <div key={t.id} style={{ marginTop: 6, fontSize: 12, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          • {t.title}
                        </div>
                      ))}
                      {items.length > 3 ? (
                        <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>+ {items.length - 3} mehr</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div style={{ color: "#666", fontSize: 13 }}>
                Woche: {fmtDate(dayKey(weekStart))} – {fmtDate(dayKey(addDays(weekStart, 6)))}
              </div>
            </>
          )}

          {loading ? <div style={{ marginTop: 10, color: "#666" }}>Lade…</div> : null}
        </div>

        <div style={{ ...styles.card, padding: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={styles.h4}>Tag: {fmtDate(selectedDay)}</div>
            <button style={styles.btn} onClick={() => loadDay(selectedDay)} disabled={dayLoading}>
              {dayLoading ? "Lade…" : "Aktualisieren"}
            </button>
          </div>

          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {dayTasks.map((t) => {
              const a = t.area_id ? (areas || []).find((x) => x.id === t.area_id) : null;
              const areaName = a?.name || t.area || "–";
              const u = t.assignee_id ? userById.get(t.assignee_id) : null;
              const userName = u ? (u.name || u.email) : "–";
              return (
                <div key={t.id} style={{ border: "1px solid #d8e0ef", borderRadius: 12, padding: 10, background: "#fff" }}>
                  <div style={{ fontWeight: 800 }}>{t.title}</div>
                  <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
                    {t.due_at ? fmtDateTime(t.due_at) : "–"} · Bereich: {areaName} · Nutzer: {userName} · Status: {t.status ?? "todo"}
                  </div>
                </div>
              );
            })}
            {dayTasks.length === 0 && !dayLoading ? <div style={{ color: "#666" }}>Keine Aufgaben für diesen Tag.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}


/* ---------------- Main Component ---------------- */
export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("board");
  const [auth, setAuth] = useState({ user: null, profile: null, role: null, isAdmin: false, inactive: false });
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  async function refreshAuth() {
    setAuthLoading(true);
    setAuthError(null);

    try {
      const ctx = await loadMyAuthContext();
      setAuth(ctx);
    } catch (e) {
      console.error("Auth init failed:", e);
      setAuth({ user: null, profile: null, role: null, isAdmin: false, inactive: false });
      setAuthError(e?.message || String(e));
    } finally {
      setAuthLoading(false);
    }
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

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return (
      <div style={styles.page}>
        <div style={styles.panel}>
          <div style={styles.h3}>Konfiguration fehlt</div>
          <div>Bitte setze NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY.</div>
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

  if (auth.inactive) {
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
          

          <TabBtn active={activeTab === "areas"} onClick={() => setActiveTab("areas")}>
            Bereiche
          </TabBtn>

          {auth.isAdmin ? (
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

      {activeTab === "board" ? <TasksBoard isAdmin={auth.isAdmin} /> : null}
      {activeTab === "calendar" ? <CalendarPanel /> : null}
      {activeTab === "guides" ? <GuidesPanel isAdmin={auth.isAdmin} /> : null}
      {activeTab === "areas" ? <AreasPanel isAdmin={auth.isAdmin} /> : null}
      {activeTab === "users" ? <UsersAdminPanel isAdmin={auth.isAdmin} /> : null}

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
    gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1.2fr auto",
    gap: 10,
    alignItems: "start",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: 10,
    borderBottom: "1px solid #d8e0ef",
    fontSize: 13,
    color: "#555",
  },
  td: {
    padding: 10,
    borderBottom: "1px solid #eef2fb",
    verticalAlign: "top",
  },
};
