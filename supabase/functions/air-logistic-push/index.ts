import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "https://karimkago01-ship-it.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json"
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)), c => c.charCodeAt(0));
}

function validPublicKey(value: string) {
  try {
    const raw = decodeBase64Url(value);
    return raw.length === 65 && raw[0] === 4;
  } catch { return false; }
}

function validPrivateKey(value: string) {
  try { return decodeBase64Url(value).length === 32; }
  catch { return false; }
}

async function sendToSubscription(admin: ReturnType<typeof createClient>, sub: { id: string; endpoint: string; p256dh: string; auth_key: string }, payload: unknown) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 12 }
    );
    await admin.from("push_subscriptions").update({ last_seen_at: new Date().toISOString() }).eq("id", sub.id);
    return { sent: 1, failed: 0 };
  } catch (error) {
    const status = Number((error as { statusCode?: number })?.statusCode || 0);
    if (status === 404 || status === 410) {
      await admin.from("push_subscriptions").delete().eq("id", sub.id);
    }
    return { sent: 0, failed: 1 };
  }
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET" && req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return reply({ error: "Unauthorized" }, 401);
  const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return reply({ error: "Unauthorized" }, 401);

  const admin = createClient(url, serviceKey);
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("user_id,workspace_id,role,active").eq("user_id", userData.user.id).maybeSingle();
  if (profileError || !profile?.active) return reply({ error: "Forbidden" }, 403);

  // VAPID material lives encrypted in Supabase Vault. This RPC is executable only by service_role.
  const { data: vapidRows, error: vapidError } = await admin.rpc("air_get_vapid_config");
  const vapid = Array.isArray(vapidRows) ? vapidRows[0] : null;
  const publicKey = String(vapid?.public_key || "");
  const privateKey = String(vapid?.private_key || "");
  const subject = String(vapid?.subject || "");
  if (vapidError || !validPublicKey(publicKey) || !validPrivateKey(privateKey) || !subject) {
    console.error("Air Logistic VAPID Vault configuration unavailable:", vapidError?.message || "Invalid stored key material");
    return reply({ error: "VAPID secrets missing or invalid" }, 503);
  }

  if (req.method === "GET") return reply({ publicKey });
  const body = await req.json().catch(() => ({}));
  try { webpush.setVapidDetails(subject, publicKey, privateKey); }
  catch (error) {
    console.error("Air Logistic VAPID setup failed:", error);
    return reply({ error: "Invalid VAPID configuration" }, 503);
  }

  // Device-scoped smoke test: the authenticated user can send only to their exact
  // subscription endpoint in their own workspace. No inbox or shipment rows are created.
  if (body.test_self === true) {
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    if (!endpoint.startsWith("https://") || endpoint.length > 2048) {
      return reply({ error: "Invalid test endpoint" }, 400);
    }
    const { data: sub, error: subError } = await admin.from("push_subscriptions")
      .select("id,endpoint,p256dh,auth_key")
      .eq("workspace_id", profile.workspace_id)
      .eq("user_id", userData.user.id)
      .eq("endpoint", endpoint)
      .maybeSingle();
    if (subError) return reply({ error: "Could not load this device subscription" }, 500);
    if (!sub) return reply({ error: "This device is not registered" }, 404);
    const result = await sendToSubscription(admin, sub, {
      title: "اختبار إشعارات Air Logistic",
      body: "نجح اتصال الإشعارات بالخلفية على هذا الهاتف.",
      url: "./",
      tag: "air-logistic-device-test"
    });
    return reply({ test: true, ...result }, result.sent === 1 ? 200 : 502);
  }

  // Any active employee may announce a privacy-safe system event to active workspace devices.
  // No database schema or shipment records are changed by this broadcast.
  if (body.broadcast_event === true) {
    const actions = Array.isArray(body.actions)
      ? body.actions.filter((x: unknown): x is string => typeof x === "string")
          .map(x => x.replace(/\s+/g, " ").trim().slice(0, 90)).filter(Boolean).slice(0, 10)
      : [];
    const eventId = typeof body.event_id === "string" && /^[A-Za-z0-9._-]{1,80}$/.test(body.event_id)
      ? body.event_id : crypto.randomUUID();
    const title = "تحديث جديد في Air Logistic";
    const message = actions.length === 1
      ? actions[0]
      : actions.length > 1
        ? `تم تنفيذ ${actions.length} تحديثات: ${actions.slice(0, 3).join("، ")}`
        : "تم تحديث بيانات النظام.";

    const { data: activeProfiles, error: activeError } = await admin.from("profiles")
      .select("user_id").eq("workspace_id", profile.workspace_id).eq("active", true);
    if (activeError) return reply({ error: "Could not load active workspace accounts" }, 500);
    const activeIds = (activeProfiles || []).map(x => x.user_id);
    if (!activeIds.length) return reply({ broadcast: true, sent: 0, failed: 0, devices: 0, recipients: 0 });

    const { data: subscriptions, error: subscriptionsError } = await admin.from("push_subscriptions")
      .select("id,user_id,endpoint,p256dh,auth_key")
      .eq("workspace_id", profile.workspace_id).in("user_id", activeIds);
    if (subscriptionsError) return reply({ error: "Could not load device subscriptions" }, 500);

    let sent = 0, failed = 0;
    for (const sub of subscriptions || []) {
      const result = await sendToSubscription(admin, sub, {
        title, body: message, url: "./", tag: "air-logistic-event-" + eventId
      });
      sent += result.sent;
      failed += result.failed;
    }
    return reply({ broadcast: true, sent, failed, devices: subscriptions?.length || 0, recipients: activeIds.length });
  }

  // Preserve the inbox-announcement path. Managers/admins may send the rows they
  // created to their entire workspace; ordinary employees remain restricted to their own rows.
  const ids = Array.isArray(body.notification_ids)
    ? body.notification_ids.filter((x: unknown) => typeof x === "string").slice(0, 100)
    : [];
  if (!ids.length) return reply({ sent: 0, failed: 0, notifications: 0, message: "No notification IDs" });

  let rowsQuery = admin.from("notifications")
    .select("id,workspace_id,recipient_id,title,body,link")
    .eq("workspace_id", profile.workspace_id).in("id", ids);
  if (!["admin", "manager"].includes(profile.role)) rowsQuery = rowsQuery.eq("recipient_id", userData.user.id);

  const { data: rows, error: rowsError } = await rowsQuery;
  if (rowsError) return reply({ error: "Could not load notifications" }, 500);

  let sent = 0, failed = 0;
  for (const row of rows || []) {
    const { data: subscriptions, error: subError } = await admin.from("push_subscriptions")
      .select("id,endpoint,p256dh,auth_key")
      .eq("workspace_id", row.workspace_id).eq("user_id", row.recipient_id);
    if (subError) { failed++; continue; }
    for (const sub of subscriptions || []) {
      const result = await sendToSubscription(admin, sub, {
        title: row.title || "Air Logistic", body: row.body || "", url: row.link || "./", tag: "air-logistic-" + row.id
      });
      sent += result.sent;
      failed += result.failed;
    }
  }
  return reply({ sent, failed, notifications: rows?.length || 0 });
});