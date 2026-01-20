diff --git a/pages/dashboard.js b/pages/dashboard.js
index 332006d7c6e258dce6b1f18c374f560d3fa9a96f..a98b6f91ecd43348b9e0ecbcc4f73d1731a87d04 100644
--- a/pages/dashboard.js
+++ b/pages/dashboard.js
@@ -1,32 +1,34 @@
 // pages/dashboard.js
 // Standalone dashboard page (React) for Next.js + Supabase
 
 import React, { useEffect, useMemo, useState } from "react";
 import { createClient } from "@supabase/supabase-js";
 
-/* ---------------- Supabase ---------------function TasksBoard({ isAdmin }) {
+/* ---------------- Supabase --------------- */
+
+function TasksBoard({ isAdmin }) {
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
   const [subDrafts, setSubDrafts] = useState({});
   const [guideModal, setGuideModal] = useState({ open: false, loading: false, guide: null, error: null });
 
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
@@ -36,50 +38,51 @@ import { createClient } from "@supabase/supabase-js";
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
       .select("id, title, area, area_id, due_at, status, created_at, subtasks ( id, title, is_done, color, created_at, guide_id, guides ( id, title ) )")
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
@@ -278,98 +281,98 @@ import { createClient } from "@supabase/supabase-js";
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
@@ -401,51 +404,51 @@ function TaskColumn({ title, count, tasks, onToggle, areaById, guides, canWrite,
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
@@ -952,308 +955,50 @@ function AreasPanel({ isAdmin }) {
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
 
@@ -1386,51 +1131,50 @@ export default function Dashboard() {
 
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
@@ -1583,111 +1327,109 @@ const styles = {
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
