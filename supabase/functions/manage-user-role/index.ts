import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const VALID_ROLES = new Set([
  "super_admin",
  "admin",
  "restaurant",
  "supermarket",
  "produce_vendor",
  "meat_seafood_vendor",
  "captain",
  "customer",
]);

function json(request: Request, body: Record<string, unknown>, status = 200) {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = new Set([
    "https://www.daim-post.online",
    "https://daim-post.online",
    "http://localhost:3000",
    ...(Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((x) => x.trim()).filter(Boolean),
  ]);
  const headers = new Headers({
    ...corsHeaders,
    "Content-Type": "application/json; charset=utf-8",
  });
  if (allowed.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(JSON.stringify(body), { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return json(request, { ok: true });
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);

  const origin = request.headers.get("Origin") ?? "";
  const allowed = new Set([
    "https://www.daim-post.online",
    "https://daim-post.online",
    "http://localhost:3000",
    ...(Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((x) => x.trim()).filter(Boolean),
  ]);
  if (origin && !allowed.has(origin)) return json(request, { error: "origin_not_allowed" }, 403);

  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !url || !anonKey || !serviceRoleKey) {
    return json(request, { error: "service_configuration_error" }, 503);
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: actorResult, error: actorError } = await userClient.auth.getUser(token);
  const actor = actorResult.user;
  if (actorError || !actor) return json(request, { error: "authentication_required" }, 401);
  if (actor.app_metadata?.role !== "super_admin") {
    return json(request, { error: "super_admin_required" }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "invalid_json" }, 400);
  }
  if (!isRecord(body)) return json(request, { error: "invalid_request" }, 400);

  const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : "";
  const newRole = typeof body.role === "string" ? body.role : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!validUuid(targetUserId)) return json(request, { error: "invalid_target_user" }, 400);
  if (targetUserId === actor.id) return json(request, { error: "self_role_change_not_allowed" }, 409);
  if (!VALID_ROLES.has(newRole)) return json(request, { error: "invalid_role" }, 400);
  if (reason.length < 2 || reason.length > 1200) return json(request, { error: "invalid_reason" }, 400);

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data: targetResult, error: targetError } = await admin.auth.admin.getUserById(targetUserId);
  const target = targetResult.user;
  if (targetError || !target) return json(request, { error: "target_user_not_found" }, 404);

  const previousMetadata = { ...(target.app_metadata ?? {}) };
  const oldRole = typeof previousMetadata.role === "string" ? previousMetadata.role : null;
  if (oldRole === newRole) return json(request, { error: "role_already_assigned" }, 409);

  const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, {
    app_metadata: { ...previousMetadata, role: newRole },
  });
  if (updateError) {
    console.error("Trusted role update failed:", updateError.message);
    return json(request, { error: "role_update_failed" }, 500);
  }

  const oldAuditRole = oldRole && VALID_ROLES.has(oldRole) ? oldRole : null;
  const { error: auditError } = await admin.from("role_assignment_events").insert({
    target_user_id: targetUserId,
    actor_user_id: actor.id,
    previous_role: oldAuditRole,
    new_role: newRole,
    reason,
  });

  if (auditError) {
    const { error: rollbackError } = await admin.auth.admin.updateUserById(targetUserId, {
      app_metadata: previousMetadata,
    });
    if (rollbackError) console.error("Role audit rollback failed; manual review required.");
    console.error("Role audit insert failed:", auditError.code);
    return json(request, { error: rollbackError ? "role_audit_failed_manual_review" : "role_audit_failed_rolled_back" }, 500);
  }

  return json(request, {
    ok: true,
    targetUserId,
    previousRole: oldRole,
    role: newRole,
    auditRecorded: true,
  });
});
