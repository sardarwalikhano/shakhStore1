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

async function findUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("user_directory_unavailable");
    const match = data.users.find((user) => (user.email ?? "").toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  throw new Error("user_directory_limit_reached");
}

async function provisionCaptain(
  request: Request,
  admin: ReturnType<typeof createClient>,
  actorId: string,
  email: string,
  fullName: string,
  reason: string,
) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return json(request, { error: "invalid_email" }, 400);
  }
  if (fullName.length < 2 || fullName.length > 120) {
    return json(request, { error: "invalid_full_name" }, 400);
  }
  if (reason.length < 2 || reason.length > 1200) {
    return json(request, { error: "invalid_reason" }, 400);
  }

  let target = null as Awaited<ReturnType<typeof findUserByEmail>>;
  let invited = false;
  try {
    target = await findUserByEmail(admin, email.toLowerCase());
    if (!target) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
      });
      if (error || !data.user) {
        console.error("Captain invitation failed:", error?.message ?? "missing_user");
        return json(request, { error: "captain_invitation_failed" }, 502);
      }
      target = data.user;
      invited = true;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "user_directory_unavailable";
    return json(request, { error: message }, 502);
  }

  if (!target || target.id === actorId) {
    return json(request, { error: "invalid_target_user" }, 400);
  }

  const previousMetadata = { ...(target.app_metadata ?? {}) };
  const oldRole = typeof previousMetadata.role === "string" ? previousMetadata.role : null;
  if (oldRole === "super_admin" || oldRole === "admin") {
    if (invited) await admin.auth.admin.deleteUser(target.id);
    return json(request, { error: "administrator_account_protected" }, 409);
  }

  if (oldRole !== "captain") {
    const { error: updateError } = await admin.auth.admin.updateUserById(target.id, {
      app_metadata: { ...previousMetadata, role: "captain" },
    });
    if (updateError) {
      if (invited) await admin.auth.admin.deleteUser(target.id);
      console.error("Captain role update failed:", updateError.message);
      return json(request, { error: "captain_role_update_failed" }, 500);
    }

    const auditRole = oldRole && VALID_ROLES.has(oldRole) ? oldRole : null;
    const { error: auditError } = await admin.from("role_assignment_events").insert({
      target_user_id: target.id,
      actor_user_id: actorId,
      previous_role: auditRole,
      new_role: "captain",
      reason,
    });

    if (auditError) {
      if (invited) {
        await admin.auth.admin.deleteUser(target.id);
      } else {
        const { error: rollbackError } = await admin.auth.admin.updateUserById(target.id, {
          app_metadata: previousMetadata,
        });
        if (rollbackError) {
          console.error("Captain role rollback failed; manual review required.");
          return json(request, { error: "captain_audit_failed_manual_review" }, 500);
        }
      }
      console.error("Captain role audit insert failed:", auditError.code);
      return json(request, { error: "captain_audit_failed_rolled_back" }, 500);
    }
  }

  return json(request, {
    ok: true,
    targetUserId: target.id,
    role: "captain",
    invited,
    alreadyCaptain: oldRole === "captain",
  });
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
    global: { headers: { Authorization: "Bearer " + token } },
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

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  if (body.action === "invite_captain") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    return provisionCaptain(request, admin, actor.id, email, fullName, reason);
  }

  const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : "";
  const newRole = typeof body.role === "string" ? body.role : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!validUuid(targetUserId)) return json(request, { error: "invalid_target_user" }, 400);
  if (targetUserId === actor.id) return json(request, { error: "self_role_change_not_allowed" }, 409);
  if (!VALID_ROLES.has(newRole)) return json(request, { error: "invalid_role" }, 400);
  if (reason.length < 2 || reason.length > 1200) return json(request, { error: "invalid_reason" }, 400);

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
