// pages/dashboard.js
// STENAU Dashboard – Finale Präsentations-Version (Geschäftsleitung-ready)
// Next.js (pages router) + Supabase
//
// ENV (Vercel / .env.local):
//   NEXT_PUBLIC_SUPABASE_URL=...
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
//
// Optional: Lege ein Logo unter /public/stenau-logo.png ab (wird automatisch genutzt).

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { createClient } from "@supabase/supabase-js";

/* =========================
   Supabase Client (sicher)
   ========================= */
function createSupabaseSafe() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

/* =========================
   Helpers
   ========================= */
const STATUS = {
  todo: { label: "Offen", key: "todo" },
  doing: { label: "In Arbeit", key: "doing" },
  done: { label: "Erledigt", key: "done" },
};

function safeDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
function fmtDate(d) {
  if (!d) return "";
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function fmtDateTime(d) {
  if (!d) return "";
  return `${fmtDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function isSameDay(a, b) {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/* =========================
   Premium Glass Styles
   ========================= */
const ui = {
  page: {
    minHeight: "100vh",
    color: "#eaf2ff",
    background:
      "radial-gradient(1200px 700px at 15% 15%, rgba(66, 153, 225, 0.35), rgba(8, 18, 38, 0.95))," +
      "radial-gradient(900px 600px at 85% 20%, rgba(99, 102, 241, 0.22), rgba(8, 18, 38, 0.95))," +
      "linear-gradient(180deg, rgba(5, 12, 28, 1), rgba(10, 20, 42, 1))",
    padding: "22px 22px 44px",
  },
  shell: { maxWidth: 1500, margin: "0 auto" },

  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 14,
  },
  brand: { display: "flex", alignItems: "center", gap: 12, minWidth: 320 },
  logo: {
    width: 56,
    height: 30,
    objectFit: "contain",
    filter: "drop-shadow(0 8px 18px rgba(0,0,0,0.35))",
  },
  titleWrap: { display: "flex", flexDirection: "column", lineHeight: 1.1 },
  title: { margin: 0, fontSize: 22, letterSpacing: 0.2 },
  subtitle: { margin: 0, marginTop: 4, fontSize: 12, opacity: 0.82 },

  pills: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center", flex: 1 },
  pill: (active) => ({
    padding: "9px 12px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: active
      ? "linear-gradient(180deg, rgba(59,130,246,0.35), rgba(37,99,235,0.14))"
      : "rgba(255,255,255,0.06)",
    color: "rgba(234,242,255,0.95)",
    boxShadow: active ? "0 10px 24px rgba(24,63,140,0.35)" : "none",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
  }),

  right: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, minWidth: 320 },
  badge: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  },
  dot: (ok) => ({
    width: 9,
    height: 9,
    borderRadius: 99,
    background: ok ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)",
    boxShadow: ok ? "0 0 0 6px rgba(34,197,94,0.12)" : "0 0 0 6px rgba(239,68,68,0.12)",
  }),
  badgeText: { display: "flex", flexDirection: "column", lineHeight: 1.15 },
  email: { fontSize: 12, opacity: 0.92 },
  role: { fontSize: 11, opacity: 0.68, marginTop: 2 },

  btn: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(234,242,255,0.95)",
    padding: "10px 12px",
    borderRadius: 14,
    cursor: "pointer",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    fontWeight: 800,
    fontSize: 12,
  },

  card: {
    border: "1px solid rgba(255,255,255,0.12)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.05))",
    borderRadius: 18,
    boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
  },

  kpiRow: { display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12, marginBottom: 14 },
  col: (span) => ({ gridColumn: `span ${span}` }),
  kpi: { padding: "14px 14px 12px", display: "flex", flexDirection: "column", gap: 6, minHeight: 78 },
  kpiLabel: { fontSize: 11, opacity: 0.72, letterSpacing: 0.25 },
  kpiValue: { fontSize: 22, fontWeight: 900, letterSpacing: 0.2 },
  kpiHint: { fontSize: 11, opacity: 0.68 },

  grid: { display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 14 },

  colCardHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
  },
  colTitle: { margin: 0, fontSize: 14, fontWeight: 900, letterSpacing: 0.2 },
  colCount: {
    fontSize: 12,
    opacity: 0.75,
    padding: "5px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  colBody: { padding: 12, minHeight: 420 },

  task: {
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.16)",
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  taskTop: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  taskTitle: { margin: 0, fontWeight: 900, fontSize: 13, letterSpacing: 0.1 },
  taskMeta: { fontSize: 11, opacity: 0.72, marginTop: 4 },
  statusDot: (status) => ({
    width: 10,
    height: 10,
    borderRadius: 99,
    background:
      status === "done" ? "rgba(34,197,94,0.95)" : status === "doing" ? "rgba(59,130,246,0.95)" : "rgba(251,191,36,0.95)",
    boxShadow:
      status === "done"
        ? "0 0 0 6px rgba(34,197,94,0.14)"
        : status === "doing"
          ? "0 0 0 6px rgba(59,130,246,0.14)"
          : "0 0 0 6px rgba(251,191,36,0.14)",
    marginTop: 2,
    flex: "0 0 auto",
  }),
  tag: {
    fontSize: 11,
    opacity: 0.85,
    padding: "3px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
  },
  notes: { marginTop: 8, fontSize: 12, opacity: 0.82, lineHeight: 1.35 },

  sublist: { marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.10)", display: "flex", flexDirection: "column", gap: 6 },
  subitem: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.92 },
  checkbox: { transform: "scale(1.05)" },
  smallBtn: {
    marginTop: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "7px 10px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(59,130,246,0.25)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
  },

  infoBox: { padding: 14, borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)" },
};

/* =========================
   Page
   ========================= */
export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseSafe(), []);
  const mounted = useRef(true);

  const [authBusy, setAuthBusy] = useState(true);
  const [authOk, setAuthOk] = useState(false);

  const [me, setMe] = useState({ id: "", email: "", role: "user", isAdmin: false });

  const [view, setView] = useState("kanban"); // kanban | calendar | list
  const [focusMine, setFocusMine] = useState(false); // Präsentations-Feature

  const [tasks, setTasks] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [delegations, setDelegations] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /* ---------- Auth ---------- */
  useEffect(() => {
    async function runAuth() {
      try {
        if (!supabase) {
          setAuthBusy(false);
          setAuthOk(false);
          return;
        }

        const { data } = await supabase.auth.getSession();
        const session = data?.session;

        if (!session?.user) {
          setAuthBusy(false);
          setAuthOk(false);
          return;
        }

        const user = session.user;
        const id = user.id;
        const email = user.email || "";

        let role = "user";
        let isAdmin = false;

        // Profile lesen (optional)
        try {
          const pr = await supabase
            .from("profiles")
            .select("id,email,role,is_active,name")
            .eq("id", id)
            .maybeSingle();

          if (pr?.data) {
            role = (pr.data.role || "user").toString();
            isAdmin = /admin/i.test(role);
          }
        } catch (_) {}

        if (!mounted.current) return;
        setMe({ id, email, role, isAdmin });
        setAuthBusy(false);
        setAuthOk(true);
      } catch (_) {
        if (!mounted.current) return;
        setAuthBusy(false);
        setAuthOk(false);
      }
    }
    runAuth();
  }, [supabase]);

  useEffect(() => {
    if (!authBusy && !authOk) {
      router.replace("/login");
    }
  }, [authBusy, authOk, router]);

  /* ---------- Data Load ---------- */
  async function loadAll() {
    if (!supabase) {
      setLoadError("Supabase ENV fehlt. Prüfe NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");

    try {
      // Tasks: subtasks via Relation "subtasks" (falls vorhanden). Wenn Relation nicht existiert, liefert Supabase einen Fehler.
      // Darum: erst mit subtasks versuchen, ansonsten fallback ohne subtasks.
      let tRes = await supabase
        .from("tasks")
        .select(
          "id,title,notes,status,area,area_id,due_at,due_date,created_at,assignee_id,report_enabled,report_rule,report_until,report_count,is_series,series_parent_id," +
          "assignee:profiles!tasks_assignee_id_fkey(id,email,name,role)," +
          "subtasks(id,title,is_done,color,created_at,guide_id)"
        )
        .order("created_at", { ascending: false });

      if (tRes.error) {
        // Fallback ohne subtasks / join
        tRes = await supabase
          .from("tasks")
          .select("id,title,notes,status,area,area_id,due_at,due_date,created_at,assignee_id,report_enabled,report_rule,report_until,report_count,is_series,series_parent_id")
          .order("created_at", { ascending: false });

        if (tRes.error) throw new Error(tRes.error.message);
      }

      const pRes = await supabase
        .from("profiles")
        .select("id,email,name,role,is_active")
        .order("email", { ascending: true });

      const dRes = await supabase
        .from("user_delegations")
        .select("id,from_user_id,to_user_id,starts_at,ends_at,is_active,created_at")
        .order("created_at", { ascending: false });

      if (!mounted.current) return;

      setTasks(Array.isArray(tRes.data) ? tRes.data : []);
      setProfiles(Array.isArray(pRes.data) ? pRes.data : []);
      setDelegations(Array.isArray(dRes.data) ? dRes.data : []);
      setLoading(false);
    } catch (e) {
      if (!mounted.current) return;
      setLoadError(e?.message || "Unbekannter Fehler beim Laden.");
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authOk) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authOk]);

  /* ---------- Derived ---------- */
  const now = useMemo(() => new Date(), [loading]);
  const todayStart = useMemo(() => startOfDay(now), [now]);
  const todayEnd = useMemo(() => endOfDay(now), [now]);

  const activeDelegations = useMemo(() => {
    const n = now.getTime();
    return (delegations || []).filter((d) => {
      if (d?.is_active === false) return false;
      const s = safeDate(d?.starts_at);
      const e = safeDate(d?.ends_at);
      const okS = !s || s.getTime() <= n;
      const okE = !e || e.getTime() >= n;
      return okS && okE;
    });
  }, [delegations, now]);

  const myDelegationActive = useMemo(() => {
    const myId = me.id;
    if (!myId) return false;
    return activeDelegations.some((d) => d.from_user_id === myId || d.to_user_id === myId);
  }, [activeDelegations, me.id]);

  const normalizedTasks = useMemo(() => {
    const list = (tasks || []).map((t) => {
      const s = t.status === "done" ? "done" : t.status === "doing" || t.status === "in_progress" ? "doing" : "todo";
      const due = safeDate(t.due_at || t.due_date);
      const assigneeEmail = t.assignee?.email || "";
      const assigneeName = t.assignee?.name || "";
      return { ...t, _status: s, _due: due, _assigneeEmail: assigneeEmail, _assigneeName: assigneeName };
    });

    if (!focusMine) return list;
    return list.filter((t) => t.assignee_id === me.id);
  }, [tasks, focusMine, me.id]);

  const byStatus = useMemo(() => {
    const m = { todo: [], doing: [], done: [] };
    for (const t of normalizedTasks) m[t._status].push(t);
    return m;
  }, [normalizedTasks]);

  const kpis = useMemo(() => {
    const total = normalizedTasks.length;
    const open = byStatus.todo.length;
    const doing = byStatus.doing.length;
    const done = byStatus.done.length;

    let overdue = 0;
    let dueToday = 0;

    for (const t of normalizedTasks) {
      if (!t._due) continue;
      if (t._status !== "done" && t._due.getTime() < todayStart.getTime()) overdue += 1;
      if (t._status !== "done" && t._due.getTime() >= todayStart.getTime() && t._due.getTime() <= todayEnd.getTime()) dueToday += 1;
    }

    return { total, open, doing, done, overdue, dueToday, activeDelegations: activeDelegations.length };
  }, [normalizedTasks, byStatus, todayStart, todayEnd, activeDelegations.length]);

  /* ---------- Actions ---------- */
  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function reactivateTask(taskId) {
    if (!supabase || !taskId) return;
    try {
      const res = await supabase.from("tasks").update({ status: "todo" }).eq("id", taskId);
      if (res.error) throw new Error(res.error.message);
      setTasks((prev) => (prev || []).map((t) => (t.id === taskId ? { ...t, status: "todo" } : t)));
    } catch (e) {
      console.warn("reactivateTask:", e?.message);
    }
  }

  async function toggleSubtask(task, sub) {
    if (!supabase || !task?.id || !sub?.id) return;
    try {
      const next = !sub.is_done;
      const res = await supabase.from("subtasks").update({ is_done: next }).eq("id", sub.id);
      if (res.error) throw new Error(res.error.message);

      setTasks((prev) =>
        (prev || []).map((t) => {
          if (t.id !== task.id) return t;
          const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
          return { ...t, subtasks: subs.map((s) => (s.id === sub.id ? { ...s, is_done: next } : s)) };
        })
      );
    } catch (e) {
      console.warn("toggleSubtask:", e?.message);
    }
  }

  /* ---------- Calendar ---------- */
  const calendarDays = useMemo(() => {
    const base = startOfDay(now);
    const start = new Date(base);
    start.setDate(start.getDate() - 3);
    const days = [];
    for (let i = 0; i < 14; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }, [now]);

  const tasksByDay = useMemo(() => {
    const map = new Map();
    for (const d of calendarDays) map.set(fmtDate(d), []);
    for (const t of normalizedTasks) {
      if (!t._due) continue;
      const key = fmtDate(t._due);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    for (const [k, v] of map.entries()) {
      v.sort((a, b) => (a._due?.getTime?.() || 0) - (b._due?.getTime?.() || 0));
      map.set(k, v);
    }
    return map;
  }, [normalizedTasks, calendarDays]);

  /* ---------- Render Guards ---------- */
  if (authBusy) {
    return (
      <div style={ui.page}>
        <div style={ui.shell}>
          <div style={{ ...ui.card, padding: 18 }}>Lade Session…</div>
        </div>
      </div>
    );
  }

  if (!authOk) {
    // redirect läuft
    return (
      <div style={ui.page}>
        <div style={ui.shell}>
          <div style={{ ...ui.card, padding: 18 }}>Bitte anmelden…</div>
        </div>
      </div>
    );
  }

  /* ---------- UI ---------- */
  return (
    <div style={ui.page}>
      <div style={ui.shell}>
        {/* Topbar */}
        <div style={ui.topbar}>
          <div style={ui.brand}>
            <img
              src="/stenau-logo.png"
              alt="STENAU"
              style={ui.logo}
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
            <div style={ui.titleWrap}>
              <h1 style={ui.title}>STENAU Dashboard</h1>
              <p style={ui.subtitle}>Chef Cockpit • Kanban • Kalender • Liste • Unteraufgaben • Vertretungen</p>
            </div>
          </div>

          <div style={ui.pills}>
            <button type="button" style={ui.pill(view === "kanban")} onClick={() => setView("kanban")}>Kanban</button>
            <button type="button" style={ui.pill(view === "calendar")} onClick={() => setView("calendar")}>Kalender</button>
            <button type="button" style={ui.pill(view === "list")} onClick={() => setView("list")}>Liste</button>

            <button
              type="button"
              style={ui.pill(focusMine)}
              onClick={() => setFocusMine((v) => !v)}
              title="Optional: Ansicht auf eigene Aufgaben fokussieren"
            >
              Fokus: {focusMine ? "Meine" : "Alle"}
            </button>

            <button type="button" style={ui.pill(false)} onClick={loadAll}>Neu laden</button>
          </div>

          <div style={ui.right}>
            <div style={ui.badge}>
              <span style={ui.dot(!loadError)} />
              <div style={ui.badgeText}>
                <div style={ui.email}>{me.email || "—"}</div>
                <div style={ui.role}>{me.isAdmin ? "Rolle: Admin" : "Rolle: Mitarbeiter"}</div>
              </div>
            </div>
            <button type="button" style={ui.btn} onClick={signOut}>Abmelden</button>
          </div>
        </div>

        {/* KPIs + Info */}
        <div style={ui.kpiRow}>
          <div style={{ ...ui.card, ...ui.kpi, ...ui.col(2) }}>
            <div style={ui.kpiLabel}>Aufgaben gesamt</div>
            <div style={ui.kpiValue}>{loading ? "…" : kpis.total}</div>
            <div style={ui.kpiHint}>Überblick</div>
          </div>
          <div style={{ ...ui.card, ...ui.kpi, ...ui.col(2) }}>
            <div style={ui.kpiLabel}>Offen</div>
            <div style={ui.kpiValue}>{loading ? "…" : kpis.open}</div>
            <div style={ui.kpiHint}>Zu planen</div>
          </div>
          <div style={{ ...ui.card, ...ui.kpi, ...ui.col(2) }}>
            <div style={ui.kpiLabel}>In Arbeit</div>
            <div style={ui.kpiValue}>{loading ? "…" : kpis.doing}</div>
            <div style={ui.kpiHint}>Aktiv</div>
          </div>
          <div style={{ ...ui.card, ...ui.kpi, ...ui.col(2) }}>
            <div style={ui.kpiLabel}>Erledigt</div>
            <div style={ui.kpiValue}>{loading ? "…" : kpis.done}</div>
            <div style={ui.kpiHint}>Historie</div>
          </div>
          <div style={{ ...ui.card, ...ui.kpi, ...ui.col(2) }}>
            <div style={ui.kpiLabel}>Fällig heute</div>
            <div style={ui.kpiValue}>{loading ? "…" : kpis.dueToday}</div>
            <div style={ui.kpiHint}>Operativ</div>
          </div>
          <div style={{ ...ui.card, ...ui.kpi, ...ui.col(2) }}>
            <div style={ui.kpiLabel}>Überfällig</div>
            <div style={{ ...ui.kpiValue, color: kpis.overdue ? "rgba(251,191,36,0.95)" : undefined }}>
              {loading ? "…" : kpis.overdue}
            </div>
            <div style={ui.kpiHint}>Priorität</div>
          </div>

          <div style={{ ...ui.card, ...ui.kpi, ...ui.col(6) }}>
            <div style={ui.kpiLabel}>Vertretungen (aktiv)</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div style={ui.kpiValue}>{loading ? "…" : kpis.activeDelegations}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>im Zeitraum</div>
            </div>
            <div style={ui.kpiHint}>
              {myDelegationActive ? "Für deinen Account ist eine Vertretung aktiv." : "Keine aktive Vertretung für deinen Account."}
            </div>
          </div>

          <div style={{ ...ui.card, padding: 14, ...ui.col(6) }}>
            <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 8 }}>Status / Präsentationshinweis</div>
            {loadError ? (
              <div style={{ ...ui.infoBox, borderColor: "rgba(239,68,68,0.35)" }}>
                <div style={{ fontWeight: 900, marginBottom: 6, color: "rgba(239,68,68,0.95)" }}>Fehler beim Laden</div>
                <div style={{ fontSize: 12, opacity: 0.9 }}>{loadError}</div>
              </div>
            ) : (
              <div style={ui.infoBox}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 900 }}>System bereit</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{fmtDateTime(new Date())}</div>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.86 }}>
                  Diese Ansicht ist für die Geschäftsleitung optimiert: KPI-Übersicht + Kanban/Kalender/Liste + Unteraufgaben + Vertretungen.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Views */}
        {view === "kanban" && (
          <div style={ui.grid}>
            <KanbanColumn title={STATUS.todo.label} count={byStatus.todo.length} tasks={byStatus.todo} onReactivate={reactivateTask} onToggleSubtask={toggleSubtask} />
            <KanbanColumn title={STATUS.doing.label} count={byStatus.doing.length} tasks={byStatus.doing} onReactivate={reactivateTask} onToggleSubtask={toggleSubtask} />
            <KanbanColumn title={STATUS.done.label} count={byStatus.done.length} tasks={byStatus.done} onReactivate={reactivateTask} onToggleSubtask={toggleSubtask} />
          </div>
        )}

        {view === "calendar" && (
          <div style={{ ...ui.card, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 14 }}>Kalender (Fälligkeiten)</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>14 Tage • due_at / due_date</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
              {calendarDays.map((d) => {
                const key = fmtDate(d);
                const list = tasksByDay.get(key) || [];
                const today = isSameDay(d, now);
                return (
                  <div key={key} style={{ ...ui.card, background: "rgba(255,255,255,0.05)", borderRadius: 16 }}>
                    <div style={{ padding: "10px 10px 8px", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
                      <div style={{ fontWeight: 900, fontSize: 12, color: today ? "#fff" : "rgba(234,242,255,0.9)" }}>
                        {key} {today ? "• Heute" : ""}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.7 }}>{list.length} Aufgabe(n)</div>
                    </div>
                    <div style={{ padding: 10, minHeight: 120 }}>
                      {list.slice(0, 6).map((t) => (
                        <div key={t.id} style={{ ...ui.task, marginBottom: 8 }}>
                          <div style={ui.taskTop}>
                            <div>
                              <div style={ui.taskTitle}>{t.title || "—"}</div>
                              <div style={ui.taskMeta}>{t._assigneeEmail ? `Zuständig: ${t._assigneeEmail}` : "Zuständig: —"}</div>
                            </div>
                            <span style={ui.statusDot(t._status)} />
                          </div>
                        </div>
                      ))}
                      {list.length > 6 && <div style={{ fontSize: 11, opacity: 0.75 }}>+ {list.length - 6} weitere…</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === "list" && (
          <div style={{ ...ui.card, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 14 }}>Liste</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Status → Datum</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              {["todo", "doing", "done"].map((s) => (
                <div key={s} style={{ ...ui.card, background: "rgba(255,255,255,0.05)", borderRadius: 16 }}>
                  <div style={ui.colCardHead}>
                    <h3 style={ui.colTitle}>{STATUS[s].label}</h3>
                    <div style={ui.colCount}>{byStatus[s].length}</div>
                  </div>
                  <div style={{ padding: 12 }}>
                    {(byStatus[s] || [])
                      .slice()
                      .sort((a, b) => ((a._due?.getTime?.() || 0) - (b._due?.getTime?.() || 0)))
                      .map((t) => (
                        <TaskCard key={t.id} task={t} compact onReactivate={reactivateTask} onToggleSubtask={toggleSubtask} />
                      ))}
                    {!byStatus[s].length && <div style={{ fontSize: 12, opacity: 0.7 }}>Keine Einträge.</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Admin Demo */}
        {me.isAdmin && (
          <div style={{ marginTop: 16, ...ui.card, padding: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Admin-Bereich (Demo)</div>
            <div style={{ fontSize: 12, opacity: 0.82, lineHeight: 1.45 }}>
              Hier können anschließend Einstellungen/Nutzerverwaltung (RBAC), Bereiche, Anleitungen und Vertretungsregeln vollständig integriert werden.
              Für die Präsentation zeigt dieser Block: rollenbasierte Oberfläche ist vorbereitet.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================
   Components
   ========================= */
function KanbanColumn({ title, count, tasks, onReactivate, onToggleSubtask }) {
  return (
    <div style={{ ...ui.card, ...ui.col(4) }}>
      <div style={ui.colCardHead}>
        <h3 style={ui.colTitle}>{title}</h3>
        <div style={ui.colCount}>{count}</div>
      </div>
      <div style={ui.colBody}>
        {!tasks?.length && <div style={{ fontSize: 12, opacity: 0.7 }}>Keine Einträge.</div>}
        {(tasks || []).slice(0, 60).map((t) => (
          <TaskCard key={t.id} task={t} onReactivate={onReactivate} onToggleSubtask={onToggleSubtask} />
        ))}
        {tasks?.length > 60 && <div style={{ fontSize: 11, opacity: 0.75 }}>+ {tasks.length - 60} weitere…</div>}
      </div>
    </div>
  );
}

function TaskCard({ task, onReactivate, onToggleSubtask, compact }) {
  const due = task._due;
  const overdue = due && task._status !== "done" && due.getTime() < startOfDay(new Date()).getTime();
  const dueTxt = due ? fmtDateTime(due) : "";

  const subs = Array.isArray(task.subtasks) ? task.subtasks : [];

  return (
    <div style={{ ...ui.task, marginBottom: compact ? 8 : 10 }}>
      <div style={ui.taskTop}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <h4
              style={{
                ...ui.taskTitle,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: compact ? 1100 : 380,
              }}
            >
              {task.title || "—"}
            </h4>
            {task.area ? <span style={ui.tag}>{task.area}</span> : null}
          </div>

          <div style={{ ...ui.taskMeta, color: overdue ? "rgba(251,191,36,0.95)" : "rgba(234,242,255,0.72)" }}>
            {task._assigneeEmail ? `Zuständig: ${task._assigneeEmail}` : "Zuständig: —"}
            {dueTxt ? ` • Fällig: ${dueTxt}` : ""}
            {overdue ? " • Überfällig" : ""}
          </div>

          {!!task.notes && !compact && (
            <div style={ui.notes}>
              {String(task.notes).slice(0, 180)}
              {String(task.notes).length > 180 ? "…" : ""}
            </div>
          )}

          {subs.length > 0 && (
            <div style={ui.sublist}>
              {subs.slice(0, compact ? 6 : 10).map((s) => (
                <label key={s.id} style={ui.subitem}>
                  <input
                    type="checkbox"
                    checked={!!s.is_done}
                    onChange={() => onToggleSubtask(task, s)}
                    style={ui.checkbox}
                  />
                  <span style={{ textDecoration: s.is_done ? "line-through" : "none", opacity: s.is_done ? 0.65 : 0.95 }}>
                    {s.title || "—"}
                  </span>
                </label>
              ))}
              {subs.length > (compact ? 6 : 10) && (
                <div style={{ fontSize: 11, opacity: 0.75 }}>+ {subs.length - (compact ? 6 : 10)} weitere…</div>
              )}
            </div>
          )}

          {task._status === "done" && (
            <button type="button" style={ui.smallBtn} onClick={() => onReactivate(task.id)}>
              Reaktivieren
            </button>
          )}
        </div>

        <span style={ui.statusDot(task._status)} title={task._status} />
      </div>
    </div>
  );
}
