// pages/dashboard.js
import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* =========================
   SECTION: SUPABASE CLIENT
   ========================= */
function getSupabaseClient() {
  if (typeof window === "undefined") return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Wichtig: niemals im Build crashen
    console.warn("Supabase ENV fehlt: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return null;
  }

  if (!window.__supabase__) {
    window.__supabase__ = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }

  return window.__supabase__;
}

/* =========================
   SECTION: HELPERS
   ========================= */
const toISO = (v) => {
  if (!v) return null;
  const d = new Date(v);
  // invalid date check
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

function mapUiStatusToDb(v) {
  // UI kann später andere Labels bekommen; DB bleibt todo/done
  if (v === "done") return "done";
  return "todo";
}

/* =========================
   SECTION: MAIN
   ========================= */
export default function DashboardPage() {
  const [supabase, setSupabase] = useState(null);
  const [session, setSession] = useState(null);
  const user = session?.user || null;

  const [tasks, setTasks] = useState([]);
  const [areas, setAreas] = useState([]);
  const [guides, setGuides] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* Create Task */
  const [newTitle, setNewTitle] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [newDueAt, setNewDueAt] = useState("");
  const [newStatus, setNewStatus] = useState("todo");
  const [newGuideId, setNewGuideId] = useState("");

  /* =========================
     SECTION: INIT SUPABASE
     ========================= */
  useEffect(() => {
    setSupabase(getSupabaseClient());
  }, []);

  /* =========================
     SECTION: AUTH
     ========================= */
  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.warn("getSession error:", error);
      setSession(data.session || null);
    });

    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s || null);
    });

    return () => data.subscription.unsubscribe();
  }, [supabase]);

  /* =========================
     SECTION: LOAD DATA
     ========================= */
  useEffect(() => {
    if (!supabase || !user) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user?.id]);

  const loadAll = async () => {
    setError("");
    setLoading(true);
    try {
      await Promise.all([loadAreas(), loadGuides(), loadTasks()]);
    } finally {
      setLoading(false);
    }
  };

  // === SECTION: LOAD TASKS (VIEW) ===
  const loadTasks = async () => {
    setError("");
    const { data, error } = await supabase
      .from("v_tasks_ui")
      .select("id,title,status,is_done,created_at,due_at,due_day,period,area_id,area_name,guide_id,guide_title")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("loadTasks error:", error);
      setError(error.message);
      setTasks([]);
      return;
    }

    setTasks(data || []);
  };

  // === SECTION: LOAD AREAS ===
  const loadAreas = async () => {
    const { data, error } = await supabase.from("areas").select("id,name").order("name");
    if (error) console.error("loadAreas error:", error);
    setAreas(data || []);
  };

  // === SECTION: LOAD GUIDES ===
  const loadGuides = async () => {
    const { data, error } = await supabase.from("guides").select("id,title").order("title");
    if (error) console.error("loadGuides error:", error);
    setGuides(data || []);
  };

  /* =========================
     SECTION: CREATE TASK
     ========================= */
  const createTask = async () => {
    setError("");
    if (!supabase) return setError("Supabase nicht initialisiert.");
    if (!user) return setError("Nicht angemeldet.");
    if (!newTitle.trim()) return;

    // due_at: wenn leer => null (DB Defaults/Views können trotzdem funktionieren)
    const dueAtIso = toISO(newDueAt);

    const payload = {
      title: newTitle.trim(),
      status: mapUiStatusToDb(newStatus), // todo | done (DB check)
      user_id: user.id,                   // RLS-konform
      area_id: newAreaId || null,
      guide_id: newGuideId || null,
      due_at: dueAtIso,                   // kann null sein
      // due_day NICHT setzen (bei dir teils generated/gesperrt)
      // period hat Default 'Heute' (NOT NULL), wir lassen es bewusst weg
    };

    const { data, error } = await supabase.from("tasks").insert([payload]).select("id").single();

    if (error) {
      console.error("createTask error:", error, payload);
      return setError(error.message);
    }

    setNewTitle("");
    setNewAreaId("");
    setNewDueAt("");
    setNewStatus("todo");
    setNewGuideId("");

    // reload
    await loadTasks();

    return data?.id;
  };

  /* =========================
     SECTION: STATUS TOGGLE
     ========================= */
  const toggleStatus = async (id, current) => {
    setError("");
    if (!supabase) return setError("Supabase nicht initialisiert.");

    const next = current === "done" ? "todo" : "done";
    const { error } = await supabase.from("tasks").update({ status: next }).eq("id", id);

    if (error) {
      console.error("toggleStatus error:", error);
      return setError(error.message);
    }

    await loadTasks();
  };

  /* =========================
     SECTION: LOGOUT
     ========================= */
  const logout = async () => {
    setError("");
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setError(error.message);
  };

  /* =========================
     SECTION: LOGIN
     ========================= */
  if (!user) {
    return <Login supabase={supabase} />;
  }

  /* =========================
     SECTION: UI
     ========================= */
  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand">Dashboard</div>
        <div className="right">
          <span className="email">{user.email}</span>
          <button className="btn" onClick={logout}>Abmelden</button>
        </div>
      </div>

      <div className="container">
        <div className="card">
          <h2>Aufgabe anlegen</h2>

          {error && <div className="alert">{error}</div>}

          <div className="row">
            <input
              className="input"
              placeholder="Titel"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />

            <select className="input" value={newAreaId} onChange={(e) => setNewAreaId(e.target.value)}>
              <option value="">Bereich</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>

            <input
              className="input"
              type="datetime-local"
              value={newDueAt}
              onChange={(e) => setNewDueAt(e.target.value)}
            />

            <select className="input" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              <option value="todo">Zu erledigen</option>
              <option value="done">Erledigt</option>
            </select>

            <select className="input" value={newGuideId} onChange={(e) => setNewGuideId(e.target.value)}>
              <option value="">Anleitung</option>
              {guides.map((g) => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>

            <button className="btn primary" onClick={createTask} disabled={loading || !newTitle.trim()}>
              Anlegen
            </button>
          </div>
        </div>

        <div className="card">
          <div className="headrow">
            <h3>Aufgaben</h3>
            <button className="btn" onClick={loadAll} disabled={loading}>
              Aktualisieren
            </button>
          </div>

          {loading && <div className="muted">Lade…</div>}

          {!loading && tasks.length === 0 && (
            <div className="muted">Keine Aufgaben vorhanden.</div>
          )}

          <div className="list">
            {tasks.map((t) => (
              <div key={t.id} className="item">
                <div className="left">
                  <div className="title">{t.title}</div>
                  <div className="meta">
                    <span className="pill">{t.status}</span>
                    {t.area_name ? <span className="pill">{t.area_name}</span> : null}
                    {t.guide_title ? <span className="pill">Anleitung: {t.guide_title}</span> : null}
                    {t.due_at ? <span className="pill">Fällig: {new Date(t.due_at).toLocaleString()}</span> : null}
                  </div>
                </div>

                <div className="right">
                  <button className="btn" onClick={() => toggleStatus(t.id, t.status)}>
                    Status wechseln
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          background: #f6f7fb;
          color: #111;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
        }
        .topbar {
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          background: #fff;
          border-bottom: 1px solid #e7e8ee;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .brand {
          font-weight: 700;
          letter-spacing: 0.2px;
        }
        .right {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .email {
          font-size: 13px;
          color: #444;
          background: #f1f2f7;
          padding: 6px 10px;
          border-radius: 999px;
        }
        .container {
          max-width: 1100px;
          margin: 18px auto;
          padding: 0 16px 28px;
          display: grid;
          gap: 14px;
        }
        .card {
          background: #fff;
          border: 1px solid #e7e8ee;
          border-radius: 14px;
          padding: 14px;
          box-shadow: 0 6px 18px rgba(0,0,0,0.04);
        }
        h2, h3 {
          margin: 0 0 12px 0;
        }
        .row {
          display: grid;
          grid-template-columns: 1.6fr 1fr 1fr 1fr 1fr auto;
          gap: 10px;
          align-items: center;
        }
        .input {
          height: 38px;
          border: 1px solid #d8dbe6;
          border-radius: 10px;
          padding: 0 10px;
          background: #fff;
          outline: none;
        }
        .input:focus {
          border-color: #a7b0ff;
          box-shadow: 0 0 0 3px rgba(98, 110, 255, 0.12);
        }
        .btn {
          height: 38px;
          padding: 0 12px;
          border-radius: 10px;
          border: 1px solid #d8dbe6;
          background: #fff;
          cursor: pointer;
        }
        .btn:hover {
          background: #f6f7fb;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .primary {
          border-color: #1b7f3b;
          background: #1b7f3b;
          color: #fff;
        }
        .primary:hover {
          background: #176a31;
        }
        .alert {
          background: #ffecec;
          border: 1px solid #ffb8b8;
          color: #7a0b0b;
          padding: 10px 12px;
          border-radius: 12px;
          margin-bottom: 12px;
          white-space: pre-wrap;
        }
        .muted {
          color: #666;
          font-size: 14px;
          padding: 6px 0;
        }
        .headrow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }
        .list {
          display: grid;
          gap: 10px;
        }
        .item {
          border: 1px solid #e7e8ee;
          border-radius: 14px;
          padding: 12px;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
        }
        .title {
          font-weight: 650;
          margin-bottom: 6px;
        }
        .meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .pill {
          font-size: 12px;
          color: #333;
          background: #f1f2f7;
          padding: 4px 8px;
          border-radius: 999px;
        }

        @media (max-width: 980px) {
          .row {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>
    </div>
  );
}

/* =========================
   SECTION: LOGIN COMPONENT
   ========================= */
function Login({ supabase }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  const canLogin = useMemo(() => !!supabase && email.trim() && pw.trim(), [supabase, email, pw]);

  const login = async () => {
    setErr("");
    if (!supabase) return setErr("Supabase nicht initialisiert.");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) {
      console.error("login error:", error);
      setErr(error.message);
    }
  };

  return (
    <div className="wrap">
      <div className="center">
        <div className="card">
          <h2>Anmeldung</h2>

          {err && <div className="alert">{err}</div>}

          <input
            className="input"
            placeholder="E-Mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input"
            type="password"
            placeholder="Passwort"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />

          <button className="btn primary" onClick={login} disabled={!canLogin}>
            Login
          </button>
        </div>
      </div>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          background: #f6f7fb;
          display: grid;
          place-items: center;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        }
        .center {
          width: 100%;
          max-width: 420px;
          padding: 18px;
        }
        .card {
          background: #fff;
          border: 1px solid #e7e8ee;
          border-radius: 16px;
          padding: 16px;
          box-shadow: 0 10px 24px rgba(0,0,0,0.06);
          display: grid;
          gap: 10px;
        }
        .input {
          height: 40px;
          border: 1px solid #d8dbe6;
          border-radius: 10px;
          padding: 0 10px;
          outline: none;
        }
        .btn {
          height: 40px;
          padding: 0 12px;
          border-radius: 10px;
          border: 1px solid #d8dbe6;
          background: #fff;
          cursor: pointer;
        }
        .primary {
          border-color: #1b7f3b;
          background: #1b7f3b;
          color: #fff;
        }
        .alert {
          background: #ffecec;
          border: 1px solid #ffb8b8;
          color: #7a0b0b;
          padding: 10px 12px;
          border-radius: 12px;
          white-space: pre-wrap;
        }
      `}</style>
    </div>
  );
}
