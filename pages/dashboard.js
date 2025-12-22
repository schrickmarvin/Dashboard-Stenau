import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const TABS = [
  { id: "board", label: "Board" },
  { id: "list", label: "Liste" },
  { id: "calendar", label: "Kalender" },
  { id: "timeline", label: "Timeline" },
  { id: "guides", label: "Anleitungen" }
];

export default function Dashboard() {
  /* -------------------- STATE -------------------- */
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [tasks, setTasks] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState("");

  const [activeTab, setActiveTab] = useState("board");

  /* -------------------- COUNTS -------------------- */
  const counts = useMemo(() => {
    return {
      today: tasks.filter((t) => t.due === "Heute" && t.status !== "done").length,
      week: tasks.filter((t) => t.due === "Diese Woche" && t.status !== "done").length,
      open: tasks.filter((t) => t.status !== "done").length
    };
  }, [tasks]);

  /* -------------------- AUTH -------------------- */
  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      setLoadingAuth(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        setUser(session?.user ?? null);
      }
    );

    return () => {
      mounted = false;
      try {
        authListener?.subscription?.unsubscribe?.();
      } catch {}
    };
  }, []);

  /* -------------------- DATEN LADEN -------------------- */
  async function reloadTasks() {
    if (!user) return;

    setLoadingData(true);
    setDataError("");

    // Versuch mit Join
    const { data, error } = await supabase
      .from("tasks")
      .select(
        "id,title,status,due_bucket,subtasks_done,subtasks_total,created_at,areas(name)"
      )
      .order("created_at", { ascending: false });

    if (error) {
      // Fallback ohne Join
      const fb = await supabase
        .from("tasks")
        .select(
          "id,title,status,due_bucket,subtasks_done,subtasks_total,created_at"
        )
        .order("created_at", { ascending: false });

      if (fb.error) {
        setDataError(fb.error.message);
        setTasks([]);
      } else {
        setTasks(
          (fb.data || []).map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            due: t.due_bucket,
            area: "—",
            subtasksDone: t.subtasks_done ?? 0,
            subtasksTotal: t.subtasks_total ?? 0
          }))
        );
        setDataError(
          "Hinweis: Bereiche konnten nicht geladen werden (Join fehlt oder FK/RLS)."
        );
      }
    } else {
      setTasks(
        (data || []).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          due: t.due_bu_
