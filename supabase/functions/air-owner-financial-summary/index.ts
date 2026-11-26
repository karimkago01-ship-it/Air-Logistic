import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const AIR_URL = Deno.env.get("SUPABASE_URL") ?? "";
const AIR_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OWNER_URL = "https://pfvlspauxehshkrzidoc.supabase.co";
const OWNER_PUBLISHABLE_KEY = "sb_publishable_-WoB_agEAKTo3YmX9RfjOw_9cKN_fr7";
const OWNER_USER_ID = "0e7fe9b5-bc54-403b-9884-ad1facf5efe0";
const SETTING_KEY = "air_logistic_financial_integration";
const ALLOWED_ORIGINS = new Set([
  "https://abo-rizq-owner-console.pages.dev",
  "https://aborizqcreative-hash.github.io"
]);

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://abo-rizq-owner-console.pages.dev",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "no-store"
});
const reply = (data: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8" }
  });

const numberOf = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value ?? "").replace(/[,،\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const dateKey = (row: Record<string, unknown>) => {
  const d = row.date || row.at || row.created_at;
  if (!d) return "";
  const date = new Date(String(d));
  return Number.isNaN(date.getTime()) ? String(d).slice(0, 10) : date.toISOString().slice(0, 10);
};
const monthStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
};
function summarize(rows: Array<{ collection: string; data: Record<string, unknown>; created_at?: string }>, since?: string) {
  const inPeriod = (r: { data: Record<string, unknown>; created_at?: string }) => {
    if (!since) return true;
    const key = dateKey({ ...r.data, created_at: r.data.created_at || r.created_at });
    return key >= since && key <= new Date().toISOString().slice(0, 10);
  };
  const group = (name: string) => rows.filter(r => r.collection === name && inPeriod(r)).map(r => r.data || {});
  const shipments = group("shipments");
  const expenses = group("expenses");
  const remits = group("remits");
  const ledger = group("ledger");
  const settlements = group("settlements");
  const shippingFees = shipments.reduce((n, s) => n + numberOf(s.fee), 0);
  const codExpected = shipments.reduce((n, s) => n + numberOf(s.cod), 0);
  const codCollected = shipments.reduce((n, s) => n + numberOf(s.collected), 0);
  const expensesTotal = expenses.reduce((n, e) => n + numberOf(e.amount), 0);
  const remitted = remits.reduce((n, r) => n + numberOf(r.amount), 0);
  const returnFees = shipments.reduce((n, s) => n + numberOf(s.returnFee), 0);
  const delivered = shipments.filter(s => /تم التسليم|تم الاستلام بالكامل|تم التسليم بالكامل/.test(String(s.status || ""))).length;
  return {
    shipments: shipments.length,
    delivered,
    shippingFees,
    codExpected,
    codCollected,
    codOutstanding: Math.max(0, codExpected - codCollected),
    expensesTotal,
    expenseRecords: expenses.length,
    remitted,
    remitRecords: remits.length,
    returnFees,
    ledgerRecords: ledger.length,
    settlementRecords: settlements.length,
    operatingSurplusBeforeUnrecordedCosts: shippingFees - expensesTotal
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return reply({ error: "Origin not allowed" }, 403, origin);
  if (!AIR_URL || !AIR_SERVICE_KEY) return reply({ error: "Air service unavailable" }, 500, origin);

  const authorization = req.headers.get("authorization") || "";
  const ownerJwt = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!ownerJwt) return reply({ error: "Owner authentication required" }, 401, origin);

  const ownerClient = createClient(OWNER_URL, OWNER_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userData, error: userError } = await ownerClient.auth.getUser(ownerJwt);
  const user = userData?.user;
  if (userError || !user || user.id !== OWNER_USER_ID) return reply({ error: "Owner identity rejected" }, 403, origin);
  const { data: assurance, error: assuranceError } = await ownerClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || assurance?.currentLevel !== "aal2") return reply({ error: "Owner MFA required" }, 403, origin);
  const { data: ownerSnapshot, error: snapshotError } = await ownerClient.rpc("ar_owner_console_snapshot");
  if (snapshotError ||
      ownerSnapshot?.owner?.authenticated !== true ||
      ownerSnapshot?.owner?.identity_verified !== true ||
      ownerSnapshot?.owner?.user_id !== OWNER_USER_ID) {
    return reply({ error: "Owner authorization failed" }, 403, origin);
  }

  const { data: consent, error: consentError } = await ownerClient
    .from("ar_control_settings")
    .select("setting_value")
    .eq("setting_key", SETTING_KEY)
    .maybeSingle();
  if (consentError || consent?.setting_value?.enabled !== true) {
    return reply({ error: "Owner has not enabled this integration" }, 403, origin);
  }

  const admin = createClient(AIR_URL, AIR_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: airOwner, error: profileError } = await admin
    .from("profiles")
    .select("workspace_id,role,active")
    .eq("user_id", OWNER_USER_ID)
    .maybeSingle();
  if (profileError || !airOwner || airOwner.role !== "admin" || airOwner.active !== true) {
    return reply({ error: "Air Logistic owner account is not active" }, 403, origin);
  }
  const { data: records, error: recordsError } = await admin
    .from("app_records")
    .select("collection,data,created_at")
    .eq("workspace_id", airOwner.workspace_id)
    .in("collection", ["shipments", "expenses", "remits", "ledger", "settlements"])
    .limit(20000);
  if (recordsError) return reply({ error: "Could not read financial summary" }, 502, origin);

  const rows = (records || []).map((r: any) => ({
    collection: String(r.collection || ""),
    data: r.data && typeof r.data === "object" && !Array.isArray(r.data) ? r.data : {},
    created_at: r.created_at
  }));
  return reply({
    ok: true,
    source: "Air Logistic",
    currency: "EGP",
    generatedAt: new Date().toISOString(),
    lifetime: summarize(rows),
    currentMonth: summarize(rows, monthStart()),
    coverage: {
      shipmentRecords: rows.filter(r => r.collection === "shipments").length,
      expenseRecords: rows.filter(r => r.collection === "expenses").length,
      ledgerRecords: rows.filter(r => r.collection === "ledger").length,
      remitRecords: rows.filter(r => r.collection === "remits").length,
      settlementRecords: rows.filter(r => r.collection === "settlements").length
    },
    notes: {
      cod: "COD is the merchandise amount and is not counted as shipping revenue.",
      surplus: "Shipping fees minus recorded expenses only; it excludes any unrecorded costs or liabilities."
    }
  }, 200, origin);
});
