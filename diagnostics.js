/* Privacy-safe, owner-visible runtime diagnostics across active workspace accounts. */
(() => {
'use strict';
if(window.__airDiagnosticsInstalled) return;
window.__airDiagnosticsInstalled=true;
const OWNER_ID='0e7fe9b5-bc54-403b-9884-ad1facf5efe0';
const QUEUE_KEY='air_logistic_diagnostics_queue_v2';
const MAX_QUEUE=40, MAX_PER_MINUTE=8;
const seen=new Map();
let sending=false;
function activeProfile() {
 const p=window.currentProfile;
 return p && p.active===true && p.user_id && p.workspace_id ? p : null;
}
function ownerProfile() {
 const p=activeProfile();
 return p && p.user_id===OWNER_ID && p.role==='admin' ? p : null;
}
function clean(value,max) {
 return String(value || '')
  .replace(/Bearer\s+\S+/gi,'Bearer [redacted]')
  .replace(/\b(?:sb_secret|sb_publishable)_[A-Za-z0-9_-]+\b/g,'[key]')
  .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,'[token]')
  .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email]')
  .replace(/\+?\d[\d\s().-]{7,}\d/g,'[phone]')
  .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,'[id]')
  .replace(/[\r\n\t]+/g,' ').slice(0,max);
}
function readQueue() {
 try { const q=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]'); return Array.isArray(q)?q.slice(-MAX_QUEUE):[]; }
 catch(_) { return []; }
}
function writeQueue(q) { try { localStorage.setItem(QUEUE_KEY,JSON.stringify(q.slice(-MAX_QUEUE))); } catch(_) {} }
function enqueue(type,message) {
 const p=activeProfile();
 if(!p) return;
 const item={
  qid:crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random(),
  event_type:clean(type,80)||'runtime_error',
  message:clean(message,700)||'Unknown runtime error',
  page:clean(document.querySelector('.page:not(.hidden)')?.id||'unknown',120),
  route:clean(location.pathname,180),app_version:'air-logistic-runtime-v2',
  user_id:p.user_id,workspace_id:p.workspace_id
 };
 const now=Date.now(),key=[item.event_type,item.message,item.page].join('|');
 if(seen.has(key)&&now-seen.get(key)<60000) return;
 seen.set(key,now);
 for(const [k,t] of seen) if(now-t>60000) seen.delete(k);
 if(seen.size>MAX_PER_MINUTE) return;
 const q=readQueue(); q.push(item); writeQueue(q); flush();
}
async function flush() {
 const p=activeProfile(),client=window.airLogisticSupabase;
 if(!p||!client||sending||!navigator.onLine) return;
 sending=true;
 try {
  let q=readQueue();
  while(true) {
   const batch=q.filter(x=>x.user_id===p.user_id&&x.workspace_id===p.workspace_id).slice(0,5);
   if(!batch.length) break;
   const rows=batch.map(({event_type,message,page,route,app_version,user_id,workspace_id})=>({event_type,message,page,route,app_version,user_id,workspace_id}));
   const result=await client.from('app_runtime_diagnostics').insert(rows);
   if(result.error) break;
   const ids=new Set(batch.map(x=>x.qid));
   q=q.filter(x=>!ids.has(x.qid)); writeQueue(q);
  }
 } catch(_) { /* preserve queue for retry */ }
 finally { sending=false; }
}
function safePath(value) {
 try { const u=new URL(String(value||''),location.href); return (u.origin+u.pathname).slice(0,250); }
 catch(_) { return ''; }
}
window.addEventListener('error',e=>{
 const target=e.target;
 if(target&&(target.src||target.href)) enqueue('resource_error','تعذر تحميل مورد من النوع '+clean(target.tagName||'unknown',30));
 else enqueue('javascript_error',clean(e.message||'JavaScript error',300)+(e.filename?' @ '+safePath(e.filename)+':'+(e.lineno||0):''));
},true);
window.addEventListener('unhandledrejection',e=>enqueue('unhandled_rejection',e.reason?.message||String(e.reason||'Unhandled promise rejection')));
window.addEventListener('online',flush);
window.addEventListener('air-logistic-profile-ready',flush);
window.addEventListener('load',()=>setTimeout(flush,1600));
document.addEventListener('visibilitychange',()=>{if(!document.hidden) flush();});
function escapeHtml(v) { return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function refresh() {
 const p=ownerProfile(),host=document.getElementById('airDiagnosticsList'),status=document.getElementById('airDiagnosticsStatus');
 if(!host||!status) return;
 if(!p||!window.airLogisticSupabase) { status.textContent='سجل الأعطال متاح لحساب المالك فقط بعد تسجيل الدخول.'; host.textContent=''; return; }
 await flush();
 status.textContent='جارٍ تحميل الأعطال من حسابات مساحة العمل...';
 const client=window.airLogisticSupabase;
 const [current,legacy]=await Promise.all([
  client.from('app_runtime_diagnostics').select('event_type,message,page,route,created_at').eq('workspace_id',p.workspace_id).order('created_at',{ascending:false}).limit(30),
  client.from('app_diagnostics').select('event_type,message,page,route,created_at').eq('workspace_id',p.workspace_id).order('created_at',{ascending:false}).limit(20)
 ]);
 if(current.error&&legacy.error) { status.textContent='تعذر تحميل سجل الأعطال. ستبقى الأخطاء الجديدة في قائمة الهاتف لحين عودة الاتصال.'; return; }
 const rows=(current.data||[]).concat(legacy.data||[]).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,40);
 status.textContent='عدد الأعطال المسجلة من الحسابات النشطة: '+rows.length+' — التفاصيل خاصة بالمالك.';
 host.innerHTML=rows.length?rows.map(row=>'<div class="alert"><b>'+escapeHtml(row.event_type)+'</b><div>'+escapeHtml(row.message)+'</div><small>'+escapeHtml(row.page)+' • '+escapeHtml(new Date(row.created_at).toLocaleString('ar-EG'))+'</small></div>').join(''):'<p class="muted">لا توجد أعطال مسجلة حتى الآن.</p>';
}
window.airDiagnostics={refresh:refresh,flush:flush};
window.addEventListener('air-logistic-profile-ready',refresh);
})();