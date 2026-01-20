// pages/dashboard.js
// Dashboard-Stenau – Final (CRUD + freie Bereiche + Admin-Bereiche + farbige Unteraufgaben + Serien global)
//
// Voraussetzungen (SQL):
// - areas: id, name (unique), color
// - tasks: id, title, area (text), area_id (uuid fk areas.id), due_at, due_date, due_day, status, created_at,
//         is_series, series_rule, series_interval, series_weekdays (int[] 1..7), series_until, series_parent_id, series_id
// - subtasks: id, task_id, title, is_done, color
// - RLS: tasks/subtasks write for authenticated; areas read for authenticated, write admin-only
// - Admin: profiles.role = 'admin'
//
// Serien GLOBAL: wir speichern am Master user_id/created_by = NULL (global) und Generator erzeugt Kinder ebenfalls global.

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ---------------- Supabase ---------------- */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL || "", SUPABASE_ANON_KEY || "");

/* ---------------- Helpers ---------------- */
function fmtDateTime(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeStr(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function normalizeName(v) {
  return safeStr(v).trim().toLowerCase();
}

function colorDotStyle(color) {
  return {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: color || "#6b7280",
    display: "inline-block",
  };
}

function areaBadgeStyle(color) {
  const c = color || "#6b7280";
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 10px",
    borderRadius: 999,
    background: c,
    color: "#fff",
    fontWeight: 900,
    fontSize: 12,
    lineHeight: "16px",
  };
}

async function generateSeries(daysAhead = 60) {
  const { data, error } = await supabase.rpc("generate_series_tasks", {
    days_ahead: daysAhead,
  });
  if (error) throw error;
  return data; // int created_count
}

/* ---------------- Auth ---------------- */
async function loadMyAuthContext() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const user = data?.user || null;
  if (!user) return { user: null, profile: null };

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, email, name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (pErr) throw pErr;
  return { user, profile: profile || null };
}

function isAdmin(profile) {
  return normalizeName(profile?.role) === "admin";
}

