 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/pages/dashboard.js b/pages/dashboard.js
index f3b066151abe21c8ff7be710d1b6f9a75ed659e7..0fd6b12e901da6461249e7aaceabd6eccfe25d86 100644
--- a/pages/dashboard.js
+++ b/pages/dashboard.js
@@ -1,30 +1,31 @@
 // pages/dashboard.js
 // Standalone dashboard page (React) for Next.js + Supabase
 
 import React, { useEffect, useMemo, useState } from "react";
 import { createClient } from "@supabase/supabase-js";
+import { styles } from "../styles/dashboardTheme";
 
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
@@ -805,51 +806,53 @@ function CalendarPanel() {
 
     setTasks(data || []);
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
         {tasks.map((t) => {
-          const areaName = t.area_id ? areaById.get(t.area_id)?.name : t.area || "–";
+          const area = t.area_id ? areaById.get(t.area_id) : null;
+          const areaName = area?.name || t.area || "–";
+          const areaColor = area?.color || (area?.key === "A" ? "#0b6b2a" : area?.key === "B" ? "#1f6feb" : "#6b7280");
           return (
             <div key={t.id} style={styles.card}>
               <div style={styles.h4}>{t.title}</div>
               <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
                 {t.due_at ? fmtDateTime(t.due_at) : "–"} · Bereich: <span style={{display:"inline-flex",alignItems:"center",gap:6}}><span style={{width:10,height:10,borderRadius:999,background:areaColor,display:"inline-block"}} />{areaName}</span> · Status: {t.status ?? "todo"}
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
   const [auth, setAuth] = useState({ user: null, profile: null, role: null, isAdmin: false, inactive: false });
   const [authLoading, setAuthLoading] = useState(true);
   const [authError, setAuthError] = useState(null);
 
   async function refreshAuth() {
     setAuthLoading(true);
     setAuthError(null);
@@ -972,201 +975,25 @@ export default function Dashboard() {
 
       {activeTab === "board" ? <TasksBoard isAdmin={auth.isAdmin} /> : null}
       {activeTab === "calendar" ? <CalendarPanel /> : null}
       {activeTab === "guides" ? <GuidesPanel isAdmin={auth.isAdmin} /> : null}
       {activeTab === "areas" ? <AreasAdminPanel isAdmin={auth.isAdmin} /> : null}
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
-
-/* ---------------- Styles ---------------- */
-const styles = {
-  page: {
-    minHeight: "100vh",
-    background: "#f3f6fb",
-    padding: 18,
-    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
-  },
-  topbar: {
-    display: "flex",
-    gap: 14,
-    alignItems: "center",
-    justifyContent: "space-between",
-    marginBottom: 14,
-  },
-  brand: {
-    fontSize: 30,
-    fontWeight: 800,
-    letterSpacing: -0.5,
-  },
-  tabs: {
-    display: "flex",
-    gap: 10,
-    alignItems: "center",
-    flexWrap: "wrap",
-  },
-  tab: {
-    border: "1px solid #d8e0ef",
-    background: "#fff",
-    padding: "10px 14px",
-    borderRadius: 999,
-    cursor: "pointer",
-    fontWeight: 600,
-  },
-  tabActive: {
-    background: "#0b6b2a",
-    borderColor: "#0b6b2a",
-    color: "#fff",
-  },
-  right: {
-    display: "flex",
-    gap: 12,
-    alignItems: "center",
-  },
-  panel: {
-    background: "#fff",
-    border: "1px solid #d8e0ef",
-    borderRadius: 18,
-    padding: 16,
-    boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
-    marginBottom: 14,
-  },
-  h3: {
-    fontSize: 18,
-    fontWeight: 800,
-    marginBottom: 10,
-  },
-  h4: {
-    fontSize: 16,
-    fontWeight: 800,
-    marginBottom: 4,
-  },
-  rowBetween: {
-    display: "flex",
-    alignItems: "center",
-    justifyContent: "space-between",
-    gap: 12,
-  },
-  columns: {
-    display: "grid",
-    gridTemplateColumns: "1fr 1fr",
-    gap: 14,
-  },
-  col: {
-    background: "transparent",
-  },
-  colHeader: {
-    display: "flex",
-    alignItems: "center",
-    justifyContent: "space-between",
-    marginBottom: 10,
-  },
-  badge: {
-    minWidth: 28,
-    height: 28,
-    borderRadius: 999,
-    background: "#eef2fb",
-    border: "1px solid #d8e0ef",
-    display: "flex",
-    alignItems: "center",
-    justifyContent: "center",
-    fontWeight: 700,
-    color: "#333",
-  },
-  pill: {
-    fontSize: 12,
-    padding: "4px 10px",
-    borderRadius: 999,
-    border: "1px solid #d8e0ef",
-    background: "#f7f9ff",
-    fontWeight: 700,
-  },
-  card: {
-    background: "#fff",
-    border: "1px solid #d8e0ef",
-    borderRadius: 18,
-    padding: 14,
-    boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
-  },
-  input: {
-    padding: 10,
-    borderRadius: 12,
-    border: "1px solid #d8e0ef",
-    outline: "none",
-    background: "#fff",
-    minWidth: 160,
-  },
-  textarea: {
-    padding: 10,
-    borderRadius: 12,
-    border: "1px solid #d8e0ef",
-    outline: "none",
-    background: "#fff",
-    width: "100%",
-    resize: "vertical",
-  },
-  btn: {
-    padding: "10px 14px",
-    borderRadius: 12,
-    border: "1px solid #d8e0ef",
-    background: "#fff",
-    cursor: "pointer",
-    fontWeight: 700,
-  },
-  btnPrimary: {
-    padding: "10px 14px",
-    borderRadius: 12,
-    border: "1px solid #0b6b2a",
-    background: "#0b6b2a",
-    color: "#fff",
-    cursor: "pointer",
-    fontWeight: 800,
-  },
-  error: {
-    background: "#fff3f3",
-    border: "1px solid #ffd2d2",
-    color: "#a40000",
-    padding: 12,
-    borderRadius: 12,
-    marginTop: 10,
-    marginBottom: 10,
-  },
-  taskFormGrid: {
-    display: "grid",
-    gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1.2fr auto",
-    gap: 10,
-    alignItems: "start",
-  },
-  table: {
-    width: "100%",
-    borderCollapse: "collapse",
-  },
-  th: {
-    textAlign: "left",
-    padding: 10,
-    borderBottom: "1px solid #d8e0ef",
-    fontSize: 13,
-    color: "#555",
-  },
-  td: {
-    padding: 10,
-    borderBottom: "1px solid #eef2fb",
-    verticalAlign: "top",
-  },
-};
 
EOF
)
