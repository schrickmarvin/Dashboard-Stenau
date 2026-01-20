from pathlib import Path

code = r'''// pages/dashboard.js
// Dashboard-Stenau-2026 (Single-file)
// Next.js (pages router) + React + Supabase
// Features: Tasks board, Calendar, Guides, Users (Admin), Areas (Admin), Area colors, Series task generator (client-side)

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

function isAdminCtx(auth, permissions) {
  const role = String(auth?.profile?.role || "").toLowerCase();
  return role === "admin" || can(permissions, "users.manage") || can(permissions, "areas.manage");
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

function toISOFromDateAndTime(dateStr, timeStr) {
  // dateStr: YYYY-MM-DD, timeStr: HH:mm
  if (!dateStr) return null;
  const t = (timeStr && /^\d{2}:\d{2}$/.test(timeStr)) ? timeStr : "08:00";
  const dt = new Date(`${dateStr}T${t}:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
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

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function addMonths(date, n) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + n);
  // If month rollover changed day (e.g., 31 -> 2), pull back to last day of month
  if (d.getDate() !== day) {
    d.setDate(0);
  }
  return d;
}

function toDateOnlyISO(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ---------------- RBAC: Load auth context ---------------- */
async function loadMyAuthContext() {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw userErr;
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

  // Permissions: try to read, but fail-soft if RLS blocks it (then permissions=[] => app works "open")
  const perms = [];

  const { data: rolePerms, error: rpErr } = await supabase
    .from("role_permissions")
    .select("permissions:permission_id ( key )")
    .eq("role_id", profile?.role_id ?? "");

  if (!rpErr) {
    for (const x of rolePerms ?? []) {
      const k = x?.permissions?.key;
      if (k) perms.push(k);
    }
  }

  const { data: userPerms, error: upErr } = await supabase
    .from("user_permissions")
    .select("allowed, permissions:permission_id ( key )")
    .eq("user_id", user.id);

  if (!upErr) {
    for (const x of userPerms ?? []) {
      if (x?.allowed) {
        const k = x?.permissions?.key;
        if (k) perms.push(k);
      }
    }
  }

  const permissions = Array.from(new Set(perms));
  return { user, profile: profile || null, permissions };
}

/* ---------------- Areas (Admin) ---------------- */
function AreasPanel({ auth, permissions, onAreasChanged }) {
  const admin = isAdminCtx(auth, permissions);

  const [areas, setAreas] = useState([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#0b6b2a");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function load() {
    setErr(null);
    setLoading(true);

    // Your schema: areas(id, name UNIQUE, color)
    const { data, error } = await supabase
      .from("areas")
      .select("id, name, color, created_at")
      .order("created_at", { ascending: true });

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
    if (!admin) return;
    const n = name.trim();
    if (!n) return;

    setErr(null);

    const { error } = await supabase.from("areas").insert({
      name: n,
      color: color || null,
    });

    if (error) {
      // Friendly duplicate error
      if (String(error.message || "").toLowerCase().includes("duplicate")) {
        setErr("Bereich existiert bereits (Name ist eindeutig).");
      } else {
        setErr(error.message);
      }
      return;
    }

    setName("");
    setColor("#0b6b2a");
    await load();
    onAreasChanged?.();
  }

  async function updateArea(id, patch) {
    if (!admin) return;
    setErr(null);

    const { error } = await supabase.from("areas").update(patch).eq("id", id);
    if (error) {
      if (String(error.message || "").toLowerCase().includes("duplicate")) {
        setErr("Bereich existiert bereits (Name ist eindeutig).");
      } else {
        setErr(error.message);
      }
      return;
    }

    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    onAreasChanged?.();
  }

  async function deleteArea(id) {
    if (!admin) return;
    setErr(null);

    const ok = window.confirm("Bereich wirklich löschen?");
    if (!ok) return;

    const { error } = await supabase.from("areas").delete().eq("id", id);
    if (error) {
      setErr(error.message);
      return;
    }

    setAreas((prev) => prev.filter((a) => a.id !== id));
    onAreasChanged?.();
  }

  if (!admin) {
    return (
      <div style={styles.panel}>
        <div style={styles.h3}>Bereiche</div>
        <div>Du hast keine Berechtigung, Bereiche zu bearbeiten.</div>
        <div style={{ marginTop: 10 }}>
          <button style={styles.btn} onClick={load} disabled={loading}>
            {loading ? "Lade…" : "Neu laden"}
          </button>
        </div>
      </div>
    );
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

      <div style={{ ...styles.card, marginBottom: 14 }}>
        <div style={styles.h4}>Neuen Bereich anlegen</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 220px auto", gap: 10, alignItems: "center" }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (z.B. 1, 2, Gewerbemüll, Papier …)"
            style={styles.input}
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            title="Farbe"
            style={{ ...styles.input, padding: 6, height: 42 }}
          />
          <button style={styles.btnPrimary} onClick={createArea}>
            Anlegen
          </button>
        </div>

        <div style={{ marginTop: 8, color: "#666", fontSize: 13 }}>
          Hinweis: In Aufgaben ist der Bereich frei eintippbar. Wenn der Text genau zu einem Bereich passt (case-insensitive),
          wird automatisch die Farbe gezogen.
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Farbe</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => (
              <tr key={a.id}>
                <td style={styles.td}>
                  <input
                    value={a.name ?? ""}
                    onChange={(e) => updateArea(a.id, { name: e.target.value })}
                    style={styles.input}
                  />
                </td>
                <td style={styles.td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="color"
                      value={a.color || "#0b6b2a"}
                      onChange={(e) => updateArea(a.id, { color: e.target.value })}
                      style={{ ...styles.input, padding: 6, height: 42, width: 80, minWidth: 80 }}
                    />
                    <div style={{ fontFamily: "monospace", color: "#666" }}>{a.color || "—"}</div>
                  </div>
                </td>
                <td style={styles.td}>
                  <button style={styles.btnDanger} onClick={() => deleteArea(a.id)}>
                    Löschen
                  </button>
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
    </div>
  );
}

/* ---------------- Admin Users Panel ---------------- */
function UsersAdminPanel({ auth, permissions }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const admin = isAdminCtx(auth, permissions) || can(permissions, "users.manage");

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
    if (admin) load();
  }, [admin]);

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

  if (!admin) {
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
function GuidesPanel({ permissions }) {
  const [guides, setGuides] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const canRead = can(permissions, "guides.read") || permissions.length === 0;
  const canWrite = can(permissions, "guides.write") || permissions.length === 0;

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
function TasksBoard({ permissions, areas, onAreasChanged }) {
  const [tasks, setTasks] = useState([]);
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const [form, setForm] = useState({
    title: "",
    area: "",
    due_at: "",
    status: "todo",
    guideIds: [],
  });

  // Series UI (global)
  const [seriesEnabled, setSeriesEnabled] = useState(false);
  const [seriesType, setSeriesType] = useState("WEEKLY"); // DAILY | WEEKLY | MONTHLY
  const [seriesInterval, setSeriesInterval] = useState(1);
  const [seriesWeekdays, setSeriesWeekdays] = useState([1]); // 1=Mo .. 7=So
  const [seriesStart, setSeriesStart] = useState(() => toDateOnlyISO(new Date()));
  const [seriesTime, setSeriesTime] = useState("08:00");
  const [seriesCount, setSeriesCount] = useState(5);

  const canRead = can(permissions, "tasks.read") || permissions.length === 0;
  const canWrite = can(permissions, "tasks.write") || permissions.length === 0;

  const areaMap = useMemo(() => {
    const m = new Map();
    for (const a of areas ?? []) {
      if (a?.name) m.set(String(a.name).toLowerCase(), a.color || null);
    }
    return m;
  }, [areas]);

  function areaColor(areaText) {
    if (!areaText) return null;
    return areaMap.get(String(areaText).trim().toLowerCase()) || null;
  }

  async function loadAll() {
    setErr(null);
    setLoading(true);

    // IMPORTANT: do NOT select columns that do not exist (e.g., 'notes')
    const { data: tData, error: tErr } = await supabase
      .from("tasks")
      .select(
        "id, title, area, due_at, status, is_series, series_id, series_parent_id, created_at, task_guides ( guide_id )"
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

  function onGuideSelect(e) {
    const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
    setForm((f) => ({ ...f, guideIds: selected }));
  }

  async function linkGuides(taskId, guideIds) {
    if (!taskId) return;
    if (!Array.isArray(guideIds) || guideIds.length === 0) return;

    const rows = guideIds.map((gid) => ({ task_id: taskId, guide_id: gid }));
    const { error: linkErr } = await supabase.from("task_guides").insert(rows);
    if (linkErr) {
      console.warn("task_guides insert failed:", linkErr.message);
    }
  }

  async function createTaskSingle() {
    if (!canWrite) return;
    if (!form.title.trim()) return;

    setErr(null);

    const payload = {
      title: form.title.trim(),
      area: (form.area || "").trim() || null,
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

    await linkGuides(inserted?.id, form.guideIds);

    setForm({ title: "", area: "", due_at: "", status: "todo", guideIds: [] });
    loadAll();
  }

  function buildSeriesDates() {
    const start = new Date(`${seriesStart}T00:00:00`);
    if (Number.isNaN(start.getTime())) return [];

    const interval = Math.max(1, Number(seriesInterval) || 1);
    const count = Math.max(1, Math.min(200, Number(seriesCount) || 1)); // hard cap

    const dates = [];

    if (seriesType === "DAILY") {
      let d = start;
      for (let i = 0; i < count; i++) {
        dates.push(new Date(d));
        d = addDays(d, interval);
      }
      return dates;
    }

    if (seriesType === "MONTHLY") {
      let d = start;
      for (let i = 0; i < count; i++) {
        dates.push(new Date(d));
        d = addMonths(d, interval);
      }
      return dates;
    }

    // WEEKLY (default)
    // seriesWeekdays: 1..7 (Mo..So)
    const wdSet = new Set((seriesWeekdays || []).map((x) => Number(x)).filter((x) => x >= 1 && x <= 7));
    if (wdSet.size === 0) wdSet.add(1);

    let d = new Date(start);
    // iterate day-by-day until we have enough
    // Respect interval weeks: allow days only in weeks that are (weekIndex % interval === 0)
    // weekIndex: 0 for week containing start date
    const startWeekStart = new Date(start);
    // Move to Monday of that week
    const jsDay = startWeekStart.getDay(); // 0=So..6=Sa
    const offsetToMonday = (jsDay === 0) ? -6 : (1 - jsDay);
    startWeekStart.setDate(startWeekStart.getDate() + offsetToMonday);

    while (dates.length < count) {
      const curWeekStart = new Date(d);
      const curJsDay = curWeekStart.getDay();
      const curOffsetToMonday = (curJsDay === 0) ? -6 : (1 - curJsDay);
      curWeekStart.setDate(curWeekStart.getDate() + curOffsetToMonday);

      const weekIndex = Math.round((curWeekStart - startWeekStart) / (7 * 24 * 3600 * 1000));
      const inAllowedWeek = weekIndex % interval === 0;

      // convert JS day to 1..7 (Mo..So)
      const wd = d.getDay() === 0 ? 7 : d.getDay();
      if (inAllowedWeek && wdSet.has(wd)) {
        dates.push(new Date(d));
      }

      d = addDays(d, 1);
      if (dates.length > 1000) break;
    }
    return dates;
  }

  async function createSeriesNow() {
    if (!canWrite) return;
    if (!form.title.trim()) return;

    setErr(null);

    const title = form.title.trim();
    const area = (form.area || "").trim() || null;
    const status = form.status || "todo";

    const dates = buildSeriesDates();
    if (dates.length === 0) {
      setErr("Serien-Startdatum ist ungültig.");
      return;
    }

    // Create a master template (optional, used for reference)
    const masterPayload = {
      title,
      area,
      status,
      is_series: true,
      series_rule: seriesType,
      series_interval: Math.max(1, Number(seriesInterval) || 1),
      series_weekdays: seriesType === "WEEKLY" ? seriesWeekdays : null,
      due_at: toISOFromDateAndTime(seriesStart, seriesTime),
    };

    const { data: master, error: mErr } = await supabase
      .from("tasks")
      .insert(masterPayload)
      .select("id")
      .single();

    if (mErr) {
      setErr(mErr.message);
      return;
    }

    const masterId = master?.id;

    // Insert generated instances
    const rows = dates.map((d) => ({
      title,
      area,
      status,
      is_series: false,
      series_id: masterId,
      series_parent_id: masterId,
      due_at: toISOFromDateAndTime(toDateOnlyISO(d), seriesTime),
    }));

    const { error: insErr } = await supabase.from("tasks").insert(rows);
    if (insErr) {
      setErr(insErr.message);
      return;
    }

    // Link guides to master (and optionally to children) — keep it simple: link to master only
    await linkGuides(masterId, form.guideIds);

    // Reset
    setSeriesEnabled(false);
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

  async function deleteTask(task) {
    if (!canWrite) return;
    const ok = window.confirm("Aufgabe wirklich löschen?");
    if (!ok) return;

    setErr(null);

    // Delete links first (if exists)
    await supabase.from("task_guides").delete().eq("task_id", task.id);

    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) {
      setErr(error.message);
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
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
            disabled={!canWrite}
          />

          <div style={{ display: "grid" }}>
            <input
              value={form.area}
              onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
              placeholder="Bereich"
              style={styles.input}
              disabled={!canWrite}
              list="areas-datalist"
            />
            <datalist id="areas-datalist">
              {(areas ?? []).map((a) => (
                <option key={a.id} value={a.name} />
              ))}
            </datalist>
          </div>

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

          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start", gap: 10 }}>
            <button style={styles.btnPrimary} onClick={createTaskSingle} disabled={!canWrite || seriesEnabled}>
              Anlegen
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800 }}>
            <input
              type="checkbox"
              checked={seriesEnabled}
              onChange={(e) => setSeriesEnabled(e.target.checked)}
              disabled={!canWrite}
            />
            Serienaufgabe (global)
          </label>

          {seriesEnabled ? (
            <>
              <select
                value={seriesType}
                onChange={(e) => setSeriesType(e.target.value)}
                style={styles.input}
              >
                <option value="DAILY">Täglich</option>
                <option value="WEEKLY">Wöchentlich</option>
                <option value="MONTHLY">Monatlich</option>
              </select>

              <input
                value={seriesInterval}
                onChange={(e) => setSeriesInterval(e.target.value)}
                style={{ ...styles.input, width: 90, minWidth: 90 }}
                type="number"
                min="1"
                title="Intervall"
              />

              {seriesType === "WEEKLY" ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {[
                    { k: 1, t: "Mo" },
                    { k: 2, t: "Di" },
                    { k: 3, t: "Mi" },
                    { k: 4, t: "Do" },
                    { k: 5, t: "Fr" },
                    { k: 6, t: "Sa" },
                    { k: 7, t: "So" },
                  ].map((w) => {
                    const on = seriesWeekdays.includes(w.k);
                    return (
                      <button
                        key={w.k}
                        type="button"
                        onClick={() => {
                          setSeriesWeekdays((prev) => {
                            const set = new Set(prev);
                            if (set.has(w.k)) set.delete(w.k);
                            else set.add(w.k);
                            const next = Array.from(set).sort((a, b) => a - b);
                            return next.length ? next : [1];
                          });
                        }}
                        style={{
                          ...styles.weekBtn,
                          ...(on ? styles.weekBtnOn : null),
                        }}
                        title="Wochentag"
                      >
                        {w.t}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <input
                type="date"
                value={seriesStart}
                onChange={(e) => setSeriesStart(e.target.value)}
                style={styles.input}
                title="Start"
              />

              <input
                type="time"
                value={seriesTime}
                onChange={(e) => setSeriesTime(e.target.value)}
                style={{ ...styles.input, width: 120, minWidth: 120 }}
                title="Uhrzeit"
              />

              <input
                value={seriesCount}
                onChange={(e) => setSeriesCount(e.target.value)}
                style={{ ...styles.input, width: 110, minWidth: 110 }}
                type="number"
                min="1"
                max="200"
                title="Anzahl"
              />

              <button style={styles.btn} onClick={createSeriesNow} disabled={!canWrite}>
                Serien jetzt erzeugen
              </button>
            </>
          ) : null}
        </div>

        <div style={{ color: "#666", fontSize: 13, marginTop: 10 }}>
          Hinweis: Farben greifen automatisch, wenn der Bereich-Text exakt (case-insensitive) zu einem Eintrag in „Bereiche“ passt.
        </div>
      </div>

      <div style={styles.columns}>
        <TaskColumn
          title="Zu erledigen"
          count={columns.todo.length}
          tasks={columns.todo}
          onToggle={toggleStatus}
          onDelete={deleteTask}
          getAreaColor={areaColor}
        />
        <TaskColumn
          title="Erledigt"
          count={columns.done.length}
          tasks={columns.done}
          onToggle={toggleStatus}
          onDelete={deleteTask}
          getAreaColor={areaColor}
        />
      </div>
    </div>
  );
}

function TaskColumn({ title, count, tasks, onToggle, onDelete, getAreaColor }) {
  return (
    <div style={styles.col}>
      <div style={styles.colHeader}>
        <div style={styles.h3}>{title}</div>
        <div style={styles.badge}>{count}</div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {tasks.map((t) => {
          const c = getAreaColor?.(t.area);
          return (
            <div
              key={t.id}
              style={{
                ...styles.card,
                borderLeft: c ? `10px solid ${c}` : styles.card.border,
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={styles.h4}>{t.title}</div>
                <span style={styles.pill}>{t.status === "done" ? "done" : "todo"}</span>

                {t.is_series ? (
                  <span style={styles.pillSeries} title="Serien-Master (Vorlage)">
                    Serie Master
                  </span>
                ) : t.series_parent_id ? (
                  <span style={styles.pillSeries} title="Serien-Instanz (aus Vorlage erzeugt)">
                    Serie
                  </span>
                ) : null}

                <button style={{ ...styles.btn, marginLeft: "auto" }} onClick={() => onToggle(t)}>
                  Status
                </button>
                <button style={styles.btnDanger} onClick={() => onDelete(t)}>
                  Löschen
                </button>
              </div>

              <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
                Bereich: {t.area ?? "–"} · Fällig: {t.due_at ? fmtDateTime(t.due_at) : "–"}
              </div>

              <div style={{ marginTop: 10, color: "#666", fontSize: 13 }}>
                Unteraufgaben 0/0
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
function CalendarPanel({ permissions, areas }) {
  const canRead = can(permissions, "calendar.read") || permissions.length === 0;

  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const areaMap = useMemo(() => {
    const m = new Map();
    for (const a of areas ?? []) {
      if (a?.name) m.set(String(a.name).toLowerCase(), a.color || null);
    }
    return m;
  }, [areas]);

  function areaColor(areaText) {
    if (!areaText) return null;
    return areaMap.get(String(areaText).trim().toLowerCase()) || null;
  }

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
        {tasks.map((t) => {
          const c = areaColor(t.area);
          return (
            <div
              key={t.id}
              style={{
                ...styles.card,
                borderLeft: c ? `10px solid ${c}` : styles.card.border,
              }}
            >
              <div style={styles.h4}>{t.title}</div>
              <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
                {t.due_at ? fmtDateTime(t.due_at) : "–"} · Bereich: {t.area ?? "–"} · Status: {t.status ?? "todo"}
              </div>
            </div>
          );
        })}
        {tasks.length === 0 ? <div style={{ color: "#666" }}>Keine Aufgaben für {fmtDate(date)}.</div> : null}
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

  const [areas, setAreas] = useState([]);

  async function loadAreas() {
    const { data, error } = await supabase
      .from("areas")
      .select("id, name, color, created_at")
      .order("created_at", { ascending: true });

    if (!error) setAreas(data ?? []);
  }

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
    loadAreas();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refreshAuth();
      loadAreas();
    });

    return () => {
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  const permissions = auth.permissions || [];
  const admin = isAdminCtx(auth, permissions);

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
          <TabBtn active={activeTab === "board"} onClick={() => setActiveTab("board")}>
            Planke
          </TabBtn>
          <TabBtn active={activeTab === "calendar"} onClick={() => setActiveTab("calendar")}>
            Kalender
          </TabBtn>
          <TabBtn active={activeTab === "guides"} onClick={() => setActiveTab("guides")}>
            Anleitungen
          </TabBtn>

          {admin ? (
            <TabBtn active={activeTab === "areas"} onClick={() => setActiveTab("areas")}>
              Bereiche
            </TabBtn>
          ) : null}

          {admin ? (
            <TabBtn active={activeTab === "users"} onClick={() => setActiveTab("users")}>
              Nutzer
            </TabBtn>
          ) : null}

          <button style={styles.btn} onClick={() => { refreshAuth(); loadAreas(); }}>
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

      {authError ? (
        <div style={{ ...styles.panel, ...styles.error }}>
          Fehler: {authError}
        </div>
      ) : null}

      {activeTab === "board" ? (
        <TasksBoard permissions={permissions} areas={areas} onAreasChanged={loadAreas} />
      ) : null}
      {activeTab === "calendar" ? <CalendarPanel permissions={permissions} areas={areas} /> : null}
      {activeTab === "guides" ? <GuidesPanel permissions={permissions} /> : null}
      {activeTab === "areas" ? (
        <AreasPanel auth={auth} permissions={permissions} onAreasChanged={loadAreas} />
      ) : null}
      {activeTab === "users" ? <UsersAdminPanel auth={auth} permissions={permissions} /> : null}

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
    fontWeight: 700,
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
    fontWeight: 900,
    marginBottom: 10,
  },
  h4: {
    fontSize: 16,
    fontWeight: 900,
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
    fontWeight: 800,
    color: "#333",
  },
  pill: {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid #d8e0ef",
    background: "#f7f9ff",
    fontWeight: 800,
  },
  pillSeries: {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px dashed #d8e0ef",
    background: "#fff",
    fontWeight: 900,
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
    fontWeight: 800,
  },
  btnPrimary: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #0b6b2a",
    background: "#0b6b2a",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 900,
  },
  btnDanger: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #ffd2d2",
    background: "#fff3f3",
    color: "#a40000",
    cursor: "pointer",
    fontWeight: 900,
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
    borderCollapse: "separate",
    borderSpacing: 0,
  },
  th: {
    textAlign: "left",
    padding: "10px 10px",
    borderBottom: "1px solid #e6edf8",
    color: "#555",
    fontWeight: 900,
    fontSize: 13,
  },
  td: {
    padding: "10px 10px",
    borderBottom: "1px solid #f0f4fc",
    verticalAlign: "top",
  },
  weekBtn: {
    border: "1px solid #d8e0ef",
    background: "#fff",
    padding: "8px 10px",
    borderRadius: 999,
    cursor: "pointer",
    fontWeight: 900,
    minWidth: 44,
  },
  weekBtnOn: {
    background: "#0b6b2a",
    borderColor: "#0b6b2a",
    color: "#fff",
  },
};
'''

out_path = Path("/mnt/data/dashboard.js")
out_path.write_text(code, encoding="utf-8")
str(out_path)
