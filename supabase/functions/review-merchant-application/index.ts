import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

type Decision = "start_review" | "approve" | "reject" | "suspend_store" | "reactivate_store";
type MerchantCategory = "restaurant" | "supermarket" | "fruits_vegetables" | "meat_seafood";

const ROLE_BY_CATEGORY: Record<MerchantCategory, string> = {
  restaurant: "restaurant",
  supermarket: "supermarket",
  fruits_vegetables: "produce_vendor",
  meat_seafood: "meat_seafood_vendor",
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "method_not_allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = Deno.env.get("SUPABASE_URL");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!bearer || !url || !publicKey || !serviceRoleKey) {
    return respond({ error: "service_configuration_error" }, 503);
  }

  const userClient = createClient(url, publicKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: userResult, error: authError } = await userClient.auth.getUser();
  const user = userResult.user;

  if (authError || !user) return respond({ error: "authentication_required" }, 401);
  const actorRole = user.app_metadata?.role;
  if (actorRole !== "admin" && actorRole !== "super_admin") {
    return respond({ error: "administrator_required" }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond({ error: "invalid_json" }, 400);
  }
  if (!isRecord(body)) return respond({ error: "invalid_request" }, 400);

  const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
  const storeId = typeof body.storeId === "string" ? body.storeId : "";
  const decision = body.decision as Decision;
  const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote.trim() : "";

  if (!["start_review", "approve", "reject", "suspend_store", "reactivate_store"].includes(decision)) {
    return respond({ error: "invalid_decision" }, 400);
  }
  if (reviewNote.length > 1200) return respond({ error: "invalid_review_note" }, 400);

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  if (decision === "suspend_store" || decision === "reactivate_store") {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storeId)) {
      return respond({ error: "invalid_store_id" }, 400);
    }
    if (reviewNote.length < 2) return respond({ error: "moderation_note_required" }, 400);
    const newStatus = decision === "suspend_store" ? "suspended" : "active";
    const { data: moderation, error: moderationError } = await admin.rpc("moderate_merchant_store", {
      p_store_id: storeId,
      p_actor_id: user.id,
      p_new_status: newStatus,
      p_note: reviewNote,
    });
    if (moderationError || !moderation?.[0]) {
      console.error("Merchant store moderation failed:", moderationError?.code ?? "empty_result");
      return respond({ error: "store_moderation_failed" }, 409);
    }
    return respond({
      ok: true,
      storeId,
      previousStatus: moderation[0].previous_status,
      status: moderation[0].new_status,
    });
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) {
    return respond({ error: "invalid_application_id" }, 400);
  }
  if (decision === "reject" && reviewNote.length < 2) {
    return respond({ error: "invalid_review_note" }, 400);
  }
  if (decision === "start_review") {
    const { data, error } = await admin
      .from("merchant_applications")
      .update({ status: "under_review", reviewed_by: user.id, review_note: reviewNote || null })
      .eq("id", applicationId)
      .eq("status", "submitted")
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("Merchant review transition failed:", error.code);
      return respond({ error: "review_transition_failed" }, 500);
    }
    if (!data) return respond({ error: "application_not_submitted" }, 409);
    return respond({ ok: true, status: "under_review" });
  }

  const { data: application, error: applicationError } = await admin
    .from("merchant_applications")
    .select("id,applicant_id,merchant_category,status")
    .eq("id", applicationId)
    .maybeSingle();

  if (applicationError || !application) return respond({ error: "application_not_found" }, 404);
  if (application.status !== "submitted" && application.status !== "under_review") {
    return respond({ error: "application_not_reviewable" }, 409);
  }

  if (decision === "reject") {
    const { data, error } = await admin
      .from("merchant_applications")
      .update({
        status: "rejected",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote,
      })
      .eq("id", applicationId)
      .in("status", ["submitted", "under_review"])
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("Merchant rejection failed:", error.code);
      return respond({ error: "rejection_failed" }, 500);
    }
    if (!data) return respond({ error: "application_already_reviewed" }, 409);
    return respond({ ok: true, status: "rejected" });
  }

  const category = application.merchant_category as MerchantCategory;
  const assignedRole = ROLE_BY_CATEGORY[category];
  if (!assignedRole) return respond({ error: "unsupported_merchant_category" }, 400);

  const { data: applicantResult, error: applicantError } = await admin.auth.admin.getUserById(application.applicant_id);
  const applicant = applicantResult.user;
  if (applicantError || !applicant) return respond({ error: "applicant_not_found" }, 404);

  const previousMetadata = { ...(applicant.app_metadata ?? {}) };
  const previousRole = previousMetadata.role;
  if (previousRole !== "customer" && previousRole !== assignedRole) {
    return respond({ error: "applicant_role_conflict" }, 409);
  }

  let roleChanged = false;
  if (previousRole !== assignedRole) {
    const { error: roleError } = await admin.auth.admin.updateUserById(applicant.id, {
      app_metadata: { ...previousMetadata, role: assignedRole },
    });
    if (roleError) {
      console.error("Merchant role assignment failed:", roleError.message);
      return respond({ error: "role_assignment_failed" }, 500);
    }
    roleChanged = true;
  }

  const { data: approved, error: approvalError } = await admin.rpc("approve_merchant_application", {
    p_application_id: applicationId,
    p_reviewer_id: user.id,
    p_review_note: reviewNote || null,
  });

  if (approvalError || !approved?.[0]) {
    if (roleChanged) {
      const { error: rollbackError } = await admin.auth.admin.updateUserById(applicant.id, {
        app_metadata: previousMetadata,
      });
      if (rollbackError) console.error("Merchant role rollback requires manual review:", rollbackError.message);
    }
    console.error("Merchant application approval failed:", approvalError?.code ?? "empty_result");
    return respond({ error: "approval_failed" }, 409);
  }

  return respond({
    ok: true,
    status: "approved",
    storeId: approved[0].store_id,
    assignedRole,
  });
});
