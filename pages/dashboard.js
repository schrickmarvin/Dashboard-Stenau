// pages/dashboard.js
// Standalone dashboard page (React) for Next.js + Supabase
// Hinweis: Datei vollständig übernehmen (keine diff-Markierungen wie "diff --git" einfügen).

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ---------------- Supabase --------------- */

function TasksBoard({ isAdmin }) {
  const [areas, setAreas] = useState([]);
  const [guides, setGuides] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [series, setSeries] = useState([]);
  const [members, setMembers] = useState([]);

  const [form, setForm] = useState({
    title: "",
    area: "",
    due_at: "",
    status: "todo",
    guideIds: [],
    assignee_id: "",
  });
  const [subDrafts, setSubDrafts] = useState({});
  const [guideModal, setGuideModal] = useState({ open: false, loading: false, guide: null, error: null });
  const [seriesForm, setSeriesForm] = useState({
    title: "",
    area: "",
    start_at: new Date().toISOString().slice(0, 16),
    recurrence: "weekly",
    interval: 1,
    count: 8,
    updateFuture: false,
  });
  const [seriesEditId, setSeriesEditId] = useState(null);
  const [seriesSubDraft, setSeriesSubDraft] = useState({ title: "", guide_id: "", color: "#6b7280" });
  const [seriesSubtasks, setSeriesSubtasks] = useState([]);
  const [seriesLoading, setSeriesLoading] = useState(false);

  async function openGuide(gid) {
    if (!gid) return;
    setGuideModal({ open: true, loading: true, guide: null, error: null });
    const { data, error } = await supabase
      .from("guides")
      .select("id, title, content, created_at")
      .eq("id", gid)
      .maybeSingle();
    if (error) {
      setGuideModal({ open: true, loading: false, guide: null, error: error.message });
      return;
    }
    if (!data) {
      setGuideModal({ open: true, loading: false, guide: null, error: "Anleitung nicht gefunden." });
      return;
    }
    setGuideModal({ open: true, loading: false, guide: data, error: null });
  }

  function closeGuide() {
    setGuideModal({ open: false, loading: false, guide: null, error: null });
  }


  function getSubDraft(taskId, fallbackColor) {
    const d = subDrafts[taskId] || { title: "", guide_id: "", color: fallbackColor || "" };
    return { ...d, color: d.color || fallbackColor || "" };
  }

  function setSubDraft(taskId, patch, fallbackColor) {
    setSubDrafts((prev) => {
      const cur = prev[taskId] || { title: "", guide_id: "", color: fallbackColor || "" };
      return { ...prev, [taskId]: { ...cur, ...patch } };
    });
  }


  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const canWrite = true;

  async function loadAll() {
    setErr(null);
    setLoading(true);

    // Tasks: use area_id, due_at, status, title
    const { data: tData, error: tErr } = await supabase
      .from("tasks")
      .select("id, title, area, area_id, due_at, status, assignee_id, created_at, is_series, series_parent_id, assignee:profiles!tasks_assignee_id_fkey ( id, name, email ), subtasks ( id, title, is_done, color, created_at, guide_id, guides ( id, title ) )")
      .order("created_at", { ascending: false });

    if (tErr) {
      setErr(tErr.message);
      setLoading(false);
      return;
    }

    const [areasList, guidesRes, membersRes] = await Promise.all([
      loadAreas(),
      supabase.from("guides").select("id, title").order("title", { ascending: true }),
      supabase.from("profiles").select("id, name, email, is_active").order("name", { ascending: true }),
    ]);

    if (guidesRes.error) {
      console.warn("guides load failed:", guidesRes.error.message);
    }

    if (membersRes?.error) {
      console.warn("members load failed:", membersRes.error.message);
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

    setTasks(decoratedTasks.filter((t) => !t.is_series));
    setAreas(areasList || []);
    setGuides(guidesRes.data || []);
    setMembers((membersRes?.data || []).filter((m) => m.is_active !== false));
    setLoading(false);
  }

  async function loadSeries() {
    setSeriesLoading(true);
    const { data: seriesData, error: seriesErr } = await supabase
      .from("tasks")
      .select("id, title, area, area_id, due_at, series_rule, series_interval, series_until, repeat_count, created_at, subtasks ( id, title, guide_id, color )")
      .eq("is_series", true)
      .order("created_at", { ascending: false });

    if (seriesErr) {
      console.warn("series load failed:", seriesErr.message);
      setSeries([]);
      setSeriesLoading(false);
      return;
    }

    setSeries(seriesData || []);
    setSeriesLoading(false);
  }

  useEffect(() => {
    loadAll();
    loadSeries();
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

  function addSeriesSubtask() {
    if (!seriesSubDraft.title.trim()) return;
    const tempId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setSeriesSubtasks((prev) => [
      ...prev,
      {
        id: tempId,
        title: seriesSubDraft.title.trim(),
        guide_id: seriesSubDraft.guide_id || null,
        color: seriesSubDraft.color || "#6b7280",
      },
    ]);
    setSeriesSubDraft({ title: "", guide_id: "", color: seriesSubDraft.color || "#6b7280" });
  }

  function removeSeriesSubtask(id) {
    setSeriesSubtasks((prev) => prev.filter((s) => s.id !== id));
  }

  function generateSeriesDates(startAt, recurrence, interval, count) {
    const dates = [];
    const base = new Date(startAt);
    for (let i = 0; i < count; i += 1) {
      const d = new Date(base);
      if (recurrence === "daily") d.setDate(base.getDate() + i * interval);
      if (recurrence === "weekly") d.setDate(base.getDate() + i * interval * 7);
      if (recurrence === "monthly") d.setMonth(base.getMonth() + i * interval);
      dates.push(d.toISOString());
    }
    return dates;
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
      assignee_id: form.assignee_id || null,
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

    setForm({ title: "", area: "", due_at: "", status: "todo", guideIds: [], assignee_id: "" });
    loadAll();
  }

  async function addSubtask(task, fallbackColor) {
    if (!canWrite) return;
    const taskId = task?.id;
    if (!taskId) return;
    const d = getSubDraft(taskId, fallbackColor);
    if (!d.title.trim()) return;

    setErr(null);
    const payload = {
      task_id: taskId,
      title: d.title.trim(),
      guide_id: d.guide_id ? d.guide_id : null,
      color: d.color || fallbackColor || null,
    };
    const { data: row, error } = await supabase.from("subtasks").insert(payload).select("id, title, is_done, color, created_at, guide_id, guides ( id, title )").single();
    if (error) {
      setErr(error.message);
      return;
    }

    // clear draft
    setSubDrafts((prev) => ({ ...prev, [taskId]: { title: "", guide_id: "", color: fallbackColor || "" } }));

    // optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, subtasks: [row, ...(t.subtasks || [])] } : t))
    );
  }

  async function updateSubtask(subId, patch) {
    if (!canWrite) return;
    setErr(null);
    const { error } = await supabase.from("subtasks").update(patch).eq("id", subId);
    if (error) {
      setErr(error.message);
      return;
    }
    setTasks((prev) =>
      prev.map((t) => ({
        ...t,
        subtasks: (t.subtasks || []).map((s) => (s.id === subId ? { ...s, ...patch } : s)),
      }))
    );
  }

  async function deleteSubtask(subId) {
    if (!canWrite) return;
    setErr(null);
    const { error } = await supabase.from("subtasks").delete().eq("id", subId);
    if (error) {
      setErr(error.message);
      return;
    }
    setTasks((prev) =>
      prev.map((t) => ({ ...t, subtasks: (t.subtasks || []).filter((s) => s.id !== subId) }))
    );
  }


  async function setTaskAssignee(taskId, assigneeId) {
    if (!taskId) return;
    setErr(null);
    const { error } = await supabase.from("tasks").update({ assignee_id: assigneeId || null }).eq("id", taskId);
    if (error) {
      setErr(error.message);
      return;
    }
    const assigneeObj = (members || []).find((m) => m.id === assigneeId) || null;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, assignee_id: assigneeId || null, assignee: assigneeObj ? { id: assigneeObj.id, name: assigneeObj.name, email: assigneeObj.email } : null } : t)));
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
    if (!taskId) return;
    setErr(null);

    // Erst Unteraufgaben löschen (FK/Abhängigkeiten vermeiden)
    const { error: subErr } = await supabase.from("subtasks").delete().eq("task_id", taskId);
    if (subErr) {
      setErr(subErr.message);
      return;
    }

    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) {
      setErr(error.message);
      return;
    }

    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  async function createSeries() {
    if (!seriesForm.title.trim()) return;
    setErr(null);
    const areaText = (seriesForm.area || "").trim();
    const matched = areaText
      ? (areas || []).find((a) => String(a.name || "").toLowerCase() === areaText.toLowerCase())
      : null;
    const count = Math.max(1, Number(seriesForm.count) || 1);
    const interval = Math.max(1, Number(seriesForm.interval) || 1);

    const dates = generateSeriesDates(seriesForm.start_at, seriesForm.recurrence, interval, count);
    const seriesUntil = dates[dates.length - 1];

    const { data: seriesRow, error: seriesErr } = await supabase
      .from("tasks")
      .insert({
        title: seriesForm.title.trim(),
        status: "todo",
        due_at: dates[0],
        area_id: matched ? matched.id : null,
        area: areaText || null,
        is_series: true,
        series_rule: seriesForm.recurrence,
        series_interval: interval,
        series_until: seriesUntil,
        repeat_count: count,
      })
      .select("id")
      .single();

    if (seriesErr) {
      setErr(seriesErr.message);
      return;
    }

    const seriesId = seriesRow?.id;
    const templates = seriesSubtasks.map((s) => ({
      title: s.title,
      guide_id: s.guide_id || null,
      color: s.color || null,
    }));

    if (templates.length > 0) {
      const { error: tempErr } = await supabase.from("subtasks").insert(
        templates.map((t) => ({
          ...t,
          task_id: seriesId,
        }))
      );
      if (tempErr) console.warn("series subtasks insert failed:", tempErr.message);
    }
    const taskRows = dates.map((dueAt) => ({
      title: seriesForm.title.trim(),
      status: "todo",
      due_at: dueAt,
      area_id: matched ? matched.id : null,
      area: areaText || null,
      series_parent_id: seriesId,
    }));

    const { data: createdTasks, error: taskErr } = await supabase
      .from("tasks")
      .insert(taskRows)
      .select("id");
    if (taskErr) {
      setErr(taskErr.message);
      return;
    }

    const subtaskRows = [];
    for (const t of createdTasks || []) {
      for (const s of templates) {
        subtaskRows.push({
          task_id: t.id,
          title: s.title,
          guide_id: s.guide_id || null,
          color: s.color || null,
        });
      }
    }

    if (subtaskRows.length > 0) {
      const { error: subErr } = await supabase.from("subtasks").insert(subtaskRows);
      if (subErr) console.warn("series subtasks copy failed:", subErr.message);
    }

    setSeriesForm((prev) => ({ ...prev, title: "", area: "" }));
    setSeriesSubtasks([]);
    loadAll();
    loadSeries();
  }

  async function saveSeries() {
    if (!seriesEditId) return;
    if (!seriesForm.title.trim()) return;
    setErr(null);
    const areaText = (seriesForm.area || "").trim();
    const matched = areaText
      ? (areas || []).find((a) => String(a.name || "").toLowerCase() === areaText.toLowerCase())
      : null;
    const count = Math.max(1, Number(seriesForm.count) || 1);
    const interval = Math.max(1, Number(seriesForm.interval) || 1);
    const dates = generateSeriesDates(seriesForm.start_at, seriesForm.recurrence, interval, count);
    const seriesUntil = dates[dates.length - 1];

    const { error: seriesErr } = await supabase
      .from("tasks")
      .update({
        title: seriesForm.title.trim(),
        area_id: matched ? matched.id : null,
        area: areaText || null,
        due_at: dates[0],
        series_rule: seriesForm.recurrence,
        series_interval: interval,
        series_until: seriesUntil,
        repeat_count: count,
      })
      .eq("id", seriesEditId);
    if (seriesErr) {
      setErr(seriesErr.message);
      return;
    }

    await supabase.from("subtasks").delete().eq("task_id", seriesEditId);
    const templates = seriesSubtasks.map((s) => ({
      task_id: seriesEditId,
      title: s.title,
      guide_id: s.guide_id || null,
      color: s.color || null,
    }));
    if (templates.length > 0) {
      const { error: tempErr } = await supabase.from("subtasks").insert(templates);
      if (tempErr) console.warn("series subtasks update failed:", tempErr.message);
    }

    if (seriesForm.updateFuture) {
      const { data: futureTasks, error: futureErr } = await supabase
        .from("tasks")
        .select("id")
        .eq("series_parent_id", seriesEditId)
        .gte("due_at", new Date().toISOString());

      if (futureErr) {
        setErr(futureErr.message);
        return;
      }

      await supabase
        .from("tasks")
        .update({
          title: seriesForm.title.trim(),
          area_id: matched ? matched.id : null,
          area: areaText || null,
        })
        .eq("series_parent_id", seriesEditId)
        .gte("due_at", new Date().toISOString());

      for (const t of futureTasks || []) {
        await supabase.from("subtasks").delete().eq("task_id", t.id);
        const subRows = templates.map((s) => ({
          task_id: t.id,
          title: s.title,
          guide_id: s.guide_id || null,
          color: s.color || null,
        }));
        if (subRows.length > 0) {
          await supabase.from("subtasks").insert(subRows);
        }
      }
    }

    setSeriesEditId(null);
    setSeriesForm((prev) => ({ ...prev, updateFuture: false }));
    loadAll();
    loadSeries();
  }

  function startEditSeries(seriesRow) {
    setSeriesEditId(seriesRow.id);
    setSeriesForm({
      title: seriesRow.title || "",
      area: seriesRow.area || "",
      start_at: seriesRow.due_at ? new Date(seriesRow.due_at).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
      recurrence: seriesRow.series_rule || "weekly",
      interval: seriesRow.series_interval || 1,
      count: seriesRow.repeat_count || 8,
      updateFuture: false,
    });
    setSeriesSubtasks(seriesRow.subtasks || []);
  }

  function cancelEditSeries() {
    setSeriesEditId(null);
    setSeriesForm((prev) => ({ ...prev, title: "", area: "", updateFuture: false }));
    setSeriesSubtasks([]);
  }

  return (
    <div>
      
      <details style={styles.details} open>
        <summary style={styles.detailsSummary}>Aufgabe anlegen</summary>

        <div style={{ paddingTop: 12 }}>
          {err ? (
            <div style={{ marginBottom: 10, padding: 10, border: "1px solid #f5b4b4", background: "rgba(255, 235, 235, 0.9)", borderRadius: 10, color: "#b00020" }}>
              {err}
              <button style={{ ...styles.btnSmall, marginLeft: 10 }} onClick={() => setErr("")}>OK</button>
            </div>
          ) : null}

          <div style={styles.taskFormGrid}>
            <input style={styles.input} placeholder="Titel" value={title} onChange={(e) => setTitle(e.target.value)} />
            <select style={styles.select} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              <option value="">Bereich</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <input style={styles.input} placeholder="tt.mm.jjjj --:--" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
            <select style={styles.select} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="todo">Zu erledigen</option>
              <option value="doing">In Arbeit</option>
              <option value="done">Erledigt</option>
            </select>

            <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "center" }}>
              <select style={styles.select} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">– Zuständig –</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name || u.email}</option>
                ))}
              </select>

              <select
                style={styles.select}
                multiple
                value={selectedGuideIds}
                onChange={(e) => {
                  const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
                  setSelectedGuideIds(vals);
                }}
              >
                {guides.map((g) => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </select>

              <button style={styles.btnPrimary} onClick={createTask}>Anlegen</button>
            </div>
          </div>

          <div style={{ color: "#666", fontSize: 13, marginTop: 8 }}>Mehrfachauswahl bei Anleitungen: Strg/Cmd + Klick</div>
        </div>
      </details>

<div style={styles.columns}>
        <TaskColumn title="Zu erledigen" count={columns.todo.length} tasks={columns.todo} onToggle={toggleStatus} areaById={areaById} guides={guides} canWrite={canWrite} getSubDraft={getSubDraft} setSubDraft={setSubDraft} onSubAdd={addSubtask} onSubUpdate={updateSubtask} onSubDelete={deleteSubtask} onGuideOpen={openGuide} members={members} onAssigneeChange={setTaskAssignee} onTaskDelete={deleteTask} />
        <TaskColumn title="Erledigt" count={columns.done.length} tasks={columns.done} onToggle={toggleStatus} areaById={areaById} guides={guides} canWrite={canWrite} getSubDraft={getSubDraft} setSubDraft={setSubDraft} onSubAdd={addSubtask} onSubUpdate={updateSubtask} onSubDelete={deleteSubtask} onGuideOpen={openGuide} members={members} onAssigneeChange={setTaskAssignee} onTaskDelete={deleteTask} />
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

      {/* Serienaufgaben als Unterpunkt im Aufgaben-Bereich */}
      <div style={{ marginTop: 16 }}>
        <details style={styles.details}>
          <summary style={styles.detailsSummary}>Serienaufgaben (Aufgaben-Serie anlegen / verwalten)</summary>

          <div style={{ paddingTop: 12 }}>
            <div style={styles.h3}>Serie anlegen / bearbeiten</div>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr 120px 120px auto", gap: 10 }}>
          <input
            value={seriesForm.title}
            onChange={(e) => setSeriesForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Serientitel"
            style={styles.input}
          />
          <input
            value={seriesForm.area}
            onChange={(e) => setSeriesForm((f) => ({ ...f, area: e.target.value }))}
            placeholder="Bereich"
            list="areas-list"
            style={styles.input}
          />
          <input
            type="datetime-local"
            value={seriesForm.start_at}
            onChange={(e) => setSeriesForm((f) => ({ ...f, start_at: e.target.value }))}
            style={styles.input}
          />
          <select
            value={seriesForm.recurrence}
            onChange={(e) => setSeriesForm((f) => ({ ...f, recurrence: e.target.value }))}
            style={styles.input}
          >
            <option value="daily">Täglich</option>
            <option value="weekly">Wöchentlich</option>
            <option value="monthly">Monatlich</option>
          </select>
          <input
            type="number"
            min="1"
            value={seriesForm.interval}
            onChange={(e) => setSeriesForm((f) => ({ ...f, interval: e.target.value }))}
            placeholder="Intervall"
            style={styles.input}
          />
          <input
            type="number"
            min="1"
            value={seriesForm.count}
            onChange={(e) => setSeriesForm((f) => ({ ...f, count: e.target.value }))}
            placeholder="Anzahl"
            style={styles.input}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {seriesEditId ? (
              <>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={seriesForm.updateFuture}
                    onChange={(e) => setSeriesForm((f) => ({ ...f, updateFuture: e.target.checked }))}
                  />
                  zukünftige Instanzen aktualisieren
                </label>
                <button style={styles.btnPrimary} onClick={saveSeries}>
                  Serie speichern
                </button>
                <button style={styles.btn} onClick={cancelEditSeries}>
                  Abbrechen
                </button>
              </>
            ) : (
              <button style={styles.btnPrimary} onClick={createSeries}>
                Serie anlegen
              </button>
            )}
          </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={styles.h4}>Unteraufgaben-Vorlagen</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={seriesSubDraft.title}
              onChange={(e) => setSeriesSubDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Unteraufgabe"
              style={{ ...styles.input, minWidth: 260 }}
            />
            <select
              value={seriesSubDraft.guide_id}
              onChange={(e) => setSeriesSubDraft((d) => ({ ...d, guide_id: e.target.value }))}
              style={{ ...styles.input, minWidth: 220 }}
            >
              <option value="">– Anleitung –</option>
              {guides.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
            <input
              type="color"
              value={seriesSubDraft.color || "#6b7280"}
              onChange={(e) => setSeriesSubDraft((d) => ({ ...d, color: e.target.value }))}
              style={styles.colorInput}
            />
            <button style={styles.btnSmallPrimary} onClick={addSeriesSubtask}>
              +
            </button>
              </div>
              {seriesSubtasks.length > 0 ? (
                <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                  {seriesSubtasks.map((s) => (
                    <div key={s.id} style={styles.subRow}>
                      <span>{s.title}</span>
                      <span style={{ color: "#666", fontSize: 13 }}>
                        {(guides || []).find((g) => g.id === s.guide_id)?.title || "—"}
                      </span>
                      <span style={{ width: 60 }} />
                      <span style={{ ...styles.areaDot, background: s.color || "#6b7280" }} />
                      <button style={styles.btnSmall} onClick={() => removeSeriesSubtask(s.id)}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: "#666", fontSize: 13, marginTop: 6 }}>Noch keine Vorlagen.</div>
              )}
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={styles.h3}>Serienübersicht</div>
              {seriesLoading ? <div style={{ color: "#666" }}>Lade…</div> : null}
              <div style={{ display: "grid", gap: 10 }}>
                {(series || []).map((s) => (
                  <div key={s.id} style={styles.card}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={styles.h4}>{s.title}</div>
                      <span style={styles.pill}>{s.series_rule || "—"}</span>
                      <span style={{ color: "#666", fontSize: 13 }}>
                        ab {s.due_at ? fmtDateTime(s.due_at) : "–"} · jede {s.series_interval || 1} · {s.repeat_count || 0} Instanzen
                      </span>
                      <button style={{ ...styles.btn, marginLeft: "auto" }} onClick={() => startEditSeries(s)}>
                        Bearbeiten
                      </button>
                    </div>
                  </div>
                ))}
                {series.length === 0 && !seriesLoading ? <div style={{ color: "#666" }}>Noch keine Serien.</div> : null}
              </div>
            </div>
          </div>
        </details>
      </div>

      {guideModal.open ? (
        <div style={styles.modalBackdrop} onMouseDown={closeGuide}>
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={styles.h4}>
                {guideModal.loading ? "Lade…" : guideModal.guide?.title || "Anleitung"}
              </div>
              <button type="button" style={styles.btnSmall} onClick={closeGuide}>
                Schließen
              </button>
            </div>

            {guideModal.error ? (
              <div style={styles.error}>Fehler: {guideModal.error}</div>
            ) : null}

            {guideModal.loading ? (
              <div style={{ color: "#666" }}>Lade…</div>
            ) : guideModal.guide ? (
              <div style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
                {guideModal.guide.content || "—"}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

    </div>
  );
}

function TaskColumn({
  title,
  count,
  tasks,
  onToggle,
  areaById,
  guides,
  canWrite,
  getSubDraft,
  setSubDraft,
  onSubAdd,
  onSubUpdate,
  onSubDelete,
  onGuideOpen,
  members,
  onAssigneeChange,
  onTaskDelete,
}) {
  return (
    <div style={styles.panel}>
      <div style={styles.colHeader}>
        <div style={styles.h3}>
          {title} <span style={styles.badge}>{typeof count === "number" ? count : (tasks || []).length}</span>
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {(tasks || []).map((t) => {
          const areaObj = (t.area_id && areaById?.get?.(t.area_id)) || null;
          const areaLabel = t.area_label || areaObj?.name || t.area || "";
          const color = t.area_color || areaObj?.color || "#94a3b8";

          const assigneeName =
            t.assignee?.name ||
            t.assignee?.email ||
            (t.assignee_id ? String(t.assignee_id) : "Unzugeordnet");

          const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
          const doneCount = subs.filter((s) => !!s.is_done).length;

          const draft = getSubDraft ? getSubDraft(t.id, color) : { title: "", guide_id: "", color };

          return (
            <div key={t.id} style={styles.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={styles.dot(color)} />
                <div style={{ fontWeight: 800 }}>{t.title}</div>
                {areaLabel ? <span style={styles.pill}>{areaLabel}</span> : null}
                <div style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>
                  {t.due_at ? fmtDateTime(t.due_at) : ""}
                </div>
              </div>

              <div style={{ marginTop: 6, fontSize: 12, color: "#666", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span>Zuständig: {assigneeName}</span>
                <span>Unteraufgaben: {doneCount}/{subs.length}</span>

                {Array.isArray(members) && members.length > 0 ? (
                  <select
                    value={t.assignee_id || ""}
                    onChange={(e) => onAssigneeChange?.(t.id, e.target.value || null)}
                    style={{ ...styles.input, padding: "6px 10px", minWidth: 220 }}
                    title="Zuständig ändern"
                  >
                    <option value="">– Unzugeordnet –</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {(m.name || m.email || m.id)}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <button style={styles.btnSmall} onClick={() => onToggle?.(t)} disabled={!canWrite}>
                  Status wechseln
                </button>
              
                <button
                  style={{ ...styles.btnSmall, borderColor: "#ef4444", color: "#b91c1c" }}
                  onClick={() => {
                    if (confirm("Aufgabe wirklich löschen?")) onTaskDelete?.(t.id);
                  }}
                  disabled={!canWrite}
                  title="Aufgabe löschen"
                >
                  Löschen
                </button>
</div>

              {/* Unteraufgaben */}
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 220px 70px 90px", gap: 8, alignItems: "center" }}>
                  <input
                    value={draft.title || ""}
                    onChange={(e) => setSubDraft?.(t.id, { title: e.target.value }, color)}
                    placeholder="Unteraufgabe…"
                    style={{ ...styles.input, minWidth: 0 }}
                    disabled={!canWrite}
                  />

                  <select
                    value={draft.guide_id || ""}
                    onChange={(e) => setSubDraft?.(t.id, { guide_id: e.target.value }, color)}
                    style={{ ...styles.input, minWidth: 0 }}
                    disabled={!canWrite}
                    title="Anleitung verknüpfen"
                  >
                    <option value="">– Anleitung –</option>
                    {(guides || []).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>

                  <input
                    type="color"
                    value={draft.color || color}
                    onChange={(e) => setSubDraft?.(t.id, { color: e.target.value }, color)}
                    style={styles.colorInput}
                    disabled={!canWrite}
                    title="Farbe"
                  />

                  <button
                    style={styles.btnSmallPrimary}
                    onClick={() => onSubAdd?.(t, color)}
                    disabled={!canWrite}
                    title="Unteraufgabe hinzufügen"
                  >
                    +
                  </button>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {subs.length === 0 ? (
                    <div style={{ fontSize: 13, color: "#666" }}>Keine Unteraufgaben</div>
                  ) : null}

                  {subs.map((s) => (
                    <div key={s.id} style={{ ...styles.subRow, gridTemplateColumns: "24px 1fr 1fr 78px 56px 44px" }}>
                      <input
                        type="checkbox"
                        checked={!!s.is_done}
                        onChange={() => onSubUpdate?.(s.id, { is_done: !s.is_done })}
                        disabled={!canWrite}
                        title="Erledigt"
                      />

                      <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.title}
                      </div>

                      <button
                        type="button"
                        style={{ ...styles.btnSmall, padding: "6px 10px", justifySelf: "start" }}
                        onClick={() => (s.guide_id ? onGuideOpen?.(s.guide_id) : null)}
                        disabled={!s.guide_id}
                        title={s.guide_id ? "Anleitung öffnen" : "Keine Anleitung verknüpft"}
                      >
                        {s.guide_id ? `Anleitung: ${(s.guides?.title || (guides || []).find((g) => g.id === s.guide_id)?.title || "öffnen")}` : "Anleitung: —"}
                      </button>

                      <span style={{ width: 60 }} />

                      <span style={{ ...styles.areaDot, background: s.color || color }} />

                      <button
                        style={styles.btnSmall}
                        onClick={() => onSubDelete?.(s.id)}
                        disabled={!canWrite}
                        title="Unteraufgabe löschen"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



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
  // Robust: Nur getSession() verwenden (enthält bereits den User).
  // getUser() wirft in Supabase v2 in manchen Fällen "Auth session missing!".
  const { data: sData, error: sErr } = await supabase.auth.getSession();
  if (sErr) {
    return { user: null, profile: null, role: null, isAdmin: false, inactive: false };
  }
  const user = sData?.session?.user || null;
  if (!user) return { user: null, profile: null, role: null, isAdmin: false, inactive: false };

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, email, name, role, role_id, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (pErr) throw pErr;

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


/* ---------------- User Settings ---------------- */
async function loadUserSettings(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("user_settings")
    .select("user_id, primary_color, background_color, background_image_url, notifications_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    // Table might not exist yet – keep app usable
    console.warn("user_settings load failed:", error.message);
    return null;
  }
  return data || null;
}

async function upsertUserSettings(userId,  patch) {
  if (!userId) throw new Error("userId fehlt");
  const payload = {
    user_id: userId,
    primary_color: patch.primary_color ?? null,
    background_color: patch.background_color ?? null,
    background_image_url: patch.background_image_url ?? null,
    notifications_enabled: typeof patch.notifications_enabled === "boolean" ? patch.notifications_enabled : null,
};

  const { error } = await supabase.from("user_settings").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
  return true;
}


/* ---------------- Admin: Users Panel ---------------- */
function UsersAdminPanel({ isAdmin }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [areas, setAreas] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [passwordDrafts, setPasswordDrafts] = useState({});
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    name: "",
    roleId: "",
    areaIds: [],
  });

  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  async function load() {
    setErr(null);
    setLoading(true);

    const [rolesRes, areasRes] = await Promise.all([
      supabase.from("roles").select("id, key, name").order("name", { ascending: true }),
      supabase.from("areas").select("id, name, color").order("name", { ascending: true }),
    ]);

    if (rolesRes.error) {
      setLoading(false);
      setErr(rolesRes.error.message);
      return;
    }

    if (areasRes.error) {
      setLoading(false);
      setErr(areasRes.error.message);
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

    const { data: areaLinks, error: linkErr } = await supabase
      .from("profile_areas")
      .select("profile_id, area_id");

    if (linkErr) {
      setLoading(false);
      setErr(linkErr.message);
      return;
    }

    const areasByProfile = (areaLinks || []).reduce((acc, link) => {
      const pid = link.profile_id;
      if (!pid) return acc;
      if (!acc[pid]) acc[pid] = [];
      acc[pid].push({ area_id: link.area_id });
      return acc;
    }, {});

    setRoles(rolesRes.data || []);
    setAreas(areasRes.data || []);
    setUsers((usersData || []).map((u) => ({ ...u, profile_areas: areasByProfile[u.id] || [] })));
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

  async function updateUserRole(id, roleId) {
    const role = roleId ? rolesById.get(roleId) : null;
    await updateUser(id, {
      role_id: roleId || null,
      role: role?.key || null,
    });
  }

  async function updateUserAreas(id, areaIds) {
    setErr(null);
    const { error: delErr } = await supabase.from("profile_areas").delete().eq("profile_id", id);
    if (delErr) {
      setErr(delErr.message);
      return;
    }

    if (areaIds.length > 0) {
      const rows = areaIds.map((areaId) => ({ profile_id: id, area_id: areaId }));
      const { error: insErr } = await supabase.from("profile_areas").insert(rows);
      if (insErr) {
        setErr(insErr.message);
        return;
      }
    }

    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, profile_areas: areaIds.map((areaId) => ({ area_id: areaId })) } : u))
    );
  }

  async function createUser() {
    const email = newUser.email.trim();
    const password = newUser.password.trim();
    if (!email) {
      setErr("E-Mail fehlt");
      return;
    }
    if (!password || password.length < 8) {
      setErr("Passwort fehlt/zu kurz (min. 8 Zeichen)");
      return;
    }

    setErr(null);
    setCreateLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setErr("Nicht angemeldet");
        return;
      }

      const role = newUser.roleId ? rolesById.get(newUser.roleId)?.key : "user";

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "createUser",
          payload: {
            email,
            password,
            role,
            name: newUser.name.trim() || null,
          },
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Nutzeranlage fehlgeschlagen");

      const userId = json?.userId;
      if (!userId) throw new Error("User-ID fehlt nach createUser");


      // Ensure profile row exists (some setups do not have an auth->profiles trigger)
      const roleKeyForInsert = newUser.roleId ? (rolesById.get(newUser.roleId)?.key || null) : (role || null);
      const { error: upsertErr } = await supabase.from("profiles").upsert(
        {
          id: userId,
          email,
          name: newUser.name.trim() || null,
          role: roleKeyForInsert,
          role_id: newUser.roleId || null,
          is_active: true,
        },
        { onConflict: "id" }
      );
      if (upsertErr) throw upsertErr;

      if (newUser.roleId) {
        const roleKey = rolesById.get(newUser.roleId)?.key || null;
        const { error: roleErr } = await supabase
          .from("profiles")
          .update({ role_id: newUser.roleId, role: roleKey })
          .eq("id", userId);
        if (roleErr) throw roleErr;
      }

      if (newUser.areaIds.length > 0) {
        await updateUserAreas(userId, newUser.areaIds);
      }

      setNewUser({ email: "", password: "", name: "", roleId: "", areaIds: [] });
      await load();
    } catch (error) {
      setErr(error?.message || String(error));
    } finally {
      setCreateLoading(false);
    }
  }

  async function setPassword(userId) {
    const password = String(passwordDrafts[userId] || "").trim();
    if (!password || password.length < 8) {
      setErr("Passwort fehlt/zu kurz (min. 8 Zeichen)");
      return;
    }

    setErr(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setErr("Nicht angemeldet");
        return;
      }

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "setPassword",
          payload: { userId, password },
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Passwort setzen fehlgeschlagen");

      setPasswordDrafts((prev) => ({ ...prev, [userId]: "" }));
    } catch (error) {
      setErr(error?.message || String(error));
    }
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

      <div style={{ ...styles.card, marginBottom: 14 }}>
        <div style={styles.h4}>Nutzer einladen</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
          <input
            value={newUser.email}
            onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="E-Mail"
            style={styles.input}
          />
          <input
            type="password"
            value={newUser.password}
            onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))}
            placeholder="Startpasswort (min. 8 Zeichen)"
            style={styles.input}
          />
          <input
            value={newUser.name}
            onChange={(e) => setNewUser((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Name"
            style={styles.input}
          />
          <select
            value={newUser.roleId}
            onChange={(e) => setNewUser((prev) => ({ ...prev, roleId: e.target.value }))}
            style={styles.input}
          >
            <option value="">Rolle wählen</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            multiple
            value={newUser.areaIds}
            onChange={(e) =>
              setNewUser((prev) => ({
                ...prev,
                areaIds: Array.from(e.target.selectedOptions).map((o) => o.value),
              }))
            }
            style={{ ...styles.input, height: 94 }}
            title="Mehrfachauswahl: Strg/Cmd + Klick"
          >
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start" }}>
            <button style={styles.btnPrimary} onClick={createUser} disabled={createLoading}>
              {createLoading ? "Erstelle…" : "Einladen"}
            </button>
          </div>
        </div>
        <div style={{ color: "#666", fontSize: 13, marginTop: 8 }}>
          Hinweis: Das Passwort wird gesetzt, die E-Mail-Benachrichtigung musst du ggf. separat versenden.
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>E-Mail</th>
              <th style={styles.th}>Rolle</th>
              <th style={styles.th}>Bereiche</th>
              <th style={styles.th}>Aktiv</th>
              <th style={styles.th}>Passwort</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const assignedAreaIds = (u.profile_areas || []).map((pa) => pa.area_id);
              return (
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
                      onChange={(e) => updateUserRole(u.id, e.target.value || null)}
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
                    <select
                      multiple
                      value={assignedAreaIds}
                      onChange={(e) =>
                        updateUserAreas(
                          u.id,
                          Array.from(e.target.selectedOptions).map((o) => o.value)
                        )
                      }
                      style={{ ...styles.input, height: 94 }}
                      title="Mehrfachauswahl: Strg/Cmd + Klick"
                    >
                      {areas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
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
                  <td style={styles.td}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="password"
                        value={passwordDrafts[u.id] ?? ""}
                        onChange={(e) =>
                          setPasswordDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))
                        }
                        placeholder="Neues Passwort"
                        style={styles.input}
                      />
                      <button style={styles.btnSmall} onClick={() => setPassword(u.id)}>
                        Setzen
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={6}>
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
  const [files, setFiles] = useState([]); // rows from guide_files
  const [signedUrls, setSignedUrls] = useState({}); // path -> signedUrl (cached)
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const [uploadingGuideId, setUploadingGuideId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState({}); // guideId -> File[]

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function load() {
    setErr(null);
    setLoading(true);

    const { data: gData, error: gErr } = await supabase
      .from("guides")
      .select("id, title, content, created_at")
      .order("created_at", { ascending: false });

    if (gErr) {
      setErr(gErr.message);
      setLoading(false);
      return;
    }

    // Dateien sind optional (wenn Tabelle noch nicht existiert, nur Warnung)
    const { data: fData, error: fErr } = await supabase
      .from("guide_files")
      .select("id, guide_id, bucket, path, filename, mime, size, created_at, created_by")
      .order("created_at", { ascending: false });

    if (fErr) {
      console.warn("guide_files load failed:", fErr.message);
    }

    setGuides(gData ?? []);
    setFiles(fData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createGuide() {
    if (!isAdmin) return;
    if (!title.trim()) return;

    setErr(null);
    const { error } = await supabase.from("guides").insert({
      title: title.trim(),
      content: content.trim() || null,
    });

    if (error) {
      setErr(error.message);
      return;
    }

    setTitle("");
    setContent("");
    load();
  }

  function filesForGuide(guideId) {
    return (files || []).filter((f) => f.guide_id === guideId);
  }

  async function ensureSignedUrl(path) {
    if (!path) return null;
    if (signedUrls[path]) return signedUrls[path];

    const { data, error } = await supabase.storage.from("guides").createSignedUrl(path, 60 * 60);
    if (error) {
      setErr(error.message);
      return null;
    }

    const url = data?.signedUrl || null;
    if (url) setSignedUrls((prev) => ({ ...prev, [path]: url }));
    return url;
  }

  async function onDownload(path) {
    const url = await ensureSignedUrl(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  async function uploadFiles(guideId, fileListOrArray) {
    const arr = Array.isArray(fileListOrArray) ? fileListOrArray : Array.from(fileListOrArray || []);
    if (!guideId || arr.length === 0) return;

    setErr(null);
    setUploading(true);
    setUploadingGuideId(guideId);

    try {
      for (const file of arr) {
        const safeName = String(file.name || "datei").replace(/[^\w.\-]+/g, "_");
        const key = `${guideId}/${Date.now()}_${safeName}`;

        const up = await supabase.storage.from("guides").upload(key, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });
        if (up.error) throw up.error;

        const ins = await supabase.from("guide_files").insert({
          guide_id: guideId,
          bucket: "guides",
          path: key,
          filename: file.name,
          mime: file.type || null,
          size: file.size ?? null,
        });
        if (ins.error) throw ins.error;
      }

      await load();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setUploading(false);
      setUploadingGuideId(null);
    }
  }

  async function deleteFile(row) {
    if (!isAdmin) return;
    if (!row?.id || !row?.path) return;
    if (!window.confirm(`Datei wirklich löschen?\n\n${row.filename}`)) return;

    setErr(null);
    const rm = await supabase.storage.from("guides").remove([row.path]);
    if (rm.error) {
      setErr(rm.error.message);
      return;
    }

    const del = await supabase.from("guide_files").delete().eq("id", row.id);
    if (del.error) {
      setErr(del.error.message);
      return;
    }

    setFiles((prev) => (prev || []).filter((f) => f.id !== row.id));
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
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={styles.btnPrimary} onClick={createGuide}>
                Anlegen
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
        {guides.map((g) => {
          const gFiles = filesForGuide(g.id);

          return (
            <div key={g.id} style={styles.card}>
              <div style={styles.h4}>{g.title}</div>
              <div style={{ color: "#666", fontSize: 13, marginBottom: 8 }}>
                Erstellt: {fmtDateTime(g.created_at)}
                {g.updated_at ? ` · Update: ${fmtDateTime(g.updated_at)}` : ""}
              </div>

              {g.content ? <div style={{ whiteSpace: "pre-wrap" }}>{g.content}</div> : null}

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Dateien</div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                  <label style={styles.fileBtn}>
                    Dateien auswählen
                    <input
                      type="file"
                      multiple
                      onChange={(e) => {
                        const picked = Array.from(e.target.files || []);
                        setPendingFiles((prev) => ({ ...prev, [g.id]: picked }));
                        // allow picking same file again later
                        e.target.value = "";
                      }}
                      disabled={uploading}
                      style={{ display: "none" }}
                    />
                  </label>

                  <button
                    type="button"
                    style={styles.btn}
                    onClick={() => uploadFiles(g.id, pendingFiles[g.id] || [])}
                    disabled={uploading || (pendingFiles[g.id] || []).length === 0}
                    title="Startet den Upload der ausgewählten Dateien"
                  >
                    Upload starten
                  </button>

                  
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {Array.isArray(pendingFiles[g.id]) && pendingFiles[g.id].length > 0
                      ? `${pendingFiles[g.id].length} Datei(en) ausgewählt`
                      : "Keine Dateien."}
                  </div>
{(pendingFiles[g.id] || []).length > 0 ? (
                    <span style={{ color: "#666", fontSize: 13 }}>
                      Ausgewählt: {(pendingFiles[g.id] || []).map((f) => f.name).join(", ")}
                    </span>
                  ) : (
                    <span style={{ color: "#666", fontSize: 13 }}>Mehrere Dateien möglich</span>
                  )}

                  {uploading && uploadingGuideId === g.id ? (
                    <span style={{ color: "#666", fontSize: 13 }}>Upload läuft…</span>
                  ) : null}
                </div>

                {gFiles.length === 0 ? (
                  <div style={{ color: "#666" }}>Keine Dateien.</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {gFiles.map((f) => (
                      <div key={f.id} style={styles.fileRow}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {f.filename}
                          </div>
                          <div style={{ color: "#666", fontSize: 12 }}>
                            {f.size ? `${Math.round(f.size / 1024)} KB` : "—"} · {fmtDateTime(f.created_at)}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                          <button style={styles.btn} onClick={() => onDownload(f.path)}>
                            Download
                          </button>
                          {isAdmin ? (
                            <button style={styles.btnDanger} onClick={() => deleteFile(f)}>
                              Löschen
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

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


/* ---------------- Kanboard (Placeholder) ---------------- */

function KanboardPanel({ isAdmin = false }) {
  const [areas, setAreas] = useState([]);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const [filterAreaId, setFilterAreaId] = useState("all");
  const [filterUserId, setFilterUserId] = useState("all");
  const [viewMode, setViewMode] = useState("assignee"); // "board" | "assignee"

  useEffect(() => {
    (async () => {
      setErr(null);
      setLoading(true);

      const { data: aData } = await supabase.from("areas").select("id, name, color").order("name", { ascending: true });
      if (Array.isArray(aData)) setAreas(aData);

      const { data: pData } = await supabase.from("profiles").select("id, email, name, role").order("name", { ascending: true });
      if (Array.isArray(pData)) setMembers(pData);

      const { data: tData, error: tErr } = await supabase
        .from("tasks")
        .select("id, title, status, due_at, area_id, assignee_id, areas:area_id(id, name, color), assignee:assignee_id(id, name, email)")
        .order("created_at", { ascending: false });

      if (tErr) setErr(tErr.message);
      if (Array.isArray(tData)) setTasks(tData);

      setLoading(false);
    })();
  }, []);

  async function moveTask(taskId, nextStatus) {
    setErr(null);
    const { error } = await supabase.from("tasks").update({ status: nextStatus }).eq("id", taskId);
    if (error) {
      setErr(error.message);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)));
  }

  const areaById = useMemo(() => new Map((areas || []).map((a) => [a.id, a])), [areas]);

  const filtered = (tasks || []).filter((t) => {
    if (filterAreaId !== "all" && String(t.area_id || "") !== String(filterAreaId)) return false;
    if (filterUserId !== "all" && String(t.assignee_id || "") !== String(filterUserId)) return false;
    return true;
  });

  const cols = {
    todo: filtered.filter((t) => (t.status || "todo") === "todo"),
    doing: filtered.filter((t) => (t.status || "") === "doing"),
    done: filtered.filter((t) => (t.status || "") === "done"),
  };

  function onDragStart(e, taskId) {
    e.dataTransfer.setData("text/plain", String(taskId));
    e.dataTransfer.effectAllowed = "move";
  }

  function onDrop(e, status) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    moveTask(id, status);
  }

  function allowDrop(e) {
    e.preventDefault();
  }

  return (
    <div style={styles.panel}>
      <div style={styles.rowBetween}>
        <div style={styles.h3}>Kanboard</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select value={filterAreaId} onChange={(e) => setFilterAreaId(e.target.value)} style={styles.input}>
            <option value="all">Alle Bereiche</option>
            {(areas || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)} style={styles.input}>
            <option value="all">Alle Nutzer</option>
            {(members || []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.email || m.id}
              </option>
            ))}
          </select>
          <select value={viewMode} onChange={(e) => setViewMode(e.target.value)} style={styles.input}>
            <option value="board">Kanban</option>
            <option value="assignee">Nach Mitarbeiter</option>
          </select>
          <button type="button" style={styles.btn} onClick={() => location.reload()}>
            Neu laden
          </button>
        </div>
      </div>

      {err ? <div style={styles.errorBox}>{err}</div> : null}
      {loading ? <div style={{ color: "#666" }}>Lädt…</div> : null}

      {viewMode === "board" ? (
      <div style={styles.kanbanGrid}>
        {[
          ["todo", "ToDo"],
          ["doing", "In Arbeit"],
          ["done", "Erledigt"],
        ].map(([key, label]) => (
          <div key={key} style={styles.kanCol} onDragOver={allowDrop} onDrop={(e) => onDrop(e, key)}>
            <div style={styles.colHeader}>
              <div style={styles.h3}>
                {label} <span style={styles.badge}>{cols[key].length}</span>
              </div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {cols[key].map((t) => {
                const areaObj = (t.area_id && areaById.get(t.area_id)) || t.areas || null;
                const areaLabel = t.area_label || areaObj?.name || "";
                const color = t.area_color || areaObj?.color || "#94a3b8";
                const assigneeName = t.assignee?.name || t.assignee?.email || (t.assignee_id ? String(t.assignee_id) : "Unzugeordnet");

                return (
                  <div key={t.id} style={{ ...styles.card, cursor: "grab" }} draggable onDragStart={(e) => onDragStart(e, t.id)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={styles.dot(color)} />
                      <div style={{ fontWeight: 800 }}>{t.title}</div>
                      {areaLabel ? <span style={styles.pill}>{areaLabel}</span> : null}
                      <div style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>{t.due_at ? fmtDateTime(t.due_at) : ""}</div>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>Zuständig: {assigneeName}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
              Tipp: Aufgaben per Drag & Drop in eine andere Spalte ziehen.
            </div>
          </div>
        ))}
      </div>
      ) : (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", alignItems: "start" }}>
          {(filterUserId === "all" ? (members || []) : (members || []).filter((m) => String(m.id) === String(filterUserId))).map((m) => {
            const mine = (filtered || []).filter((t) => String(t.assignee_id || "") === String(m.id));
            const by = {
              todo: mine.filter((t) => (t.status || "todo") === "todo"),
              doing: mine.filter((t) => (t.status || "") === "doing"),
              done: mine.filter((t) => (t.status || "") === "done"),
            };
const statusOrder = { todo: 0, doing: 1, done: 2 };
const mineSorted = [...mine].sort((a, b) => {
  const sa = String(a.status || "todo");
  const sb = String(b.status || "todo");
  const oa = statusOrder[sa] ?? 9;
  const ob = statusOrder[sb] ?? 9;
  if (oa !== ob) return oa - ob;
  const da = a.due_at ? new Date(a.due_at).getTime() : 9999999999999;
  const db = b.due_at ? new Date(b.due_at).getTime() : 9999999999999;
  if (da !== db) return da - db;
  return String(a.title || "").localeCompare(String(b.title || ""));
});


            // optional: hide empty users when "all"
            if (filterUserId === "all" && mine.length === 0) return null;

            return (
              <div key={m.id} style={styles.card}>
                <div style={styles.rowBetween}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900 }}>{m.name || m.email || m.id}</div>
                    <span style={styles.pill}>Gesamt: {mineSorted.length}</span>
                    <span style={styles.pill}>ToDo: {by.todo.length}</span>
                    <span style={styles.pill}>In Arbeit: {by.doing.length}</span>
                    <span style={styles.pill}>Erledigt: {by.done.length}</span>
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  {mineSorted.map((t) => {
                    const areaObj = (t.area_id && areaById.get(t.area_id)) || t.areas || null;
                    const areaLabel = t.area_label || areaObj?.name || "";
                    const color = t.area_color || areaObj?.color || "#94a3b8";
                    const st = String(t.status || "todo");
                    const stLabel = st === "doing" ? "In Arbeit" : st === "done" ? "Erledigt" : "ToDo";

                    return (
                      <div
                        key={t.id}
                        style={{
                          ...styles.card,
                          cursor: "grab",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                        draggable
                        onDragStart={(e) => onDragStart(e, t.id)}
                        title="Drag & Drop: Aufgabe in eine andere Spalte ziehen (Kanban-Ansicht)"
                      >
                        <span style={styles.dot(color)} />
                        <div style={{ fontWeight: 800 }}>{t.title}</div>
                        {areaLabel ? <span style={styles.pill}>{areaLabel}</span> : null}
                        <span style={styles.pill}>Status: {stLabel}</span>
                        <div style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>{t.due_at ? fmtDateTime(t.due_at) : ""}</div>
                      </div>
                    );
                  })}

                  {mineSorted.length === 0 ? <div style={{ color: "#666", fontSize: 13 }}>Keine Aufgaben.</div> : null}
                </div>
              </div>
            );

          })}
        </div>
      )}

    </div>
  );
}


/* ---------------- Calendar ---------------- */
function CalendarPanel({ areaList: areaListProp = [], userList: userListProp = [], currentUser = null, isAdmin = false }) {
  const [view, setView] = useState("month"); // "month" | "week"
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // filters
  const [filterAreaId, setFilterAreaId] = useState("all");
  const [filterUserId, setFilterUserId] = useState("all");
  const [viewMode, setViewMode] = useState("assignee"); // "board" | "assignee"


  const [areaList, setAreaList] = useState(() => (Array.isArray(areaListProp) ? areaListProp : []));
  const [userList, setUserList] = useState(() => (Array.isArray(userListProp) ? userListProp : []));

  useEffect(() => {
    // Fallback: Wenn keine Bereiche/Nutzer als Props reinkommen, selbst laden
    (async () => {
      try {
        if (!Array.isArray(areaList) || areaList.length === 0) {
          const { data: aData } = await supabase.from("areaList").select("id, name, color").order("name", { ascending: true });
          if (Array.isArray(aData)) setAreaList(aData);
        } else {
          setAreaList(areaList);
        }

        if (!Array.isArray(userList) || userList.length === 0) {
          const { data: pData } = await supabase.from("profiles").select("id, email, name, role").order("name", { ascending: true });
          if (Array.isArray(pData)) setUserList(pData);
        } else {
          setUserList(userList);
        }
      } catch (_) {
        // ignore
      }
    })();
  }, [areaList, userList]);


  // tasks data
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const showError = (msg) => setErr(String(msg || "Fehler"));
  const [quickTitle, setQuickTitle] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const isoDateKey = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.toISOString().slice(0, 10);
  };

  const formatDayLabel = (d) =>
    new Date(d).toLocaleDateString("de-DE", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  const toLocalInputValue = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const mergeDateKeepTime = (iso, targetDate) => {
    // keep time from iso, change date to targetDate
    const t = iso ? new Date(iso) : new Date();
    const nd = new Date(targetDate);
    nd.setHours(t.getHours(), t.getMinutes(), 0, 0);
    return nd.toISOString();
  };

  const canSeeUser = (u) => {
    if (!u) return false;
    if (isAdmin) return true;
    return u.id === currentUser?.id;
  };

  async function loadTasks(rangeStart, rangeEnd) {
    setLoading(true);
    try {
      let q = supabase
        .from("tasks")
        .select(
          "id,title,status,area_id,assignee_id,due_at,created_at"
        )
        .gte("due_at", rangeStart.toISOString())
        .lte("due_at", rangeEnd.toISOString())
        .order("due_at", { ascending: true });

      // RLS already limits. Extra filters below are client side.
      const { data, error } = await q;
      if (error) throw error;
      setTasks(Array.isArray(data) ? data : []);
    } catch (e) {
      showError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  // month range: from first visible cell to last visible cell
  const getMonthGridRange = () => {
    const first = new Date(monthCursor);
    first.setDate(1);
    const start = new Date(first);
    const day = (start.getDay() + 6) % 7; // monday=0
    start.setDate(start.getDate() - day);
    start.setHours(0, 0, 0, 0);

    const last = new Date(first);
    last.setMonth(last.getMonth() + 1);
    last.setDate(0);
    last.setHours(23, 59, 59, 999);

    const end = new Date(last);
    const lastDay = (end.getDay() + 6) % 7;
    end.setDate(end.getDate() + (6 - lastDay));
    end.setHours(23, 59, 59, 999);

    return { start, end };
  };

  const getWeekRange = () => {
    const d = new Date(selectedDate);
    d.setHours(0, 0, 0, 0);
    const day = (d.getDay() + 6) % 7;
    const start = new Date(d);
    start.setDate(start.getDate() - day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  };

  useEffect(() => {
    const { start, end } = view === "month" ? getMonthGridRange() : getWeekRange();
    loadTasks(start, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, monthCursor, selectedDate]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (!t?.due_at) return false;
      if (filterAreaId !== "all" && t.area_id !== filterAreaId) return false;
      if (filterUserId !== "all" && t.assignee_id !== filterUserId) return false;
      return true;
    });
  }, [tasks, filterAreaId, filterUserId]);

  const tasksByDay = useMemo(() => {
    const map = new Map();
    for (const t of filteredTasks) {
      const k = isoDateKey(t.due_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    }
    return map;
  }, [filteredTasks]);

  const selectedKey = isoDateKey(selectedDate);
  const selectedTasks = tasksByDay.get(selectedKey) || [];

  async function updateTask(taskId, patch) {
    setSavingId(taskId);
    try {
      const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
      if (error) throw error;
      // refresh local state
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t))
      );
    } catch (e) {
      showError(e?.message || String(e));
    } finally {
      setSavingId(null);
    }
  }

  async function deleteTask(taskId) {
    if (!confirm("Aufgabe wirklich löschen?")) return;
    setSavingId(taskId);
    try {
      const { error } = await supabase.from("tasks").delete().eq("id", taskId);
      if (error) throw error;
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (e) {
      showError(e?.message || String(e));
    } finally {
      setSavingId(null);
    }
  }

  async function createTask() {
    const title = quickTitle.trim();
    if (!title) return;
    setSavingId("new");
    try {
      const dueIso = mergeDateKeepTime(null, selectedDate);
      const insert = {
        title,
        status: "open",
        area_id: filterAreaId !== "all" ? filterAreaId : null,
        assignee_id:
          filterUserId !== "all" ? filterUserId : currentUser?.id || null,
        due_at: dueIso,
      };
      const { data, error } = await supabase
        .from("tasks")
        .insert(insert)
        .select("id,title,status,area_id,assignee_id,due_at,created_at")
        .single();
      if (error) throw error;
      setTasks((prev) => [...prev, data].sort((a, b) => new Date(a.due_at) - new Date(b.due_at)));
      setQuickTitle("");
      setEditingId(data.id);
    } catch (e) {
      showError(e?.message || String(e));
    } finally {
      setSavingId(null);
    }
  }

  // Drag & Drop
  const onDragStartTask = (ev, task) => {
    ev.dataTransfer.setData("text/task_id", task.id);
    ev.dataTransfer.setData("text/task_due", task.due_at || "");
    ev.dataTransfer.effectAllowed = "move";
  };

  const onDropDay = async (ev, dayDate) => {
    ev.preventDefault();
    const taskId = ev.dataTransfer.getData("text/task_id");
    const due = ev.dataTransfer.getData("text/task_due");
    if (!taskId) return;
    const nextDue = mergeDateKeepTime(due, dayDate);
    await updateTask(taskId, { due_at: nextDue });
  };

  const renderTaskPill = (t) => {
    const area = areaList?.find((a) => a.id === t.area_id);
    const assignee = userList?.find((u) => u.id === t.assignee_id);
    const label = `${t.title}${assignee ? ` · ${assignee.name}` : ""}`;
    return (
      <div
        key={t.id}
        draggable
        onDragStart={(e) => onDragStartTask(e, t)}
        title={label}
        style={{
          fontSize: 11,
          padding: "2px 6px",
          borderRadius: 999,
          background: area?.color || "rgba(0,0,0,0.06)",
          color: "#111",
          cursor: "grab",
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          border: "1px solid rgba(0,0,0,0.10)",
        }}
        onClick={() => {
          setSelectedDate(new Date(t.due_at));
          setEditingId(t.id);
        }}
      >
        {t.title}
      </div>
    );
  };

  const renderMonthGrid = () => {
    const { start, end } = getMonthGridRange();
    const days = [];
    const d = new Date(start);
    while (d <= end) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }

    const weekDays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    const isSameMonth = (x) => x.getMonth() === monthCursor.getMonth();
    const isToday = (x) => isoDateKey(x) === isoDateKey(new Date());
    const isSelected = (x) => isoDateKey(x) === selectedKey;

    return (
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
          {weekDays.map((w) => (
            <div key={w} style={{ fontWeight: 700, fontSize: 12, opacity: 0.8 }}>
              {w}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
          {days.map((day) => {
            const k = isoDateKey(day);
            const items = tasksByDay.get(k) || [];
            return (
              <div
                key={k}
                onClick={() => setSelectedDate(day)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDropDay(e, day)}
                style={{
                  minHeight: 92,
                  background: isSelected(day)
                    ? "rgba(34,197,94,0.12)"
                    : "rgba(255,255,255,0.92)",
                  border: isToday(day)
                    ? "2px solid rgba(34,197,94,0.8)"
                    : "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 12,
                  padding: 8,
                  cursor: "pointer",
                  opacity: isSameMonth(day) ? 1 : 0.55,
                  boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
                  overflow: "hidden",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{day.getDate()}</div>
                  {items.length > 0 ? (
                    <div style={{ fontSize: 11, opacity: 0.7 }}>{items.length}</div>
                  ) : null}
                </div>

                <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                  {items.slice(0, 4).map(renderTaskPill)}
                  {items.length > 4 ? (
                    <div style={{ fontSize: 11, opacity: 0.7 }}>+{items.length - 4} mehr</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeekGrid = () => {
    const { start, end } = getWeekRange();
    const days = [];
    const d = new Date(start);
    while (d <= end) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }

    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {days.map((day) => {
          const k = isoDateKey(day);
          const items = tasksByDay.get(k) || [];
          const selected = isoDateKey(day) === selectedKey;
          return (
            <div
              key={k}
              onClick={() => setSelectedDate(day)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropDay(e, day)}
              style={{
                minHeight: 260,
                background: selected ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.92)",
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 12,
                padding: 10,
                boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
                overflow: "hidden",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 8 }}>
                {day.toLocaleDateString("de-DE", { weekday: "short" })} {day.getDate()}
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {items.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.6 }}>—</div>
                ) : (
                  items.map(renderTaskPill)
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const EditRow = ({ task }) => {
    const isEditing = editingId === task.id;
    const area = areaList?.find((a) => a.id === task.area_id);
    const assignee = userList?.find((u) => u.id === task.assignee_id);
    const disabled = savingId === task.id;

    return (
      <div
        style={{
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
          padding: 10,
          background: "rgba(255,255,255,0.92)",
          boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
          display: "grid",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: area?.color || "rgba(0,0,0,0.2)",
              }}
            />
            <div style={{ fontWeight: 800, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>
              {task.title}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setEditingId(isEditing ? null : task.id)}
              style={styles.smallBtn}
              disabled={disabled}
              title={isEditing ? "Schließen" : "Bearbeiten"}
            >
              {isEditing ? "Fertig" : "Bearbeiten"}
            </button>
            <button
              onClick={() => deleteTask(task.id)}
              style={{ ...styles.smallBtn, borderColor: "rgba(239,68,68,0.35)" }}
              disabled={disabled}
              title="Löschen"
            >
              Löschen
            </button>
          </div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          {assignee ? `Zuständig: ${assignee.name}` : "Zuständig: —"} · Status: {task.status || "—"}
        </div>

        {isEditing ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={styles.label}>Titel</label>
              <input
                style={styles.input}
                defaultValue={task.title || ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== task.title) updateTask(task.id, { title: v });
                }}
                disabled={disabled}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={styles.label}>Termin</label>
              <input
                type="datetime-local"
                style={styles.input}
                defaultValue={toLocalInputValue(task.due_at)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  const iso = new Date(v).toISOString();
                  updateTask(task.id, { due_at: iso });
                }}
                disabled={disabled}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={styles.label}>Status</label>
              <select
                style={styles.select}
                value={task.status || "open"}
                onChange={(e) => updateTask(task.id, { status: e.target.value })}
                disabled={disabled}
              >
                <option value="open">offen</option>
                <option value="in_progress">in Bearbeitung</option>
                <option value="done">erledigt</option>
                <option value="blocked">blockiert</option>
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={styles.label}>Bereich</label>
                <select
                  style={styles.select}
                  value={task.area_id || ""}
                  onChange={(e) => updateTask(task.id, { area_id: e.target.value || null })}
                  disabled={disabled}
                >
                  <option value="">—</option>
                  {(areaList || []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={styles.label}>Nutzer</label>
                <select
                  style={styles.select}
                  value={task.assignee_id || ""}
                  onChange={(e) => updateTask(task.id, { assignee_id: e.target.value || null })}
                  disabled={disabled}
                >
                  <option value="">—</option>
                  {(userList || []).filter(canSeeUser).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const monthLabel = monthCursor.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  const navPrev = () => {
    if (view === "month") {
      const d = new Date(monthCursor);
      d.setMonth(d.getMonth() - 1);
      setMonthCursor(d);
    } else {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 7);
      setSelectedDate(d);
    }
  };

  const navNext = () => {
    if (view === "month") {
      const d = new Date(monthCursor);
      d.setMonth(d.getMonth() + 1);
      setMonthCursor(d);
    } else {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + 7);
      setSelectedDate(d);
    }
  };

  const reload = () => {
    const { start, end } = view === "month" ? getMonthGridRange() : getWeekRange();
    loadTasks(start, end);
  };

  return (
    <div style={styles.calendarOuter}>
      <div style={styles.calendarPanelCard}>
        <div style={{ display: "grid", gap: 14 }}>
      {err ? <div style={styles.error}>Fehler: {err}</div> : null}
      <div style={styles.sectionHeader}>
        <div>
          <div style={styles.sectionTitle}>Kalender</div>
          <div style={styles.sectionSub}>
            {view === "month" ? `Monatsansicht · ${monthLabel}` : `Wochenansicht · ${formatDayLabel(selectedDate)}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            style={view === "month" ? styles.tabBtnActive : styles.tabBtn}
            onClick={() => setView("month")}
          >
            Monat
          </button>
          <button
            style={view === "week" ? styles.tabBtnActive : styles.tabBtn}
            onClick={() => setView("week")}
          >
            Woche
          </button>
          <button style={styles.tabBtn} onClick={navPrev} title="Zurück">
            ◀
          </button>
          <button style={styles.tabBtn} onClick={navNext} title="Weiter">
            ▶
          </button>
          <button style={styles.tabBtn} onClick={reload} disabled={loading}>
            Neu laden
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select
              style={styles.select}
              value={filterAreaId}
              onChange={(e) => setFilterAreaId(e.target.value)}
              title="Bereich-Filter"
            >
              <option value="all">Alle Bereiche</option>
              {(areaList || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            <select
              style={styles.select}
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              title="Nutzer-Filter"
            >
              <option value="all">Alle Nutzer</option>
              {(userList || []).filter(canSeeUser).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>

            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Tipp: Aufgaben per Drag & Drop auf ein anderes Datum ziehen.
            </div>
          </div>

          {view === "month" ? renderMonthGrid() : renderWeekGrid()}
        </div>

        <div style={{ ...styles.card, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 14 }}>Aufgaben am {formatDayLabel(selectedDate)}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{selectedTasks.length} Einträge</div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={styles.label}>Neue Aufgabe</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={styles.input}
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  placeholder="Titel…"
                />
                <button style={styles.primaryBtn} onClick={createTask} disabled={savingId === "new"}>
                  Hinzufügen
                </button>
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Die Aufgabe wird direkt mit dem gewählten Datum angelegt. Bereich/Nutzer übernimmt den aktuellen Filter (falls gesetzt).
              </div>
            </div>

            {selectedTasks.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.7 }}>Keine Einträge.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {selectedTasks.map((t) => (
                  <EditRow key={t.id} task={t} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
  );
}

/* ---------------- User Settings Panel ---------------- */
function UserSettingsPanel({ userId, settings, onChange }) {
  const [draft, setDraft] = useState(() => ({
    primary_color: settings?.primary_color || "#0b6b2a",
    background_color: settings?.background_color || "#f3f6fb",
    background_image_url: settings?.background_image_url || "",
    notifications_enabled: settings?.notifications_enabled !== false,
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    setDraft({
      primary_color: settings?.primary_color || "#0b6b2a",
      background_color: settings?.background_color || "#f3f6fb",
      background_image_url: settings?.background_image_url || "",
      notifications_enabled: settings?.notifications_enabled !== false,
    });
  }, [settings?.primary_color, settings?.background_color, settings?.background_image_url, settings?.notifications_enabled]);

  async function save() {
    setErr(null);
    setInfo(null);
    setSaving(true);
    try {
      await upsertUserSettings(userId, draft);
      setInfo("Gespeichert.");
      onChange?.(draft);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.panel}>
      <div style={styles.rowBetween}>
        <div style={styles.h3}>Einstellungen</div>
        <button style={styles.btn} onClick={save} disabled={saving}>
          {saving ? "Speichere…" : "Speichern"}
        </button>
      </div>

      {err ? <div style={styles.error}>Fehler: {err}</div> : null}
      {info ? <div style={{ ...styles.card, borderColor: "#d8e0ef", background: "#f7f9ff" }}>{info}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 10 }}>
        <div style={styles.card}>
          <div style={styles.h4}>Farben</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10, alignItems: "center" }}>
            <div style={{ color: "#666", fontSize: 13 }}>Primärfarbe (Buttons / aktiver Tab)</div>
            <input
              type="color"
              value={draft.primary_color || "#0b6b2a"}
              onChange={(e) => setDraft((d) => ({ ...d, primary_color: e.target.value }))}
              style={styles.colorInput}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10, alignItems: "center", marginTop: 10 }}>
            <div style={{ color: "#666", fontSize: 13 }}>Hintergrundfarbe</div>
            <input
              type="color"
              value={draft.background_color || "#f3f6fb"}
              onChange={(e) => setDraft((d) => ({ ...d, background_color: e.target.value }))}
              style={styles.colorInput}
            />
          </div>

          <div style={{ marginTop: 10, color: "#666", fontSize: 13 }}>
            Tipp: Wir machen die finalen Styles (Layouts, Abstände, optische Feinheiten) sauber ganz zum Schluss.
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.h4}>Hintergrundbild (optional)</div>
          <div style={{ color: "#666", fontSize: 13, marginBottom: 8 }}>
            Wenn gesetzt, überschreibt das Bild die Hintergrundfarbe. (z.B. URL zu einem internen Bild oder CDN)
          </div>
          <input
            value={draft.background_image_url}
            onChange={(e) => setDraft((d) => ({ ...d, background_image_url: e.target.value }))}
            placeholder="https://…"
            style={{ ...styles.input, width: "100%" }}
          />
          <div style={{ marginTop: 12 }}>
            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={!!draft.notifications_enabled}
                onChange={(e) => setDraft((d) => ({ ...d, notifications_enabled: e.target.checked }))}
              />
              <span>Benachrichtigungen aktiv</span>
            </label>
          </div>

          <div style={{ marginTop: 10, color: "#666", fontSize: 13 }}>
            Hinweis: Die Benachrichtigung ist vorbereitet (Einstellung + Speicherung). Die echte Notification-Logik (E-Mail/Push) bauen wir als eigenes Paket.
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

  const [userSettings, setUserSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(false);


  async function refreshAuth() {
    setAuthLoading(true);
    setAuthError(null);

    try {
      const ctx = await loadMyAuthContext();
      setAuth(ctx);
      if (ctx?.profile?.id) {
        setSettingsLoading(true);
        const s = await loadUserSettings(ctx.profile.id);
        setUserSettings(s);
        setSettingsLoading(false);
      } else {
        setUserSettings(null);
      }
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

  const primary = userSettings?.primary_color || "#0b6b2a";
  const pageBg = userSettings?.background_color || "#f3f6fb";
  const bgImg = (userSettings?.background_image_url || "").trim();
  const pageStyle = {
    ...styles.page,
    // Dezent Corporate-Glass (lesbar): helle Glas-Karten + dunkle Schrift
    "--primary": primary,
    "--page-bg": pageBg,
    "--text": "rgba(15,23,42,0.96)",
    "--text-soft": "rgba(51,65,85,0.92)",
    "--card-bg": "rgba(255,255,255,0.78)",
    "--card-border": "rgba(15,23,42,0.12)",
    "--card-shadow": "0 18px 46px rgba(2,6,23,0.18)",
    "--card-shadow-soft": "0 10px 28px rgba(2,6,23,0.14)",
    "--input-bg": "rgba(255,255,255,0.92)",
    "--input-border": "rgba(15,23,42,0.16)",
    "--muted-bg": "rgba(255,255,255,0.55)",
    ...(bgImg
      ? {
          // Overlay beruhigt das Bild, ohne den Kontrast zu killen
          backgroundImage: `linear-gradient(rgba(15,23,42,0.22), rgba(15,23,42,0.22)), url(${bgImg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }
      : {
          background: "linear-gradient(180deg, rgba(241,245,249,1), rgba(226,232,240,1))",
        }),
  };

  
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return (
      <div style={pageStyle}>
        <div style={styles.panel}>
          <div style={styles.h3}>Konfiguration fehlt</div>
          <div>Bitte setze NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY.</div>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div style={pageStyle}>
        <div style={styles.panel}>Lade…</div>
      </div>
    );
  }

  if (auth.inactive) {
    return (
      <div style={pageStyle}>
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
      <div style={pageStyle}>
        <div style={styles.panel}>
          <div style={styles.h3}>Bitte anmelden</div>
          <div style={{ color: "#666" }}>
            Du bist nicht eingeloggt. Bitte melde dich über die Login-Seite an.
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              style={styles.btnPrimary}
              onClick={() => (window.location.href = "/login")}
            >
              Zur Login-Seite
            </button>
            <button style={styles.btn} onClick={refreshAuth}>
              Neu laden
            </button>
          </div>

          {authError ? <div style={styles.error}>Fehler: {authError}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={styles.topbar}>
        <div style={styles.brand}>Armaturenbrett</div>

        <div style={styles.tabs}>
          <TabBtn active={activeTab === "board"} onClick={() => setActiveTab("board")}>
            Plan
          </TabBtn>
<TabBtn active={activeTab === "kanboard"} onClick={() => setActiveTab("kanboard")}>
  Kanboard
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

          <TabBtn active={activeTab === "settings"} onClick={() => setActiveTab("settings")}>
            Einstellungen
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
          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ color: "#555", fontSize: 14 }}>{auth.profile?.email || auth.user.email}</div>
            <div style={{ color: "#777", fontSize: 12 }}>{new Date().toLocaleString("de-DE")} · Version {process.env.NEXT_PUBLIC_APP_VERSION || "dev"}</div>
          </div>
          <button style={styles.btn} onClick={signOut}>
            Abmelden
          </button>
        </div>
      </div>

      {authError ? <div style={{ ...styles.panel, ...styles.error }}>Fehler: {authError}</div> : null}

      {activeTab === "board" ? <TasksBoard isAdmin={auth.isAdmin} /> : null}
{activeTab === "kanboard" ? <KanboardPanel isAdmin={auth.isAdmin} /> : null}
      {activeTab === "calendar" ? <CalendarPanel currentUser={auth.user} isAdmin={auth.isAdmin} /> : null}
      {activeTab === "guides" ? <GuidesPanel isAdmin={auth.isAdmin} /> : null}
      {activeTab === "areas" ? <AreasPanel isAdmin={auth.isAdmin} /> : null}
      {activeTab === "settings" ? (
        <UserSettingsPanel userId={auth.profile?.id} settings={userSettings} onChange={(s) => setUserSettings((prev) => ({ ...(prev || {}), ...(s || {}) }))} />
      ) : null}
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
        ...(active ? styles.tabActive : {}),
      }}
    >
      {children}
    </button>
  );
}

/* ---------------- Styles ---------------- */
const USER_COLORS = [
  "#2563eb", "#16a34a", "#dc2626", "#7c3aed", "#ea580c",
  "#0d9488", "#db2777", "#ca8a04", "#4f46e5", "#059669"
];

const styles = {
  /* ---------------- Layout / Theme ---------------- */
  page: {
    minHeight: "100vh",
    background: "var(--page-bg, #0b1220)",
    color: "var(--text, #0f172a)",
    padding: 16,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    lineHeight: 1.35,
  },

  topbar: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  brand: {
    fontSize: 28,
    fontWeight: 850,
    letterSpacing: -0.6,
    color: "var(--brand, #0b1220)",
  },

  tabs: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },

  tab: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 34,
    border: "1px solid var(--card-border, rgba(15,23,42,0.14))",
    background: "var(--card-bg, rgba(255,255,255,0.78))",
    padding: "8px 12px",
    borderRadius: 999,
    cursor: "pointer",
    fontWeight: 750,
    fontSize: 13,
    color: "var(--tab-text, #0f172a)",
    backdropFilter: "blur(8px)",
    transition: "transform 120ms ease, background 120ms ease, border-color 120ms ease",
    userSelect: "none",
  },

  tabActive: {
    background: "rgba(59,130,246,0.18)",
    borderColor: "rgba(59,130,246,0.55)",
  },

  right: {
    display: "flex",
    gap: 10,
    alignItems: "center",
  },

  panel: {
    background: "var(--card-bg, rgba(255,255,255,0.78))",
    border: "1px solid var(--card-border, rgba(15,23,42,0.14))",
    borderRadius: 20,
    padding: 18,
    boxShadow: "var(--card-shadow, 0 14px 40px rgba(2,6,23,0.18))",
    backdropFilter: "blur(10px)",
  },

  /* kleiner Farbpunkte-Indikator (z.B. Bereichsfarbe) */
  dot: (color) => ({
    width: 10,
    height: 10,
    borderRadius: 999,
    display: "inline-block",
    background: color || "rgba(148,163,184,0.95)",
    boxShadow: "0 0 0 3px rgba(15,23,42,0.06)",
    flex: "0 0 auto",
  }),

  kanbanGrid: {
    display: "flex",
    gap: 12,
    alignItems: "stretch",
    overflowX: "auto",
    paddingBottom: 8,
    scrollSnapType: "x mandatory",
  },

  kanCol: {
    background: "var(--card-bg, rgba(255,255,255,0.78))",
    border: "1px solid var(--card-border, rgba(15,23,42,0.14))",
    borderRadius: 18,
    padding: 14,
    minHeight: 480,
    flex: "1 0 380px",
    scrollSnapAlign: "start",

    boxShadow: "var(--card-shadow-soft, 0 10px 26px rgba(2,6,23,0.16))",
    backdropFilter: "blur(10px)",
  },

  details: {
    background: "var(--card-bg, rgba(255,255,255,0.78))",
    border: "1px solid var(--card-border, rgba(15,23,42,0.14))",
    borderRadius: 18,
    padding: 16,
    boxShadow: "var(--card-shadow-soft, 0 10px 26px rgba(2,6,23,0.16))",
    backdropFilter: "blur(10px)",
  },

  detailsSummary: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
    marginTop: 12,
  },

  calendarOuter: {
    display: "grid",
    gridTemplateColumns: "1.3fr 0.7fr",
    gap: 12,
    alignItems: "start",
  },

  calendarPanelCard: {
    background: "var(--card-bg, rgba(255,255,255,0.78))",
    border: "1px solid var(--card-border, rgba(15,23,42,0.14))",
    borderRadius: 18,
    padding: 16,
    boxShadow: "var(--card-shadow-soft, 0 10px 26px rgba(2,6,23,0.16))",
    backdropFilter: "blur(10px)",
  },

  badge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 26,
    height: 22,
    padding: "0 8px",
    borderRadius: 999,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: 800,
    color: "#0f172a",
  },

  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 10px",
    borderRadius: 999,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: 750,
    color: "#0f172a",
  },

  card: {
    background: "var(--card-bg, rgba(255,255,255,0.78))",
    border: "1px solid var(--card-border, rgba(15,23,42,0.14))",
    borderRadius: 16,
    padding: 14,
    boxShadow: "var(--card-shadow-soft, 0 10px 26px rgba(2,6,23,0.16))",
    backdropFilter: "blur(10px)",
  },

  /* ---------------- Inputs / Buttons ---------------- */
  input: {
    width: "100%",
    height: 38,
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.14)",
    background: "rgba(255,255,255,0.92)",
    color: "#0f172a",
    outline: "none",
    fontSize: 14,
  },

  textarea: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.14)",
    background: "rgba(255,255,255,0.92)",
    color: "#0f172a",
    outline: "none",
    fontSize: 14,
    minHeight: 100,
    resize: "vertical",
  },

  btn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 38,
    padding: "8px 14px",
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.14)",
    background: "rgba(255,255,255,0.82)",
    color: "#0f172a",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    transition: "transform 120ms ease, background 120ms ease, border-color 120ms ease",
    backdropFilter: "blur(8px)",
    userSelect: "none",
    whiteSpace: "nowrap",
  },

  btnPrimary: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 38,
    padding: "8px 14px",
    borderRadius: 12,
    border: "1px solid rgba(59,130,246,0.70)",
    background: "linear-gradient(180deg, rgba(59,130,246,0.95), rgba(37,99,235,0.92))",
    color: "#fff",
    fontWeight: 850,
    fontSize: 13,
    cursor: "pointer",
    boxShadow: "0 10px 26px rgba(2,6,23,0.18)",
    userSelect: "none",
    whiteSpace: "nowrap",
  },

  btnDanger: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 38,
    padding: "8px 14px",
    borderRadius: 12,
    border: "1px solid rgba(239,68,68,0.55)",
    background: "rgba(239,68,68,0.10)",
    color: "#991b1b",
    fontWeight: 850,
    fontSize: 13,
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  },

  btnSmall: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 32,
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid rgba(15,23,42,0.14)",
    background: "rgba(255,255,255,0.88)",
    color: "#0f172a",
    fontWeight: 800,
    fontSize: 12.5,
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  },

  btnSmallPrimary: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 32,
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid rgba(59,130,246,0.70)",
    background: "rgba(59,130,246,0.16)",
    color: "#0b2a66",
    fontWeight: 900,
    fontSize: 12.5,
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  },

  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(2,6,23,0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    zIndex: 50,
  },

  modal: {
    width: "min(860px, 100%)",
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(15,23,42,0.14)",
    borderRadius: 22,
    boxShadow: "0 26px 80px rgba(0,0,0,0.35)",
    backdropFilter: "blur(12px)",
    overflow: "hidden",
    color: "#0f172a",
  },

  modalHeader: {
    padding: 16,
    borderBottom: "1px solid rgba(15,23,42,0.12)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  error: {
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(248,113,113,0.35)",
    background: "rgba(248,113,113,0.10)",
    color: "#991b1b",
    fontWeight: 750,
  },

  taskFormGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
    alignItems: "end",
  },

  subRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto auto",
    gap: 10,
    alignItems: "center",
  },

  areaDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "var(--primary, #3b82f6)",
    display: "inline-block",
  },

  colorInput: {
    width: 42,
    height: 34,
    borderRadius: 10,
    border: "1px solid rgba(15,23,42,0.14)",
    background: "rgba(255,255,255,0.92)",
    padding: 0,
  },

  fileBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 38,
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px dashed rgba(15,23,42,0.22)",
    background: "rgba(255,255,255,0.88)",
    color: "#0f172a",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
    userSelect: "none",
    whiteSpace: "nowrap",
  },
};

