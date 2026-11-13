(() => {
'use strict';
if (window.__airDeliveryProofsInstalled) return;
window.__airDeliveryProofsInstalled = true;
const BUCKET = 'air-logistic-delivery-proof';
const byId = id => document.getElementById(id);
let selectedId = '';
let signatureDirty = false;
let drawing = false;
const canvas = byId('airDeliverySignature');
const ctx = canvas ? canvas.getContext('2d') : null;
function esc(value) {
 return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function getShipment(id) {
 try { return typeof db !== 'undefined' ? (db.shipments || []).find(x => String(x.id) === String(id)) : null; }
 catch (_) { return null; }
}
function allowed(shipment,p) {
 if (!p || !p.active || !shipment) return false;
 if (p.role === 'admin' || p.role === 'manager') return true;
 return p.role === 'courier' && String(shipment.courier_user_id || '') === String(p.user_id);
}
function clearSignature() {
 if (!ctx || !canvas) return;
 ctx.clearRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle = '#fff';
 ctx.fillRect(0,0,canvas.width,canvas.height);
 signatureDirty = false;
}
function pos(e) {
 const r=canvas.getBoundingClientRect();
 return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};
}
if(canvas && ctx) {
 canvas.style.touchAction='none';
 ctx.strokeStyle='#142a45'; ctx.lineWidth=5; ctx.lineCap='round'; ctx.lineJoin='round';
 clearSignature();
 canvas.addEventListener('pointerdown',e=>{
  e.preventDefault(); drawing=true;
  if(canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  const p=pos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y);
 });
 canvas.addEventListener('pointermove',e=>{
  if(!drawing) return;
  e.preventDefault(); const p=pos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); signatureDirty=true;
 });
 const stop=()=>{drawing=false;};
 canvas.addEventListener('pointerup',stop);
 canvas.addEventListener('pointercancel',stop);
 canvas.addEventListener('lostpointercapture',stop);
}
function signedCanvasBlob() {
 return new Promise(resolve=>{
  if(!canvas || !signatureDirty) return resolve(null);
  canvas.toBlob(resolve,'image/png');
 });
}
async function upload(client,profile,file,label) {
 const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
 const path=profile.workspace_id+'/'+profile.user_id+'/'+crypto.randomUUID()+'-'+label+'.'+ext;
 const result=await client.storage.from(BUCKET).upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});
 if(result.error) throw result.error;
 return path;
}
async function loadHistory() {
 const host=byId('airDeliveryProofHistory');
 const p=window.currentProfile, client=window.airLogisticSupabase;
 if(!host || !selectedId || !p || !client) return;
 host.textContent='جارٍ تحميل الإثباتات...';
 const r=await client.from('delivery_proofs')
  .select('id,recipient_name,proof_image_path,signature_path,delivered_at,notes')
  .eq('workspace_id',p.workspace_id).eq('shipment_id',selectedId)
  .order('delivered_at',{ascending:false}).limit(20);
 if(r.error) { host.textContent='تعذر تحميل سجل الإثباتات. تحقق من الاتصال والصلاحيات.'; return; }
 if(!r.data || !r.data.length) { host.textContent='لا توجد إثباتات مسجلة لهذه الشحنة حتى الآن.'; return; }
 const cards=[];
 for(const row of r.data) {
  const photo=await client.storage.from(BUCKET).createSignedUrl(row.proof_image_path,120);
  const sig=row.signature_path?await client.storage.from(BUCKET).createSignedUrl(row.signature_path,120):null;
  const photoUrl=photo.error?'':(photo.data && photo.data.signedUrl || '');
  const sigUrl=sig && !sig.error ? (sig.data && sig.data.signedUrl || '') : '';
  cards.push('<article class="air-notification"><b>'+esc(row.recipient_name)+'</b><p>وقت التسليم: '+esc(new Date(row.delivered_at).toLocaleString('ar-EG'))+'</p>'+
   (row.notes?'<p>'+esc(row.notes)+'</p>':'')+
   (photoUrl?'<a target="_blank" rel="noopener" href="'+esc(photoUrl)+'"><img src="'+esc(photoUrl)+'" alt="صورة إثبات التسليم" loading="lazy" style="max-width:180px;max-height:180px;border-radius:10px;object-fit:cover"></a>':'<small>تعذر فتح الصورة.</small>')+
   (sigUrl?'<div><small>توقيع المستلم</small><br><img src="'+esc(sigUrl)+'" alt="التوقيع" loading="lazy" style="max-width:220px;background:#fff;border:1px solid #ddd"></div>':'')+
   '</article>');
 }
 host.innerHTML=cards.join('');
}
function closePanel() {
 const panel=byId('airDeliveryProofPanel');
 if(panel) panel.style.display='none';
 selectedId='';
 if(byId('airDeliveryProofForm')) byId('airDeliveryProofForm').reset();
 clearSignature();
}
window.openAirDeliveryProof=async function(encodedId) {
 const id=decodeURIComponent(String(encodedId || ''));
 const shipment=getShipment(id), p=window.currentProfile;
 if(!allowed(shipment,p)) { alert('إثبات التسليم متاح للمدير والمندوب المسند إليه الشحنة فقط.'); return; }
 if(shipment.status!=='تم التسليم') { alert('سجّل حالة الشحنة «تم التسليم» أولًا.'); return; }
 selectedId=id;
 byId('airDeliveryProofTitle').textContent='إثبات تسليم الشحنة رقم '+id;
 byId('airDeliveryProofPanel').style.display='block';
 byId('airDeliveryProofForm').reset();
 clearSignature();
 byId('airDeliveryProofStatus').textContent='أرفق صورة واضحة واكتب اسم المستلم. التوقيع والموقع اختياريان.';
 await loadHistory();
 byId('airDeliveryProofPanel').scrollIntoView({behavior:'smooth',block:'start'});
};
byId('airDeliverySignatureClear')?.addEventListener('click',clearSignature);
byId('airDeliveryProofCancel')?.addEventListener('click',closePanel);
byId('airDeliveryProofForm')?.addEventListener('submit',async e=>{
 e.preventDefault();
 const p=window.currentProfile,client=window.airLogisticSupabase,id=selectedId;
 const shipment=getShipment(id);
 const recipient=(byId('airProofRecipient').value || '').trim();
 const file=byId('airProofPhoto').files && byId('airProofPhoto').files[0];
 const status=byId('airDeliveryProofStatus'),button=byId('airDeliveryProofSave');
 if(!allowed(shipment,p) || shipment.status!=='تم التسليم') { status.textContent='تعذر التحقق من صلاحية الشحنة؛ أعد فتح النافذة.'; return; }
 if(!client || !recipient || !file) { status.textContent='اكتب اسم المستلم واختر صورة الإثبات.'; return; }
 if(!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>15*1024*1024) { status.textContent='الصورة يجب أن تكون JPG أو PNG أو WEBP وبحد أقصى 15 ميجابايت.'; return; }
 button.disabled=true;
 let photoPath='';
 try {
  status.textContent='جارٍ رفع الصورة وحفظ إثبات التسليم...';
  photoPath=await upload(client,p,file,'delivery');
  let signaturePath=null;
  const blob=await signedCanvasBlob();
  if(blob) {
   try { signaturePath=await upload(client,p,new File([blob],'signature.png',{type:'image/png'}),'signature'); }
   catch(err) { console.warn('Optional signature upload failed:',err); }
  }
  if(!window.currentProfile || window.currentProfile.user_id!==p.user_id || window.currentProfile.workspace_id!==p.workspace_id) throw new Error('تغير الحساب أثناء الحفظ. أعد تسجيل الدخول.');
  let location={};
  if(byId('airProofIncludeLocation').checked && navigator.geolocation) {
   location=await new Promise(resolve=>navigator.geolocation.getCurrentPosition(
    x=>resolve({latitude:x.coords.latitude,longitude:x.coords.longitude,location_accuracy_m:x.coords.accuracy}),
    ()=>resolve({}),{enableHighAccuracy:true,timeout:7000,maximumAge:30000}
   ));
  }
  const saved=await client.from('delivery_proofs').insert({
   workspace_id:p.workspace_id,shipment_id:String(id),recorded_by:p.user_id,
   recipient_name:recipient.slice(0,160),proof_image_path:photoPath,
   signature_path:signaturePath,delivered_at:new Date().toISOString(),
   latitude:location.latitude==null?null:location.latitude,
   longitude:location.longitude==null?null:location.longitude,
   location_accuracy_m:location.location_accuracy_m==null?null:location.location_accuracy_m,
   notes:(byId('airProofNotes').value || '').trim().slice(0,1000)
  });
  if(saved.error) throw saved.error;
  status.textContent='تم حفظ إثبات التسليم وتسجيل العملية في سجل المراجعة.';
  await loadHistory();
  if(typeof window.toast==='function') window.toast('تم حفظ إثبات التسليم.');
 } catch(err) {
  console.error('Air Logistic delivery proof:',err);
  status.textContent='تعذر حفظ الإثبات: '+String(err && err.message || err).slice(0,220);
  if(photoPath) status.textContent+=' قد تبقى الصورة المرفوعة في المخزن إذا فشل حفظ السجل.';
 } finally { button.disabled=false; }
});
window.airDeliveryProofs={refresh:loadHistory,close:closePanel};
})();