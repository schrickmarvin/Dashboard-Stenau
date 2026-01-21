
// pages/dashboard.js
// FIXED VERSION – removes Python syntax and build errors
// Next.js pages router, SSR forced

import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ---------------- Supabase ---------------- */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------------- SSR Guard ---------------- */
export async function getServerSideProps() {
  return { props: {} };
}

/* ---------------- Helpers ---------------- */
function fmtDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("de-DE");
}

/* ---------------- Main ---------------- */
export default function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [err, setErr] = useState(null);

  async function loadTasks() {
    setErr(null);
    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, status, due_at, area, is_series, series_parent_id")
      .order("created_at", { ascending: false });

    if (error) {
      setErr(error.message);
      return;
    }
    setTasks(data || []);
  }

  useEffect(() => {
    loadTasks();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Dashboard</h1>
      {err && <div style={{ color: "red" }}>{err}</div>}

      {tasks.map((t) => (
        <div
          key={t.id}
          style={{
            border: "1px solid #ccc",
            padding: 10,
            marginBottom: 10,
          }}
        >
          <b>{t.title}</b>
          <div>Status: {t.status}</div>
          <div>Bereich: {t.area || "-"}</div>
          <div>Fällig: {fmtDateTime(t.due_at)}</div>
          {t.is_series && <div>🔁 Serien-Master</div>}
          {t.series_parent_id && <div>🔁 Serien-Instanz</div>}
        </div>
      ))}
    </div>
  );
}
