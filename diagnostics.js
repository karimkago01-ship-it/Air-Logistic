/* Owner-only runtime diagnostics. Never records credentials, form values, or shipment/customer payloads. */
(() => {
  'use strict';
  if (window.__airDiagnosticsInstalled) return;
  window.__airDiagnosticsInstalled = true;

  const OWNER_ID = '0e7fe9b5-bc54-403b-9884-ad1facf5efe0';
  const QUEUE_KEY = 'air_logistic_diagnostics_queue_v1';
  const MAX_QUEUE = 20;
  const MAX_PER_MINUTE = 8;
  const seen = new Map();
  let sending = false;

  function ownerProfile() {
    const p = window.currentProfile;
    return p && p.user_id === OWNER_ID && p.active === true ? p : null;
  }
  function clean(value, max) {
    return String(value || '')
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]')
      .replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone]')
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '[id]')
      .replace(/[\r\n\t]+/g, ' ')
      .slice(0, max);
  }
  function readQueue() {
    try {
      const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      return Array.isArray(q) ? q.slice(-MAX_QUEUE) : [];
    } catch (_) { return []; }
  }
  function writeQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE))); } catch (_) {}
  }
  function eventFingerprint(item) {
    return [item.event_type, item.message, item.page].join('|');
  }
  function enqueue(type, message) {
    const profile = ownerProfile();
    if (!profile) return;
    const item = {
      event_type: clean(type, 80) || 'runtime_error',
      message: clean(message, 700) || 'Unknown runtime error',
      page: clean(document.querySelector('.page:not(.hidden)')?.id || 'unknown', 120),
      route: clean(location.pathname, 180),
      app_version: 'air-logistic-diagnostics-v1',
      user_id: profile.user_id,
      workspace_id: profile.workspace_id
    };
    const now = Date.now();
    const key = eventFingerprint(item);
    if (seen.has(key) && now - seen.get(key) < 60000) return;
    seen.set(key, now);
    for (const [k, t] of seen) if (now - t > 60000) seen.delete(k);
    if (seen.size > MAX_PER_MINUTE) return;
    const q = readQueue();
    q.push(item);
    writeQueue(q);
    flush();
  }
  async function flush() {
    const profile = ownerProfile();
    const client = window.airLogisticSupabase;
    if (!profile || !client || sending || !navigator.onLine) return;
    sending = true;
    try {
      let q = readQueue();
      while (q.length) {
        const batch = q.slice(0, 5).map(({event_type,message,page,route,app_version,user_id,workspace_id}) =>
          ({event_type,message,page,route,app_version,user_id,workspace_id}));
        const result = await client.from('app_diagnostics').insert(batch);
        if (result.error) break;
        q = q.slice(batch.length);
        writeQueue(q);
      }
    } catch (_) {
      // Keep the small local queue and retry when connectivity returns.
    } finally { sending = false; }
  }
  window.addEventListener('error', event => {
    const target = event.target;
    if (target && (target.src || target.href)) {
      enqueue('resource_error', 'تعذر تحميل مورد في التطبيق: ' + clean(target.src || target.href, 250));
      return;
    }
    enqueue('javascript_error', (event.message || 'JavaScript error') + ' @ ' + (event.filename || '') + ':' + (event.lineno || 0));
  }, true);
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    enqueue('unhandled_rejection', reason?.message || String(reason || 'Unhandled promise rejection'));
  });
  window.addEventListener('online', flush);
  window.addEventListener('load', () => setTimeout(flush, 1800));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) flush(); });

  async function refresh() {
    const profile = ownerProfile();
    const host = document.getElementById('airDiagnosticsList');
    const status = document.getElementById('airDiagnosticsStatus');
    if (!host || !status) return;
    if (!profile || !window.airLogisticSupabase) {
      status.textContent = 'سجل الأعطال متاح لحساب المالك فقط بعد اكتمال تسجيل الدخول.';
      host.textContent = '';
      return;
    }
    await flush();
    status.textContent = 'جارٍ تحميل سجل الأعطال الخاص...';
    const result = await window.airLogisticSupabase.from('app_diagnostics')
      .select('event_type,message,page,route,created_at')
      .order('created_at', {ascending:false}).limit(20);
    if (result.error) {
      status.textContent = 'تعذر تحميل سجل الأعطال. سيُحتفظ بالأخطاء محليًا حتى عودة الاتصال.';
      return;
    }
    status.textContent = 'آخر ' + result.data.length + ' أعطال مسجلة — خاص بحساب المالك.';
    host.innerHTML = result.data.length ? result.data.map(row =>
      '<div class="alert"><b>' + escapeHtml(row.event_type) + '</b><div>' +
      escapeHtml(row.message) + '</div><small>' + escapeHtml(row.page) + ' • ' +
      escapeHtml(new Date(row.created_at).toLocaleString('ar-EG')) + '</small></div>'
    ).join('') : '<p class="muted">لا توجد أعطال مسجلة حتى الآن.</p>';
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  window.airDiagnostics = {refresh, flush};
  window.addEventListener('air-logistic-profile-ready', refresh);
})();