(function () {
'use strict';
if (window.airLogisticDispatchV1) return;
window.airLogisticDispatchV1 = true;

const escHtml = value => typeof esc === 'function' ? esc(value) : String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const moneyFmt = value => typeof money === 'function' ? money(value) : (Number(value)||0).toLocaleString('ar-EG')+' ج.م';
const shipRows = () => Array.isArray(db.shipments) ? db.shipments : [];
const transferRows = () => { if (!Array.isArray(db.transfers)) db.transfers=[]; return db.transfers; };
const ensureHistory = s => { if (!Array.isArray(s.history)) s.history=[]; return s.history; };
const isFinal = status => {
 const value=String(status||'');
 return value.includes('تم التسليم')||value.includes('مرتجع')||value.includes('ملغاة')||value.includes('ملغي')||value.includes('رفض الاستلام')||value.includes('رفض جزئي');
};

const css=document.createElement('style');
css.id='air-courier-dispatch-outcomes';
css.textContent='.air-dispatch-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:end}'+
'.air-dispatch-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:14px 0}'+
'.air-dispatch-metric{padding:12px;border:1px solid #dbe4ed;border-radius:12px;background:linear-gradient(145deg,#fff,#f5f8fb)}'+
'.air-dispatch-metric small{display:block;color:#62758a;font-size:12px}.air-dispatch-metric b{display:block;margin-top:4px;color:#17324b;font-size:20px}'+
'.air-dispatch-list{display:grid;gap:8px;margin-top:12px}.air-dispatch-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;padding:12px;border:1px solid #e0e8ef;border-radius:12px;background:#fff;cursor:pointer}'+
'.air-dispatch-row input{width:19px;height:19px;accent-color:#bd8b24}.air-dispatch-main{display:grid;gap:4px;min-width:0}'+
'.air-dispatch-main small,.air-dispatch-current{color:#63778c;font-size:12px}.air-dispatch-current{white-space:nowrap}'+
'.air-shipment-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}.air-outcome-note{display:block;margin-top:6px;padding:7px 9px;border-right:3px solid #bd8b24;border-radius:7px;background:#fff8e8;color:#5d471a;font-size:12px;white-space:normal}'+
'.air-modal{position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px}.air-modal[hidden]{display:none!important}'+
'.air-modal-backdrop{position:absolute;inset:0;background:#081b2dcc;backdrop-filter:blur(3px)}'+
'.air-modal-card{position:relative;width:min(560px,100%);max-height:90vh;overflow:auto;padding:20px;border:1px solid #e3e8ed;border-radius:18px;background:#fff;box-shadow:0 20px 70px #06172c55}'+
'.air-modal-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.air-modal-head h3{margin:0;color:#17324b}'+
'.air-modal-card .formgrid{margin-top:10px}.air-modal-card textarea{min-height:90px}.air-modal-actions{display:flex;justify-content:flex-start;gap:9px;margin-top:16px}'+
'@media(max-width:700px){.air-dispatch-grid{grid-template-columns:1fr}.air-dispatch-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.air-dispatch-row{grid-template-columns:auto minmax(0,1fr)}.air-dispatch-current{grid-column:2;white-space:normal}.air-modal-card{padding:15px}}';
document.head.appendChild(css);

const transferPage=document.getElementById('transfers');
if(transferPage&&!document.getElementById('airDispatchPanel')){
 transferPage.insertAdjacentHTML('afterbegin',
 '<div class="panel" id="airDispatchPanel"><h2>صرف الشحنات على المندوب</h2>'+
 '<p class="muted">حدد المندوب ثم اختر الشحنات التي سيتم تسليمها له. يُحفظ اسم المندوب وحسابه ووقت الصرف في سجل كل شحنة، وتُسجّل إعادة التوزيع في سجل التحويلات.</p>'+
 '<div class="air-dispatch-grid"><label>مندوب التوصيل<select id="dispatchCourier"><option value="">اختر المندوب</option></select></label>'+
 '<label>بحث في الشحنات<input id="dispatchSearch" type="search" placeholder="رقم الشحنة أو العميل أو المنطقة"></label>'+
 '<label>سبب الصرف / التوزيع<input id="dispatchReason" maxlength="240" value="صرف شحنات للتوصيل"></label></div>'+
 '<div id="dispatchCourierSummary" class="air-dispatch-summary"></div>'+
 '<div class="actions"><button class="light" id="dispatchSelectVisible" type="button">تحديد الشحنات الظاهرة</button>'+
 '<button class="secondary" id="dispatchClearVisible" type="button">إلغاء التحديد</button>'+
 '<span id="dispatchSelectionSummary" class="muted" aria-live="polite">تم تحديد 0 شحنة</span></div>'+
 '<div id="dispatchList" class="air-dispatch-list" aria-live="polite"></div>'+
 '<div class="actions"><button class="primary" id="dispatchSubmit" type="button">صرف الشحنات المحددة على المندوب</button></div>'+
 '<p id="dispatchStatus" class="muted">يشترط وجود حساب نشط بدور «مندوب» وبالاسم نفسه المسجل في بيانات السائقين.</p></div>');
}
if(!document.getElementById('courierPickerLabel')){
 const picker=document.getElementById('courierPicker');
 if(picker&&picker.parentElement)picker.parentElement.id='courierPickerLabel';
}
if(document.getElementById('shipments')&&!document.getElementById('shipmentOutcomeModal')){
 document.body.insertAdjacentHTML('beforeend',
 '<div id="shipmentOutcomeModal" class="air-modal" hidden><div class="air-modal-backdrop" data-outcome-close></div>'+
 '<section class="air-modal-card" role="dialog" aria-modal="true" aria-labelledby="shipmentOutcomeTitle">'+
 '<div class="air-modal-head"><h3 id="shipmentOutcomeTitle">تحديث نتيجة الشحنة</h3><button type="button" class="secondary" aria-label="إغلاق" data-outcome-close>✕</button></div>'+
 '<p id="shipmentOutcomeShipment" class="muted"></p><form id="shipmentOutcomeForm"><input type="hidden" name="shipmentId">'+
 '<div class="formgrid"><label class="span2">الإجراء<select name="action" id="shipmentOutcomeAction">'+
 '<option value="postpone">تأجيل / لم يتم الرد</option><option value="reject">رفض العميل بدون دفع</option><option value="reject_paid">رفض العميل مع دفع</option></select></label>'+
 '<label class="span2">سبب التأجيل أو الرفض<textarea name="reason" maxlength="500" required placeholder="اكتب السبب بوضوح ليظهر في الصفحة الرئيسية وسجل الشحنة"></textarea></label>'+
 '<label id="shipmentOutcomeNextWrap" class="span2">موعد المحاولة القادمة (اختياري)<input name="nextAttempt" type="date"></label>'+
 '<label id="shipmentOutcomePaidWrap" class="span2" hidden>المبلغ المحصّل عند الرفض (جنيه)<input name="paidAmount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="اكتب المبلغ الذي تم دفعه"></label></div>'+
 '<div class="air-modal-actions"><button class="primary" type="submit">حفظ وتسجيل الحركة</button><button class="secondary" type="button" data-outcome-close>إلغاء</button></div></form></section></div>');
}
['#shipForm select[name="status"]','#statusFilter'].forEach(selector=>{
 const el=document.querySelector(selector);
 if(el&&![...el.options].some(o=>o.value==='العميل رفض الاستلام'))el.add(new Option('العميل رفض الاستلام','العميل رفض الاستلام'));
});

window.shipmentOutcomeNote=function(s){
 const status=String(s?.status||'');
 if(status.includes('رفض')||s?.refusalReason){
  const reason=String(s.refusalReason||s.failureReason||'العميل رفض الاستلام');
  const amount=Number(s.refusalPaidAmount)||0;
  return reason+' — '+(amount>0?'تم الدفع: '+moneyFmt(amount):'لم يتم تحصيل مبلغ');
 }
 if(status.includes('مؤجل')||status.includes('تأجيل')||status.includes('لم يتم الرد'))return String(s.failureReason||s.outcomeReason||'لم يتم تسجيل سبب التأجيل أو عدم الرد');
 return '';
};

window.renderRecentShipments=function(){
 const target=document.getElementById('recent');if(!target)return;
 const rows=shipRows().slice(-6).reverse();
 if(!rows.length){target.innerHTML='<p class="muted">لا توجد بيانات مسجلة حتى الآن.</p>';return;}
 const body=rows.map(s=>{
  const last=Array.isArray(s.history)&&s.history.length?s.history[0]:{};
  const status=String(s.status||last.toStatus||last.event||'غير محددة');
  const movement=String(last.reason||(last.fromStatus&&last.toStatus?last.fromStatus+' ← '+last.toStatus:(last.event&&last.event!==status?last.event:'')));
  const note=window.shipmentOutcomeNote(s);
  const at=last.at?new Date(last.at).toLocaleString('ar-EG'):'';
  const noteHtml=note?'<small class="air-outcome-note"><b>ملاحظة التأجيل / الرفض:</b> '+escHtml(note)+'</small>':'';
  const movementHtml=movement&&movement!==note?'<small class="muted">آخر حركة: '+escHtml(movement)+'</small>':'';
  return '<tr><td>'+escHtml(s.id||'')+'</td><td>'+escHtml(s.customer||'')+'</td><td>'+escHtml(s.to||'')+'</td>'+
   '<td><span class="tag recent-status">'+escHtml(status)+'</span></td><td>'+noteHtml+movementHtml+
   (at?'<br><small class="muted">'+escHtml(at)+'</small>':'')+'</td></tr>';
 }).join('');
 target.innerHTML='<div class="tablewrap"><table><thead><tr><th>رقم الشحنة</th><th>العميل</th><th>الوجهة</th><th>الحالة الكاملة</th><th>تفاصيل الحركة وملاحظة التأجيل / الرفض</th></tr></thead><tbody>'+body+'</tbody></table></div>';
};

window.renderShip=function(){
 const q=(document.getElementById('shipSearch')?.value||'').toLowerCase();
 const filter=document.getElementById('statusFilter')?.value||'';
 const rows=shipRows().filter(s=>(!filter||s.status===filter)&&[s.id,s.customer,s.phone,s.to,s.carrier,s.agent].join(' ').toLowerCase().includes(q)).slice().reverse();
 const body=rows.map(s=>{
  const id=encodeURIComponent(s.id),note=window.shipmentOutcomeNote(s);
  return '<tr><td>'+escHtml(s.id)+'</td><td>'+escHtml(s.customer)+'</td><td>'+escHtml(s.phone)+'</td><td>'+escHtml(s.to)+'</td>'+
   '<td>'+escHtml(s.agent||'غير معين')+'</td><td>'+escHtml(s.carrier)+'</td><td><span class="tag">'+escHtml(s.status)+'</span>'+
   (note?'<small class="air-outcome-note">'+escHtml(note)+'</small>':'')+'</td><td>'+escHtml(s.due)+'</td><td><div class="air-shipment-actions">'+
   '<button class="light" type="button" onclick="editShip(\''+id+'\')">تعديل</button>'+
   '<button class="secondary" type="button" onclick="openShipmentOutcome(\''+id+'\',\'postpone\')">تأجيل / رفض</button>'+
   '<button class="secondary" type="button" onclick="openAirDeliveryProof(\''+id+'\')">إثبات التسليم</button>'+
   '<button class="danger" type="button" onclick="deleteShip(\''+id+'\')">حذف</button></div></td></tr>';
 }).join('');
 const target=document.getElementById('shipTable');
 if(target)target.innerHTML=rows.length?'<table><thead><tr>'+['رقم الشحنة','العميل','الهاتف','الوجهة','المندوب','شركة النقل','الحالة والملاحظة','موعد التسليم','الإجراءات'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table>':'<p class="muted">لا توجد شحنات مطابقة.</p>';
};

// Prevent normal edits from discarding the new dispatch and outcome fields.
const shipmentForm=document.getElementById('shipForm');
if(shipmentForm){
 shipmentForm.onsubmit=async function(event){
  event.preventDefault();
  const values=Object.fromEntries(new FormData(event.currentTarget));
  const old=editingId?shipRows().find(s=>s.id===editingId):null;
  const x=old?{...old,...values}:values;
  const normalized=normalizeShipmentId(x.id);
  const duplicate=shipRows().find(s=>normalizeShipmentId(s.id)===normalized&&String(s.id)!==String(editingId||''));
  if(duplicate)return alert('رقم الشحنة موجود بالفعل أو بنفس الرقم بعد تجاهل المسافات والشرطات. لم يتم الحفظ.');
  if(old&&old.agent===x.agent&&old.courier_user_id)x.courier_user_id=old.courier_user_id;
  else if(x.agent){try{x.courier_user_id=await window.resolveAirCourierUserId(x.agent);}catch(error){alert(error.message||'تعذر ربط الشحنة بحساب المندوب.');return;}}
  else x.courier_user_id=null;
  if(editingId){
   const i=shipRows().findIndex(s=>s.id===editingId);
   x.history=Array.isArray(old?.history)?old.history:[];
   if(old&&(old.status!==x.status||old.agent!==x.agent))x.history.unshift({at:new Date().toISOString(),event:'تعديل الحالة أو المندوب',fromAgent:old.agent||'',toAgent:x.agent||'',fromStatus:old.status||'',toStatus:x.status||''});
   db.shipments[i]=x;audit('تعديل شحنة',x.id);toast('تم تحديث الشحنة');
  }else{x.history=[{at:new Date().toISOString(),event:'إنشاء الشحنة'}];db.shipments.push(x);audit('إضافة شحنة',x.id);toast('تم حفظ الشحنة');}
  resetShip();save();
 };
}

let selectedIds=new Set();
function updateSelectedCount(){const el=document.getElementById('dispatchSelectionSummary');if(el)el.textContent='تم تحديد '+selectedIds.size+' شحنة';}
window.renderDispatchPortal=function(){
 const panel=document.getElementById('airDispatchPanel'),picker=document.getElementById('dispatchCourier');
 if(!panel||!picker)return;
 const profile=window.currentProfile,allowed=!!profile?.active&&['admin','manager'].includes(profile.role);
 panel.style.display=allowed?'':'none';if(!allowed)return;
 const previous=picker.value,drivers=(db.drivers||[]).filter(d=>d.status!=='غير نشط');
 picker.innerHTML='<option value="">اختر المندوب</option>'+drivers.map(d=>'<option value="'+escHtml(d.name)+'">'+escHtml(d.name)+'</option>').join('');
 if(drivers.some(d=>d.name===previous))picker.value=previous;
 const courier=picker.value,assigned=courier?shipRows().filter(s=>s.agent===courier):[];
 const metrics=[['إجمالي المسند للمندوب',assigned.length],['قيد التوصيل',assigned.filter(s=>!isFinal(s.status)).length],
  ['تم التسليم',assigned.filter(s=>String(s.status||'').includes('تم التسليم')).length],
  ['تأجيل / رفض',assigned.filter(s=>String(s.status||'').includes('مؤجل')||String(s.status||'').includes('تأجيل')||String(s.status||'').includes('رفض')).length]];
 const summary=document.getElementById('dispatchCourierSummary');
 if(summary)summary.innerHTML=metrics.map(m=>'<div class="air-dispatch-metric"><small>'+m[0]+'</small><b>'+m[1]+'</b></div>').join('');
 const query=(document.getElementById('dispatchSearch')?.value||'').trim().toLocaleLowerCase();
 const visible=shipRows().filter(s=>!isFinal(s.status)&&[s.id,s.customer,s.phone,s.to,s.agent].join(' ').toLocaleLowerCase().includes(query)).slice().reverse();
 const list=document.getElementById('dispatchList');
 if(list)list.innerHTML=visible.length?visible.map(s=>{
  const id=String(s.id),checked=selectedIds.has(id)?' checked':'';
  return '<label class="air-dispatch-row"><input class="air-dispatch-check" type="checkbox" data-shipment-id="'+encodeURIComponent(id)+'"'+checked+'>'+
   '<span class="air-dispatch-main"><b>شحنة '+escHtml(id)+' — '+escHtml(s.customer||'بدون اسم')+'</b><small>'+
   escHtml(s.to||'بدون وجهة')+' · '+escHtml(s.phone||'بدون هاتف')+' · COD: '+moneyFmt(s.cod)+'</small></span>'+
   '<span class="air-dispatch-current">'+(s.agent?'مسندة حاليًا: '+escHtml(s.agent):'غير مسندة')+'<br><small>'+escHtml(s.status||'غير محددة')+'</small></span></label>';
 }).join(''):'<p class="muted">لا توجد شحنات قابلة للصرف تطابق البحث الحالي.</p>';
 updateSelectedCount();
};
function selectVisible(checked){
 document.querySelectorAll('#dispatchList .air-dispatch-check').forEach(input=>{
  input.checked=!!checked;const id=decodeURIComponent(input.dataset.shipmentId||'');
  if(checked)selectedIds.add(id);else selectedIds.delete(id);
 });updateSelectedCount();
}
document.getElementById('dispatchList')?.addEventListener('change',event=>{
 const input=event.target.closest('.air-dispatch-check');if(!input)return;
 const id=decodeURIComponent(input.dataset.shipmentId||'');
 if(input.checked)selectedIds.add(id);else selectedIds.delete(id);updateSelectedCount();
});
document.getElementById('dispatchSelectVisible')?.addEventListener('click',()=>selectVisible(true));
document.getElementById('dispatchClearVisible')?.addEventListener('click',()=>selectVisible(false));
document.getElementById('dispatchSearch')?.addEventListener('input',()=>window.renderDispatchPortal());
document.getElementById('dispatchCourier')?.addEventListener('change',()=>window.renderDispatchPortal());

document.getElementById('dispatchSubmit')?.addEventListener('click',async()=>{
 const profile=window.currentProfile;
 if(!profile?.active||!['admin','manager'].includes(profile.role))return alert('صرف الشحنات متاح للمدير ومدير النظام فقط.');
 const target=document.getElementById('dispatchCourier')?.value||'';
 const reason=(document.getElementById('dispatchReason')?.value||'').trim();
 if(!target)return alert('اختر مندوب التوصيل أولاً.');
 if(!reason)return alert('اكتب سبب الصرف أو التوزيع.');
 const selected=[...selectedIds].map(id=>shipRows().find(s=>String(s.id)===id)).filter(s=>s&&!isFinal(s.status));
 if(!selected.length)return alert('حدد شحنة واحدة على الأقل من الشحنات المتاحة.');
 let courierUserId;
 try{courierUserId=await window.resolveAirCourierUserId(target);}
 catch(error){const status=document.getElementById('dispatchStatus');if(status)status.textContent=error.message||'تعذر ربط المندوب بحسابه.';return alert(error.message||'تعذر التحقق من حساب المندوب.');}
 const changed=selected.filter(s=>s.agent!==target||String(s.courier_user_id||'')!==String(courierUserId));
 if(!changed.length)return alert('كل الشحنات المحددة مسندة بالفعل لهذا المندوب.');
 if(!confirm('تأكيد صرف '+changed.length+' شحنة إلى المندوب '+target+'؟ سيتم تسجيل كل حركة في سجل التحويلات.'))return;
 const at=new Date().toISOString(),batchId='AIR-DISPATCH-'+(window.crypto?.randomUUID?window.crypto.randomUUID():Date.now());
 changed.forEach(s=>{
  const fromAgent=s.agent||'',fromStatus=s.status||'';
  transferRows().unshift({type:'صرف شحنة للمندوب',batchId,shipmentId:s.id,fromAgent,toAgent:target,courierUserId,reason,at});
  s.agent=target;s.courier_user_id=courierUserId;s.assignedAt=at;s.dispatchBatchId=batchId;s.status='خرجت للتوصيل';
  ensureHistory(s).unshift({at,event:'صرف الشحنة للمندوب',fromAgent,toAgent:target,fromStatus,toStatus:s.status,reason,batchId});
 });
 selectedIds.clear();audit('صرف مجموعة شحنات للمندوب',changed.length+' شحنة إلى '+target+' | '+batchId);
 const status=document.getElementById('dispatchStatus');if(status)status.textContent='تم صرف '+changed.length+' شحنة للمندوب '+target+' وتسجيلها باسمه.';
 save();toast('تم صرف الشحنات وتحديث كشف المندوب');
});

window.renderTransfers=function(){
 const target=document.getElementById('transferTable');if(!target)return;
 const list=transferRows();
 if(!list.length){target.innerHTML='<p class="muted">لا توجد تحويلات أو عمليات صرف مسجلة.</p>';return;}
 target.innerHTML='<table><thead><tr><th>نوع الحركة</th><th>رقم الشحنة</th><th>من مندوب</th><th>إلى مندوب</th><th>السبب</th><th>التاريخ والوقت</th><th>إجراء</th></tr></thead><tbody>'+
 list.map((t,i)=>'<tr><td>'+escHtml(t.type||'تحويل فردي')+'</td><td>'+escHtml(t.shipmentId)+'</td><td>'+escHtml(t.fromAgent||'—')+'</td><td>'+
 escHtml(t.toAgent)+'</td><td>'+escHtml(t.reason)+'</td><td>'+escHtml(t.at?new Date(t.at).toLocaleString('ar-EG'):'')+
 '</td><td><button class="light" type="button" onclick="editTransfer('+i+')">تعديل التوزيع</button></td></tr>').join('')+'</tbody></table>';
};

window.openShipmentOutcome=function(encodedId,initialAction){
 const id=decodeURIComponent(String(encodedId||'')),s=shipRows().find(x=>String(x.id)===id);
 if(!s)return alert('الشحنة غير موجودة.');
 const modal=document.getElementById('shipmentOutcomeModal'),form=document.getElementById('shipmentOutcomeForm');
 if(!modal||!form)return;
 form.reset();form.elements.shipmentId.value=id;
 document.getElementById('shipmentOutcomeShipment').textContent='الشحنة: '+id+' — '+(s.customer||'');
 form.elements.action.value=initialAction||'postpone';
 form.elements.reason.value=(initialAction==='reject'||initialAction==='reject_paid')?(s.refusalReason||'رفض العميل الاستلام'):(s.failureReason||'لم يتم الرد');
 form.elements.paidAmount.value=s.refusalPaidAmount||'';form.elements.nextAttempt.value=s.nextAttempt||'';
 window.syncShipmentOutcomeFields();modal.hidden=false;
};
window.closeShipmentOutcome=function(){const modal=document.getElementById('shipmentOutcomeModal');if(modal)modal.hidden=true;};
window.syncShipmentOutcomeFields=function(){
 const action=document.getElementById('shipmentOutcomeAction')?.value||'postpone';
 const paidWrap=document.getElementById('shipmentOutcomePaidWrap'),nextWrap=document.getElementById('shipmentOutcomeNextWrap');
 const paid=document.querySelector('#shipmentOutcomeForm [name="paidAmount"]');
 if(paidWrap)paidWrap.hidden=action!=='reject_paid';if(nextWrap)nextWrap.hidden=action!=='postpone';if(paid)paid.required=action==='reject_paid';
};
document.getElementById('shipmentOutcomeAction')?.addEventListener('change',window.syncShipmentOutcomeFields);
document.getElementById('shipmentOutcomeModal')?.addEventListener('click',e=>{if(e.target.matches('[data-outcome-close]'))window.closeShipmentOutcome();});
document.getElementById('shipmentOutcomeForm')?.addEventListener('submit',event=>{
 event.preventDefault();const form=event.currentTarget,id=String(form.elements.shipmentId.value||''),s=shipRows().find(x=>String(x.id)===id);
 if(!s)return alert('الشحنة لم تعد موجودة.');
 const action=form.elements.action.value,reason=String(form.elements.reason.value||'').trim(),amount=Number(form.elements.paidAmount.value)||0;
 if(!reason)return alert('اكتب سبب التأجيل أو الرفض قبل الحفظ.');
 if(action==='reject_paid'&&(!Number.isFinite(amount)||amount<=0))return alert('اكتب مبلغًا صحيحًا أكبر من صفر.');
 const at=new Date().toISOString(),oldStatus=s.status||'';
 if(action==='postpone'){
  s.status='مؤجل / لم يتم الرد';s.attempts=(Number(s.attempts)||0)+1;s.failureReason=reason;s.outcomeReason=reason;
  s.nextAttempt=form.elements.nextAttempt.value||'';s.outcomeType='postponed';s.refusalReason='';s.refusalPaidAmount=0;s.refusalPaymentStatus='';
 }else{
  s.status='العميل رفض الاستلام';s.refusalReason=reason;s.failureReason=reason;s.outcomeReason=reason;
  s.refusalPaymentStatus=action==='reject_paid'?'تم الدفع':'لم يتم الدفع';s.refusalPaidAmount=action==='reject_paid'?amount:0;
  s.refusalPaidAt=action==='reject_paid'?at:null;s.outcomeType='refused';
 }
 ensureHistory(s).unshift({at,event:action==='postpone'?'تأجيل الشحنة':'رفض العميل الاستلام',fromStatus:oldStatus,toStatus:s.status,reason,
  paidAmount:action==='reject_paid'?amount:0,paymentStatus:action==='reject_paid'?'تم الدفع':'لم يتم الدفع'});
 audit(action==='postpone'?'تأجيل شحنة':'تسجيل رفض شحنة',id+' — '+reason+(action==='reject_paid'?' — تم تحصيل '+moneyFmt(amount):''));
 window.closeShipmentOutcome();save();toast(action==='postpone'?'تم تسجيل التأجيل وسببه':'تم تسجيل الرفض وبيانات الدفع');
});

window.statusButtons=function(s){
 const id=encodeURIComponent(s.id);
 return '<div class="status-actions">'+
 '<button class="light" onclick="updateShipmentStatus(\''+id+'\',\'تم الاستلام من التاجر\')">استلام من التاجر</button>'+
 '<button class="light" onclick="updateShipmentStatus(\''+id+'\',\'في المخزن / مركز التوزيع\')">دخول المخزن</button>'+
 '<button class="light" onclick="updateShipmentStatus(\''+id+'\',\'خرجت للتوصيل\')">خرجت للتوصيل</button>'+
 '<button class="success" onclick="updateShipmentStatus(\''+id+'\',\'تم التسليم\')">تم التسليم</button>'+
 '<button class="secondary" onclick="openShipmentOutcome(\''+id+'\',\'postpone\')">تأجيل</button>'+
 '<button class="danger" onclick="openShipmentOutcome(\''+id+'\',\'reject\')">رفض العميل</button>'+
 '<button class="light" onclick="updateShipmentStatus(\''+id+'\',\'مرتجع\',\'تعذر التسليم نهائيًا\')">مرتجع</button></div>';
};
window.postponeShipment=function(id){window.openShipmentOutcome(id,'postpone');};

window.renderCourierPortal=function(){
 const picker=document.getElementById('courierPicker'),target=document.getElementById('courierManifest');
 if(!picker||!target)return;
 const profile=window.currentProfile,isCourier=profile?.role==='courier',label=document.getElementById('courierPickerLabel');
 let name='';
 if(isCourier){
  name=String(profile.full_name||'');picker.innerHTML='<option value="'+escHtml(name)+'">'+escHtml(name)+'</option>';picker.value=name;
  if(label)label.style.display='none';
 }else{
  if(label)label.style.display='';const previous=picker.value;
  picker.innerHTML='<option value="">اختر المندوب</option>'+(db.drivers||[]).filter(d=>d.status!=='غير نشط').map(d=>'<option value="'+escHtml(d.name)+'">'+escHtml(d.name)+'</option>').join('');
  picker.value=previous;name=picker.value;
 }
 if(!name){target.innerHTML='<p class="muted">اختر المندوب لعرض كشف الشحنات المصروفة عليه.</p>';return;}
 const assigned=isCourier?shipRows().filter(s=>String(s.courier_user_id||'')===String(profile.user_id)):shipRows().filter(s=>s.agent===name);
 const metric=[['إجمالي الشحنات المصروفة',assigned.length],['قيد التوصيل',assigned.filter(s=>!isFinal(s.status)).length],
  ['تم التسليم',assigned.filter(s=>String(s.status||'').includes('تم التسليم')).length],
  ['تأجيل / رفض',assigned.filter(s=>String(s.status||'').includes('مؤجل')||String(s.status||'').includes('تأجيل')||String(s.status||'').includes('رفض')).length]];
 const summary='<div class="air-dispatch-summary">'+metric.map(m=>'<div class="air-dispatch-metric"><small>'+m[0]+'</small><b>'+m[1]+'</b></div>').join('')+'</div>';
 const cards=assigned.slice().sort((a,b)=>String(b.assignedAt||'').localeCompare(String(a.assignedAt||''))).map(s=>{
  const note=window.shipmentOutcomeNote(s),date=s.assignedAt?'تاريخ الصرف: '+new Date(s.assignedAt).toLocaleString('ar-EG'):'';
  return '<article class="panel"><div class="air-modal-head"><b>الشحنة '+escHtml(s.id)+' — '+escHtml(s.customer||'')+'</b><span class="tag">'+escHtml(s.status||'غير محددة')+'</span></div>'+
   '<p>'+escHtml(s.to||'')+' | '+escHtml(s.phone||'')+' | COD: '+moneyFmt(s.cod)+'</p>'+
   '<p class="muted">المندوب: '+escHtml(s.agent||name)+' '+escHtml(date)+'</p>'+
   (note?'<small class="air-outcome-note">'+escHtml(note)+'</small>':'')+(isFinal(s.status)?'':window.statusButtons(s))+'</article>';
 }).join('');
 target.innerHTML=summary+(cards||'<p class="muted">لا توجد شحنات مصروفة لهذا المندوب حتى الآن.</p>');
};

window.applyWorkflowStatus=function(){
 const id=document.getElementById('wfShipment')?.value||'',status=document.getElementById('wfStatus')?.value||'';
 const reason=(document.getElementById('wfReason')?.value||'').trim();
 if(!id)return alert('اختر الشحنة أولاً.');
 const s=shipRows().find(x=>String(x.id)===String(id));if(!s)return;
 if((status.includes('تأجيل')||status.includes('لم يتم الرد')||status.includes('رفض'))&&!reason)return alert('اكتب سبب التأجيل أو الرفض أولاً.');
 const previous=s.status||'',at=new Date().toISOString();s.status=status;
 if(status.includes('تأجيل')||status.includes('لم يتم الرد')){s.attempts=(Number(s.attempts)||0)+1;s.failureReason=reason;s.outcomeReason=reason;s.outcomeType='postponed';}
 if(status.includes('رفض')){s.refusalReason=reason||'العميل رفض الاستلام';s.failureReason=s.refusalReason;s.refusalPaymentStatus='لم يتم الدفع';s.refusalPaidAmount=0;s.outcomeType='refused';}
 if(status.includes('مرتجع'))s.returnFee=Number(s.returnFee)||Number(db.policies?.defaultReturnFee)||0;
 ensureHistory(s).unshift({at,event:'تحديث دورة الشحنة',fromStatus:previous,toStatus:status,reason});
 audit('تحديث دورة الشحنة',id+': '+previous+' ← '+status+' '+reason);save();toast('تم تحديث الحالة');
};

if(typeof window.render==='function'&&!window.airDispatchRenderWrapped){
 const oldRender=window.render;
 window.render=function(){oldRender.apply(this,arguments);window.renderDispatchPortal();};
 window.airDispatchRenderWrapped=true;
}
window.renderDispatchPortal();window.renderTransfers();window.renderCourierPortal();
})();