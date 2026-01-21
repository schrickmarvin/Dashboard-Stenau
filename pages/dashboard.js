diff --git a/pages/dashboard.js b/pages/dashboard.js
index 332006d7c6e258dce6b1f18c374f560d3fa9a96f..e177d986c0748c665fb4acd24e08159e0ffad48f 100644
--- a/pages/dashboard.js
+++ b/pages/dashboard.js
@@ -1,154 +1,224 @@
 // pages/dashboard.js
 // Standalone dashboard page (React) for Next.js + Supabase
+// Hinweis: Datei vollständig übernehmen (keine diff-Markierungen wie "diff --git" einfügen).
 
 import React, { useEffect, useMemo, useState } from "react";
 import { createClient } from "@supabase/supabase-js";
 
-/* ---------------- Supabase ---------------function TasksBoard({ isAdmin }) {
+/* ---------------- Supabase --------------- */
+
+function TasksBoard({ isAdmin }) {
   const [areas, setAreas] = useState([]);
   const [guides, setGuides] = useState([]);
   const [tasks, setTasks] = useState([]);
+  const [series, setSeries] = useState([]);
 
   const [form, setForm] = useState({
     title: "",
     area: "",
     due_at: "",
     status: "todo",
     guideIds: [],
   });
   const [subDrafts, setSubDrafts] = useState({});
   const [guideModal, setGuideModal] = useState({ open: false, loading: false, guide: null, error: null });
+  const [seriesForm, setSeriesForm] = useState({
+    title: "",
+    area: "",
+    start_at: new Date().toISOString().slice(0, 16),
+    recurrence: "weekly",
+    interval: 1,
+    count: 8,
+    updateFuture: false,
+  });
+  const [seriesEditId, setSeriesEditId] = useState(null);
+  const [seriesSubDraft, setSeriesSubDraft] = useState({ title: "", guide_id: "", color: "#6b7280" });
+  const [seriesSubtasks, setSeriesSubtasks] = useState([]);
+  const [seriesLoading, setSeriesLoading] = useState(false);
 
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
+  const canWrite = true;
 
   async function loadAll() {
     setErr(null);
     setLoading(true);
 
     // Tasks: use area_id, due_at, status, title
     const { data: tData, error: tErr } = await supabase
       .from("tasks")
-      .select("id, title, area, area_id, due_at, status, created_at, subtasks ( id, title, is_done, color, created_at, guide_id, guides ( id, title ) )")
+      .select("id, title, area, area_id, due_at, status, created_at, is_series, series_id, series_parent_id, subtasks ( id, title, is_done, color, created_at, guide_id, guides ( id, title ) )")
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
 
-    setTasks(decoratedTasks);
+    setTasks(decoratedTasks.filter((t) => !t.is_series));
     setAreas(areasList || []);
     setGuides(guidesRes.data || []);
     setLoading(false);
   }
 
+  async function loadSeries() {
+    setSeriesLoading(true);
+    const { data: seriesData, error: seriesErr } = await supabase
+      .from("tasks")
+      .select("id, title, area, area_id, due_at, series_rule, series_interval, series_until, repeat_count, created_at, subtasks ( id, title, guide_id, color )")
+      .eq("is_series", true)
+      .order("created_at", { ascending: false });
+
+    if (seriesErr) {
+      console.warn("series load failed:", seriesErr.message);
+      setSeries([]);
+      setSeriesLoading(false);
+      return;
+    }
+
+    setSeries(seriesData || []);
+    setSeriesLoading(false);
+  }
+
   useEffect(() => {
     loadAll();
+    loadSeries();
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
 
+  function addSeriesSubtask() {
+    if (!seriesSubDraft.title.trim()) return;
+    const tempId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
+    setSeriesSubtasks((prev) => [
+      ...prev,
+      {
+        id: tempId,
+        title: seriesSubDraft.title.trim(),
+        guide_id: seriesSubDraft.guide_id || null,
+        color: seriesSubDraft.color || "#6b7280",
+      },
+    ]);
+    setSeriesSubDraft({ title: "", guide_id: "", color: seriesSubDraft.color || "#6b7280" });
+  }
+
+  function removeSeriesSubtask(id) {
+    setSeriesSubtasks((prev) => prev.filter((s) => s.id !== id));
+  }
+
+  function generateSeriesDates(startAt, recurrence, interval, count) {
+    const dates = [];
+    const base = new Date(startAt);
+    for (let i = 0; i < count; i += 1) {
+      const d = new Date(base);
+      if (recurrence === "daily") d.setDate(base.getDate() + i * interval);
+      if (recurrence === "weekly") d.setDate(base.getDate() + i * interval * 7);
+      if (recurrence === "monthly") d.setMonth(base.getMonth() + i * interval);
+      dates.push(d.toISOString());
+    }
+    return dates;
+  }
+
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
 
@@ -209,50 +279,249 @@ import { createClient } from "@supabase/supabase-js";
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
 
   async function toggleStatus(task) {
     const next = (task.status ?? "todo") === "done" ? "todo" : "done";
     const { error } = await supabase.from("tasks").update({ status: next }).eq("id", task.id);
     if (error) {
       setErr(error.message);
       return;
     }
     setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
   }
 
+  async function createSeries() {
+    if (!seriesForm.title.trim()) return;
+    setErr(null);
+    const areaText = (seriesForm.area || "").trim();
+    const matched = areaText
+      ? (areas || []).find((a) => String(a.name || "").toLowerCase() === areaText.toLowerCase())
+      : null;
+    const count = Math.max(1, Number(seriesForm.count) || 1);
+    const interval = Math.max(1, Number(seriesForm.interval) || 1);
+
+    const dates = generateSeriesDates(seriesForm.start_at, seriesForm.recurrence, interval, count);
+    const seriesUntil = dates[dates.length - 1];
+
+    const { data: seriesRow, error: seriesErr } = await supabase
+      .from("tasks")
+      .insert({
+        title: seriesForm.title.trim(),
+        status: "todo",
+        due_at: dates[0],
+        area_id: matched ? matched.id : null,
+        area: areaText || null,
+        is_series: true,
+        series_rule: seriesForm.recurrence,
+        series_interval: interval,
+        series_until: seriesUntil,
+        repeat_count: count,
+      })
+      .select("id")
+      .single();
+
+    if (seriesErr) {
+      setErr(seriesErr.message);
+      return;
+    }
+
+    const seriesId = seriesRow?.id;
+    const templates = seriesSubtasks.map((s) => ({
+      title: s.title,
+      guide_id: s.guide_id || null,
+      color: s.color || null,
+    }));
+
+    if (templates.length > 0) {
+      const { error: tempErr } = await supabase.from("subtasks").insert(
+        templates.map((t) => ({
+          ...t,
+          task_id: seriesId,
+        }))
+      );
+      if (tempErr) console.warn("series subtasks insert failed:", tempErr.message);
+    }
+    const taskRows = dates.map((dueAt) => ({
+      title: seriesForm.title.trim(),
+      status: "todo",
+      due_at: dueAt,
+      area_id: matched ? matched.id : null,
+      area: areaText || null,
+      series_id: seriesId,
+      series_parent_id: seriesId,
+    }));
+
+    const { data: createdTasks, error: taskErr } = await supabase
+      .from("tasks")
+      .insert(taskRows)
+      .select("id");
+    if (taskErr) {
+      setErr(taskErr.message);
+      return;
+    }
+
+    const subtaskRows = [];
+    for (const t of createdTasks || []) {
+      for (const s of templates) {
+        subtaskRows.push({
+          task_id: t.id,
+          title: s.title,
+          guide_id: s.guide_id || null,
+          color: s.color || null,
+        });
+      }
+    }
+
+    if (subtaskRows.length > 0) {
+      const { error: subErr } = await supabase.from("subtasks").insert(subtaskRows);
+      if (subErr) console.warn("series subtasks copy failed:", subErr.message);
+    }
+
+    setSeriesForm((prev) => ({ ...prev, title: "", area: "" }));
+    setSeriesSubtasks([]);
+    loadAll();
+    loadSeries();
+  }
+
+  async function saveSeries() {
+    if (!seriesEditId) return;
+    if (!seriesForm.title.trim()) return;
+    setErr(null);
+    const areaText = (seriesForm.area || "").trim();
+    const matched = areaText
+      ? (areas || []).find((a) => String(a.name || "").toLowerCase() === areaText.toLowerCase())
+      : null;
+    const count = Math.max(1, Number(seriesForm.count) || 1);
+    const interval = Math.max(1, Number(seriesForm.interval) || 1);
+    const dates = generateSeriesDates(seriesForm.start_at, seriesForm.recurrence, interval, count);
+    const seriesUntil = dates[dates.length - 1];
+
+    const { error: seriesErr } = await supabase
+      .from("tasks")
+      .update({
+        title: seriesForm.title.trim(),
+        area_id: matched ? matched.id : null,
+        area: areaText || null,
+        due_at: dates[0],
+        series_rule: seriesForm.recurrence,
+        series_interval: interval,
+        series_until: seriesUntil,
+        repeat_count: count,
+      })
+      .eq("id", seriesEditId);
+    if (seriesErr) {
+      setErr(seriesErr.message);
+      return;
+    }
+
+    await supabase.from("subtasks").delete().eq("task_id", seriesEditId);
+    const templates = seriesSubtasks.map((s) => ({
+      task_id: seriesEditId,
+      title: s.title,
+      guide_id: s.guide_id || null,
+      color: s.color || null,
+    }));
+    if (templates.length > 0) {
+      const { error: tempErr } = await supabase.from("subtasks").insert(templates);
+      if (tempErr) console.warn("series subtasks update failed:", tempErr.message);
+    }
+
+    if (seriesForm.updateFuture) {
+      const { data: futureTasks, error: futureErr } = await supabase
+        .from("tasks")
+        .select("id")
+        .eq("series_parent_id", seriesEditId)
+        .gte("due_at", new Date().toISOString());
+
+      if (futureErr) {
+        setErr(futureErr.message);
+        return;
+      }
+
+      await supabase
+        .from("tasks")
+        .update({
+          title: seriesForm.title.trim(),
+          area_id: matched ? matched.id : null,
+          area: areaText || null,
+          series_id: seriesEditId,
+        })
+        .eq("series_parent_id", seriesEditId)
+        .gte("due_at", new Date().toISOString());
+
+      for (const t of futureTasks || []) {
+        await supabase.from("subtasks").delete().eq("task_id", t.id);
+        const subRows = templates.map((s) => ({
+          task_id: t.id,
+          title: s.title,
+          guide_id: s.guide_id || null,
+          color: s.color || null,
+        }));
+        if (subRows.length > 0) {
+          await supabase.from("subtasks").insert(subRows);
+        }
+      }
+    }
+
+    setSeriesEditId(null);
+    setSeriesForm((prev) => ({ ...prev, updateFuture: false }));
+    loadAll();
+    loadSeries();
+  }
+
+  function startEditSeries(seriesRow) {
+    setSeriesEditId(seriesRow.id);
+    setSeriesForm({
+      title: seriesRow.title || "",
+      area: seriesRow.area || "",
+      start_at: seriesRow.due_at ? new Date(seriesRow.due_at).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
+      recurrence: seriesRow.series_rule || "weekly",
+      interval: seriesRow.series_interval || 1,
+      count: seriesRow.repeat_count || 8,
+      updateFuture: false,
+    });
+    setSeriesSubtasks(seriesRow.subtasks || []);
+  }
+
+  function cancelEditSeries() {
+    setSeriesEditId(null);
+    setSeriesForm((prev) => ({ ...prev, title: "", area: "", updateFuture: false }));
+    setSeriesSubtasks([]);
+  }
+
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
@@ -278,98 +547,246 @@ import { createClient } from "@supabase/supabase-js";
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
-        <TaskColumn title="Zu erledigen" count={columns.todo.length} tasks={columns.todo} onToggle={toggleStatus} areaById={areaById} guides={guides} canWrite={canWrite} getSubDraft={getSubDraft} setSubDraft={setSubDraft} onSubAdd={addSubtask} onSubUpdate={updateSubtask} onSubDelete={deleteSubtask} />
-        <TaskColumn title="Erledigt" count={columns.done.length} tasks={columns.done} onToggle={toggleStatus} areaById={areaById} guides={guides} canWrite={canWrite} getSubDraft={getSubDraft} setSubDraft={setSubDraft} onSubAdd={addSubtask} onSubUpdate={updateSubtask} onSubDelete={deleteSubtask} />
+        <TaskColumn title="Zu erledigen" count={columns.todo.length} tasks={columns.todo} onToggle={toggleStatus} areaById={areaById} guides={guides} canWrite={canWrite} getSubDraft={getSubDraft} setSubDraft={setSubDraft} onSubAdd={addSubtask} onSubUpdate={updateSubtask} onSubDelete={deleteSubtask} onGuideOpen={openGuide} />
+        <TaskColumn title="Erledigt" count={columns.done.length} tasks={columns.done} onToggle={toggleStatus} areaById={areaById} guides={guides} canWrite={canWrite} getSubDraft={getSubDraft} setSubDraft={setSubDraft} onSubAdd={addSubtask} onSubUpdate={updateSubtask} onSubDelete={deleteSubtask} onGuideOpen={openGuide} />
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
 
+      <div style={styles.panel}>
+        <div style={styles.h3}>Serienaufgabe</div>
+        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr 120px 120px auto", gap: 10 }}>
+          <input
+            value={seriesForm.title}
+            onChange={(e) => setSeriesForm((f) => ({ ...f, title: e.target.value }))}
+            placeholder="Serientitel"
+            style={styles.input}
+          />
+          <input
+            value={seriesForm.area}
+            onChange={(e) => setSeriesForm((f) => ({ ...f, area: e.target.value }))}
+            placeholder="Bereich"
+            list="areas-list"
+            style={styles.input}
+          />
+          <input
+            type="datetime-local"
+            value={seriesForm.start_at}
+            onChange={(e) => setSeriesForm((f) => ({ ...f, start_at: e.target.value }))}
+            style={styles.input}
+          />
+          <select
+            value={seriesForm.recurrence}
+            onChange={(e) => setSeriesForm((f) => ({ ...f, recurrence: e.target.value }))}
+            style={styles.input}
+          >
+            <option value="daily">Täglich</option>
+            <option value="weekly">Wöchentlich</option>
+            <option value="monthly">Monatlich</option>
+          </select>
+          <input
+            type="number"
+            min="1"
+            value={seriesForm.interval}
+            onChange={(e) => setSeriesForm((f) => ({ ...f, interval: e.target.value }))}
+            placeholder="Intervall"
+            style={styles.input}
+          />
+          <input
+            type="number"
+            min="1"
+            value={seriesForm.count}
+            onChange={(e) => setSeriesForm((f) => ({ ...f, count: e.target.value }))}
+            placeholder="Anzahl"
+            style={styles.input}
+          />
+          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
+            {seriesEditId ? (
+              <>
+                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
+                  <input
+                    type="checkbox"
+                    checked={seriesForm.updateFuture}
+                    onChange={(e) => setSeriesForm((f) => ({ ...f, updateFuture: e.target.checked }))}
+                  />
+                  zukünftige Instanzen aktualisieren
+                </label>
+                <button style={styles.btnPrimary} onClick={saveSeries}>
+                  Serie speichern
+                </button>
+                <button style={styles.btn} onClick={cancelEditSeries}>
+                  Abbrechen
+                </button>
+              </>
+            ) : (
+              <button style={styles.btnPrimary} onClick={createSeries}>
+                Serie anlegen
+              </button>
+            )}
+          </div>
+        </div>
+
+        <div style={{ marginTop: 12 }}>
+          <div style={styles.h4}>Unteraufgaben-Vorlagen</div>
+          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
+            <input
+              value={seriesSubDraft.title}
+              onChange={(e) => setSeriesSubDraft((d) => ({ ...d, title: e.target.value }))}
+              placeholder="Unteraufgabe"
+              style={{ ...styles.input, minWidth: 260 }}
+            />
+            <select
+              value={seriesSubDraft.guide_id}
+              onChange={(e) => setSeriesSubDraft((d) => ({ ...d, guide_id: e.target.value }))}
+              style={{ ...styles.input, minWidth: 220 }}
+            >
+              <option value="">– Anleitung –</option>
+              {guides.map((g) => (
+                <option key={g.id} value={g.id}>
+                  {g.title}
+                </option>
+              ))}
+            </select>
+            <input
+              type="color"
+              value={seriesSubDraft.color || "#6b7280"}
+              onChange={(e) => setSeriesSubDraft((d) => ({ ...d, color: e.target.value }))}
+              style={styles.colorInput}
+            />
+            <button style={styles.btnSmallPrimary} onClick={addSeriesSubtask}>
+              +
+            </button>
+          </div>
+          {seriesSubtasks.length > 0 ? (
+            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
+              {seriesSubtasks.map((s) => (
+                <div key={s.id} style={styles.subRow}>
+                  <span>{s.title}</span>
+                  <span style={{ color: "#666", fontSize: 13 }}>
+                    {(guides || []).find((g) => g.id === s.guide_id)?.title || "—"}
+                  </span>
+                  <span style={{ width: 60 }} />
+                  <span style={{ ...styles.areaDot, background: s.color || "#6b7280" }} />
+                  <button style={styles.btnSmall} onClick={() => removeSeriesSubtask(s.id)}>
+                    ✕
+                  </button>
+                </div>
+              ))}
+            </div>
+          ) : (
+            <div style={{ color: "#666", fontSize: 13, marginTop: 6 }}>Noch keine Vorlagen.</div>
+          )}
+        </div>
+      </div>
+
+      <div style={styles.panel}>
+        <div style={styles.h3}>Serienübersicht</div>
+        {seriesLoading ? <div style={{ color: "#666" }}>Lade…</div> : null}
+        <div style={{ display: "grid", gap: 10 }}>
+          {(series || []).map((s) => (
+            <div key={s.id} style={styles.card}>
+              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
+                <div style={styles.h4}>{s.title}</div>
+                <span style={styles.pill}>{s.series_rule || "—"}</span>
+                <span style={{ color: "#666", fontSize: 13 }}>
+                  ab {s.due_at ? fmtDateTime(s.due_at) : "–"} · jede {s.series_interval || 1} · {s.repeat_count || 0} Instanzen
+                </span>
+                <button style={{ ...styles.btn, marginLeft: "auto" }} onClick={() => startEditSeries(s)}>
+                  Bearbeiten
+                </button>
+              </div>
+            </div>
+          ))}
+          {series.length === 0 && !seriesLoading ? <div style={{ color: "#666" }}>Noch keine Serien.</div> : null}
+        </div>
+      </div>
+
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
 
-function TaskColumn({ title, count, tasks, onToggle, areaById, guides, canWrite, getSubDraft, setSubDraft, onSubAdd, onSubUpdate, onSubDelete }) {
+function TaskColumn({ title, count, tasks, onToggle, areaById, guides, canWrite, getSubDraft, setSubDraft, onSubAdd, onSubUpdate, onSubDelete, onGuideOpen }) {
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
@@ -401,51 +818,51 @@ function TaskColumn({ title, count, tasks, onToggle, areaById, guides, canWrite,
                         style={{ ...styles.input, minWidth: 220 }}
                         disabled={!canWrite}
                       />
 
                       <select
                         value={s.guide_id ?? ""}
                         onChange={(e) =>
                           onSubUpdate(s.id, { guide_id: e.target.value || null })
                         }
                         style={{ ...styles.input, minWidth: 220 }}
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
 
                       {s.guide_id ? (
                         <button
                           type="button"
                           style={styles.btnSmall}
-                          onClick={() => openGuide(s.guide_id)}
+                          onClick={() => onGuideOpen(s.guide_id)}
                           title="Anleitung öffnen"
                         >
                           Anleitung
                         </button>
                       ) : (
                         <span style={{ width: 78 }} />
                       )}
 
                       <input
                         type="color"
                         value={s.color || t.area_color || "#6b7280"}
                         onChange={(e) => onSubUpdate(s.id, { color: e.target.value })}
                         disabled={!canWrite}
                         title="Farbe"
                         style={styles.colorInput}
                       />
 
                       <button
                         style={styles.btnSmall}
                         onClick={() => onSubDelete(s.id)}
                         disabled={!canWrite}
                         title="Löschen"
                       >
                         ✕
                       </button>
@@ -594,176 +1011,453 @@ async function loadMyAuthContext() {
 
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
+  const [areas, setAreas] = useState([]);
   const [q, setQ] = useState("");
   const [loading, setLoading] = useState(false);
+  const [createLoading, setCreateLoading] = useState(false);
   const [err, setErr] = useState(null);
+  const [passwordDrafts, setPasswordDrafts] = useState({});
+  const [newUser, setNewUser] = useState({
+    email: "",
+    password: "",
+    name: "",
+    roleId: "",
+    areaIds: [],
+  });
+
+  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
 
   async function load() {
     setErr(null);
     setLoading(true);
 
-    const { data: rolesData, error: rErr } = await supabase
-      .from("roles")
-      .select("id, key, name")
-      .order("name", { ascending: true });
+    const [rolesRes, areasRes] = await Promise.all([
+      supabase.from("roles").select("id, key, name").order("name", { ascending: true }),
+      supabase.from("areas").select("id, name, color").order("name", { ascending: true }),
+    ]);
+
+    if (rolesRes.error) {
+      setLoading(false);
+      setErr(rolesRes.error.message);
+      return;
+    }
 
-    if (rErr) {
+    if (areasRes.error) {
       setLoading(false);
-      setErr(rErr.message);
+      setErr(areasRes.error.message);
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
 
-    setRoles(rolesData || []);
-    setUsers(usersData || []);
+    const { data: areaLinks, error: linkErr } = await supabase
+      .from("profile_areas")
+      .select("profile_id, area_id");
+
+    if (linkErr) {
+      setLoading(false);
+      setErr(linkErr.message);
+      return;
+    }
+
+    const areasByProfile = (areaLinks || []).reduce((acc, link) => {
+      if (!acc[link.profile_id]) acc[link.profile_id] = [];
+      acc[link.profile_id].push({ area_id: link.area_id });
+      return acc;
+    }, {});
+
+    setRoles(rolesRes.data || []);
+    setAreas(areasRes.data || []);
+    setUsers((usersData || []).map((u) => ({ ...u, profile_areas: areasByProfile[u.id] || [] })));
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
 
+  async function updateUserRole(id, roleId) {
+    const role = roleId ? rolesById.get(roleId) : null;
+    await updateUser(id, {
+      role_id: roleId || null,
+      role: role?.key || null,
+    });
+  }
+
+  async function updateUserAreas(id, areaIds) {
+    setErr(null);
+    const { error: delErr } = await supabase.from("profile_areas").delete().eq("profile_id", id);
+    if (delErr) {
+      setErr(delErr.message);
+      return;
+    }
+
+    if (areaIds.length > 0) {
+      const rows = areaIds.map((areaId) => ({ profile_id: id, area_id: areaId }));
+      const { error: insErr } = await supabase.from("profile_areas").insert(rows);
+      if (insErr) {
+        setErr(insErr.message);
+        return;
+      }
+    }
+
+    setUsers((prev) =>
+      prev.map((u) => (u.id === id ? { ...u, profile_areas: areaIds.map((areaId) => ({ area_id: areaId })) } : u))
+    );
+  }
+
+  async function createUser() {
+    const email = newUser.email.trim();
+    const password = newUser.password.trim();
+    if (!email) {
+      setErr("E-Mail fehlt");
+      return;
+    }
+    if (!password || password.length < 8) {
+      setErr("Passwort fehlt/zu kurz (min. 8 Zeichen)");
+      return;
+    }
+
+    setErr(null);
+    setCreateLoading(true);
+
+    try {
+      const { data: sessionData } = await supabase.auth.getSession();
+      const token = sessionData?.session?.access_token;
+      if (!token) {
+        setErr("Nicht angemeldet");
+        return;
+      }
+
+      const role = newUser.roleId ? rolesById.get(newUser.roleId)?.key : "user";
+
+      const res = await fetch("/api/admin/users", {
+        method: "POST",
+        headers: {
+          "Content-Type": "application/json",
+          Authorization: `Bearer ${token}`,
+        },
+        body: JSON.stringify({
+          action: "createUser",
+          payload: {
+            email,
+            password,
+            role,
+            name: newUser.name.trim() || null,
+          },
+        }),
+      });
+
+      const json = await res.json();
+      if (!res.ok) throw new Error(json?.error || "Nutzeranlage fehlgeschlagen");
+
+      const userId = json?.userId;
+      if (!userId) throw new Error("User-ID fehlt nach createUser");
+
+      if (newUser.roleId) {
+        const roleKey = rolesById.get(newUser.roleId)?.key || null;
+        const { error: roleErr } = await supabase
+          .from("profiles")
+          .update({ role_id: newUser.roleId, role: roleKey })
+          .eq("id", userId);
+        if (roleErr) throw roleErr;
+      }
+
+      if (newUser.areaIds.length > 0) {
+        await updateUserAreas(userId, newUser.areaIds);
+      }
+
+      setNewUser({ email: "", password: "", name: "", roleId: "", areaIds: [] });
+      await load();
+    } catch (error) {
+      setErr(error?.message || String(error));
+    } finally {
+      setCreateLoading(false);
+    }
+  }
+
+  async function setPassword(userId) {
+    const password = String(passwordDrafts[userId] || "").trim();
+    if (!password || password.length < 8) {
+      setErr("Passwort fehlt/zu kurz (min. 8 Zeichen)");
+      return;
+    }
+
+    setErr(null);
+
+    try {
+      const { data: sessionData } = await supabase.auth.getSession();
+      const token = sessionData?.session?.access_token;
+      if (!token) {
+        setErr("Nicht angemeldet");
+        return;
+      }
+
+      const res = await fetch("/api/admin/users", {
+        method: "POST",
+        headers: {
+          "Content-Type": "application/json",
+          Authorization: `Bearer ${token}`,
+        },
+        body: JSON.stringify({
+          action: "setPassword",
+          payload: { userId, password },
+        }),
+      });
+
+      const json = await res.json();
+      if (!res.ok) throw new Error(json?.error || "Passwort setzen fehlgeschlagen");
+
+      setPasswordDrafts((prev) => ({ ...prev, [userId]: "" }));
+    } catch (error) {
+      setErr(error?.message || String(error));
+    }
+  }
+
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
 
+      <div style={{ ...styles.card, marginBottom: 14 }}>
+        <div style={styles.h4}>Nutzer einladen</div>
+        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
+          <input
+            value={newUser.email}
+            onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
+            placeholder="E-Mail"
+            style={styles.input}
+          />
+          <input
+            type="password"
+            value={newUser.password}
+            onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))}
+            placeholder="Startpasswort (min. 8 Zeichen)"
+            style={styles.input}
+          />
+          <input
+            value={newUser.name}
+            onChange={(e) => setNewUser((prev) => ({ ...prev, name: e.target.value }))}
+            placeholder="Name"
+            style={styles.input}
+          />
+          <select
+            value={newUser.roleId}
+            onChange={(e) => setNewUser((prev) => ({ ...prev, roleId: e.target.value }))}
+            style={styles.input}
+          >
+            <option value="">Rolle wählen</option>
+            {roles.map((r) => (
+              <option key={r.id} value={r.id}>
+                {r.name}
+              </option>
+            ))}
+          </select>
+          <select
+            multiple
+            value={newUser.areaIds}
+            onChange={(e) =>
+              setNewUser((prev) => ({
+                ...prev,
+                areaIds: Array.from(e.target.selectedOptions).map((o) => o.value),
+              }))
+            }
+            style={{ ...styles.input, height: 94 }}
+            title="Mehrfachauswahl: Strg/Cmd + Klick"
+          >
+            {areas.map((area) => (
+              <option key={area.id} value={area.id}>
+                {area.name}
+              </option>
+            ))}
+          </select>
+          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start" }}>
+            <button style={styles.btnPrimary} onClick={createUser} disabled={createLoading}>
+              {createLoading ? "Erstelle…" : "Einladen"}
+            </button>
+          </div>
+        </div>
+        <div style={{ color: "#666", fontSize: 13, marginTop: 8 }}>
+          Hinweis: Das Passwort wird gesetzt, die E-Mail-Benachrichtigung musst du ggf. separat versenden.
+        </div>
+      </div>
+
       <div style={{ overflowX: "auto" }}>
         <table style={styles.table}>
           <thead>
             <tr>
               <th style={styles.th}>Name</th>
               <th style={styles.th}>E-Mail</th>
               <th style={styles.th}>Rolle</th>
+              <th style={styles.th}>Bereiche</th>
               <th style={styles.th}>Aktiv</th>
+              <th style={styles.th}>Passwort</th>
             </tr>
           </thead>
           <tbody>
-            {filtered.map((u) => (
-              <tr key={u.id}>
-                <td style={styles.td}>
-                  <input
-                    value={u.name ?? ""}
-                    onChange={(e) => updateUser(u.id, { name: e.target.value })}
-                    style={styles.input}
-                  />
-                </td>
-                <td style={styles.td}>{u.email ?? ""}</td>
-                <td style={styles.td}>
-                  <select
-                    value={u.role_id ?? ""}
-                    onChange={(e) => updateUser(u.id, { role_id: e.target.value || null })}
-                    style={styles.input}
-                  >
-                    <option value="">–</option>
-                    {roles.map((r) => (
-                      <option key={r.id} value={r.id}>
-                        {r.name}
-                      </option>
-                    ))}
-                  </select>
-                </td>
-                <td style={styles.td}>
-                  <input
-                    type="checkbox"
-                    checked={u.is_active !== false}
-                    onChange={(e) => updateUser(u.id, { is_active: e.target.checked })}
-                  />
-                </td>
-              </tr>
-            ))}
+            {filtered.map((u) => {
+              const assignedAreaIds = (u.profile_areas || []).map((pa) => pa.area_id);
+              return (
+                <tr key={u.id}>
+                  <td style={styles.td}>
+                    <input
+                      value={u.name ?? ""}
+                      onChange={(e) => updateUser(u.id, { name: e.target.value })}
+                      style={styles.input}
+                    />
+                  </td>
+                  <td style={styles.td}>{u.email ?? ""}</td>
+                  <td style={styles.td}>
+                    <select
+                      value={u.role_id ?? ""}
+                      onChange={(e) => updateUserRole(u.id, e.target.value || null)}
+                      style={styles.input}
+                    >
+                      <option value="">–</option>
+                      {roles.map((r) => (
+                        <option key={r.id} value={r.id}>
+                          {r.name}
+                        </option>
+                      ))}
+                    </select>
+                  </td>
+                  <td style={styles.td}>
+                    <select
+                      multiple
+                      value={assignedAreaIds}
+                      onChange={(e) =>
+                        updateUserAreas(
+                          u.id,
+                          Array.from(e.target.selectedOptions).map((o) => o.value)
+                        )
+                      }
+                      style={{ ...styles.input, height: 94 }}
+                      title="Mehrfachauswahl: Strg/Cmd + Klick"
+                    >
+                      {areas.map((area) => (
+                        <option key={area.id} value={area.id}>
+                          {area.name}
+                        </option>
+                      ))}
+                    </select>
+                  </td>
+                  <td style={styles.td}>
+                    <input
+                      type="checkbox"
+                      checked={u.is_active !== false}
+                      onChange={(e) => updateUser(u.id, { is_active: e.target.checked })}
+                    />
+                  </td>
+                  <td style={styles.td}>
+                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
+                      <input
+                        type="password"
+                        value={passwordDrafts[u.id] ?? ""}
+                        onChange={(e) =>
+                          setPasswordDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))
+                        }
+                        placeholder="Neues Passwort"
+                        style={styles.input}
+                      />
+                      <button style={styles.btnSmall} onClick={() => setPassword(u.id)}>
+                        Setzen
+                      </button>
+                    </div>
+                  </td>
+                </tr>
+              );
+            })}
 
             {filtered.length === 0 ? (
               <tr>
-                <td style={styles.td} colSpan={4}>
+                <td style={styles.td} colSpan={6}>
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
@@ -952,308 +1646,50 @@ function AreasPanel({ isAdmin }) {
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
 
-/* ---------------- Tasks Board (Planke) ---------------- */
-function TasksBoard({ isAdmin }) {
-  const [areas, setAreas] = useState([]);
-  const [guides, setGuides] = useState([]);
-  const [tasks, setTasks] = useState([]);
-
-  const [form, setForm] = useState({
-    title: "",
-    area: "",
-    due_at: "",
-    status: "todo",
-    guideIds: [],
-  });
-
-  const [loading, setLoading] = useState(false);
-  const [err, setErr] = useState(null);
-
-  async function loadAll() {
-    setErr(null);
-    setLoading(true);
-
-    // Tasks: use area_id, due_at, status, title
-    const { data: tData, error: tErr } = await supabase
-      .from("tasks")
-      .select("id, title, area, area_id, due_at, status, created_at")
-      .order("created_at", { ascending: false });
-
-    if (tErr) {
-      setErr(tErr.message);
-      setLoading(false);
-      return;
-    }
-
-    const [areasList, guidesRes] = await Promise.all([
-      loadAreas(),
-      supabase.from("guides").select("id, title").order("title", { ascending: true }),
-    ]);
-
-    if (guidesRes.error) {
-      console.warn("guides load failed:", guidesRes.error.message);
-    }
-
-    const areaByIdTmp = new Map((areasList || []).map((a) => [a.id, a]));
-    const areaByNameTmp = new Map((areasList || []).map((a) => [String(a.name || "").toLowerCase(), a]));
-
-    const decoratedTasks = (tData || []).map((t) => {
-      const areaObj = t.area_id
-        ? areaByIdTmp.get(t.area_id)
-        : (t.area ? areaByNameTmp.get(String(t.area).toLowerCase()) : null);
-      const areaLabel = areaObj?.name || t.area || "";
-      const areaColor = areaObj?.color || null;
-      return { ...t, area_label: areaLabel, area_color: areaColor };
-    });
-
-    setTasks(decoratedTasks);
-    setAreas(areasList || []);
-    setGuides(guidesRes.data || []);
-    setLoading(false);
-  }
-
-  useEffect(() => {
-    loadAll();
-  }, []);
-
-  const areaById = useMemo(() => {
-    const m = new Map();
-    for (const a of areas) m.set(a.id, a);
-    return m;
-  }, [areas]);
-
-  const columns = useMemo(() => {
-    const todo = [];
-    const done = [];
-    for (const t of tasks) {
-      if ((t.status ?? "todo") === "done") done.push(t);
-      else todo.push(t);
-    }
-    return { todo, done };
-  }, [tasks]);
-
-  function onGuideSelect(e) {
-    const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
-    setForm((f) => ({ ...f, guideIds: selected }));
-  }
-
-  async function createTask() {
-    if (!form.title.trim()) return;
-    setErr(null);
-    const areaText = (form.area || "").trim();
-    const matched = areaText
-      ? (areas || []).find((a) => String(a.name || "").toLowerCase() === areaText.toLowerCase())
-      : null;
-
-    const payload = {
-      title: form.title.trim(),
-      status: form.status || "todo",
-      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
-      area_id: matched ? matched.id : null,
-      area: areaText || null,
-    };
-
-    const { data: inserted, error: insErr } = await supabase.from("tasks").insert(payload).select("id").single();
-
-    if (insErr) {
-      setErr(insErr.message);
-      return;
-    }
-
-    const taskId = inserted?.id;
-
-    // Many-to-many task_guides (optional)
-    if (taskId && Array.isArray(form.guideIds) && form.guideIds.length > 0) {
-      const rows = form.guideIds.map((gid) => ({ task_id: taskId, guide_id: gid }));
-      const { error: linkErr } = await supabase.from("task_guides").insert(rows);
-      if (linkErr) console.warn("task_guides insert failed:", linkErr.message);
-    }
-
-    setForm({ title: "", area: "", due_at: "", status: "todo", guideIds: [] });
-    loadAll();
-  }
-
-  async function toggleStatus(task) {
-    const next = (task.status ?? "todo") === "done" ? "todo" : "done";
-    const { error } = await supabase.from("tasks").update({ status: next }).eq("id", task.id);
-    if (error) {
-      setErr(error.message);
-      return;
-    }
-    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
-  }
-
-  return (
-    <div>
-      <div style={styles.panel}>
-        <div style={styles.h3}>Aufgabe anlegen</div>
-
-        {err ? <div style={styles.error}>Fehler: {err}</div> : null}
-
-        <div style={styles.taskFormGrid}>
-          <input
-            value={form.title}
-            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
-            placeholder="Titel"
-            style={styles.input}
-          />
-
-          <input
-            value={form.area}
-            onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
-            placeholder="Bereich"
-            list="areas-list"
-            style={styles.input}
-          />
-          <datalist id="areas-list">
-            {areas.map((a) => (
-              <option key={a.id} value={a.name} />
-            ))}
-          </datalist>
-
-          <input
-            type="datetime-local"
-            value={form.due_at}
-            onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))}
-            style={styles.input}
-          />
-
-          <select
-            value={form.status}
-            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
-            style={styles.input}
-          >
-            <option value="todo">Zu erledigen</option>
-            <option value="done">Erledigt</option>
-          </select>
-
-          <select
-            multiple
-            value={form.guideIds}
-            onChange={onGuideSelect}
-            style={{ ...styles.input, height: 94 }}
-            title="Mehrfachauswahl: Strg/Cmd + Klick"
-          >
-            {guides.map((g) => (
-              <option key={g.id} value={g.id}>
-                {g.title}
-              </option>
-            ))}
-          </select>
-
-          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start" }}>
-            <button style={styles.btnPrimary} onClick={createTask}>
-              Anlegen
-            </button>
-          </div>
-        </div>
-
-        <div style={{ color: "#666", fontSize: 13, marginTop: 8 }}>Mehrfachauswahl bei Anleitungen: Strg/Cmd + Klick</div>
-      </div>
-
-      <div style={styles.columns}>
-        <TaskColumn title="Zu erledigen" count={columns.todo.length} tasks={columns.todo} onToggle={toggleStatus} areaById={areaById} />
-        <TaskColumn title="Erledigt" count={columns.done.length} tasks={columns.done} onToggle={toggleStatus} areaById={areaById} />
-      </div>
-
-      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
-        <button style={styles.btn} onClick={loadAll} disabled={loading}>
-          {loading ? "Lade…" : "Neu laden"}
-        </button>
-      </div>
-
-      {!isAdmin ? (
-        <div style={{ marginTop: 10, color: "#666", fontSize: 13 }}>
-          Hinweis: Aufgaben anlegen ist für alle Nutzer erlaubt. Admin-Funktionen findest du im Tab „Nutzer“.
-        </div>
-      ) : null}
-    </div>
-  );
-}
-
-function TaskColumn({ title, count, tasks, onToggle, areaById }) {
-  return (
-    <div style={styles.col}>
-      <div style={styles.colHeader}>
-        <div style={styles.h3}>{title}</div>
-        <div style={styles.badge}>{count}</div>
-      </div>
-
-      <div style={{ display: "grid", gap: 12 }}>
-        {tasks.map((t) => {
-          const areaName = t.area || (t.area_id ? areaById.get(t.area_id)?.name : "–");
-          return (
-            <div key={t.id} style={styles.card}>
-              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
-                <div style={styles.h4}>{t.title}</div>
-              {t.area_color ? (
-                <span title={t.area || t.area_label || ""} style={{...styles.areaDot, background: t.area_color}} />
-              ) : null}
-                <span style={styles.pill}>{t.status === "done" ? "done" : "todo"}</span>
-                <button style={{ ...styles.btn, marginLeft: "auto" }} onClick={() => onToggle(t)}>
-                  Status
-                </button>
-              </div>
-
-              <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
-                Bereich: {areaName} · Fällig: {t.due_at ? fmtDateTime(t.due_at) : "–"}
-              </div>
-
-              <div style={{ marginTop: 10, color: "#666", fontSize: 13 }}>Unteraufgaben 0/0</div>
-            </div>
-          );
-        })}
-
-        {tasks.length === 0 ? <div style={{ color: "#666" }}>Keine Einträge.</div> : null}
-      </div>
-    </div>
-  );
-}
-
 /* ---------------- Calendar ---------------- */
 function CalendarPanel() {
   const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
   const [tasks, setTasks] = useState([]);
   const [areas, setAreas] = useState([]);
   const [loading, setLoading] = useState(false);
   const [err, setErr] = useState(null);
 
   useEffect(() => {
     loadAreas().then(setAreas).catch(() => setAreas([]));
   }, []);
 
   const areaById = useMemo(() => {
     const m = new Map();
     for (const a of areas) m.set(a.id, a);
     return m;
   }, [areas]);
 
   async function load() {
     setErr(null);
     setLoading(true);
 
     const from = startOfDayISO(date);
     const to = endOfDayISO(date);
 
@@ -1386,51 +1822,50 @@ export default function Dashboard() {
 
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
-          
 
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
@@ -1583,111 +2018,109 @@ const styles = {
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
   btnSmall: {
     padding: "8px 10px",
-    borderRadius: 10,
+    borderRadius: 12,
     border: "1px solid #d8e0ef",
     background: "#fff",
     cursor: "pointer",
-    fontWeight: 700,
-    fontSize: 13,
+    fontWeight: 800,
   },
   modalBackdrop: {
     position: "fixed",
     inset: 0,
     background: "rgba(0,0,0,0.35)",
     display: "flex",
     alignItems: "center",
     justifyContent: "center",
     padding: 16,
     zIndex: 9999,
   },
   modal: {
     width: "min(900px, 96vw)",
     maxHeight: "80vh",
     overflow: "auto",
     background: "#fff",
     border: "1px solid #d8e0ef",
     borderRadius: 18,
     padding: 16,
     boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
   },
   modalHeader: {
     display: "flex",
     alignItems: "center",
     justifyContent: "space-between",
     gap: 12,
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
   subRow: {
     display: "grid",
     gridTemplateColumns: "24px 1fr 1fr 60px 44px",
     gap: 10,
     alignItems: "center",
   },
-  btnSmall: {
-    padding: "8px 10px",
-    borderRadius: 12,
+  areaDot: {
+    width: 14,
+    height: 14,
+    borderRadius: 999,
     border: "1px solid #d8e0ef",
-    background: "#fff",
-    cursor: "pointer",
-    fontWeight: 800,
+    display: "inline-block",
   },
   btnSmallPrimary: {
     padding: "8px 12px",
     borderRadius: 12,
     border: "1px solid #0b6b2a",
     background: "#0b6b2a",
     color: "#fff",
     cursor: "pointer",
     fontWeight: 900,
   },
   colorInput: {
     width: 56,
     height: 38,
     padding: 0,
     border: "1px solid #d8e0ef",
     borderRadius: 12,
     background: "#fff",
     cursor: "pointer",
   },
 
   table: {
     width: "100%",
     borderCollapse: "collapse",
   },
   th: {
