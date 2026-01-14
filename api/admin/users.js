// pages/api/admin/users.js
import { createClient } from "@supabase/supabase-js";

/**
 * REQUIREMENTS (Vercel / .env):
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY  (server-side only!)
 *
 * Supported actions (POST JSON):
 * { action: "list", payload: {} }
 * { action: "createUser", payload: { email, password, role, name } }
 * { action: "setPassword", payload: { userId, password } }
 * { action: "setRole", payload: { userId, role } }
 *
 * NOTE:
 * This route uses the Service Role key and should never be exposed client-side.
 * We additionally verify the caller is an admin by reading public.profiles.role.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getBearerToken(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || "";
  if (!h) return null;
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Methode nicht erlaubt" });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      error: "Server ENV fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY",
    });
  }

  try {
    const token = await getBearerToken(req);
    if (!token) return res.status(401).json({ error: "Nicht angemeldet" });

    // verify caller
    const { data: caller, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr) return res.status(401).json({ error: "Ungültige Session" });

    const callerId = caller?.user?.id;
    if (!callerId) return res.status(401).json({ error: "Ungültige Session" });

    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .maybeSingle();

    if (profErr) return res.status(403).json({ error: "Profilprüfung fehlgeschlagen" });
    if ((prof?.role || "user") !== "admin") return res.status(403).json({ error: "Keine Admin-Rechte" });

    const { action, payload } = req.body || {};

    // LIST
    if (action === "list") {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("id,email,name,role,created_at,updated_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return res.status(200).json({ users: data || [], isAdmin: true });
    }

    // CREATE USER
    if (action === "createUser") {
      const email = String(payload?.email || "").trim();
      const password = String(payload?.password || "").trim();
      const role = String(payload?.role || "user").trim();
      const name = payload?.name ? String(payload.name).trim() : null;

      if (!email) return res.status(400).json({ error: "E-Mail fehlt" });
      if (!password || password.length < 8)
        return res.status(400).json({ error: "Passwort fehlt/zu kurz (min. 8 Zeichen)" });

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw error;

      const userId = data?.user?.id;
      if (!userId) return res.status(500).json({ error: "User-ID fehlt nach createUser" });

      const { error: pErr } = await supabaseAdmin.from("profiles").upsert(
        {
          id: userId,
          email,
          name,
          role: role === "admin" ? "admin" : "user",
        },
        { onConflict: "id" }
      );
      if (pErr) throw pErr;

      return res.status(200).json({ success: true, userId });
    }

    // SET PASSWORD
    if (action === "setPassword") {
      const userId = String(payload?.userId || "").trim();
      const password = String(payload?.password || "").trim();
      if (!userId) return res.status(400).json({ error: "userId fehlt" });
      if (!password || password.length < 8)
        return res.status(400).json({ error: "Passwort fehlt/zu kurz (min. 8 Zeichen)" });

      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
      if (error) throw error;

      return res.status(200).json({ success: true });
    }

    // SET ROLE
    if (action === "setRole") {
      const userId = String(payload?.userId || "").trim();
      const role = String(payload?.role || "user").trim();
      if (!userId) return res.status(400).json({ error: "userId fehlt" });

      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ role: role === "admin" ? "admin" : "user", updated_at: new Date().toISOString() })
        .eq("id", userId);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: "Unbekannte Aktion" });
  } catch (err) {
    return res.status(500).json({ error: err?.message || String(err) });
  }
}
