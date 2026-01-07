// pages/dashboard.js
import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ---------------- Supabase Client ---------------- */
function getSupabaseClient() {
  if (typeof window === "undefined") return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn("Supabase ENV fehlt");
    return null;
  }

  if (!window.__supabase__) {
    window.__supabase__ = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }

  return window.__supabase__;
}

/* ---------------- Helpers ---------------- */
const toISO = (v) => (v ? new Date(v).toISOString() : null);

/* ---------------- Main ---------------- */
export default function DashboardPage() {
  const [supabase, setSupabase] = useState(null);
  const [session, setSession] = useState(null);
  const user = session?.user || null;

  const [tasks, setTasks] = useState([]);
  const [areas, setAreas] = useState([]);
  const [guides, setGuides] = useState([]);
  const [error, setError] = useState("");

  /* Create Task */
  const [newTitle, setNewTitle] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [newDueAt, setNewDueAt] = useState("");
  const [newStatus, setNewStatus] = useState("todo");
  const [newGuideId, setNewGuideId] = useState("");

  /* Init Supabase */
  useEffect(() => {
    setSupabase(getSupabaseClient());
  }, []);

  /* Auth */
  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
    });

    const { data } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s || null)
    );

    return () => data.subscription.unsubscribe();
  }, [supabase]);

  /* Load Data */
  useEffect(() => {
    if (!supabase || !user) return;
    loadTasks();
    loadAreas();
    loadGuides();
  }, [supabase, user]);

  const loadTasks = async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("id,title,status,due_at,areas(name)")
      .order("created_at", { ascending: false });

    if (error) return setError(error.message);
    setTasks(data || []);
  };

  const loadAreas = async () => {
    const { data } = await supabase.from("areas").select("*").order("name");
    setAreas(data || []);
  };

  const loadGuides = async () => {
    const { data } = await supabase.from("guides").select("*").order("title");
    setGuides(data || []);
  };

  /* ---------------- Create Task (FIXED) ---------------- */
  const createTask = async () => {
    setError("");
    if (!newTitle.trim()) return;

    const payload = {
      title: newTitle.trim(),
      area_id: newAreaId || null,
      due_at: toISO(newDueAt) || new Date().toISOString(),
      status: newStatus,              // ✅ todo | done
      user_id: user.id,               // ✅ RLS-konform
      guide_id: newGuideId || null,
    };

    const { error } = await supabase.from("tasks").insert([payload]);
    if (error) return setError(error.message);

    setNewTitle("");
    await loadTasks();
  };

  /* ---------------- Status Toggle (FIXED) ---------------- */
  const toggleStatus = async (id, current) => {
    const next = current === "done" ? "todo" : "done";
    const { error } = await supabase
      .from("tasks")
      .update({ status: next })
      .eq("id", id);

    if (error) return setError(error.message);
    await loadTasks();
  };

  /* ---------------- Login ---------------- */
  if (!user) {
    return <Login supabase={supabase} />;
  }

  /* ---------------- UI ---------------- */
  return (
    <div style={{ padding: 24 }}>
      <h2>Aufgabe anlegen</h2>

      {error && <div style={{ color: "red" }}>{error}</div>}

      <input
        placeholder="Titel"
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
      />

      <select value={newAreaId} onChange={(e) => setNewAreaId(e.target.value)}>
        <option value="">Bereich</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>

      <input
        type="datetime-local"
        value={newDueAt}
        onChange={(e) => setNewDueAt(e.target.value)}
      />

      <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
        <option value="todo">Zu erledigen</option>
        <option value="done">Erledigt</option>
      </select>

      <select value={newGuideId} onChange={(e) => setNewGuideId(e.target.value)}>
        <option value="">Anleitung</option>
        {guides.map((g) => (
          <option key={g.id} value={g.id}>{g.title}</option>
        ))}
      </select>

      <button onClick={createTask}>Anlegen</button>

      <hr />

      <h3>Aufgaben</h3>
      {tasks.map((t) => (
        <div key={t.id}>
          {t.title} – {t.status}
          <button onClick={() => toggleStatus(t.id, t.status)}>
            Status wechseln
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Login Component ---------------- */
function Login({ supabase }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  const login = async () => {
    await supabase.auth.signInWithPassword({ email, password: pw });
  };

  return (
    <div style={{ padding: 40 }}>
      <input placeholder="E-Mail" onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="Passwort" onChange={(e) => setPw(e.target.value)} />
      <button onClick={login}>Login</button>
    </div>
  );
}
