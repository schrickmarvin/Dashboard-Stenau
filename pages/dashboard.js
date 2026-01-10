 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/pages/dashboard.js b/pages/dashboard.js
index cf10d053e4d2114d71f023a4e0eb1f48bd11e953..762b8bff3f03f790e3aa62abfc488f3bad679ae5 100644
--- a/pages/dashboard.js
+++ b/pages/dashboard.js
@@ -1,242 +1,596 @@
 // pages/dashboard.js
-import { useEffect, useState } from "react";
+import { useEffect, useMemo, useState } from "react";
 import { createClient } from "@supabase/supabase-js";
 
 /* ---------------- Supabase ---------------- */
 const supabase = createClient(
   process.env.NEXT_PUBLIC_SUPABASE_URL,
   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
 );
 
+const theme = {
+  primary: "#0f7a2a",
+  primarySoft: "#dcfce7",
+  border: "#e2e8f0",
+  borderStrong: "#cbd5f5",
+  text: "#0f172a",
+  textSoft: "#64748b",
+  background: "#f5f7ff",
+  surface: "#ffffff",
+  surfaceAlt: "#f8fafc",
+};
+
+const inputStyle = {
+  border: "1px solid var(--border)",
+  borderRadius: 10,
+  padding: "8px 10px",
+  marginRight: 8,
+  marginBottom: 8,
+  background: "var(--surface)",
+};
+
+const cardStyle = {
+  border: "1px solid var(--borderStrong)",
+  borderRadius: 12,
+  marginBottom: 16,
+  padding: 12,
+  background: "var(--surface)",
+};
+
+const progressOuterStyle = {
+  marginTop: 6,
+  background: "var(--border)",
+  height: 8,
+  borderRadius: 999,
+};
+
+const errorStyle = {
+  color: "#b91c1c",
+  background: "#fee2e2",
+  border: "1px solid #fecaca",
+  padding: "8px 10px",
+  borderRadius: 10,
+  marginBottom: 8,
+};
+
+const tabButtonStyle = (active) => ({
+  border: "1px solid var(--border)",
+  background: active ? "var(--primary)" : "var(--surface)",
+  color: active ? "#fff" : "var(--text)",
+  padding: "6px 12px",
+  borderRadius: 999,
+  cursor: "pointer",
+  fontWeight: 600,
+});
+
+const calendarHeaderStyle = {
+  display: "flex",
+  gap: 12,
+  alignItems: "center",
+  marginBottom: 12,
+};
+
+const calendarGridStyle = {
+  display: "grid",
+  gridTemplateColumns: "repeat(7, 1fr)",
+  gap: 8,
+  background: "var(--surface)",
+  border: "1px solid var(--border)",
+  borderRadius: 12,
+  padding: 12,
+};
+
+const calendarHeaderCellStyle = {
+  fontSize: 12,
+  fontWeight: 700,
+  color: "var(--textSoft)",
+  textTransform: "uppercase",
+};
+
+const calendarCellStyle = {
+  border: "1px solid var(--border)",
+  borderRadius: 10,
+  minHeight: 90,
+  padding: 8,
+  background: "var(--surfaceAlt)",
+  display: "flex",
+  flexDirection: "column",
+  gap: 6,
+};
+
+const calendarTaskStyle = {
+  fontSize: 12,
+  padding: "4px 6px",
+  borderRadius: 8,
+  background: "var(--primarySoft)",
+  color: "var(--text)",
+  border: "1px solid var(--border)",
+};
+
+const smallButtonStyle = {
+  border: "1px solid var(--border)",
+  background: "var(--surface)",
+  padding: "4px 8px",
+  borderRadius: 8,
+  cursor: "pointer",
+};
+
 /* ---------------- Page ---------------- */
 export default function Dashboard() {
   const [user, setUser] = useState(null);
+  const [role, setRole] = useState("mitarbeiter");
+  const [activeTab, setActiveTab] = useState("board");
+  const [calendarMonth, setCalendarMonth] = useState(() => {
+    const now = new Date();
+    return new Date(now.getFullYear(), now.getMonth(), 1);
+  });
 
   const [tasks, setTasks] = useState([]);
   const [subtasks, setSubtasks] = useState([]);
-  const [stats, setStats] = useState([]);
 
   const [areas, setAreas] = useState([]);
   const [guides, setGuides] = useState([]);
 
   const [title, setTitle] = useState("");
   const [areaId, setAreaId] = useState("");
   const [guideId, setGuideId] = useState("");
   const [dueAt, setDueAt] = useState("");
 
   const [error, setError] = useState("");
+  const [expandedTaskIds, setExpandedTaskIds] = useState({});
 
   /* ---------------- Auth ---------------- */
   useEffect(() => {
     supabase.auth.getSession().then(({ data }) => {
       setUser(data.session?.user ?? null);
     });
 
     const { data: listener } = supabase.auth.onAuthStateChange(
       (_event, session) => {
         setUser(session?.user ?? null);
       }
     );
 
     return () => listener.subscription.unsubscribe();
   }, []);
 
   /* ---------------- Load ---------------- */
   useEffect(() => {
     if (!user) return;
     loadAll();
   }, [user]);
 
   async function loadAll() {
     await Promise.all([
       loadTasks(),
       loadSubtasks(),
-      loadStats(),
       loadAreas(),
       loadGuides(),
+      loadRole(),
     ]);
   }
 
   async function loadTasks() {
     const { data, error } = await supabase
       .from("v_tasks_ui")
       .select("*")
       .order("created_at", { ascending: false });
 
     if (error) setError(error.message);
     else setTasks(data ?? []);
   }
 
   async function loadSubtasks() {
     const { data } = await supabase.from("v_subtasks_ui").select("*");
     setSubtasks(data ?? []);
   }
 
-  async function loadStats() {
-    const { data } = await supabase
-      .from("v_task_subtask_stats")
-      .select("*");
-    setStats(data ?? []);
+  async function loadRole() {
+    const { data, error } = await supabase
+      .from("profiles")
+      .select("role")
+      .eq("id", user.id)
+      .single();
+
+    if (error) return;
+    if (data?.role) setRole(data.role);
   }
 
   async function loadAreas() {
     const { data } = await supabase.from("areas").select("*").order("name");
     setAreas(data ?? []);
   }
 
   async function loadGuides() {
     const { data } = await supabase.from("guides").select("*").order("title");
     setGuides(data ?? []);
   }
 
   /* ---------------- Create Task ---------------- */
   async function createTask() {
     setError("");
+    if (role !== "chef") {
+      setError("Nur Chef kann Aufgaben anlegen.");
+      return;
+    }
     if (!title.trim()) return;
 
     const { error } = await supabase.from("tasks").insert([
       {
         title: title.trim(),
         area_id: areaId || null,
         guide_id: guideId || null,
         due_at: dueAt ? new Date(dueAt).toISOString() : null,
         status: "todo",
         user_id: user.id,
       },
     ]);
 
     if (error) {
       setError(error.message);
       return;
     }
 
     setTitle("");
     setAreaId("");
     setGuideId("");
     setDueAt("");
     await loadAll();
   }
 
   /* ---------------- Subtasks ---------------- */
   async function addSubtask(taskId, text) {
+    if (role !== "chef") {
+      setError("Nur Chef kann Unteraufgaben anlegen.");
+      return;
+    }
     if (!text.trim()) return;
 
     await supabase.from("subtasks").insert([
       {
         task_id: taskId,
         title: text.trim(),
         is_done: false,
       },
     ]);
 
     await loadAll();
   }
 
-  async function toggleSubtask(id, isDone) {
+  async function toggleSubtask(id, isDone, taskId) {
     await supabase
       .from("subtasks")
       .update({ is_done: !isDone })
       .eq("id", id);
 
+    await syncTaskStatusFromSubtasks(taskId, id, !isDone);
+    await loadAll();
+  }
+
+  async function toggleTaskStatus(taskId, nextStatus) {
+    if (role !== "chef") {
+      setError("Nur Chef kann den Aufgabenstatus ändern.");
+      return;
+    }
+    const isDone = nextStatus === "done";
+
+    await supabase
+      .from("tasks")
+      .update({ status: nextStatus })
+      .eq("id", taskId);
+
+    await supabase
+      .from("subtasks")
+      .update({ is_done: isDone })
+      .eq("task_id", taskId);
+
     await loadAll();
   }
 
+  async function syncTaskStatusFromSubtasks(taskId, changedId, nextDone) {
+    const taskSubtasks = subtasks
+      .filter((st) => st.task_id === taskId)
+      .map((st) => (st.id === changedId ? { ...st, is_done: nextDone } : st));
+    if (taskSubtasks.length === 0) return;
+
+    const doneCount = taskSubtasks.filter((st) => st.is_done).length;
+    const nextStatus = doneCount === taskSubtasks.length ? "done" : "todo";
+
+    await supabase
+      .from("tasks")
+      .update({ status: nextStatus })
+      .eq("id", taskId);
+  }
+
+  function toggleExpanded(taskId) {
+    setExpandedTaskIds((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
+  }
+
+  function changeMonth(offset) {
+    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
+  }
+
+  const monthLabel = calendarMonth.toLocaleString("de-DE", {
+    month: "long",
+    year: "numeric",
+  });
+
+  const calendarDays = useMemo(() => {
+    const year = calendarMonth.getFullYear();
+    const month = calendarMonth.getMonth();
+    const start = new Date(year, month, 1);
+    const startDay = (start.getDay() + 6) % 7;
+    const daysInMonth = new Date(year, month + 1, 0).getDate();
+
+    const days = [];
+    for (let i = 0; i < startDay; i += 1) {
+      days.push(null);
+    }
+    for (let day = 1; day <= daysInMonth; day += 1) {
+      days.push(new Date(year, month, day));
+    }
+    return days;
+  }, [calendarMonth]);
+
+  const tasksByDate = useMemo(() => {
+    return tasks.reduce((acc, task) => {
+      if (!task.due_at) return acc;
+      const date = new Date(task.due_at);
+      const key = date.toISOString().slice(0, 10);
+      if (!acc[key]) acc[key] = [];
+      acc[key].push(task);
+      return acc;
+    }, {});
+  }, [tasks]);
+
+  const calendarGroups = useMemo(() => {
+    const grouped = {};
+    tasks.forEach((task) => {
+      const dateKey = task.due_at
+        ? new Date(task.due_at).toLocaleDateString()
+        : "Ohne Datum";
+      if (!grouped[dateKey]) grouped[dateKey] = [];
+      grouped[dateKey].push(task);
+    });
+
+    return Object.entries(grouped).sort(([a], [b]) => {
+      if (a === "Ohne Datum") return 1;
+      if (b === "Ohne Datum") return -1;
+      return new Date(a) - new Date(b);
+    });
+  }, [tasks]);
+
   /* ---------------- UI ---------------- */
   if (!user) {
     return <div style={{ padding: 40 }}>Bitte einloggen…</div>;
   }
 
   return (
-    <div style={{ padding: 24 }}>
-      <h2>Aufgabe anlegen</h2>
+    <div
+      style={{
+        padding: 24,
+        background: theme.background,
+        minHeight: "100vh",
+        color: theme.text,
+        "--primary": theme.primary,
+        "--primarySoft": theme.primarySoft,
+        "--border": theme.border,
+        "--borderStrong": theme.borderStrong,
+        "--text": theme.text,
+        "--textSoft": theme.textSoft,
+        "--surface": theme.surface,
+        "--surfaceAlt": theme.surfaceAlt,
+      }}
+    >
+      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
+        <div>
+          <h2>Dashboard</h2>
+          <div style={{ fontSize: 12, color: "var(--textSoft)" }}>
+            Rolle: {role === "chef" ? "Chef" : "Mitarbeiter"}
+          </div>
+        </div>
+        <div style={{ display: "flex", gap: 8 }}>
+          <button style={tabButtonStyle(activeTab === "board")} onClick={() => setActiveTab("board")}>
+            Board
+          </button>
+          <button style={tabButtonStyle(activeTab === "calendar")} onClick={() => setActiveTab("calendar")}>
+            Kalender
+          </button>
+        </div>
+      </div>
+
+      <h3>Aufgabe anlegen</h3>
 
-      {error && <div style={{ color: "red" }}>{error}</div>}
+      {error && <div style={errorStyle}>{error}</div>}
 
       <input
         placeholder="Titel"
         value={title}
         onChange={(e) => setTitle(e.target.value)}
+        style={inputStyle}
       />
 
-      <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
+      <select value={areaId} onChange={(e) => setAreaId(e.target.value)} style={inputStyle}>
         <option value="">Bereich</option>
         {areas.map((a) => (
           <option key={a.id} value={a.id}>
             {a.name}
           </option>
         ))}
       </select>
 
       <input
         type="datetime-local"
         value={dueAt}
         onChange={(e) => setDueAt(e.target.value)}
+        style={inputStyle}
       />
 
-      <select value={guideId} onChange={(e) => setGuideId(e.target.value)}>
+      <select value={guideId} onChange={(e) => setGuideId(e.target.value)} style={inputStyle}>
         <option value="">Anleitung</option>
         {guides.map((g) => (
           <option key={g.id} value={g.id}>
             {g.title}
           </option>
         ))}
       </select>
 
-      <button onClick={createTask}>Anlegen</button>
+      <button onClick={createTask} disabled={role !== "chef"}>
+        Anlegen
+      </button>
 
       <hr />
 
-      <h2>Board</h2>
-
-      {tasks.map((t) => {
-        const s = stats.find((x) => x.task_id === t.id);
-        const taskSubs = subtasks.filter((st) => st.task_id === t.id);
-
-        return (
-          <div key={t.id} style={{ border: "1px solid #ccc", marginBottom: 16, padding: 12 }}>
-            <strong>{t.title}</strong> ({t.status})<br />
-            Unteraufgaben: {s?.done_subtasks ?? 0}/{s?.total_subtasks ?? 0}
-
-            <div>
-              {taskSubs.map((st) => (
-                <div key={st.id}>
-                  <input
-                    type="checkbox"
-                    checked={st.is_done}
-                    onChange={() => toggleSubtask(st.id, st.is_done)}
-                  />{" "}
-                  {st.title}
+      {activeTab === "board" ? (
+        <>
+          <h3>Board</h3>
+
+          {tasks.map((t) => {
+            const taskSubs = subtasks.filter((st) => st.task_id === t.id);
+            const doneCount = taskSubs.filter((st) => st.is_done).length;
+            const totalCount = taskSubs.length;
+            const progress = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
+            const expanded = !!expandedTaskIds[t.id];
+
+            return (
+              <div key={t.id} style={cardStyle}>
+                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
+                  <div>
+                    <strong>{t.title}</strong> ({t.status})
+                    <div style={{ fontSize: 12, color: "var(--textSoft)" }}>
+                      Unteraufgaben: {doneCount}/{totalCount}
+                    </div>
+                    <div style={progressOuterStyle}>
+                      <div
+                        style={{
+                          width: `${progress}%`,
+                          height: 8,
+                          borderRadius: 999,
+                          background: "var(--primary)",
+                        }}
+                      />
+                    </div>
+                  </div>
+                  <div style={{ display: "flex", gap: 8 }}>
+                    <button onClick={() => toggleExpanded(t.id)}>
+                      {expanded ? "Zuklappen" : "Aufklappen"}
+                    </button>
+                    <button
+                      onClick={() => toggleTaskStatus(t.id, t.status === "done" ? "todo" : "done")}
+                      disabled={role !== "chef"}
+                    >
+                      Status wechseln
+                    </button>
+                  </div>
                 </div>
-              ))}
-            </div>
 
-            <AddSubtask onAdd={(text) => addSubtask(t.id, text)} />
+                {expanded ? (
+                  <div style={{ marginTop: 10 }}>
+                    <div>
+                    {taskSubs.map((st) => (
+                        <div key={st.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
+                          <input
+                            type="checkbox"
+                            checked={st.is_done}
+                            onChange={() => toggleSubtask(st.id, st.is_done, t.id)}
+                          />{" "}
+                          {st.title}
+                        </div>
+                      ))}
+                    </div>
+
+                    <AddSubtask onAdd={(text) => addSubtask(t.id, text)} />
+                  </div>
+                ) : null}
+              </div>
+            );
+          })}
+        </>
+      ) : (
+        <>
+          <h3>Kalender</h3>
+          <div style={calendarHeaderStyle}>
+            <button onClick={() => changeMonth(-1)} style={smallButtonStyle}>
+              ◀
+            </button>
+            <div style={{ fontWeight: 700 }}>{monthLabel}</div>
+            <button onClick={() => changeMonth(1)} style={smallButtonStyle}>
+              ▶
+            </button>
+          </div>
+          <div style={calendarGridStyle}>
+            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((label) => (
+              <div key={label} style={calendarHeaderCellStyle}>
+                {label}
+              </div>
+            ))}
+            {calendarDays.map((date, index) => {
+              if (!date) {
+                return <div key={`empty-${index}`} style={calendarCellStyle} />;
+              }
+              const dateKey = date.toISOString().slice(0, 10);
+              const dayTasks = tasksByDate[dateKey] ?? [];
+              return (
+                <div key={dateKey} style={calendarCellStyle}>
+                  <div style={{ fontSize: 12, color: "var(--textSoft)" }}>{date.getDate()}</div>
+                  {dayTasks.length === 0 ? (
+                    <div style={{ fontSize: 12, color: "var(--textSoft)" }}>—</div>
+                  ) : (
+                    dayTasks.map((task) => (
+                      <div key={task.id} style={calendarTaskStyle}>
+                        {task.title}
+                      </div>
+                    ))
+                  )}
+                </div>
+              );
+            })}
+          </div>
+          <div style={{ marginTop: 16 }}>
+            <h4>Liste nach Datum</h4>
+            {calendarGroups.length === 0 ? (
+              <div>Keine Aufgaben</div>
+            ) : (
+              calendarGroups.map(([dateKey, items]) => (
+                <div key={dateKey} style={{ marginBottom: 16 }}>
+                  <strong>{dateKey}</strong>
+                  <ul>
+                    {items.map((task) => (
+                      <li key={task.id}>
+                        {task.title} ({task.status})
+                      </li>
+                    ))}
+                  </ul>
+                </div>
+              ))
+            )}
           </div>
-        );
-      })}
+        </>
+      )}
     </div>
   );
 }
 
 /* ---------------- Subtask Input ---------------- */
 function AddSubtask({ onAdd }) {
   const [text, setText] = useState("");
 
   return (
     <div>
       <input
         placeholder="Unteraufgabe…"
         value={text}
         onChange={(e) => setText(e.target.value)}
+        style={inputStyle}
       />
       <button
         onClick={() => {
           onAdd(text);
           setText("");
         }}
       >
         +
       </button>
     </div>
   );
 }
 
EOF
)
