import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const auth = read('../auth.js');
const html = read('../index.html');
const sw = read('../sw.js');
const auditMigration = read('../supabase/migrations/20261109051126_central_append_only_air_logistic_activity_audit.sql');

new vm.Script(auth, { filename: 'auth.js' });
new vm.Script(sw, { filename: 'sw.js' });

const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((source) => source.trim());

assert.ok(inlineScripts.length > 0, 'index.html must contain application scripts');
inlineScripts.forEach((source, index) => {
  new vm.Script(source, { filename: 'index.html:inline-script-' + (index + 1) });
});

assert.ok(auth.includes('air_logistic_recovery_v1'), 'local recovery archive must remain enabled');
assert.ok(!auth.includes("removeItem('air_logistic_full_v1')"), 'local recovery snapshot must never be silently removed');
assert.ok(auth.includes('resolveAirCourierUserId'), 'authenticated courier resolver must exist');
assert.ok(auth.includes("String(item.courier_user_id || '')"), 'courier cloud sync must be scoped by authenticated user ID');
assert.ok(auth.includes(".update({data:row.data,updated_by:profile.user_id})"), 'courier sync must update assigned rows without attempting an unauthorized insert');
assert.ok(auth.includes(".eq('collection','shipments')"), 'courier sync updates must be restricted to shipment records');
assert.ok(auth.includes("result.data.length !== 1"), 'courier sync must detect when RLS prevents the assigned shipment update');

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

console.log('Air Logistic validation passed.');
console.log('Validated auth.js, sw.js, and ' + inlineScripts.length + ' inline application scripts.');
