
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Dashboard() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data?.session) {
        router.replace("/login");
        return;
      }

      setSession(data.session);
      setLoading(false);
    };

    init();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
      } else {
        setSession(session);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [router]);

  if (loading) return null;

  return (
    <div style={{ padding: 40 }}>
      <h1>Stenau Dashboard</h1>
      <p>Angemeldet als: {session.user.email}</p>

      {/* Hier kommt dein kompletter Dashboard-Inhalt rein */}

    </div>
  );
}
