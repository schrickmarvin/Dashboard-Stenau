// pages/dashboard.js
// STENAU Dashboard – Kanboard mit frei wählbaren Mitarbeiter-Farben
// Farbanpassung direkt im Kanboard (Color Picker pro Mitarbeiter)

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { createClient } from "@supabase/supabase-js";

/* ================= SUPABASE ================= */

const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      )
    : null;

/* ================= HELPERS ================= */

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

/* ================= PAGE ================= */

export default function Dashboard() {
  const router = useRouter();

  const [sessionReady, setSessionReady] = useState(false);
  const [user, setUser] = useState(null);

  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [subtasks, setSubtasks] = useState([]);

  const [expanded, setExpanded] = useState({});
  const [memberColors, setMemberColors] = useState({});

  /* ================= AUTH ================= */

  useEffect(() => {
    async function loadSession() {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setUser(data.session.user);
      setSessionReady(true);
    }
    loadSession();
  }, [router]);

  /* ================= LOAD DATA ================= */

  useEffect(() => {
    if (!sessionReady || !supabase) return;

    async function load() {
      const { data: t } = await supabase.from("tasks").select("*");
      const { data: m } = await supabase.from("profiles").select("*");
      const { data: s } = await supabase.from("subtasks").select("*");

      setTasks(safeArray(t));
      setMembers(safeArray(m));
      setSubtasks(safeArray(s));

      // Default Farben setzen falls noch keine existieren
      const defaults = {};
      safeArray(m).forEach((mem, index) => {
        defaults[mem.id] =
          localStorage.getItem("color_" + mem.id) ||
          `hsl(${(index * 67) % 360}, 65%, 55%)`;
      });
      setMemberColors(defaults);
    }

    load();
  }, [sessionReady]);

  /* ================= COLOR HANDLING ================= */

  function changeColor(memberId, color) {
    setMemberColors((prev) => {
      const updated = { ...prev, [memberId]: color };
      localStorage.setItem("color_" + memberId, color);
      return updated;
    });
  }

  /* ================= TASK GROUPING ================= */

  const tasksByMember = useMemo(() => {
    const grouped = {};
    members.forEach((m) => (grouped[m.id] = []));
    tasks.forEach((t) => {
      if (grouped[t.assignee_id]) {
        grouped[t.assignee_id].push(t);
      }
    });
    return grouped;
  }, [tasks, members]);

  function toggleExpand(taskId) {
    setExpanded((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  }

  /* ================= RENDER ================= */

  if (!sessionReady) return null;

  return (
    <div style={{ padding: 30, background: "#f3f5f8", minHeight: "100vh" }}>
      <h1 style={{ marginBottom: 30 }}>Kanboard</h1>

      <div style={{ display: "flex", gap: 20, overflowX: "auto" }}>
        {members.map((member) => (
          <div
            key={member.id}
            style={{
              minWidth: 320,
              background: "#ffffff",
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
              borderTop: `6px solid ${memberColors[member.id]}`,
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <strong>{member.name || member.email}</strong>

              {/* Color Picker */}
              <input
                type="color"
                value={memberColors[member.id]}
                onChange={(e) =>
                  changeColor(member.id, e.target.value)
                }
                style={{ cursor: "pointer", border: "none" }}
              />
            </div>

            {/* Tasks */}
            {safeArray(tasksByMember[member.id]).map((task) => {
              const relatedSubs = subtasks.filter(
                (s) => s.task_id === task.id
              );

              return (
                <div
                  key={task.id}
                  style={{
                    background: "#f7f9fc",
                    padding: 12,
                    borderRadius: 10,
                    marginBottom: 10,
                    cursor: "pointer",
                  }}
                  onClick={() => toggleExpand(task.id)}
                >
                  <div style={{ fontWeight: 600 }}>
                    {task.title}
                  </div>

                  {expanded[task.id] && (
                    <div style={{ marginTop: 8 }}>
                      {relatedSubs.length === 0 && (
                        <div style={{ fontSize: 13, opacity: 0.6 }}>
                          Keine Unteraufgaben
                        </div>
                      )}

                      {relatedSubs.map((sub) => (
                        <div
                          key={sub.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 14,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={sub.is_done}
                            readOnly
                          />
                          <span
                            style={{
                              textDecoration: sub.is_done
                                ? "line-through"
                                : "none",
                            }}
                          >
                            {sub.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
