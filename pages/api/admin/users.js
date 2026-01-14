// pages/api/admin/users.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(res, status, body) {
  res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL" });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return json(res, 401, { error: "Missing bearer token" });

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) return json(res, 401, { error: "Invalid token" });

  const requesterId = userData.user.id;

  const { data: prof, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", requesterId)
    .maybeSingle();

  const isAdmin = !profErr && prof?.role === "admin";
  if (!isAdmin) return json(res, 403, { error: "Not authorized", isAdmin: false });

  const { action, ...payload } = req.body || {};

  try {
    if (action === "list") {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("id,email,name,role,created_at,updated_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return json(res, 200, { isAdmin: true, users: data || [] });
    }

    if (action === "create") {
      const email = String(payload.email || "").trim().toLowerCase();
      const name = String(payload.name || "").trim();
      const role = payload.role === "admin" ? "admin" : "user";
      let tempPassword = String(payload.tempPassword || "").trim();

      if (!email) return json(res, 400, { error: "Email missing" });
      if (!tempPassword) {
        tempPassword = (Math.random().toString(36).slice(2) + "A!" + Math.random().toString(36).slice(2)).slice(0, 14);
      }

      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });
      if (cErr) throw cErr;

      const { error: upErr } = await supabaseAdmin.from("profiles").upsert({
        id: created.user.id,
        email,
        name: name || null,
        role,
      });
      if (upErr) throw upErr;

      return json(res, 200, { ok: true, id: created.user.id, tempPassword });
    }

    if (action === "update") {
      const id = String(payload.id || "").trim();
      const name = String(payload.name || "").trim();
      const role = payload.role === "admin" ? "admin" : "user";
      if (!id) return json(res, 400, { error: "id missing" });

      const { error } = await supabaseAdmin.from("profiles").update({ name: name || null, role }).eq("id", id);
      if (error) throw error;

      return json(res, 200, { ok: true });
    }

    if (action === "setPassword") {
      const id = String(payload.id || "").trim();
      const password = String(payload.password || "").trim();
      if (!id || !password) return json(res, 400, { error: "id/password missing" });

      const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password });
      if (error) throw error;

      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: "Unknown action" });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
}
