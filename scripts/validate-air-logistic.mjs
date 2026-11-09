import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const auth = read('../auth.js');
const html = read('../index.html');
const sw = read('../sw.js');

new vm.Script(auth, { filename: 'auth.js' });
new vm.Script(sw, { filename: 'sw.js' });

const inlineScripts = [...html.matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi)]
  .map((match) => match[1])
  .filter((source) => source.trim());

assert.ok(inlineScripts.length > 0, 'index.html must contain application scripts');
inlineScripts.forEach((source, index) => {
  new vm.Script(source, { filename: `index.html:inline-script-${index + 1}` });
});

assert.ok(auth.includes('air_logistic_recovery_v1'), 'local recovery archive must remain enabled');
assert.ok(!auth.includes("removeItem('air_logistic_full_v1')"), 'local recovery snapshot must never be silently removed');
assert.ok(auth.includes('resolveAirCourierUserId'), 'authenticated courier resolver must exist');
assert.ok(auth.includes("String(item.courier_user_id || '')"), 'courier cloud sync must be scoped by authenticated user ID');

assert.ok(html.includes("shipForm').onsubmit=async"), 'shipment save must resolve courier account before saving');
assert.ok(html.includes('async function commitImport()'), 'bulk import must resolve courier accounts before saving');
assert.ok(html.includes("transferForm').onsubmit=async"), 'shipment transfer must resolve courier account before saving');
assert.ok(html.includes('s.courier_user_id=courierUserId'), 'shipment transfer must persist courier user ID');

assert.ok(/serviceWorker|service-worker/i.test(html), 'PWA service worker registration must remain present');
assert.ok(/CACHE_NAME|cacheName/i.test(sw), 'service worker must define a cache version');

console.log('Air Logistic validation passed.');
console.log(`Validated auth.js, sw.js, and ${inlineScripts.length} inline application scripts.`);