/* ---------------- Areas (Admin-only edit) ---------------- */
function AreasPanel({ admin, onAreasChanged }) {
  const [areas, setAreas] = useState([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6b7280");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function load() {
    setErr(null);
    setLoading(true);
    const { data, error } = await supabase
      .from("areas")
      .select("id, name, color, created_at")
      .order("name", { ascending: true });
    if (error) setErr(error.message);
    setAreas(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function upsertArea() {
    if (!admin) return;
    const n = name.trim();
    if (!n) return;

    setErr(null);
    const { error } = await supabase.from("areas").upsert({ name: n, color });
    if (error) {
      setErr(error.message);
      return;
    }
    setName("");
    setColor("#6b7280");
    await load();
    onAreasChanged?.();
  }

  async function updateArea(id, patch) {
    if (!admin) return;
    setErr(null);
    const { error } = await supabase.from("areas").update(patch).eq("id", id);
    if (error) {
      setErr(error.message);
      return;
    }
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    onAreasChanged?.();
  }

  async function deleteArea(id) {
    if (!admin) return;
    const ok = window.confirm(
      "Bereich wirklich löschen?\n\nHinweis: Aufgaben mit diesem Bereich verlieren ggf. ihre Farbzuteilung."
    );
    if (!ok) return;

    setErr(null);
    const { error } = await supabase.from("areas").delete().eq("id", id);
    if (error) {
      setErr(error.message);
      return;
    }
    setAreas((prev) => prev.filter((a) => a.id !== id));
    onAreasChanged?.();
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

      {!admin ? (
        <div style={{ color: "#666", marginTop: 10 }}>
          Du kannst Bereiche ansehen, aber nur Admin darf Bereiche anlegen/ändern/löschen.
        </div>
      ) : (
        <div style={{ ...styles.card, marginTop: 10, marginBottom: 12 }}>
          <div style={styles.h4}>Bereich anlegen / aktualisieren</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px auto", gap: 10 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (z.B. Papier)"
              style={styles.input}
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{ ...styles.input, padding: 4, height: 42 }}
              title="Farbe"
            />
            <button style={styles.btnPrimary} onClick={upsertArea}>
              Speichern
            </button>
          </div>
          <div style={{ marginTop: 8, color: "#666", fontSize: 13 }}>
            Tipp: Wenn der Name schon existiert, wird nur die Farbe aktualisiert (kein Duplicate-Fehler).
          </div>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Farbe</th>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Erstellt</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => (
              <tr key={a.id}>
                <td style={styles.td}>
                  <span style={colorDotStyle(a.color)} />
                </td>
                <td style={styles.td}>
                  {admin ? (
                    <input
                      value={a.name ?? ""}
                      onChange={(e) => updateArea(a.id, { name: e.target.value })}
                      style={styles.input}
                    />
                  ) : (
                    <span>{a.name}</span>
                  )}
                </td>
                <td style={styles.td}>{a.created_at ? fmtDateTime(a.created_at) : "–"}</td>
                <td style={styles.td}>
                  {admin ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="color"
                        value={a.color || "#6b7280"}
                        onChange={(e) => updateArea(a.id, { color: e.target.value })}
                        style={{ height: 34, width: 46, padding: 2 }}
                        title="Farbe ändern"
                      />
                      <button style={styles.btn} onClick={() => deleteArea(a.id)}>
                        Löschen
                      </button>
                    </div>
                  ) : (
                    <span style={{ color: "#999" }}>—</span>
                  )}
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
    </div>
  );
}

/* ---------------- Subtasks CRUD (colored) ---------------- */
function SubtasksPanel({ taskId, onChanged }) {
  const [subs, setSubs] = useState([]);
  const [title, setTitle] = useState("");
  const [color, setColor] = useState("#6b7280");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function load() {
    setErr(null);
    setLoading(true);
    const { data, error } = await supabase
      .from("subtasks")
      .select("id, task_id, title, is_done, color, created_at, updated_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    if (error) setErr(error.message);
    setSubs(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [taskId]);

  async function add() {
    const t = title.trim();
    if (!t) return;

    setErr(null);
    const { error } = await supabase.from("subtasks").insert({
      task_id: taskId,
      title: t,
      color,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    setTitle("");
    setColor("#6b7280");
    await load();
    onChanged?.();
  }

  async function toggleDone(s) {
    setErr(null);
    const { error } = await supabase
      .from("subtasks")
      .update({ is_done: !s.is_done, updated_at: new Date().toISOString() })
      .eq("id", s.id);
    if (error) {
      setErr(error.message);
      return;
    }
    await load();
    onChanged?.();
  }

  async function rename(id, nextTitle) {
    setErr(null);
    const t = nextTitle.trim();
    const { error } = await supabase
      .from("subtasks")
      .update({ title: t, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) setErr(error.message);
    setSubs((prev) => prev.map((x) => (x.id === id ? { ...x, title: t } : x)));
    onChanged?.();
  }

  async function recolor(id, nextColor) {
    setErr(null);
    const { error } = await supabase
      .from("subtasks")
      .update({ color: nextColor, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) setErr(error.message);
    setSubs((prev) => prev.map((x) => (x.id === id ? { ...x, color: nextColor } : x)));
    onChanged?.();
  }

  async function remove(id) {
    const ok = window.confirm("Unteraufgabe wirklich löschen?");
    if (!ok) return;

    setErr(null);
    const { error } = await supabase.from("subtasks").delete().eq("id", id);
    if (error) {
      setErr(error.message);
      return;
    }
    setSubs((prev) => prev.filter((x) => x.id !== id));
    onChanged?.();
  }

  const doneCount = subs.filter((s) => s.is_done).length;
  const total = subs.length;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 13, color: "#666", fontWeight: 900 }}>
          Unteraufgaben {doneCount}/{total}
        </div>
        <button style={styles.btn} onClick={load} disabled={loading}>
          {loading ? "…" : "Reload"}
        </button>
      </div>

      {err ? <div style={{ ...styles.error, marginTop: 10 }}>{err}</div> : null}

      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        {subs.map((s) => (
          <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={!!s.is_done} onChange={() => toggleDone(s)} />
            <span style={colorDotStyle(s.color)} />
            <input
              value={s.title ?? ""}
              onChange={(e) => rename(s.id, e.target.value)}
              style={{ ...styles.input, minWidth: 0 }}
            />
            <input
              type="color"
              value={s.color || "#6b7280"}
              onChange={(e) => recolor(s.id, e.target.value)}
              style={{ height: 34, width: 46, padding: 2 }}
              title="Farbe"
            />
            <button style={styles.btn} onClick={() => remove(s.id)}>
              Löschen
            </button>
          </div>
        ))}

        {subs.length === 0 ? <div style={{ color: "#999", fontSize: 13 }}>Noch keine Unteraufgaben.</div> : null}
      </div>

      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px auto", gap: 10, alignItems: "center" }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Neue Unteraufgabe"
            style={styles.input}
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ ...styles.input, padding: 4, height: 42 }}
            title="Farbe"
          />
          <button style={styles.btnPrimary} onClick={add}>
            Hinzufügen
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Tasks Board (CRUD + Serien) ---------------- */
function TasksBoard({ areas, permissions }) {
  const canRead = true; // RLS regelt; UI offen
  const canWrite = true;

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  // Create form
  const [form, setForm] = useState({
    title: "",
    area: "",
    due_at: "",
    status: "todo",
    notes: "",
  });

  // Serien
  const [isSeries, setIsSeries] = useState(false);
  const [seriesRule, setSeriesRule] = useState("weekly"); // weekly | monthly
  const [seriesInterval, setSeriesInterval] = useState(1);
  const [seriesWeekdays, setSeriesWeekdays] = useState([1, 2, 3, 4, 5]); // Mo-Fr
  const [seriesUntil, setSeriesUntil] = useState("");
  const [seriesDaysAhead, setSeriesDaysAhead] = useState(60);

  const [openTaskId, setOpenTaskId] = useState(null);

  const weekdayLabels = [
    { v: 1, t: "Mo" },
    { v: 2, t: "Di" },
    { v: 3, t: "Mi" },
    { v: 4, t: "Do" },
    { v: 5, t: "Fr" },
    { v: 6, t: "Sa" },
    { v: 7, t: "So" },
  ];

  function toggleWeekday(v) {
    setSeriesWeekdays((prev) => {
      const s = new Set(prev);
      if (s.has(v)) s.delete(v);
      else s.add(v);
      return Array.from(s).sort((a, b) => a - b);
    });
  }

  const areaByName = useMemo(() => {
    const m = new Map();
    for (const a of areas || []) m.set(normalizeName(a.name), a);
    return m;
  }, [areas]);

  async function loadAll() {
    setErr(null);
    setLoading(true);

    // NOTE: Wir zeigen auch Master-Serien (is_series=true) im Board oben (als "Serie"),
    // damit man sie bearbeiten/stoppen könnte. Wenn du sie ausblenden willst -> filter.
    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, area, area_id, status, due_at, due_date, created_at, is_series, series_rule, series_interval, series_weekdays, series_until")
      .order("created_at", { ascending: false });

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    setTasks(data || []);
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

    // Serien GLOBAL: created_by/user_id = null
    const payload = {
      title: form.title.trim(),
      area: form.area ? form.area.trim() : null,
      area_id: null, // Trigger kann setzen
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      due_date: form.due_at ? new Date(form.due_at).toISOString().slice(0, 10) : null,
      status: form.status || "todo",
      notes: form.notes || null,

      is_series: !!isSeries,
      series_rule: isSeries ? seriesRule : null,
      series_interval: isSeries ? Math.max(1, Number(seriesInterval) || 1) : 1,
      series_weekdays: isSeries && seriesRule === "weekly" ? seriesWeekdays : null,
      series_until: isSeries && seriesUntil ? new Date(seriesUntil + "T00:00:00").toISOString() : null,

      created_by: null,
      user_id: null,
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

    // Reset
    setForm({ title: "", area: "", due_at: "", status: "todo", notes: "" });
    setIsSeries(false);
    setSeriesRule("weekly");
    setSeriesInterval(1);
    setSeriesWeekdays([1, 2, 3, 4, 5]);
    setSeriesUntil("");

    // Wenn Serie: direkt erzeugen
    if (payload.is_series) {
      try {
        await generateSeries(seriesDaysAhead);
      } catch (e) {
        console.warn("generateSeries failed:", e?.message || e);
      }
    }

    loadAll();
  }

  async function updateTask(id, patch) {
    setErr(null);
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) {
      setErr(error.message);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function toggleDone(task) {
    const next = (task.status ?? "todo") === "done" ? "todo" : "done";
    await updateTask(task.id, { status: next });
  }

  async function deleteTask(id) {
    const ok = window.confirm(
      "Aufgabe wirklich löschen?\n\nHinweis: Unteraufgaben bleiben ggf. bestehen, wenn kein FK-Cascade aktiv ist."
    );
    if (!ok) return;

    setErr(null);
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      setErr(error.message);
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (openTaskId === id) setOpenTaskId(null);
  }

  function renderSeriesChip(t) {
    if (!t.is_series) return null;
    const rule = t.series_rule === "monthly" ? "Monatlich" : "Wöchentlich";
    const interval = Math.max(1, Number(t.series_interval || 1));
    let extra = "";
    if (t.series_rule === "weekly" && Array.isArray(t.series_weekdays)) {
      extra = ` · ${t.series_weekdays.join(",")}`;
    }
    return (
      <span style={{ ...styles.pill, borderColor: "#0b6b2a", fontWeight: 900 }}>
        Serie: {rule} · Intervall {interval}
        {extra}
      </span>
    );
  }

  function renderTaskCard(t) {
    const areaMatch = areaByName.get(normalizeName(t.area));
    const badge = areaMatch ? (
      <span style={areaBadgeStyle(areaMatch.color)}>{areaMatch.name}</span>
    ) : t.area ? (
      <span style={areaBadgeStyle("#6b7280")}>{t.area}</span>
    ) : (
      <span style={{ color: "#999", fontSize: 13 }}>— kein Bereich —</span>
    );

    return (
      <div key={t.id} style={styles.card}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={t.title ?? ""}
            onChange={(e) => updateTask(t.id, { title: e.target.value })}
            style={{ ...styles.input, fontWeight: 900, flex: 1, minWidth: 260 }}
          />

          {renderSeriesChip(t)}

          <button style={styles.btn} onClick={() => toggleDone(t)}>
            Status
          </button>
          <button style={styles.btn} onClick={() => deleteTask(t.id)}>
            Löschen
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          <div>{badge}</div>

          <input
            list="areas-suggestions"
            value={t.area ?? ""}
            onChange={(e) => updateTask(t.id, { area: e.target.value })}
            placeholder="Bereich (frei eintippbar)"
            style={{ ...styles.input, minWidth: 220, width: 260 }}
          />

          <input
            type="datetime-local"
            value={t.due_at ? new Date(t.due_at).toISOString().slice(0, 16) : ""}
            onChange={(e) =>
              updateTask(t.id, { due_at: e.target.value ? new Date(e.target.value).toISOString() : null })
            }
            style={{ ...styles.input, width: 220 }}
          />

          <div style={{ color: "#666", fontSize: 13 }}>
            Erstellt: {fmtDateTime(t.created_at)} {t.due_at ? `· Fällig: ${fmtDateTime(t.due_at)}` : ""}
          </div>

          <button
            style={{ ...styles.btn, marginLeft: "auto" }}
            onClick={() => setOpenTaskId(openTaskId === t.id ? null : t.id)}
          >
            {openTaskId === t.id ? "Unteraufgaben schließen" : "Unteraufgaben"}
          </button>
        </div>

        {openTaskId === t.id ? <SubtasksPanel taskId={t.id} onChanged={loadAll} /> : null}
      </div>
    );
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
      <datalist id="areas-suggestions">
        {(areas || []).map((a) => (
          <option key={a.id} value={a.name} />
        ))}
      </datalist>

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

          <input
            list="areas-suggestions"
            value={form.area}
            onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
            placeholder="Bereich (frei eintippbar)"
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

          <button style={styles.btnPrimary} onClick={createTask} disabled={!canWrite}>
            Anlegen
          </button>
        </div>

        {/* Serien UI */}
        <div style={{ ...styles.card, marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 900 }}>
              <input
                type="checkbox"
                checked={isSeries}
                onChange={(e) => setIsSeries(e.target.checked)}
                disabled={!canWrite}
              />
              Serienaufgabe (global)
            </label>

            {isSeries ? (
              <>
                <select
                  value={seriesRule}
                  onChange={(e) => setSeriesRule(e.target.value)}
                  style={styles.input}
                  disabled={!canWrite}
                >
                  <option value="weekly">Wöchentlich</option>
                  <option value="monthly">Monatlich</option>
                </select>

                <input
                  type="number"
                  min={1}
                  value={seriesInterval}
                  onChange={(e) => setSeriesInterval(e.target.value)}
                  style={{ ...styles.input, width: 120 }}
                  disabled={!canWrite}
                  title="Intervall (z.B. 1 = jede Woche/Monat, 2 = alle 2 Wochen/Monate)"
                />

                {seriesRule === "weekly" ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {weekdayLabels.map((w) => {
                      const active = seriesWeekdays.includes(w.v);
                      return (
                        <button
                          key={w.v}
                          type="button"
                          onClick={() => toggleWeekday(w.v)}
                          disabled={!canWrite}
                          style={{
                            ...styles.btn,
                            padding: "8px 10px",
                            borderRadius: 999,
                            background: active ? "#0b6b2a" : "#fff",
                            borderColor: active ? "#0b6b2a" : "#d8e0ef",
                            color: active ? "#fff" : "#111",
                            fontWeight: 900,
                          }}
                        >
                          {w.t}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: "#666", fontSize: 13 }}>
                    Monatlich: Tag wird über das Fälligkeitsdatum (due_at) der Serienaufgabe definiert.
                  </div>
                )}

                <input
                  type="date"
                  value={seriesUntil}
                  onChange={(e) => setSeriesUntil(e.target.value)}
                  style={styles.input}
                  disabled={!canWrite}
                  title="Serie bis (optional)"
                />

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="number"
                    min={7}
                    max={365}
                    value={seriesDaysAhead}
                    onChange={(e) => setSeriesDaysAhead(Number(e.target.value))}
                    style={{ ...styles.input, width: 120 }}
                    disabled={!canWrite}
                    title="Wie weit im Voraus generieren (Tage)"
                  />
                  <button
                    type="button"
                    style={styles.btn}
                    disabled={!canWrite}
                    onClick={async () => {
                      try {
                        const n = await generateSeries(seriesDaysAhead);
                        alert(`Serien erzeugt: ${n}`);
                        loadAll();
                      } catch (e) {
                        alert(e?.message || String(e));
                      }
                    }}
                  >
                    Serien jetzt erzeugen
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 10, color: "#666", fontSize: 13 }}>
          Hinweis: Farben greifen automatisch, wenn der Bereich-Text exakt (case-insensitive) zu einem Eintrag in „Bereiche“ passt.
        </div>
      </div>

      <div style={styles.columns}>
        <div style={styles.col}>
          <div style={styles.colHeader}>
            <div style={styles.h3}>Zu erledigen</div>
            <div style={styles.badge}>{columns.todo.length}</div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>{columns.todo.map(renderTaskCard)}</div>
          {columns.todo.length === 0 ? <div style={{ color: "#999" }}>Keine Einträge.</div> : null}
        </div>

        <div style={styles.col}>
          <div style={styles.colHeader}>
            <div style={styles.h3}>Erledigt</div>
            <div style={styles.badge}>{columns.done.length}</div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>{columns.done.map(renderTaskCard)}</div>
          {columns.done.length === 0 ? <div style={{ color: "#999" }}>Keine Einträge.</div> : null}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Calendar ---------------- */
function CalendarPanel({ areas }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  const areaByName = useMemo(() => {
    const m = new Map();
    for (const a of areas || []) m.set(normalizeName(a.name), a);
    return m;
  }, [areas]);

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

    if (error) setErr(error.message);
    setItems(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [date]);

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
        {items.map((t) => {
          const areaMatch = areaByName.get(normalizeName(t.area));
          const badge = areaMatch ? (
            <span style={areaBadgeStyle(areaMatch.color)}>{areaMatch.name}</span>
          ) : t.area ? (
            <span style={areaBadgeStyle("#6b7280")}>{t.area}</span>
          ) : null;

          return (
            <div key={t.id} style={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={styles.h4}>{t.title}</div>
                <span style={styles.pill}>{t.status ?? "todo"}</span>
              </div>
              <div style={{ color: "#666", fontSize: 13, marginTop: 6 }}>
                {t.due_at ? fmtDateTime(t.due_at) : "–"} {badge ? <> · {badge}</> : null}
              </div>
            </div>
          );
        })}
        {items.length === 0 ? <div style={{ color: "#999" }}>Keine Aufgaben für diesen Tag.</div> : null}
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

  const [areas, setAreas] = useState([]);
  const [areasErr, setAreasErr] = useState(null);

  async function refreshAuth() {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const ctx = await loadMyAuthContext();
      setAuth(ctx);
    } catch (e) {
      setAuth({ user: null, profile: null });
      setAuthError(e?.message || String(e));
    } finally {
      setAuthLoading(false);
    }
  }

  async function loadAreas() {
    setAreasErr(null);
    const { data, error } = await supabase
      .from("areas")
      .select("id, name, color")
      .order("name", { ascending: true });
    if (error) setAreasErr(error.message);
    setAreas(data || []);
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
          <div style={{ color: "#666" }}>Du bist nicht eingeloggt (nutze deinen Login-Flow).</div>
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

  const admin = isAdmin(auth.profile);

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
          <TabBtn active={activeTab === "areas"} onClick={() => setActiveTab("areas")}>
            Bereiche
          </TabBtn>

          <button style={styles.btn} onClick={loadAreas}>
            Bereiche neu laden
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
      {areasErr ? <div style={{ ...styles.panel, ...styles.error }}>Areas: {areasErr}</div> : null}

      {activeTab === "board" ? <TasksBoard areas={areas} permissions={[]} /> : null}
      {activeTab === "calendar" ? <CalendarPanel areas={areas} /> : null}
      {activeTab === "areas" ? <AreasPanel admin={admin} onAreasChanged={loadAreas} /> : null}

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
    fontWeight: 900,
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
    fontWeight: 800,
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
  col: {},
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
    fontWeight: 900,
    color: "#333",
  },
  pill: {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid #d8e0ef",
    background: "#f7f9ff",
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
  btn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #d8e0ef",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 900,
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
    gridTemplateColumns: "1.4fr 1fr 1fr 1fr auto",
    gap: 10,
    alignItems: "start",
  },
};
