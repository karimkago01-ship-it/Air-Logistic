import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const auth = read('../auth.js');
const dispatch = read('../dispatch.js');
const html = read('../index.html');
const sw = read('../sw.js');
const diagnostics = read('../diagnostics.js');
const diagnosticsMigration = read('../supabase/migrations/20261110113000_owner_only_app_diagnostics.sql');
const auditMigration = read('../supabase/migrations/20261109051126_central_append_only_air_logistic_activity_audit.sql');

new vm.Script(auth, { filename: 'auth.js' });
new vm.Script(dispatch, { filename: 'dispatch.js' });
new vm.Script(sw, { filename: 'sw.js' });
new vm.Script(diagnostics, { filename: 'diagnostics.js' });

const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((source) => source.trim());

assert.ok(inlineScripts.length > 0, 'index.html must contain application scripts');
inlineScripts.forEach((source, index) => {
  new vm.Script(source, { filename: 'index.html:inline-script-' + (index + 1) });
});

assert.ok(diagnostics.includes('air_diagnostics') === false, 'diagnostics must use the dedicated private table');
assert.match(diagnostics, /const\s+OWNER_ID\s*=\s*'0e7fe9b5-bc54-403b-9884-ad1facf5efe0'\s*;/, 'diagnostics capture must be restricted to the owner account');
assert.ok(diagnostics.includes("from('app_diagnostics')"), 'runtime diagnostics must be stored in the private diagnostics table');
assert.ok(diagnosticsMigration.includes('enable row level security'), 'diagnostics table must enforce RLS');
assert.ok(diagnosticsMigration.includes('app_diagnostics_owner_read') && diagnosticsMigration.includes('app_diagnostics_owner_insert'), 'diagnostics access must be owner-only');
assert.ok(diagnosticsMigration.includes('revoke all on public.app_diagnostics from anon, authenticated'), 'diagnostics table must not expose anonymous or broad client permissions');
assert.ok(auth.includes('let activeAuthUser = null;'), 'auth state must be declared inside the strict-mode auth scope');
assert.ok(auth.includes('air_logistic_recovery_v1'), 'local recovery archive must remain enabled');
assert.ok(!auth.includes("removeItem('air_logistic_full_v1')"), 'local recovery snapshot must never be silently removed');
assert.ok(auth.includes('resolveAirCourierUserId'), 'authenticated courier resolver must exist');
assert.ok(auth.includes("const courierPages = new Set(['home','portalDispatch','portalMore','courierPortal','chat','notifications'])"), 'courier accounts must be restricted to their dedicated pages within the five-portal navigation');
assert.equal((html.match(/class="air-main-portal/g)||[]).length,5,'main navigation must contain exactly five top-level portals');
for (const page of ['home','portalShipments','portalDispatch','portalFinance','portalMore']) assert.ok(html.includes('id="'+page+'"'), 'required five-portal destination must exist: '+page);
assert.ok(html.includes("{page:'portalMore',icon:'☰',label:'المزيد'}"), 'mobile navigation must expose the fifth More destination');
assert.ok(html.includes('data-subpage="scanner"'), 'scanner tools must remain accessible within the consolidated portals');
assert.ok(html.includes('data-subpage="customers"') && html.includes('data-subpage="notifications"'), 'directory and service tools must remain accessible within More');
assert.ok(auth.includes("#airMobileBottomNav button[data-mobile-page]"), 'courier restrictions must also cover mobile navigation');
assert.ok(dispatch.includes('airDispatchPanel'), 'courier bulk dispatch portal must exist inside the Transfers section');
assert.ok(dispatch.includes('window.resolveAirCourierUserId(target)'), 'dispatch must resolve the authenticated courier account before assignment');
assert.ok(dispatch.includes('dispatchBatchId=batchId'), 'bulk dispatch must persist a batch reference on each issued shipment');
assert.ok(dispatch.includes('type:\'صرف شحنة للمندوب\''), 'bulk dispatch must create an auditable transfer ledger row');
assert.ok(dispatch.includes('refusalPaymentStatus'), 'refusal workflow must persist payment status');
assert.ok(dispatch.includes('refusalPaidAmount'), 'refusal workflow must persist the amount paid');
assert.ok(dispatch.includes('function') && dispatch.includes('ملاحظة التأجيل / الرفض'), 'home page must show an explicit postponement/refusal note');
assert.ok(dispatch.includes('courier_user_id||\'\')===String(profile.user_id)'), 'courier manifest must scope shipments to the signed-in courier ID');
assert.ok(dispatch.includes('const x=old?{...old,...values}:values'), 'shipment edit must preserve assignment and outcome metadata');
assert.ok(dispatch.includes('window.renderTransfers=function()'), 'Transfers page must show dispatch rows in its activity ledger');
assert.ok(dispatch.includes("document.getElementById('dispatchCourier')?.addEventListener('change'"), 'dispatch courier picker must refresh its metrics on selection');
assert.ok(dispatch.includes("status.includes('لم يتم الرد')"), 'no-answer workflow states must display their recorded reason');
assert.ok(auth.includes("String(item.courier_user_id || '')"), 'courier cloud sync must be scoped by authenticated user ID');
assert.ok(auth.includes(".update({data:row.data,updated_by:profile.user_id})"), 'courier sync must update assigned rows without attempting an unauthorized insert');
assert.ok(auth.includes(".eq('collection','shipments')"), 'courier sync updates must be restricted to shipment records');
assert.ok(auth.includes("result.data.length !== 1"), 'courier sync must detect when RLS prevents the assigned shipment update');
assert.ok(auth.includes('const hasUnread = unread > 0;'), 'notification inbox must restore unread state from the server when the app opens');
assert.ok(auth.includes("navButton.insertAdjacentHTML('beforeend','<span class=\"air-unread-dot\">جديد</span>')"), 'unread notifications must display the navigation badge without requiring a push event');
assert.ok(auth.includes('else if (!hasUnread) dot?.remove();'), 'the unread navigation badge must clear after all notifications are read');

assert.ok(html.includes("shipForm').onsubmit=async"), 'shipment save must resolve courier account before saving');
assert.ok(html.includes('async function commitImport()'), 'bulk import must resolve courier accounts before saving');
assert.ok(html.includes("transferForm').onsubmit=async"), 'shipment transfer must resolve courier account before saving');
assert.ok(html.includes('s.courier_user_id=courierUserId'), 'shipment transfer must persist courier user ID');
assert.ok(auth.includes('window.renderAirActivityLog'), 'central activity log viewer must exist');
assert.ok(auth.includes("activityNav.style.display = ['admin','manager'].includes(profile.role)"), 'activity log navigation must be restricted to managers');
assert.ok(html.includes('id="activityLog"'), 'central activity log page must be visible in the application');
assert.ok(auditMigration.includes('create trigger air_logistic_record_audit'), 'database audit trigger migration must exist');
assert.ok(auditMigration.includes('revoke insert, update, delete on public.activity_log'), 'client accounts must not edit or forge central audit rows');

assert.ok(html.includes('startWaybillCamera'), 'live camera capture for waybill OCR must exist');
assert.ok(html.includes('captureWaybillFromCamera'), 'captured camera frames must be sent to OCR');
assert.ok(html.includes('readWaybillImage(blob)'), 'camera images must use the shared Arabic/English OCR pipeline');
assert.ok(html.includes('tessdata_fast'), 'waybill OCR must use compact fast language models');
assert.ok(html.includes('waybillOCRWorkerPromise'), 'waybill OCR worker must be reused across scans');
assert.ok(html.includes("cacheMethod:'write'"), 'OCR language data must be cached for subsequent scans');
assert.ok(html.includes('toggleCameraTorch'), 'camera flashlight toggle must be available');
assert.ok(html.includes('ocrTorchButton'), 'waybill camera must expose a flashlight control');
assert.ok(html.includes('scannerTorchButton'), 'barcode scanner camera must expose a flashlight control');
assert.ok(html.includes('getCapabilities'), 'flashlight control must detect device torch support');
assert.ok(html.includes("tessedit_pageseg_mode:'6'"), 'OCR must use a block-oriented page mode for faster waybill recognition');
assert.ok(html.includes('maxSide=2000,scale=Math.min(1'), 'OCR image preparation must avoid unnecessary upscaling');
assert.ok(html.includes("'image/jpeg',0.9"), 'OCR image preparation must use compressed JPEG to reduce processing time');

assert.ok(html.includes('capture="environment"'), 'waybill image input must request the rear camera on mobile');
assert.ok(html.includes('air-logo-transition-styles'), 'segmented brand logo transition styles must exist');
assert.ok(html.includes('air-logo-page-transition'), 'page navigation must show the segmented brand logo loader');
assert.ok(html.includes("#nav button[data-page],#airMobileBottomNav button[data-mobile-page]"), 'loader must cover desktop and mobile page navigation');
assert.ok(/serviceWorker|service-worker/i.test(html), 'PWA service worker registration must remain present');
assert.ok(/CACHE_NAME|cacheName/i.test(sw), 'service worker must define a cache version');
assert.ok(sw.includes('"./dispatch.js"'), 'service worker app shell must cache the dispatch module');
assert.match(sw, /const\s+CACHE_NAME\s*=\s*["']air-logistic-pwa-v\d+["']/, 'PWA cache name must be versioned so installed clients refresh the app shell');

console.log('Air Logistic validation passed.');
console.log('Validated auth.js, sw.js, and ' + inlineScripts.length + ' inline application scripts.');
