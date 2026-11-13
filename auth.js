/* Air Logistic secure employee access + shared cloud data */
(() => {
  'use strict';
  const CFG = {
    url: 'https://jynzwuamihnwbbnvqlqw.supabase.co',
    key: 'sb_publishable_4LoEfXDeogMpZ18AfQtz_Q_2zjBcyKi'
  };
  const $ = id => document.getElementById(id);
  const APP_REDIRECT = 'https://karimkago01-ship-it.github.io/Air-Logistic/';
  const OWNER_USER_ID = '0e7fe9b5-bc54-403b-9884-ad1facf5efe0';
  const isOwnerAccount = profile => profile?.user_id === OWNER_USER_ID;
  const say = (message, error = false) => {
    const n = $('authNotice'); if (!n) return;
    n.textContent = message; n.style.color = error ? '#b42318' : '#176b46';
    n.classList.remove('hidden');
  };
  const hideNotice = () => $('authNotice')?.classList.add('hidden');
  const defaults = () => ({
    shipments:[],customers:[],drivers:[],vehicles:[],expenses:[],transfers:[],
    audit:[],imports:[],settlements:[],remits:[],policies:{},roles:[],
    agents:[],priceRules:[],ledger:[]
  });
  const keys = ['shipments','customers','drivers','vehicles','expenses','transfers','audit','imports','settlements','remits','roles','agents','priceRules','ledger'];
  const oldSnapshot = (() => {
    try { return JSON.parse(localStorage.getItem('air_logistic_full_v1') || 'null'); }
    catch (_) { return null; }
  })();
  // Keep the previous local dataset until the administrator has migrated it successfully.

  if (!window.supabase || !window.supabase.createClient) {
    document.body.classList.add('auth-locked');
    say('تعذر تحميل مكوّن الاتصال الآمن. حدّث الصفحة وتأكد من الإنترنت.', true);
    return;
  }
  const client = window.supabase.createClient(CFG.url, CFG.key, {
    auth: { autoRefreshToken:true, persistSession:true, detectSessionInUrl:true, flowType:'pkce' }
  });
  window.airLogisticSupabase = client;
  window.currentProfile = null;
  let activeAuthUser = null;
  let syncTimer = null, realtimeChannel = null, syncBusy = false, syncPending = false;
  const DELETE_QUEUE_KEY = 'air_logistic_cloud_delete_queue_v1';
  const deleteQueue = (() => {
    try { const q=JSON.parse(localStorage.getItem(DELETE_QUEUE_KEY)||'[]'); return Array.isArray(q)?q.slice(-500):[]; }
    catch(_) { return []; }
  })();
  function persistDeleteQueue() {
    try { localStorage.setItem(DELETE_QUEUE_KEY,JSON.stringify(deleteQueue.slice(-500))); }
    catch(error) { console.warn('Air Logistic pending delete queue:',error); }
  }
  let pendingAirPushEvents = [];
  let pendingAirPushBatch = null;

  // Queue a privacy-safe activity label for delivery after the cloud save succeeds.
  window.queueAirPushEvent = function(action) {
    const safeAction = String(action || '').replace(/\s+/g,' ').trim().slice(0,90);
    if (!safeAction) return;
    pendingAirPushEvents.push(safeAction);
    if (pendingAirPushEvents.length > 100) pendingAirPushEvents.shift();
  };

  async function flushAirPushEvents() {
    // Background push is now dispatched server-side from the notifications table.
    // Do not send a second workspace-wide broadcast from the browser (prevents duplicates).
    pendingAirPushEvents = [];
    pendingAirPushBatch = null;
    return true;
  }

  function lockApp() { document.body.classList.add('auth-locked'); $('authGate')?.classList.remove('hidden'); }
  function unlockApp() { document.body.classList.remove('auth-locked'); $('authGate')?.classList.add('hidden'); }
  function roleName(role) {
    return ({admin:'مدير النظام',manager:'مدير',employee:'مدير التسليمات',courier:'مندوب'})[role] || 'مستخدم';
  }
  function showMode(mode) {
    $('loginForm')?.classList.toggle('hidden', mode !== 'login');
    $('signupForm')?.classList.toggle('hidden', mode !== 'signup');
    $('resetForm')?.classList.toggle('hidden', mode !== 'reset');
    $('newPasswordForm')?.classList.toggle('hidden', mode !== 'newPassword');
    $('loginModeBtn')?.classList.toggle('active', mode === 'login');
    $('signupModeBtn')?.classList.toggle('active', mode === 'signup');
    hideNotice();
  }
  $('loginModeBtn')?.addEventListener('click', () => showMode('login'));
  $('signupModeBtn')?.addEventListener('click', () => showMode('signup'));
  $('forgotPasswordBtn')?.addEventListener('click', () => showMode('reset'));
  $('resendConfirmBtn')?.addEventListener('click', async () => {
    const email = $('loginEmail')?.value.trim().toLowerCase();
    if (!email) return say('اكتب البريد الإلكتروني في خانة الدخول أولًا.', true);
    const button = $('resendConfirmBtn'); button.disabled = true;
    const result = await client.auth.resend({type:'signup',email,options:{emailRedirectTo:APP_REDIRECT}});
    button.disabled = false;
    if (result.error) return say('تعذر إعادة إرسال التأكيد. تأكد من إعداد رابط الموقع وحاول مرة أخرى.', true);
    say('تم طلب إرسال رسالة تأكيد جديدة. افحص البريد الوارد والرسائل غير المرغوب فيها.');
  });
  $('backToLoginBtn')?.addEventListener('click', () => showMode('login'));

  $('loginForm')?.addEventListener('submit', async event => {
    event.preventDefault(); hideNotice();
    const email = $('loginEmail').value.trim().toLowerCase();
    const password = $('loginPassword').value;
    const button = $('loginSubmit'); button.disabled = true; button.textContent = 'جارٍ التحقق...';
    const result = await client.auth.signInWithPassword({email,password});
    button.disabled = false; button.textContent = 'دخول آمن';
    if (result.error) return say('تعذر تسجيل الدخول. راجع البريد وكلمة المرور أو تأكد من تأكيد البريد الإلكتروني.', true);
    say('تم التحقق من الحساب. جارٍ تحميل الصلاحيات وبيانات الفرع...');
  });

  $('signupForm')?.addEventListener('submit', async event => {
    event.preventDefault(); hideNotice();
    const full_name = $('signupName').value.trim();
    const email = $('signupEmail').value.trim().toLowerCase();
    const password = $('signupPassword').value;
    const confirm = $('signupConfirm').value;
    if (full_name.length < 3) return say('اكتب الاسم الكامل.', true);
    if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password))
      return say('كلمة المرور يجب أن تكون 12 حرفًا على الأقل وبها حرف كبير وصغير ورقم.', true);
    if (password !== confirm) return say('تأكيد كلمة المرور غير مطابق.', true);
    const button = $('signupSubmit'); button.disabled = true; button.textContent = 'جارٍ إنشاء الحساب...';
    const result = await client.auth.signUp({
      email, password, options:{data:{full_name},emailRedirectTo:APP_REDIRECT}
    });
    button.disabled = false; button.textContent = 'إرسال طلب إنشاء الحساب';
    if (result.error) return say('تعذر إنشاء الحساب. راجع البريد أو جرّب بريدًا آخر.', true);
    if (result.data.session) say('تم إنشاء الحساب. جارٍ التحقق من صلاحية المدير...');
    else {
      showMode('login');
      say('تم إرسال الطلب. افتح رسالة تأكيد البريد الإلكتروني أولًا، ثم سجّل الدخول. كل الحسابات الجديدة تنتظر تفعيل مدير النظام؛ سيتم تفعيل حساب المدير الأول يدويًا بعد التأكد من بريدك.');
    }
  });

  $('resetForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const email = $('resetEmail').value.trim().toLowerCase();
    const result = await client.auth.resetPasswordForEmail(email,{redirectTo:APP_REDIRECT});
    if (result.error) return say('تعذر إرسال رابط الاستعادة. تحقق من البريد وحاول مرة أخرى.', true);
    say('إذا كان البريد مسجلًا، ستصلك رسالة آمنة لإعادة تعيين كلمة المرور.');
  });

  $('newPasswordForm')?.addEventListener('submit', async event => {
    event.preventDefault(); hideNotice();
    const password = $('newPassword').value;
    const confirm = $('newPasswordConfirm').value;
    if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password))
      return say('كلمة المرور يجب أن تكون 12 حرفًا على الأقل وبها حرف كبير وصغير ورقم.', true);
    if (password !== confirm) return say('تأكيد كلمة المرور غير مطابق.', true);
    const button = $('saveNewPassword'); button.disabled = true; button.textContent = 'جارٍ حفظ كلمة المرور...';
    const result = await client.auth.updateUser({password});
    button.disabled = false; button.textContent = 'حفظ كلمة المرور والدخول';
    if (result.error) return say('تعذر تحديث كلمة المرور. افتح أحدث رسالة استعادة وجرّب مرة أخرى.', true);
    say('تم تحديث كلمة المرور بنجاح. جارٍ فتح حسابك...');
    const current = await client.auth.getSession();
    if (current.error || !current.data.session) { showMode('login'); return say('تم تحديث كلمة المرور. سجّل الدخول الآن بكلمة المرور الجديدة.'); }
    await activateSession(current.data.session);
  });

  async function readProfile(user) {
    const result = await client.from('profiles')
      .select('user_id,workspace_id,full_name,role,active,created_at')
      .eq('user_id',user.id).maybeSingle();
    if (result.error || !result.data) throw new Error('لم يتم العثور على ملف صلاحيات الحساب.');
    return result.data;
  }

  function setAuthBar(profile,email) {
    const backupAdminOnly = $('backupAdminOnly');
    const owner = isOwnerAccount(profile) && profile.role === 'admin';
    if (backupAdminOnly) backupAdminOnly.style.display = profile?.active ? '' : 'none';
    if ($('backupDownloadButton')) $('backupDownloadButton').style.display = owner ? '' : 'none';
    if ($('backupRequestButton')) $('backupRequestButton').style.display = owner ? 'none' : '';
    if ($('backupRefreshButton')) $('backupRefreshButton').style.display = owner ? 'none' : '';
    if ($('backupApprovedDownloadButton') && owner) $('backupApprovedDownloadButton').style.display = 'none';
    const backupApprovalPanel = $('backupApprovalPanel');
    if (backupApprovalPanel) backupApprovalPanel.style.display = owner ? '' : 'none';
    const bar = $('authBar'); if (!bar) return;
    bar.innerHTML = '<span>مرحبًا، <b>' + esc(profile.full_name) + '</b> · ' + roleName(profile.role) + ' · ' + esc(email || '') + '</span><button type="button" id="secureSignOut">تسجيل خروج آمن</button>';
    $('secureSignOut')?.addEventListener('click',async () => {
      await client.auth.signOut({scope:'local'});
      window.currentProfile = null; activeAuthUser = null;
      const backupAdminOnly = $('backupAdminOnly'); if (backupAdminOnly) backupAdminOnly.style.display = 'none'; const backupApprovalPanel = $('backupApprovalPanel'); if (backupApprovalPanel) backupApprovalPanel.style.display = 'none';
      const identityPanel = document.getElementById('airIdentityPanel');
      const identityLauncher = document.getElementById('airIdentityLauncher');
      if (identityPanel) { identityPanel.style.display = 'none'; identityPanel.querySelector('#airIdentityOwn').textContent = ''; identityPanel.querySelector('#airIdentityReviewList').textContent = ''; }
      if (identityLauncher) identityLauncher.style.display = 'none';
      if (realtimeChannel) { await client.removeChannel(realtimeChannel); realtimeChannel = null; }
      lockApp(); say('تم تسجيل الخروج بأمان.');
    });
    const nav = document.querySelector('#nav button[data-page="accountRequests"]');
    if (nav) nav.style.display = isOwnerAccount(profile) ? '' : 'none';
    const rolesNav = document.querySelector('#nav button[data-page="roles"]');
    if (rolesNav) rolesNav.style.display = isOwnerAccount(profile) ? '' : 'none';
    const activityNav = document.querySelector('#nav button[data-page="activityLog"]');
    if (activityNav) activityNav.style.display = ['admin','manager'].includes(profile.role) ? '' : 'none';
    const savedDocsNav = document.querySelector('#nav button[data-page="savedDocuments"]');
    if (savedDocsNav) {
      const canViewAllIdentityDocs = profile.user_id === IDENTITY_GRACE_APPROVER_USER_ID && profile.role === 'admin';
      savedDocsNav.style.display = canViewAllIdentityDocs ? '' : 'none';
      savedDocsNav.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!canViewAllIdentityDocs) return;
        const launcher = document.getElementById('airIdentityLauncher');
        if (launcher) launcher.click();
      }, true);
    }
  }

  let pendingBackupRequestId = null;

  async function requestBackupApproval() {
    const profile = window.currentProfile;
    if (!profile?.active || isOwnerAccount(profile)) return alert('هذا الإجراء متاح للحسابات الأخرى النشطة فقط.');
    const status = $('backupRequestStatus');
    if (status) status.textContent = 'جارٍ إرسال طلب الموافقة إلى المدير الأساسي...';
    const existing = await client.from('backup_access_requests').select('id,status').eq('workspace_id',profile.workspace_id).eq('requester_id',profile.user_id).eq('status','pending').order('requested_at',{ascending:false}).limit(1).maybeSingle();
    if (existing.error) { if(status) status.textContent='تعذر التحقق من الطلبات السابقة. حاول مرة أخرى.'; return; }
    const approved = await client.from('backup_access_requests').select('id,status').eq('workspace_id',profile.workspace_id).eq('requester_id',profile.user_id).eq('status','approved').gt('expires_at',new Date().toISOString()).order('requested_at',{ascending:false}).limit(1).maybeSingle();
    if (approved.error) { if(status) status.textContent='تعذر التحقق من الموافقات السابقة. حاول مرة أخرى.'; return; }
    if (approved.data) { pendingBackupRequestId=approved.data.id; await refreshBackupApprovalStatus(); return; }
    if (existing.data) {
      pendingBackupRequestId = existing.data.id;
      if(status) status.textContent='لديك طلب سابق ينتظر موافقة المدير الأساسي.';
      await refreshBackupApprovalStatus();
      return;
    }
    const created = await client.from('backup_access_requests').insert({workspace_id:profile.workspace_id,requester_id:profile.user_id,status:'pending'}).select('id').single();
    if (created.error) { if(status) status.textContent='تعذر إرسال الطلب. تحقق من اتصال النظام ثم أعد المحاولة.'; return; }
    pendingBackupRequestId = created.data.id;
    if(status) status.textContent='تم إرسال طلبك إلى حساب المدير الأساسي. لن يبدأ التنزيل قبل موافقته.';
  }

  async function refreshBackupApprovalStatus() {
    const profile = window.currentProfile;
    if (!profile?.active || isOwnerAccount(profile)) return;
    const status = $('backupRequestStatus');
    const button = $('backupApprovedDownloadButton');
    const result = await client.from('backup_access_requests').select('id,status,expires_at').eq('workspace_id',profile.workspace_id).eq('requester_id',profile.user_id).in('status',['pending','approved']).order('requested_at',{ascending:false}).limit(1).maybeSingle();
    if (result.error) { if(status) status.textContent='تعذر تحديث حالة الموافقة. تحقق من الاتصال.'; return; }
    if (!result.data) { pendingBackupRequestId=null; if(button) button.style.display='none'; if(status) status.textContent='لا يوجد طلب موافقة حالي. اضغط «طلب موافقة المدير على التنزيل».'; return; }
    pendingBackupRequestId=result.data.id;
    if (result.data.status === 'pending') {
      if(button) button.style.display='none';
      if(status) status.textContent='طلبك قيد المراجعة لدى المدير الأساسي.';
    } else if (new Date(result.data.expires_at).getTime() > Date.now()) {
      if(button) button.style.display='';
      if(status) status.textContent='تمت الموافقة. اضغط زر التنزيل الآن؛ الموافقة صالحة لخمس دقائق ولمرة واحدة.';
    } else {
      if(button) button.style.display='none';
      if(status) status.textContent='انتهت صلاحية الموافقة. أرسل طلبًا جديدًا.';
    }
  }

  async function downloadApprovedBackup() {
    if (!pendingBackupRequestId) return alert('لا يوجد طلب موافق عليه.');
    const completed = await window.backup(pendingBackupRequestId);
    if (!completed) return;
    pendingBackupRequestId = null;
    if ($('backupApprovedDownloadButton')) $('backupApprovedDownloadButton').style.display='none';
    if ($('backupRequestStatus')) $('backupRequestStatus').textContent='تم استهلاك الموافقة. لتنزيل نسخة أخرى يلزم طلب جديد.';
  }

  async function renderBackupApprovalRequests() {
    const profile = window.currentProfile;
    const box = $('backupApprovalRequests');
    if (!box) return;
    if (!isOwnerAccount(profile) || profile?.role !== 'admin') { box.textContent='هذه البوابة متاحة لحساب المدير الأساسي فقط.'; return; }
    box.textContent='جارٍ تحميل الطلبات...';
    const requests = await client.from('backup_access_requests').select('id,requester_id,requested_at').eq('workspace_id',profile.workspace_id).eq('status','pending').order('requested_at',{ascending:true});
    if (requests.error) { box.textContent='تعذر تحميل الطلبات. تحقق من الاتصال.'; return; }
    if (!requests.data?.length) { box.textContent='لا توجد طلبات موافقة معلّقة حاليًا.'; return; }
    const ids=[...new Set(requests.data.map(x=>x.requester_id))];
    const people=await client.from('profiles').select('user_id,full_name,role').in('user_id',ids);
    const names=new Map((people.data||[]).map(x=>[x.user_id,x]));
    box.replaceChildren();
    for (const request of requests.data) {
      const person=names.get(request.requester_id);
      const row=document.createElement('div'); row.className='notice'; row.style.margin='10px 0';
      const info=document.createElement('p');
      info.textContent=(person?.full_name||'حساب غير معروف')+' — '+({admin:'مدير النظام',manager:'مدير',employee:'مدير التسليمات',courier:'مندوب'}[person?.role]||'حساب')+' — '+new Date(request.requested_at).toLocaleString('ar-EG');
      const approve=document.createElement('button'); approve.type='button'; approve.className='primary'; approve.textContent='موافقة على تنزيل نسخة واحدة'; approve.addEventListener('click',()=>reviewBackupRequest(request.id,'approved'));
      const reject=document.createElement('button'); reject.type='button'; reject.className='secondary'; reject.textContent='رفض الطلب'; reject.style.marginInlineStart='8px'; reject.addEventListener('click',()=>reviewBackupRequest(request.id,'rejected'));
      row.append(info,approve,reject); box.append(row);
    }
  }

  async function reviewBackupRequest(id, decision) {
    const profile=window.currentProfile;
    if (!isOwnerAccount(profile) || profile?.role !== 'admin' || !['approved','rejected'].includes(decision)) return alert('اعتماد الطلب متاح لحساب المدير الأساسي فقط.');
    const now=new Date().toISOString();
    const result=await client.from('backup_access_requests').update({status:decision,reviewed_by:profile.user_id,reviewed_at:now,expires_at:decision==='approved'?new Date(Date.now()+5*60*1000).toISOString():null}).eq('id',id).eq('workspace_id',profile.workspace_id).eq('status','pending').select('id').maybeSingle();
    if (result.error || !result.data) { alert('تعذر حفظ القرار؛ ربما تمت مراجعة الطلب بالفعل.'); return; }
    await renderBackupApprovalRequests();
    alert(decision==='approved'?'تمت الموافقة. يستطيع صاحب الطلب الآن تنزيل نسخة واحدة خلال خمس دقائق.':'تم رفض طلب تنزيل النسخة الاحتياطية.');
  }

  async function consumeBackupApproval(id) {
    const profile=window.currentProfile;
    if (!profile?.active || isOwnerAccount(profile)) return false;
    const now=new Date().toISOString();
    const result=await client.from('backup_access_requests').update({status:'consumed',downloaded_at:now}).eq('id',id).eq('workspace_id',profile.workspace_id).eq('requester_id',profile.user_id).eq('status','approved').gt('expires_at',now).select('id').maybeSingle();
    return !result.error && !!result.data;
  }

  window.requestBackupApproval=requestBackupApproval;
  window.refreshBackupApprovalStatus=refreshBackupApprovalStatus;
  window.downloadApprovedBackup=downloadApprovedBackup;
  window.renderBackupApprovalRequests=renderBackupApprovalRequests;
  window.reviewBackupRequest=reviewBackupRequest;
  window.consumeBackupApproval=consumeBackupApproval;

  async function syncDBToCloud() {
    const profile = window.currentProfile;
    if (!profile || !profile.active) return false;
    if (!navigator.onLine) {
      window.airSyncState = {...(window.airSyncState||{}),status:'offline',lastError:null};
      return false;
    }
    if (syncBusy) { syncPending = true; return false; }
    syncBusy = true;
    window.airSyncState = {...(window.airSyncState||{}),status:'syncing',lastError:null};
    try {
      for (const collection of keys) {
        if (collection === 'roles' && !isOwnerAccount(profile)) continue;
        if (profile.role === 'courier' && collection !== 'shipments') continue;
        const items = Array.isArray(db[collection]) ? db[collection] : [];
        const rows = [];
        for (const item of items) {
          if (profile.role === 'courier' && String(item.courier_user_id || '') !== String(profile.user_id)) continue;
          if (collection !== 'shipments') item._cloudId = item._cloudId || crypto.randomUUID();
          const record_id = collection === 'shipments' ? String(item.id || item._cloudId) : String(item._cloudId);
          if (!record_id || record_id === 'undefined') continue;
          item._createdBy = item._createdBy || profile.user_id;
          rows.push({
            workspace_id:profile.workspace_id, collection, record_id, data:item,
            created_by:item._createdBy, updated_by:profile.user_id
          });
        }
        if (profile.role === 'courier') {
          // Couriers may update only shipments already assigned to their authenticated user.
          // Use UPDATE (not UPSERT): the database intentionally grants couriers no INSERT
          // policy on app_records, and an UPSERT can fail even when its row already exists.
          for (const row of rows) {
            const result = await client.from('app_records')
              .update({data:row.data,updated_by:profile.user_id})
              .eq('workspace_id',profile.workspace_id)
              .eq('collection','shipments')
              .eq('record_id',row.record_id)
              .select('record_id');
            if (result.error) throw result.error;
            if (!result.data || result.data.length !== 1) {
              throw new Error('لم يتم حفظ تحديث الشحنة؛ تأكد أن الشحنة ما زالت مسندة إلى حسابك.');
            }
          }
        } else {
          for (let i=0;i<rows.length;i+=100) {
            const result = await client.from('app_records').upsert(rows.slice(i,i+100),{
              onConflict:'workspace_id,collection,record_id'
            });
            if (result.error) throw result.error;
          }
        }
      }
      if (isOwnerAccount(profile) && db.policies && Object.keys(db.policies).length) {
        const policyResult = await client.from('app_records').upsert({
          workspace_id:profile.workspace_id, collection:'policies', record_id:'settings',
          data:db.policies, created_by:profile.user_id, updated_by:profile.user_id
        }, {onConflict:'workspace_id,collection,record_id'});
        if (policyResult.error) throw policyResult.error;
      }
      while (deleteQueue.length) {
        const item = deleteQueue[0];
        const result = await client.from('app_records').delete()
          .eq('workspace_id',profile.workspace_id).eq('collection',item.collection).eq('record_id',item.record_id);
        if (result.error) throw result.error;
        deleteQueue.shift();
        persistDeleteQueue();
      }
      window.airSyncState = {...(window.airSyncState||{}),status:'success',lastSuccess:new Date().toISOString(),lastError:null};
      if (pendingAirPushBatch || pendingAirPushEvents.length) await flushAirPushEvents();
      return true;
    } catch (error) {
      window.airSyncState = {...(window.airSyncState||{}),status:'error',lastError:String(error?.message||error).slice(0,240)};
      console.error('Air Logistic cloud sync:',error);
      if (typeof toast === 'function') toast('تعذرت مزامنة بعض البيانات؛ راجع اتصال الإنترنت وصلاحيات الحساب.');
      return false;
    } finally {
      syncBusy = false;
      if (syncPending) {
        syncPending = false;
        clearTimeout(syncTimer);
        syncTimer = setTimeout(syncDBToCloud, 120);
      }
    }
  }

  async function loadCloudData() {
    const profile = window.currentProfile;
    const result = await client.from('app_records').select('collection,record_id,data,created_by')
      .eq('workspace_id',profile.workspace_id);
    if (result.error) throw result.error;
    const next = defaults();
    for (const row of (result.data || [])) {
      if (row.collection === 'policies') { next.policies = row.data || {}; continue; }
      if (!keys.includes(row.collection)) continue;
      const item = row.data || {};
      if (row.collection !== 'shipments') item._cloudId = item._cloudId || row.record_id;
      item._createdBy = item._createdBy || row.created_by || null;
      next[row.collection].push(item);
    }
    // Preserve a point-in-time recovery copy before reconciling local and cloud data.
    if (isOwnerAccount(profile) && oldSnapshot && typeof oldSnapshot === 'object') {
      try {
        if (!localStorage.getItem('air_logistic_recovery_v1')) {
          localStorage.setItem('air_logistic_recovery_v1', JSON.stringify({
            savedAt: new Date().toISOString(),
            sourceKey: 'air_logistic_full_v1',
            data: oldSnapshot
          }));
        }
      } catch (error) {
        console.warn('Air Logistic recovery archive:', error);
      }
    }

    const cloudRows = result.data || [];
    if (!cloudRows.length && isOwnerAccount(profile) && oldSnapshot) {
      // Empty cloud: retain the complete local snapshot and attempt a non-destructive upload.
      for (const key of keys) {
        if (Array.isArray(oldSnapshot[key])) next[key] = oldSnapshot[key].map(item => ({...item}));
      }
      if (oldSnapshot.policies && typeof oldSnapshot.policies === 'object') next.policies = {...oldSnapshot.policies};
      db = next;
      await syncDBToCloud();
    } else {
      // Existing cloud rows remain authoritative for matching IDs. Add local-only rows
      // so offline-created records are not silently discarded during first reconciliation.
      if (isOwnerAccount(profile) && oldSnapshot) {
        for (const key of keys) {
          if (!Array.isArray(oldSnapshot[key])) continue;
          const existing = new Set(next[key].map(item =>
            String(key === 'shipments' ? (item.id || item._cloudId || '') : (item._cloudId || ''))
          ));
          for (const raw of oldSnapshot[key]) {
            const item = raw && typeof raw === 'object' ? {...raw} : null;
            if (!item) continue;
            if (key !== 'shipments' && !item._cloudId) item._cloudId = crypto.randomUUID();
            const id = String(key === 'shipments' ? (item.id || item._cloudId || '') : (item._cloudId || ''));
            if (!id || existing.has(id)) continue;
            next[key].push(item);
            existing.add(id);
          }
        }
        const cloudHasPolicies = cloudRows.some(row => row.collection === 'policies');
        if (!cloudHasPolicies && oldSnapshot.policies && typeof oldSnapshot.policies === 'object') {
          next.policies = {...oldSnapshot.policies};
        }
      }
      db = next;
      // Re-upsert the reconciled set. The recovery archive is intentionally retained;
      // it is never deleted merely because the cloud contains one or more records.
      if (profile.role === 'admin' && oldSnapshot) await syncDBToCloud();
    }
    if (typeof render === 'function') render();
  }

  window.addEventListener('online',() => {
    if (!window.currentProfile?.active) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncDBToCloud,150);
  });
  document.addEventListener('visibilitychange',() => {
    if (document.hidden || !navigator.onLine || !window.currentProfile?.active) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncDBToCloud,250);
  });

  window.save = function() {
    // Keep a local recovery snapshot before attempting cloud sync.
    try {
      localStorage.setItem('air_logistic_full_v1', JSON.stringify(db));
    } catch (error) {
      console.warn('Air Logistic local recovery snapshot:', error);
      if (typeof toast === 'function') toast('تعذر حفظ نسخة محلية؛ تحقق من مساحة الهاتف.');
    }
    if (typeof render === 'function') render();
    if (!window.currentProfile?.active) return;
    if (!pendingAirPushEvents.length) window.queueAirPushEvent('تحديث بيانات النظام');
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncDBToCloud,350);
  };

  window.queueAirLogisticCloudDelete = function(collection,record_id) {
    deleteQueue.push({collection,record_id:String(record_id)});
    persistDeleteQueue();
  };
  window.deleteShip = function(id) {
    if (!['admin','manager'].includes(window.currentProfile?.role)) return alert('حذف الشحنات متاح لمدير النظام أو المدير فقط.');
    const key = decodeURIComponent(String(id));
    if (!confirm('هل تريد حذف الشحنة ' + key + '؟')) return;
    deleteQueue.push({collection:'shipments',record_id:key});
    persistDeleteQueue();
    if (typeof audit === 'function') audit('حذف شحنة',key);
    db.shipments = db.shipments.filter(x => String(x.id) !== key);
    save();
    if (typeof toast === 'function') toast('تم حذف الشحنة');
  };

  // Resolve the selected courier's authenticated account ID for RLS-safe shipment assignment.
  window.resolveAirCourierUserId = async function(fullName) {
    const profile = window.currentProfile;
    const name = String(fullName || '').trim();
    if (!profile?.active || !['admin','manager'].includes(profile.role)) {
      throw new Error('تعيين الشحنة لحساب مندوب يتطلب صلاحية المدير أو مدير النظام.');
    }
    if (!name) throw new Error('اختر اسم المندوب أولًا.');
    const result = await client.from('profiles').select('user_id')
      .eq('workspace_id',profile.workspace_id)
      .eq('full_name',name).eq('role','courier').eq('active',true)
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data?.user_id) {
      throw new Error('لا يوجد حساب مندوب نشط مطابق لهذا الاسم. تأكد من تسجيل حساب المندوب وتفعيله.');
    }
    return result.data.user_id;
  };

  async function renderAirOwnerGraceRequests() {
    const profile = window.currentProfile;
    const panel = $('airGraceOwnerPanel');
    const target = $('airGraceOwnerList');
    if (!panel || !target) return;
    const owner = profile?.active && profile.user_id === IDENTITY_GRACE_APPROVER_USER_ID && profile.role === 'admin';
    panel.style.display = owner ? 'block' : 'none';
    if (!owner) return;
    target.textContent = 'جارٍ تحميل طلبات المهلة...';
    const result = await client.from('identity_access_requests')
      .select('id,user_id,status,requested_at')
      .eq('workspace_id',profile.workspace_id)
      .eq('status','requested')
      .order('requested_at',{ascending:false})
      .limit(100);
    if (result.error) {
      target.textContent = 'تعذر تحميل طلبات المهلة. تحقق من الاتصال والصلاحيات.';
      console.error('Air Logistic grace requests:',result.error);
      return;
    }
    const requests = result.data || [];
    if (!requests.length) {
      target.innerHTML = '<p class="muted">لا توجد طلبات مهلة 15 يوم معلقة حاليًا.</p>';
      return;
    }
    const userIds = [...new Set(requests.map(item => item.user_id))];
    const people = await client.from('profiles').select('user_id,full_name')
      .eq('workspace_id',profile.workspace_id).in('user_id',userIds);
    if (people.error) {
      target.textContent = 'تم العثور على الطلبات، لكن تعذر تحميل أسماء أصحابها.';
      return;
    }
    const names = new Map((people.data || []).map(person => [person.user_id,person.full_name || 'حساب']));
    target.innerHTML = '<div class="tablewrap"><table><thead><tr><th>اسم المستخدم</th><th>تاريخ الطلب</th><th>الإجراء</th></tr></thead><tbody>' +
      requests.map(item => '<tr><td><b>' + esc(names.get(item.user_id) || 'حساب') + '</b></td><td>' +
        esc(new Date(item.requested_at).toLocaleString('ar-EG')) +
        '</td><td><div style="display:flex;gap:7px;flex-wrap:wrap"><button class="success" type="button" data-owner-grace-approve="' + esc(item.id) + '">موافقة 15 يوم</button><button type="button" data-owner-grace-reject="' + esc(item.id) + '" style="background:#fff0f0;color:#a83232;border:1px solid #dba5a5;border-radius:8px;padding:8px 12px">رفض</button></div></td></tr>'
      ).join('') + '</tbody></table></div>';
    target.querySelectorAll('[data-owner-grace-approve]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      await reviewIdentityGrace(button.dataset.ownerGraceApprove,'approved');
      await renderAirOwnerGraceRequests();
    }));
    target.querySelectorAll('[data-owner-grace-reject]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      await reviewIdentityGrace(button.dataset.ownerGraceReject,'rejected');
      await renderAirOwnerGraceRequests();
    }));
  }

  async function renderAccountRequests() {
    const pendingBox = $('pendingAccounts'), approvedBox = $('approvedAccounts');
    if (!pendingBox || !approvedBox) return;
    if (!isOwnerAccount(window.currentProfile)) {
      pendingBox.textContent = 'هذه الصفحة متاحة لحساب المالك فقط وبموافقته.';
      approvedBox.textContent = '';
      return;
    }
    const result = await client.from('profiles')
      .select('user_id,full_name,role,active,created_at')
      .eq('workspace_id',window.currentProfile.workspace_id)
      .order('created_at',{ascending:true});
    if (result.error) {
      pendingBox.textContent = 'تعذر تحميل حسابات مديري التسليمات.';
      approvedBox.textContent = '';
      return;
    }
    await renderAirOwnerGraceRequests();
    const users = result.data || [];
    const pending = users.filter(x => !x.active);
    const registered = users;
    const roleOptions = role => [
      ['admin','مدير النظام'],['manager','مدير'],['employee','مدير التسليمات'],['courier','مندوب']
    ].map(([value,label]) => '<option value="' + value + '"' + (role === value ? ' selected' : '') + '>' + label + '</option>').join('');
    pendingBox.innerHTML = pending.length
      ? '<div class="tablewrap"><table><thead><tr><th>اسم الحساب</th><th>الدور</th><th>تاريخ التسجيل</th><th>الإجراء</th></tr></thead><tbody>' +
        pending.map(x => '<tr><td>' + esc(x.full_name) + '</td><td><select id="pending-role-' + x.user_id + '">' + roleOptions(x.role) + '</select></td><td>' + new Date(x.created_at).toLocaleString('ar-EG') + '</td><td><button class="success" onclick="setAirEmployeeAccess(\'' + x.user_id + '\',true)">تفعيل الحساب</button></td></tr>').join('') +
        '</tbody></table></div>' : '<p class="muted">لا توجد طلبات حسابات معلقة.</p>';
    approvedBox.innerHTML = registered.length
      ? '<div class="tablewrap"><table><thead><tr><th>اسم مدير التسليمات / المدير</th><th>الدور الحالي</th><th>حالة التشغيل</th><th>حفظ التعديل</th></tr></thead><tbody>' +
        registered.map(x => '<tr><td>' + esc(x.full_name) + (x.user_id === window.currentProfile.user_id ? ' <b>(حسابك)</b>' : '') + '</td><td><select id="managed-role-' + x.user_id + '">' + roleOptions(x.role) + '</select></td><td><select id="managed-active-' + x.user_id + '"><option value="true"' + (x.active ? ' selected' : '') + '>تشغيل على النظام</option><option value="false"' + (!x.active ? ' selected' : '') + '>إيقاف / انقطاع</option></select></td><td><button class="primary" onclick="updateAirEmployeeProfile(\'' + x.user_id + '\')">حفظ</button></td></tr>').join('') +
        '</tbody></table></div>' : '<p class="muted">لا توجد حسابات مسجلة حتى الآن.</p>';
  }
  window.renderAccountRequests = renderAccountRequests;

  window.setAirEmployeeAccess = async function(userId,active) {
    if (!isOwnerAccount(window.currentProfile)) return alert('إدارة الحسابات محصورة بحساب المالك الخاص فقط.');
    if (userId === window.currentProfile.user_id && !active) return alert('لا يمكن إيقاف حساب المدير الذي تستخدمه حاليًا.');
    const role = $('pending-role-' + userId)?.value || 'employee';
    const result = await client.from('profiles').update({active,role})
      .eq('user_id',userId).eq('workspace_id',window.currentProfile.workspace_id);
    if (result.error) return alert('تعذر تحديث الحساب. تأكد من صلاحيات المدير.');
    await renderAccountRequests();
    if (typeof toast === 'function') toast(active ? 'تم تفعيل الحساب بالدور المحدد' : 'تم إيقاف الحساب');
  };

  window.updateAirEmployeeProfile = async function(userId) {
    if (!isOwnerAccount(window.currentProfile)) return alert('إدارة الحسابات محصورة بحساب المالك الخاص فقط.');
    if (userId === window.currentProfile.user_id) return alert('لا يمكن تعديل دور أو حالة حساب المدير الذي تستخدمه حاليًا من هذه الشاشة.');
    const role = $('managed-role-' + userId)?.value;
    const active = $('managed-active-' + userId)?.value === 'true';
    if (!['admin','manager','employee','courier'].includes(role)) return alert('الدور المحدد غير صحيح.');
    const result = await client.from('profiles').update({active,role})
      .eq('user_id',userId).eq('workspace_id',window.currentProfile.workspace_id);
    if (result.error) return alert('تعذر حفظ التعديلات. راجع اتصال الإنترنت وصلاحيات المدير.');
    await renderAccountRequests();
    if (typeof toast === 'function') toast('تم حفظ الدور وحالة التشغيل بنجاح');
  };

  function installPasswordVisibility() {
    ['loginPassword','signupPassword','signupConfirm'].forEach(id => {
      const input = $(id);
      if (!input || input.dataset.visibilityReady === '1') return;
      input.dataset.visibilityReady = '1';
      const toggle = document.createElement('label');
      toggle.style.cssText = 'display:flex;align-items:center;gap:8px;margin:6px 0 12px;font-size:13px;cursor:pointer;';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.style.cssText = 'width:16px;height:16px;';
      check.addEventListener('change', () => { input.type = check.checked ? 'text' : 'password'; });
      const caption = document.createElement('span');
      caption.textContent = 'إظهار كلمة المرور';
      toggle.append(check,caption);
      input.insertAdjacentElement('afterend',toggle);
    });
  }
  installPasswordVisibility();

  const airHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const airDate = value => { try { return new Date(value).toLocaleString('ar-EG',{dateStyle:'short',timeStyle:'short'}); } catch (_) { return ''; } };
  window.renderAirActivityLog = async function() {
    const target = $('airActivityTable');
    const status = $('airActivityStatus');
    if (!target) return;
    const profile = window.currentProfile;
    if (!profile?.active || !['admin','manager'].includes(profile.role)) {
      if (status) status.textContent = 'سجل العمليات متاح لمدير النظام والمدير فقط.';
      target.textContent = '';
      return;
    }
    if (status) status.textContent = 'جارٍ تحميل سجل العمليات الموثّق...';
    const [logsResult, profilesResult] = await Promise.all([
      client.from('activity_log')
        .select('id,actor_id,action,details,created_at')
        .eq('workspace_id',profile.workspace_id)
        .order('created_at',{ascending:false})
        .limit(100),
      client.from('profiles')
        .select('user_id,full_name,role')
        .eq('workspace_id',profile.workspace_id)
    ]);
    if (logsResult.error) {
      if (status) status.textContent = 'تعذر تحميل سجل العمليات. تحقق من الاتصال والصلاحيات.';
      target.textContent = '';
      return;
    }
    const names = new Map((profilesResult.data || []).map(x => [x.user_id,x.full_name || x.user_id]));
    const collectionNames = {
      shipments:'الشحنات',customers:'العملاء',drivers:'المناديب',vehicles:'السيارات',
      expenses:'المصروفات',transfers:'التحويلات',settlements:'التسويات',
      remits:'توريدات المناديب',agents:'الوكلاء',priceRules:'التسعير',
      ledger:'الحركة المالية',policies:'السياسات',roles:'الصلاحيات'
    };
    const actionNames = {record_insert:'إضافة سجل',record_update:'تعديل سجل',record_delete:'حذف سجل'};
    const rows = logsResult.data || [];
    target.innerHTML = rows.length
      ? '<div class="tablewrap"><table><thead><tr><th>التاريخ والوقت</th><th>المستخدم</th><th>العملية</th><th>القسم</th><th>رقم السجل</th><th>تفاصيل التغيير</th></tr></thead><tbody>' +
        rows.map(row => {
          const d = row.details || {};
          const changes = [];
          if (d.status_before !== d.status_after && (d.status_before || d.status_after)) {
            changes.push('الحالة: ' + (d.status_before || '—') + ' ← ' + (d.status_after || '—'));
          }
          if (d.agent_before !== d.agent_after && (d.agent_before || d.agent_after)) {
            changes.push('المندوب: ' + (d.agent_before || '—') + ' ← ' + (d.agent_after || '—'));
          }
          if (d.courier_user_id_before !== d.courier_user_id_after &&
              (d.courier_user_id_before || d.courier_user_id_after)) {
            changes.push('تم تحديث ربط حساب المندوب');
          }
          return '<tr><td>' + airHtml(airDate(row.created_at)) +
            '</td><td>' + airHtml(names.get(row.actor_id) || 'حساب غير معروف') +
            '</td><td>' + airHtml(actionNames[row.action] || row.action) +
            '</td><td>' + airHtml(collectionNames[d.collection] || d.collection || '—') +
            '</td><td>' + airHtml(d.shipment_id || d.record_id || '—') +
            '</td><td>' + airHtml(changes.join('؛ ') || 'تم تسجيل العملية') + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<p class="muted">لا توجد عمليات مسجلة بعد. سيظهر هنا كل تغيير جديد تلقائيًا.</p>';
    if (status) status.textContent = 'يعرض آخر ' + rows.length + ' عملية محفوظة مركزيًا وغير قابلة للتعديل من حسابات الموظفين.';
  };

  const airAlertPrefs = (() => {
    try { return Object.assign({sound:true,vibration:true},JSON.parse(localStorage.getItem('air_logistic_alert_prefs') || '{}')); }
    catch (_) { return {sound:true,vibration:true}; }
  })();
  let airAlertAudio = null;
  function saveAirAlertPrefs() {
    try { localStorage.setItem('air_logistic_alert_prefs',JSON.stringify(airAlertPrefs)); } catch (_) {}
  }
  function playAirAlert() {
    if (!airAlertPrefs.sound) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      airAlertAudio = airAlertAudio || new AudioContextClass();
      if (airAlertAudio.state === 'suspended') airAlertAudio.resume();
      const oscillator = airAlertAudio.createOscillator();
      const gain = airAlertAudio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880,airAlertAudio.currentTime);
      oscillator.frequency.setValueAtTime(660,airAlertAudio.currentTime + 0.13);
      gain.gain.setValueAtTime(0.0001,airAlertAudio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16,airAlertAudio.currentTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001,airAlertAudio.currentTime + 0.32);
      oscillator.connect(gain); gain.connect(airAlertAudio.destination);
      oscillator.start(); oscillator.stop(airAlertAudio.currentTime + 0.34);
    } catch (error) { console.warn('Air Logistic alert sound:',error); }
  }
  function updateAirAlertControls() {
    const sound = $('airAlertSound'), vibration = $('airAlertVibration'), permission = $('airAlertPermission');
    if (sound) sound.checked = !!airAlertPrefs.sound;
    if (vibration) vibration.checked = !!airAlertPrefs.vibration;
    if (permission) permission.textContent = ('Notification' in window && Notification.permission === 'granted')
      ? 'تنبيهات الهاتف مفعّلة' : ('Notification' in window && Notification.permission === 'denied')
        ? 'إذن التنبيهات مرفوض من إعدادات المتصفح' : 'فعّل تنبيهات الهاتف للسماح بظهورها خارج التطبيق';
  }
  window.enableAirNotificationAlerts = async function() {
    if (!('Notification' in window)) return alert('هذا المتصفح لا يدعم إشعارات الهاتف.');
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        airAlertAudio = airAlertAudio || new AudioContextClass();
        if (airAlertAudio.state === 'suspended') await airAlertAudio.resume();
      }
      const permission = await Notification.requestPermission();
      updateAirAlertControls();
      if (permission === 'granted') {
        const pushResult = await registerAirPushSubscription();
        let testSent = false;
        if (pushResult) {
          try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
              const test = await client.functions.invoke('air-logistic-push', {
                body:{test_self:true,endpoint:subscription.endpoint}
              });
              testSent = !test.error && Number(test.data?.sent || 0) === 1;
              if (!testSent) console.warn('Air Logistic test push delivery:',test.error || test.data);
            }
          } catch (error) { console.warn('Air Logistic test push:',error); }
        }
        if (navigator.vibrate && airAlertPrefs.vibration) navigator.vibrate([70,40,70]);
        const message = !pushResult
          ? 'تم السماح بالتنبيهات، لكن تعذر تسجيل إشعارات الخلفية. راجع الاتصال وإعدادات الخدمة.'
          : testSent
            ? 'تم تفعيل إشعارات الخلفية وإرسال إشعار اختبار لهذا الهاتف.'
            : 'تم تسجيل هذا الجهاز، لكن تعذر تأكيد إرسال إشعار الاختبار.';
        if (typeof toast === 'function') toast(message);
      } else {
        alert(permission === 'denied' ? 'إذن الإشعارات مرفوض. فعّله من إعدادات الموقع في Chrome.' : 'لم يتم منح إذن الإشعارات.');
      }
    } catch (error) { console.error(error); alert('تعذر تفعيل تنبيهات الهاتف على هذا الجهاز.'); }
  };
  function airBase64ToUint8Array(value) {
    const normalized = String(value || '').replace(/-/g,'+').replace(/_/g,'/');
    const raw = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  }
  async function registerAirPushSubscription() {
    const profile = window.currentProfile;
    if (!profile?.active || !profile.workspace_id || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    try {
      const sessionResult = await client.auth.getSession();
      if (sessionResult.error || !sessionResult.data.session) return false;
      const configResult = await client.functions.invoke('air-logistic-push', { method:'GET' });
      const publicKey = configResult.data?.publicKey;
      if (configResult.error || !publicKey) throw new Error('Push service configuration unavailable');
      const registration = await navigator.serviceWorker.ready;
      const applicationServerKey = airBase64ToUint8Array(publicKey);
      let subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const existingKey = subscription.options?.applicationServerKey;
        const existingBytes = existingKey ? new Uint8Array(existingKey) : null;
        const sameKey = !!existingBytes && existingBytes.length === applicationServerKey.length &&
          existingBytes.every((byte,index) => byte === applicationServerKey[index]);
        if (!sameKey) {
          const staleEndpoint = subscription.endpoint;
          await subscription.unsubscribe();
          // Remove this device's obsolete server-side token after a VAPID key rotation.
          const cleanup = await client.from('push_subscriptions').delete()
            .eq('workspace_id',profile.workspace_id)
            .eq('user_id',profile.user_id)
            .eq('endpoint',staleEndpoint);
          if (cleanup.error) console.warn('Air Logistic stale push subscription cleanup:',cleanup.error);
          subscription = null;
        }
      }
      if (!subscription) subscription = await registration.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Invalid browser subscription');
      const saved = await client.from('push_subscriptions').upsert({
        user_id:profile.user_id, workspace_id:profile.workspace_id,
        endpoint:json.endpoint, p256dh:json.keys.p256dh, auth_key:json.keys.auth,
        user_agent:navigator.userAgent, last_seen_at:new Date().toISOString()
      }, { onConflict:'endpoint' });
      if (saved.error) throw saved.error;
      return true;
    } catch (error) {
      console.warn('Air Logistic push subscription:',error);
      return false;
    }
  }
  window.registerAirPushSubscription = registerAirPushSubscription;

  function notifyAirIncoming(row) {
    playAirAlert();
    if (airAlertPrefs.vibration && navigator.vibrate) navigator.vibrate([90,45,90]);
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState === 'hidden') {
      const brandLogo = new URL('./icon.svg', window.location.href).href;
      const options = {body:String(row.body || ''),icon:brandLogo,image:brandLogo,tag:'air-logistic-'+row.id,renotify:false,vibrate:airAlertPrefs.vibration?[100,50,100]:[],data:{url:row.link || './'}};
      if (navigator.serviceWorker?.ready) navigator.serviceWorker.ready.then(reg => reg.showNotification(String(row.title || 'Air Logistic'),options)).catch(() => {});
      else try { new Notification(String(row.title || 'Air Logistic'),options); } catch (_) {}
    }
  }
  $('airAlertSound')?.addEventListener('change',event => { airAlertPrefs.sound = event.target.checked; saveAirAlertPrefs(); });
  $('airAlertVibration')?.addEventListener('change',event => { airAlertPrefs.vibration = event.target.checked; saveAirAlertPrefs(); });
  updateAirAlertControls();


  window.renderAirChat = async function() {
    const profile = window.currentProfile;
    const box = $('airChatMessages'), status = $('airChatStatus');
    if (!profile?.active || !box) return;
    if (status) status.textContent = 'جارٍ تحميل المحادثة...';
    const result = await client.from('chat_messages')
      .select('id,sender_id,message,created_at')
      .eq('workspace_id',profile.workspace_id).eq('room_key','general')
      .order('created_at',{ascending:true}).limit(150);
    if (result.error) {
      if (status) status.textContent = 'تعذر تحميل المحادثة. تحقق من اتصال الإنترنت وصلاحيات الحساب.';
      return;
    }
    const rows = result.data || [];
    const senderIds = [...new Set(rows.map(row => row.sender_id).filter(id => id !== profile.user_id))];
    let senderNames = {};
    if (senderIds.length && ['admin','manager'].includes(profile.role)) {
      const people = await client.from('profiles').select('user_id,full_name').in('user_id',senderIds);
      if (!people.error) senderNames = Object.fromEntries((people.data || []).map(person => [person.user_id,person.full_name]));
    }
    box.innerHTML = rows.length ? rows.map(row => {
      const mine = row.sender_id === profile.user_id;
      const who = mine ? 'أنت' : (senderNames[row.sender_id] || 'عضو بالفريق');
      return '<article class="air-chat-message'+(mine?' mine':'')+'"><div class="air-chat-meta"><b>'+who+'</b><time>'+airHtml(airDate(row.created_at))+'</time></div><div class="air-chat-text">'+airHtml(row.message)+'</div></article>';
    }).join('') : '<p class="muted">لا توجد رسائل بعد. ابدأ أول محادثة مع الفريق.</p>';
    if (status) status.textContent = rows.length ? 'آخر 150 رسالة في محادثة الفرع' : 'المحادثة جاهزة لاستقبال أول رسالة';
    box.scrollTop = box.scrollHeight;
  };

  window.sendAirChatMessage = async function(event) {
    event?.preventDefault();
    const profile = window.currentProfile, input = $('airChatInput');
    const message = input?.value.trim();
    if (!profile?.active || !message) return;
    if (message.length > 5000) return alert('الرسالة أطول من الحد المسموح.');
    const button = $('airChatForm')?.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    const result = await client.from('chat_messages').insert({
      workspace_id:profile.workspace_id, sender_id:profile.user_id, room_key:'general', message
    });
    if (button) button.disabled = false;
    if (result.error) return alert('تعذر إرسال الرسالة. تأكد من اتصال الإنترنت وصلاحيات الحساب.');
    input.value = '';
    await window.renderAirChat();
  };

  window.renderAirNotifications = async function() {
    const profile = window.currentProfile;
    const box = $('airNotificationList'), status = $('airNotificationStatus');
    const notificationPage = $('notifications');
    const canReviewGrace = profile?.user_id === IDENTITY_GRACE_APPROVER_USER_ID && profile?.role === 'admin';
    let gracePanel = document.getElementById('airGraceRequestsPanel');
    if (canReviewGrace && notificationPage) {
      if (!gracePanel) {
        gracePanel = document.createElement('section');
        gracePanel.id = 'airGraceRequestsPanel';
        gracePanel.className = 'panel';
        gracePanel.style.cssText = 'border:2px solid #d8a33b;background:#fffdf7;margin-bottom:14px';
        notificationPage.insertBefore(gracePanel, notificationPage.firstElementChild);
      }
      gracePanel.style.display = 'block';
      gracePanel.innerHTML = '<h2>طلبات مهلة 15 يوم — تحتاج موافقتك</h2><p class="muted">طلبات الموظفين التي تنتظر اعتمادك تظهر هنا مباشرة، دون الحاجة إلى فتح شاشة المستندات.</p><div id="airGraceRequestsList">جارٍ تحميل الطلبات...</div>';
      const pendingGrace = await client.from('identity_access_requests')
        .select('id,user_id,requested_at')
        .eq('workspace_id',profile.workspace_id)
        .eq('status','requested')
        .order('requested_at',{ascending:false})
        .limit(100);
      const list = document.getElementById('airGraceRequestsList');
      if (pendingGrace.error) {
        if (list) list.textContent = 'تعذر تحميل طلبات المهلة. تحقق من الاتصال والصلاحيات.';
      } else if (list) {
        const requests = pendingGrace.data || [];
        const ids = [...new Set(requests.map(request => request.user_id))];
        let names = new Map();
        if (ids.length) {
          const people = await client.from('profiles').select('user_id,full_name')
            .eq('workspace_id',profile.workspace_id).in('user_id',ids);
          if (!people.error) names = new Map((people.data || []).map(person => [person.user_id,person.full_name || 'حساب']));
        }
        list.innerHTML = requests.length ? requests.map(request =>
          '<article style="border:1px solid #e7d8b2;border-radius:10px;padding:11px;margin:8px 0;background:white"><b>' +
          identityEscape(names.get(request.user_id) || 'حساب') +
          '</b><div style="font-size:12px;color:#65758a;margin:4px 0">طلب مهلة 15 يوم · ' +
          identityEscape(new Date(request.requested_at).toLocaleString('ar-EG')) +
          '</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-air-grace-approve="' +
          identityEscape(request.id) +
          '" style="background:#176b46;color:#fff;border:0;border-radius:8px;padding:9px 13px">موافقة 15 يوم</button><button type="button" data-air-grace-reject="' +
          identityEscape(request.id) +
          '" style="background:#a83232;color:#fff;border:0;border-radius:8px;padding:9px 13px">رفض</button></div></article>'
        ).join('') : '<p class="muted">لا توجد طلبات مهلة معلقة حاليًا.</p>';
        list.querySelectorAll('[data-air-grace-approve]').forEach(button => button.addEventListener('click', async () => {
          button.disabled = true;
          await reviewIdentityGrace(button.dataset.airGraceApprove,'approved');
          await window.renderAirNotifications();
        }));
        list.querySelectorAll('[data-air-grace-reject]').forEach(button => button.addEventListener('click', async () => {
          button.disabled = true;
          await reviewIdentityGrace(button.dataset.airGraceReject,'rejected');
          await window.renderAirNotifications();
        }));
      }
    } else if (gracePanel) {
      gracePanel.style.display = 'none';
    }
    if (!profile?.active || !box) return;
    const canBroadcast = isOwnerAccount(profile) && profile.role === 'admin';
    $('airAnnouncementPanel')?.classList.toggle('hidden',!canBroadcast);
    if (status) status.textContent = 'جارٍ تحميل إشعارات حسابك...';
    const result = await client.from('notifications')
      .select('id,title,body,link,read_at,created_at')
      .eq('workspace_id',profile.workspace_id).eq('recipient_id',profile.user_id)
      .order('created_at',{ascending:false}).limit(100);
    if (result.error) {
      if (status) status.textContent = 'تعذر تحميل الإشعارات. تحقق من الاتصال والصلاحيات.';
      return;
    }
    const rows = result.data || [];
    const navButton = document.querySelector('#nav button[data-page="notifications"]');
    if (navButton && rows.every(x => !!x.read_at)) { navButton.dataset.hasUnread = 'false'; navButton.querySelector('.air-unread-dot')?.remove(); }
    const unread = rows.filter(x => !x.read_at).length;
    if (status) status.textContent = 'لديك '+unread+' إشعار غير مقروء من أصل '+rows.length;
    box.innerHTML = rows.length ? rows.map(row =>
      '<article class="air-notification'+(!row.read_at?' unread':'')+'"><div class="air-notification-head"><b>'+airHtml(row.title)+'</b><small>'+airHtml(airDate(row.created_at))+'</small></div><p>'+airHtml(row.body)+'</p>'+
      ((String(row.link || '').startsWith('https://') || String(row.link || '').startsWith('http://')) ? '<a href="'+airHtml(row.link)+'" target="_blank" rel="noopener noreferrer">فتح الرابط المرتبط</a>' : '')+
      (!row.read_at ? '<div class="actions"><button class="light" type="button" onclick="markAirNotificationRead(\''+row.id+'\')">تحديد كمقروء</button></div>' : '<small>تمت القراءة</small>')+
      '</article>'
    ).join('') : '<p class="muted">لا توجد إشعارات حتى الآن.</p>';
  };

  window.markAirNotificationRead = async function(id) {
    const profile = window.currentProfile;
    if (!profile?.active || !id) return;
    const result = await client.from('notifications')
      .update({read_at:new Date().toISOString()})
      .eq('id',id).eq('workspace_id',profile.workspace_id).eq('recipient_id',profile.user_id);
    if (result.error) return alert('تعذر تحديث حالة الإشعار.');
    await window.renderAirNotifications();
  };

  window.sendAirNotification = async function(event) {
    event?.preventDefault();
    const profile = window.currentProfile;
    if (!profile?.active || !isOwnerAccount(profile) || profile.role !== 'admin') return alert('إرسال التنبيه الجماعي متاح لحساب مالك النظام فقط.');
    const title = $('airAnnouncementTitle')?.value.trim();
    const body = $('airAnnouncementBody')?.value.trim();
    if (!title || !body) return alert('اكتب عنوان التنبيه ونصه.');
    const button = $('airAnnouncementForm')?.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    const members = await client.from('profiles').select('user_id')
      .eq('workspace_id',profile.workspace_id).eq('active',true);
    if (members.error) {
      if (button) button.disabled = false;
      return alert('تعذر تحميل قائمة أعضاء الفرع لإرسال التنبيه.');
    }
    const recipients = (members.data || []).filter(x => x.user_id !== profile.user_id);
    if (!recipients.length) {
      if (button) button.disabled = false;
      return alert('لا توجد حسابات أخرى نشطة في الفرع لإرسال التنبيه إليها.');
    }
    const rows = recipients.map(x => ({
      workspace_id:profile.workspace_id, recipient_id:x.user_id,
      title, body, payload:{kind:'team_announcement'}
    }));
    const result = await client.from('notifications').insert(rows);
    if (button) button.disabled = false;
    if (result.error) return alert('تعذر إرسال التنبيه. راجع صلاحيات المدير واتصال الإنترنت.');
    $('airAnnouncementForm').reset();
    alert('تم حفظ التنبيه إلى '+rows.length+' حساب نشط. وسيتم إرسال إشعارات الخلفية تلقائيًا إلى الأجهزة المسجلة.');
    await window.renderAirNotifications();
  };

  function subscribeRealtime() {
    if (realtimeChannel) client.removeChannel(realtimeChannel);
    const workspaceId = window.currentProfile.workspace_id;
    realtimeChannel = client.channel('air-logistic-' + workspaceId)
      .on('postgres_changes',{event:'*',schema:'public',table:'app_records',filter:'workspace_id=eq.' + workspaceId},payload => {
        const row = payload.new || payload.old;
        if (!row) return;
        if (row.collection === 'policies') {
          if (payload.eventType !== 'DELETE') db.policies = payload.new.data || {};
          else db.policies = {};
          if (typeof render === 'function') render();
          return;
        }
        if (!keys.includes(row.collection)) return;
        const collection = row.collection;
        if (!Array.isArray(db[collection])) db[collection] = [];
        const idx = db[collection].findIndex(x => collection === 'shipments'
          ? String(x.id) === String(row.record_id) : String(x._cloudId) === String(row.record_id));
        if (payload.eventType === 'DELETE') {
          if (idx >= 0) db[collection].splice(idx,1);
        } else if (payload.new && payload.new.data) {
          const item = payload.new.data;
          if (collection !== 'shipments') item._cloudId = item._cloudId || payload.new.record_id;
          if (idx >= 0) db[collection][idx] = item; else db[collection].push(item);
        }
        if (typeof render === 'function') render();
      })
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages',filter:'workspace_id=eq.' + workspaceId},payload => {
        if (document.getElementById('chat') && !document.getElementById('chat').classList.contains('hidden')) window.renderAirChat();
      })
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:'recipient_id=eq.' + window.currentProfile.user_id},payload => {
        if (payload.new) notifyAirIncoming(payload.new);
        const page = document.getElementById('notifications');
        if (page && !page.classList.contains('hidden')) window.renderAirNotifications();
        const navButton = document.querySelector('#nav button[data-page=\"notifications\"]');
        if (navButton) { navButton.dataset.hasUnread = 'true'; if (!navButton.querySelector('.air-unread-dot')) navButton.insertAdjacentHTML('beforeend','<span class="air-unread-dot">جديد</span>'); }
      }).subscribe();
  }


  // Private identity-document center. Files stay in a private Storage bucket;
  // owners can read their own files; only Abu Rizq's admin account can review all users' files.
  const IDENTITY_BUCKET = 'air-logistic-identity';
  // Only Abu Rizq's verified admin account is exempt from personal document submission.
  const IDENTITY_EXEMPT_USER_ID = '0e7fe9b5-bc54-403b-9884-ad1facf5efe0';
  const IDENTITY_GRACE_APPROVER_USER_ID = IDENTITY_EXEMPT_USER_ID;
  const IDENTITY_TYPES = [
    ['national_id_front','البطاقة الشخصية - الوجه الأمامي'],
    ['national_id_back','البطاقة الشخصية - الوجه الخلفي'],
    ['driving_license','رخصة القيادة']
  ];
  let identityPanelReady = false;
  const identityEscape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function ensureIdentityPanel() {
    if (!window.currentProfile?.active) return;
    if (identityPanelReady) {
      const launcher = document.getElementById('airIdentityLauncher');
      if (launcher) launcher.style.display = 'block';
      renderIdentityPanel();
      return;
    }
    identityPanelReady = true;
    const panel = document.createElement('section');
    panel.id = 'airIdentityPanel';
    panel.style.cssText = 'position:fixed;z-index:9998;inset:0;width:100vw;height:100vh;height:100dvh;max-height:none;overflow:auto;box-sizing:border-box;background:#f4f7fb;color:#172b45;border:0;border-radius:0;box-shadow:none;padding:clamp(16px,4vw,34px);display:none;font:15px/1.7 system-ui,sans-serif;direction:rtl;';
    panel.innerHTML = '<div style="max-width:760px;margin:0 auto"><div style="display:flex;align-items:center;gap:8px"><b style="font-size:22px">استكمال أوراق حساب Air Logistic</b></div><p id="airIdentityIntro" style="color:#53657a;margin:8px 0">قبل استخدام النظام، ارفع صورة البطاقة الشخصية (الوجهين) ورخصة القيادة. لو مستند مش معاك اضغط زر «مش معايا» لطلب مهلة من المدير.</p><div id="airIdentityOwn"></div><div id="airIdentityGrace" style="border:1px solid #dce6f0;border-radius:11px;padding:10px;margin-top:10px;background:#f7f9fc"><b>المستندات مش جاهزة؟</b><p id="airIdentityGraceStatus" style="margin:5px 0;color:#53657a">اطلب مهلة تشغيل مؤقتة لمدة 15 يومًا بعد موافقة الإدارة.</p><button type="button" id="airIdentityGraceRequest" style="background:#245b91;color:white;border:0;border-radius:8px;padding:9px 12px">طلب مهلة تشغيل 15 يوم</button></div><button type="button" id="airIdentityDone" style="display:none;background:#176b46;color:white;border:0;border-radius:8px;padding:10px 18px;margin-top:12px;font-weight:700">موافق</button><hr style="border:0;border-top:1px solid #e5ebf2;margin:12px 0"><div id="airIdentityReview" style="display:none"><b>مراجعة المستندات وطلبات المهلة</b><div id="airIdentityReviewList" style="margin-top:8px"></div></div><p id="airIdentityMessage" role="status" style="margin:8px 0;color:#176b46"></p></div>';
    document.body.appendChild(panel);
    const launcher = document.createElement('button');
    launcher.id = 'airIdentityLauncher';
    launcher.type = 'button';
    launcher.textContent = '📄 أوراق الحساب';
    launcher.style.cssText = 'position:fixed;z-index:9997;right:14px;bottom:14px;border:0;border-radius:999px;padding:12px 16px;background:#102746;color:white;box-shadow:0 5px 20px #10274644;font-weight:700;cursor:pointer;';
    document.body.appendChild(launcher);
    launcher.addEventListener('click', async () => { panel.style.display='block'; launcher.style.display='none'; await renderIdentityPanel(); });
    panel.querySelector('#airIdentityDone').addEventListener('click', () => { panel.style.display='none'; launcher.style.display='block'; });
    renderIdentityPanel();
  }
  async function renderIdentityPanel() {
    const profile = window.currentProfile;
    const own = document.getElementById('airIdentityOwn');
    const review = document.getElementById('airIdentityReview');
    const reviewList = document.getElementById('airIdentityReviewList');
    const message = document.getElementById('airIdentityMessage');
    if (!profile?.active || !own) return;
    const isExemptAdmin = profile.user_id === IDENTITY_EXEMPT_USER_ID;
    const required = IDENTITY_TYPES;
    const ownWrap = document.getElementById('airIdentityOwn');
    const graceWrap = document.getElementById('airIdentityGrace');
    const doneButton = document.getElementById('airIdentityDone');
    if (ownWrap) ownWrap.style.display = isExemptAdmin ? 'none' : 'block';
    if (graceWrap) graceWrap.style.display = isExemptAdmin ? 'none' : 'block';
    const mineResult = await client.from('identity_documents')
      .select('id,document_type,storage_path,status,rejection_reason,created_at')
      .eq('user_id',profile.user_id).order('created_at',{ascending:false});
    if (mineResult.error) { own.textContent='تعذر تحميل أوراقك. تحقق من الاتصال.'; return; }
    const mine = mineResult.data || [];
    const graceResult = await client.from('identity_access_requests').select('id,status,expires_at,rejection_reason')
      .eq('user_id',profile.user_id).order('requested_at',{ascending:false}).limit(1);
    const grace = graceResult.data?.[0];
    const graceStatus = document.getElementById('airIdentityGraceStatus');
    const graceButton = document.getElementById('airIdentityGraceRequest');
    if (graceStatus) graceStatus.textContent = grace
      ? (grace.status==='requested' ? 'طلبك قيد مراجعة الإدارة.'
        : grace.status==='approved' && new Date(grace.expires_at)>new Date() ? 'المهلة مفعّلة حتى '+new Date(grace.expires_at).toLocaleString('ar-EG')
        : grace.status==='rejected' ? 'تم رفض الطلب. '+identityEscape(grace.rejection_reason || '')
        : grace.status==='approved' ? 'انتهت مهلة التشغيل المؤقتة.' : 'يمكنك طلب مهلة جديدة.')
      : 'المستندات مش جاهزة؟ اطلب مهلة تشغيل مؤقتة لمدة 15 يومًا، بعد موافقة الإدارة.';
    if (graceButton) {
      graceButton.disabled = !!(grace && (grace.status==='requested' || (grace.status==='approved' && new Date(grace.expires_at)>new Date())));
      graceButton.textContent = grace?.status==='requested' ? 'الطلب قيد المراجعة' : grace?.status==='approved' && new Date(grace.expires_at)>new Date() ? 'المهلة مفعّلة' : 'طلب مهلة تشغيل 15 يوم';
      graceButton.onclick = requestIdentityGrace;
    }

    const allRequiredApproved = required.every(([type]) => mine.some(doc => doc.document_type === type && doc.status === 'approved'));
    const graceApproved = !!(grace && grace.status === 'approved' && new Date(grace.expires_at) > new Date());
    const canDismiss = allRequiredApproved || graceApproved;
    if (doneButton) {
      doneButton.style.display = !isExemptAdmin && canDismiss ? 'block' : 'none';
      doneButton.textContent = allRequiredApproved ? 'موافق - تم استكمال المستندات' : 'موافق - تم اعتماد مهلة الـ15 يوم';
    }
    if (!isExemptAdmin && !canDismiss) {
      const panel = document.getElementById('airIdentityPanel');
      const launcher = document.getElementById('airIdentityLauncher');
      if (panel) panel.style.display = 'block';
      if (launcher) launcher.style.display = 'none';
      const intro = document.getElementById('airIdentityIntro');
      if (intro) intro.textContent = 'مطلوب استكمال الأوراق الرسمية واعتمادها. يمكنك رفعها هنا دون مشاركة روابط عامة.';
    }
    const statusLabel = status => ({pending:'قيد المراجعة',approved:'مقبول',rejected:'مرفوض'})[status] || status;
    own.innerHTML = required.map(([type,label]) => {
      const docs = mine.filter(d => d.document_type === type);
      const latest = docs[0];
      const inputId = 'airIdentityFile_' + type;
      return '<div style="border:1px solid #e2e9f1;border-radius:11px;padding:10px;margin:8px 0"><div style="font-weight:700">'+label+'</div><div style="font-size:12px;color:#53657a;margin:3px 0">'+(latest ? 'الحالة: '+statusLabel(latest.status) : 'لم يتم رفع المستند بعد')+(latest?.rejection_reason ? ' · السبب: '+identityEscape(latest.rejection_reason) : '')+'</div>'+(latest?.status==='approved' ? '' : '<input id="'+inputId+'" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style="display:block;width:100%;margin:7px 0"><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-upload-type="'+type+'" style="background:#176b46;color:white;border:0;border-radius:8px;padding:9px 13px">رفع المستند</button><button type="button" data-no-document="'+type+'" style="background:#fff;color:#245b91;border:1px solid #9bb4cf;border-radius:8px;padding:9px 13px">مش معايا المستند</button></div>')+'</div>';
    }).join('');
    own.querySelectorAll('[data-upload-type]').forEach(button => button.addEventListener('click', () => uploadIdentityDocument(button.dataset.uploadType)));
    own.querySelectorAll('[data-no-document]').forEach(button => button.addEventListener('click', () => requestIdentityGrace()));
    const canReview = profile.user_id === IDENTITY_GRACE_APPROVER_USER_ID && profile.role === 'admin';
    if (review) review.style.display = canReview ? 'block' : 'none';
    if (canReview && reviewList) {
      const allResult = await client.from('identity_documents')
        .select('id,user_id,document_type,storage_path,status,rejection_reason,created_at')
        .eq('workspace_id',profile.workspace_id).order('created_at',{ascending:false}).limit(100);
      if (allResult.error) { reviewList.textContent='تعذر تحميل قائمة المراجعة.'; return; }
      const graceReviewResult = await client.from('identity_access_requests').select('id,user_id,status,requested_at,expires_at,rejection_reason').eq('workspace_id',profile.workspace_id).order('requested_at',{ascending:false}).limit(100);
      const profilesResult = await client.from('profiles').select('user_id,full_name,role').eq('workspace_id',profile.workspace_id);
      const names = new Map((profilesResult.data || []).map(x => [x.user_id,x.full_name || 'حساب']));
      const labels = new Map(IDENTITY_TYPES);
      const canApproveGrace = profile.user_id === IDENTITY_GRACE_APPROVER_USER_ID;
      const graceHtml = (graceReviewResult.data || []).map(req =>
        '<article style="border:1px solid #dce6f0;border-radius:10px;padding:9px;margin:8px 0"><b>'+identityEscape(names.get(req.user_id)||'حساب')+'</b><div>طلب مهلة 15 يوم · '+(req.status==='requested'?'بانتظار موافقة مدير النظام':req.status==='approved'?'تمت الموافقة':'مرفوض')+(req.expires_at?' · حتى '+new Date(req.expires_at).toLocaleString('ar-EG'):'')+'</div>'+(req.status==='requested' && canApproveGrace?'<button type="button" data-grace-approve="'+req.id+'" style="background:#176b46;color:white;border:0;border-radius:7px;padding:7px 10px;margin:5px">موافقة 15 يوم</button><button type="button" data-grace-reject="'+req.id+'" style="background:#a83232;color:white;border:0;border-radius:7px;padding:7px 10px">رفض</button>':req.status==='requested'?'<small>قرار المهلة متاح لحساب مدير النظام المعتمد فقط.</small>':'')+'</article>'
      ).join('');

      reviewList.innerHTML = graceHtml + ((allResult.data || []).length ? allResult.data.map(doc =>
        '<article style="border:1px solid #e2e9f1;border-radius:10px;padding:9px;margin:8px 0"><b>'+identityEscape(names.get(doc.user_id) || 'حساب')+'</b><div>'+identityEscape(labels.get(doc.document_type) || doc.document_type)+' · '+statusLabel(doc.status)+'</div><div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:7px"><button type="button" data-open-doc="'+doc.id+'" style="border:0;border-radius:7px;padding:7px 10px">عرض آمن</button>'+(doc.status==='pending' ? '<button type="button" data-approve-doc="'+doc.id+'" style="background:#176b46;color:#fff;border:0;border-radius:7px;padding:7px 10px">اعتماد</button><button type="button" data-reject-doc="'+doc.id+'" style="background:#a83232;color:#fff;border:0;border-radius:7px;padding:7px 10px">رفض</button>' : '')+(doc.rejection_reason ? '<div style="font-size:12px">سبب الرفض: '+identityEscape(doc.rejection_reason)+'</div>' : '')+'</div></article>'
      ).join('') : '<p style="color:#53657a">لا توجد مستندات مرفوعة حتى الآن.</p>');
      reviewList.querySelectorAll('[data-grace-approve]').forEach(b => b.addEventListener('click', () => reviewIdentityGrace(b.dataset.graceApprove,'approved')));
      reviewList.querySelectorAll('[data-grace-reject]').forEach(b => b.addEventListener('click', () => reviewIdentityGrace(b.dataset.graceReject,'rejected')));
      reviewList.querySelectorAll('[data-open-doc]').forEach(b => b.addEventListener('click', () => openIdentityDocument((allResult.data || []).find(d => d.id===b.dataset.openDoc))));
      reviewList.querySelectorAll('[data-approve-doc]').forEach(b => b.addEventListener('click', () => reviewIdentityDocument(b.dataset.approveDoc,'approved')));
      reviewList.querySelectorAll('[data-reject-doc]').forEach(b => b.addEventListener('click', () => reviewIdentityDocument(b.dataset.rejectDoc,'rejected')));
    }
    if (message) message.textContent = '';
  }
  async function requestIdentityGrace() {
    const profile=window.currentProfile, message=document.getElementById('airIdentityMessage');
    if(!profile?.active || profile.user_id === IDENTITY_EXEMPT_USER_ID) return;
    const old=await client.from('identity_access_requests').select('id,status,expires_at')
      .eq('user_id',profile.user_id).order('requested_at',{ascending:false}).limit(1);
    const req=old.data?.[0];
    if(req && (req.status==='requested' || (req.status==='approved' && new Date(req.expires_at)>new Date()))) {
      if(message) message.textContent='لديك طلب قائم أو مهلة سارية بالفعل.'; return;
    }
    const saved=await client.from('identity_access_requests').insert({workspace_id:profile.workspace_id,user_id:profile.user_id,status:'requested'});
    if(saved.error) { if(message) message.textContent='تعذر إرسال طلب المهلة. حاول مرة أخرى.'; return; }
    if(message) message.textContent='تم إرسال طلب مهلة 15 يومًا للإدارة للموافقة.';
    await renderIdentityPanel();
  }
  async function reviewIdentityGrace(id,status) {
    const profile=window.currentProfile;
    if(!['admin','manager'].includes(profile?.role) || profile.user_id !== IDENTITY_GRACE_APPROVER_USER_ID) return alert('اعتماد مهلة الـ15 يوم متاح لحساب أبو رزق الإداري فقط.');
    let reason=null;
    if(status==='rejected') { reason=window.prompt('اكتب سبب رفض طلب المهلة:'); if(!reason?.trim()) return; }
    const now=new Date();
    const result=await client.from('identity_access_requests').update({
      status,reviewer_id:profile.user_id,reviewed_at:now.toISOString(),
      expires_at:status==='approved'?new Date(now.getTime()+15*86400000).toISOString():null,
      rejection_reason:status==='rejected'?reason.trim().slice(0,500):null
    }).eq('id',id).eq('workspace_id',profile.workspace_id).eq('status','requested');
    if(result.error) return alert('تعذر حفظ قرار المهلة.');
    await renderIdentityPanel();
  }

  async function uploadIdentityDocument(type) {
    const profile = window.currentProfile;
    const input = document.getElementById('airIdentityFile_' + type);
    const file = input?.files?.[0];
    const message = document.getElementById('airIdentityMessage');
    if (!profile?.active || !file) { if (message) message.textContent='اختر صورة أو ملف PDF أولًا.'; return; }
    const allowed = ['image/jpeg','image/png','image/webp','application/pdf'];
    if (!allowed.includes(file.type) || file.size > 10*1024*1024) { if (message) message.textContent='الصيغ المسموحة JPG وPNG وWEBP وPDF، وبحد أقصى 10 ميجابايت.'; return; }
    
    if (message) message.textContent='جارٍ رفع المستند بشكل آمن...';
    const ext = ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'})[file.type];
    const path = profile.workspace_id+'/'+profile.user_id+'/'+type+'/'+crypto.randomUUID()+'.'+ext;
    const uploaded = await client.storage.from(IDENTITY_BUCKET).upload(path,file,{contentType:file.type,upsert:false});
    if (uploaded.error) { if (message) message.textContent='تعذر رفع المستند. '+uploaded.error.message; return; }
    const saved = await client.from('identity_documents').insert({
      workspace_id:profile.workspace_id,user_id:profile.user_id,document_type:type,storage_path:path
    });
    if (saved.error) { if (message) message.textContent='تم رفع الملف لكن تعذر تسجيله للمراجعة. تواصل مع مدير النظام.'; return; }
    if (message) message.textContent='تم رفع المستند وإرساله للمراجعة.';
    await renderIdentityPanel();
  }
  async function openIdentityDocument(doc) {
    if (!doc) return;
    const result = await client.storage.from(IDENTITY_BUCKET).createSignedUrl(doc.storage_path,60);
    if (result.error) return alert('تعذر فتح المستند. تحقق من صلاحية الاطلاع.');
    window.open(result.data.signedUrl,'_blank','noopener,noreferrer');
  }
  async function reviewIdentityDocument(id,status) {
    const profile = window.currentProfile;
    if (profile?.user_id !== IDENTITY_GRACE_APPROVER_USER_ID || profile?.role !== 'admin') return alert('الاطلاع ومراجعة المستندات متاحان لحساب أبو رزق فقط.');
    let reason = null;
    if (status === 'rejected') {
      reason = window.prompt('اكتب سبب رفض المستند:');
      if (!reason || !reason.trim()) return;
    }
    const result = await client.from('identity_documents').update({
      status,reviewer_id:profile.user_id,reviewed_at:new Date().toISOString(),
      rejection_reason:status==='rejected' ? reason.trim().slice(0,500) : null
    }).eq('id',id).eq('workspace_id',profile.workspace_id);
    if (result.error) return alert('تعذر حفظ قرار المراجعة. تحقق من الصلاحيات.');
    await renderIdentityPanel();
  }

  async function activateSession(session) {
    if (!session || !session.user) {
      window.currentProfile = null; activeAuthUser = null; lockApp(); return;
    }
    try {
      const profile = await readProfile(session.user);
      if (!profile.active) {
        window.currentProfile = profile;
        lockApp();
        say('تم التحقق من بريدك. طلب الحساب ينتظر موافقة مدير النظام؛ لن تظهر لك أي شحنات قبل الاعتماد.');
        return;
      }
      window.currentProfile = profile;
      activeAuthUser = {id:session.user.id,username:session.user.email,fullName:profile.full_name,role:roleName(profile.role)};
      await loadCloudData();
      setAuthBar(profile,session.user.email);
      unlockApp();
      // Re-register this signed-in device silently when the user has already granted
      // notification permission. First-time permission still requires an explicit tap.
      if ('Notification' in window && Notification.permission === 'granted') {
        window.registerAirPushSubscription?.().then(ok => {
          if (!ok) console.warn('Air Logistic: background push registration will retry on the next app open.');
        }).catch(error => console.warn('Air Logistic background push registration:',error));
      }
      if (isOwnerAccount(profile) && profile.role === 'admin') renderBackupApprovalRequests();
      else refreshBackupApprovalStatus();
      ensureIdentityPanel();
      subscribeRealtime();
      window.renderAirNotifications();
      window.dispatchEvent(new Event('air-logistic-profile-ready'));
      if (profile.role === 'admin') renderAccountRequests();
    } catch (error) {
      console.error(error); lockApp();
      say('تعذر تحميل الصلاحيات أو بيانات الفرع. لم يتم فتح لوحة التحكم.',true);
    }
  }

  client.auth.onAuthStateChange((event,session) => setTimeout(() => {
    if (event === 'PASSWORD_RECOVERY') {
      lockApp();
      showMode('newPassword');
      say('تم التحقق من رابط الاستعادة. أدخل كلمة المرور الجديدة لتحديث حسابك.');
      return;
    }
    activateSession(session);
  },0));
  (async () => {
    lockApp(); showMode('login');
    const result = await client.auth.getSession();
    if (result.error) return say('تعذر التحقق من جلسة الدخول. أعد تحميل الصفحة.',true);
    await activateSession(result.data.session);
  })();
})();