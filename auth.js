/* Air Logistic secure employee access + shared cloud data */
(() => {
  'use strict';
  const CFG = {
    url: 'https://jynzwuamihnwbbnvqlqw.supabase.co',
    key: 'sb_publishable_4LoEfXDeogMpZ18AfQtz_Q_2zjBcyKi'
  };
  const $ = id => document.getElementById(id);
  const APP_REDIRECT = 'https://karimkago01-ship-it.github.io/Air-Logistic/';
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
  activeAuthUser = null;
  let syncTimer = null, realtimeChannel = null, syncBusy = false, syncPending = false;
  const deleteQueue = [];

  function lockApp() { document.body.classList.add('auth-locked'); $('authGate')?.classList.remove('hidden'); }
  function unlockApp() { document.body.classList.remove('auth-locked'); $('authGate')?.classList.add('hidden'); }
  function roleName(role) {
    return ({admin:'مدير النظام',manager:'مدير',employee:'مدير التسليمات',courier:'مندوب'})[role] || 'مستخدم';
  }
  function showMode(mode) {
    $('loginForm')?.classList.toggle('hidden', mode !== 'login');
    $('signupForm')?.classList.toggle('hidden', mode !== 'signup');
    $('resetForm')?.classList.toggle('hidden', mode !== 'reset');
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

  async function readProfile(user) {
    const result = await client.from('profiles')
      .select('user_id,workspace_id,full_name,role,active,created_at')
      .eq('user_id',user.id).maybeSingle();
    if (result.error || !result.data) throw new Error('لم يتم العثور على ملف صلاحيات الحساب.');
    return result.data;
  }

  function setAuthBar(profile,email) {
    const bar = $('authBar'); if (!bar) return;
    bar.innerHTML = '<span>مرحبًا، <b>' + esc(profile.full_name) + '</b> · ' + roleName(profile.role) + ' · ' + esc(email || '') + '</span><button type="button" id="secureSignOut">تسجيل خروج آمن</button>';
    $('secureSignOut')?.addEventListener('click',async () => {
      await client.auth.signOut({scope:'local'});
      window.currentProfile = null; activeAuthUser = null;
      if (realtimeChannel) { await client.removeChannel(realtimeChannel); realtimeChannel = null; }
      lockApp(); say('تم تسجيل الخروج بأمان.');
    });
    const nav = document.querySelector('#nav button[data-page="accountRequests"]');
    if (nav) nav.style.display = profile.role === 'admin' ? '' : 'none';
  }

  async function syncDBToCloud() {
    const profile = window.currentProfile;
    if (!profile || !profile.active) return false;
    if (syncBusy) { syncPending = true; return false; }
    syncBusy = true;
    try {
      for (const collection of keys) {
        if (profile.role === 'courier' && collection !== 'shipments') continue;
        const items = Array.isArray(db[collection]) ? db[collection] : [];
        const rows = [];
        for (const item of items) {
          if (profile.role === 'courier' && item.agent !== profile.full_name) continue;
          if (collection !== 'shipments') item._cloudId = item._cloudId || crypto.randomUUID();
          const record_id = collection === 'shipments' ? String(item.id || item._cloudId) : String(item._cloudId);
          if (!record_id || record_id === 'undefined') continue;
          item._createdBy = item._createdBy || profile.user_id;
          rows.push({
            workspace_id:profile.workspace_id, collection, record_id, data:item,
            created_by:item._createdBy, updated_by:profile.user_id
          });
        }
        for (let i=0;i<rows.length;i+=100) {
          const result = await client.from('app_records').upsert(rows.slice(i,i+100),{
            onConflict:'workspace_id,collection,record_id'
          });
          if (result.error) throw result.error;
        }
      }
      if (profile.role !== 'courier' && db.policies && Object.keys(db.policies).length) {
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
      }
      return true;
    } catch (error) {
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
    const pageSize = 500;
    const cloudRows = [];
    for (let offset = 0; ; offset += pageSize) {
      const result = await client.from('app_records')
        .select('collection,record_id,data,created_by')
        .eq('workspace_id',profile.workspace_id)
        .order('id',{ascending:true})
        .range(offset,offset + pageSize - 1);
      if (result.error) throw result.error;
      const batch = result.data || [];
      cloudRows.push(...batch);
      if (batch.length < pageSize) break;
    }

    const next = defaults();
    const cloudIds = Object.fromEntries(keys.map(key => [key,new Set()]));
    let cloudHasPolicies = false;
    for (const row of cloudRows) {
      if (row.collection === 'policies') {
        next.policies = row.data || {};
        cloudHasPolicies = true;
        continue;
      }
      if (!keys.includes(row.collection)) continue;
      const item = row.data && typeof row.data === 'object' ? {...row.data} : {};
      if (row.collection !== 'shipments') item._cloudId = item._cloudId || row.record_id;
      item._createdBy = item._createdBy || row.created_by || null;
      next[row.collection].push(item);
      cloudIds[row.collection].add(String(row.record_id));
    }

    // Preserve local recovery data. Only local records absent from the cloud are
    // queued for migration; cloud records are never overwritten during login.
    let recoveredCount = 0;
    let recoverPolicies = false;
    const recoveredIds = Object.fromEntries(keys.map(key => [key,[]]));
    if (profile.role === 'admin' && oldSnapshot && typeof oldSnapshot === 'object') {
      for (const collection of keys) {
        const localItems = Array.isArray(oldSnapshot[collection]) ? oldSnapshot[collection] : [];
        for (const source of localItems) {
          if (!source || typeof source !== 'object') continue;
          const item = {...source};
          if (collection !== 'shipments') item._cloudId = item._cloudId || crypto.randomUUID();
          const recordId = collection === 'shipments' ? String(item.id || '') : String(item._cloudId || '');
          if (!recordId || cloudIds[collection].has(recordId)) continue;
          next[collection].push(item);
          cloudIds[collection].add(recordId);
          recoveredCount++;
          recoveredIds[collection].push(recordId);
        }
      }
      if (!cloudHasPolicies && oldSnapshot.policies && typeof oldSnapshot.policies === 'object') {
        next.policies = oldSnapshot.policies;
        recoverPolicies = Object.keys(oldSnapshot.policies).length > 0;
      }
    }

    db = next;
    if (typeof render === 'function') render();

    if (profile.role === 'admin' && (recoveredCount > 0 || recoverPolicies)) {
      const migrated = await syncDBToCloud();
      if (!migrated) {
        if (typeof toast === 'function') toast('تم تحميل البيانات مع الاحتفاظ بنسختك المحلية؛ تعذرت مزامنة بعض السجلات.');
      } else {
        // Verify every recovered key before reporting migration success.
        let verified = true;
        for (const collection of keys) {
          const ids = recoveredIds[collection];
          for (let i = 0; i < ids.length; i += 100) {
            const batch = ids.slice(i,i + 100);
            const check = await client.from('app_records')
              .select('record_id')
              .eq('workspace_id',profile.workspace_id)
              .eq('collection',collection)
              .in('record_id',batch);
            if (check.error) { verified = false; break; }
            const found = new Set((check.data || []).map(row => String(row.record_id)));
            if (batch.some(id => !found.has(id))) { verified = false; break; }
          }
          if (!verified) break;
        }
        if (verified && recoverPolicies) {
          const check = await client.from('app_records')
            .select('record_id')
            .eq('workspace_id',profile.workspace_id)
            .eq('collection','policies')
            .eq('record_id','settings')
            .maybeSingle();
          verified = !check.error && !!check.data;
        }
        if (typeof toast === 'function') toast(verified
          ? 'تم التحقق من مزامنة السجلات المستعادة. نسخة الاسترداد المحلية محفوظة.'
          : 'اكتملت محاولة المزامنة لكن تعذر التحقق من كل السجلات؛ نسخة الاسترداد المحلية ما زالت محفوظة.');
      }
    }
  }

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
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncDBToCloud,350);
  };

  window.queueAirLogisticCloudDelete = function(collection,record_id) {
    deleteQueue.push({collection,record_id:String(record_id)});
  };
  window.deleteShip = function(id) {
    if (!['admin','manager'].includes(window.currentProfile?.role)) return alert('حذف الشحنات متاح لمدير النظام أو المدير فقط.');
    const key = decodeURIComponent(String(id));
    if (!confirm('هل تريد حذف الشحنة ' + key + '؟')) return;
    deleteQueue.push({collection:'shipments',record_id:key});
    if (typeof audit === 'function') audit('حذف شحنة',key);
    db.shipments = db.shipments.filter(x => String(x.id) !== key);
    save();
    if (typeof toast === 'function') toast('تم حذف الشحنة');
  };

  async function renderAccountRequests() {
    const pendingBox = $('pendingAccounts'), approvedBox = $('approvedAccounts');
    if (!pendingBox || !approvedBox) return;
    if (window.currentProfile?.role !== 'admin') {
      pendingBox.textContent = 'هذه الصفحة متاحة لمدير النظام فقط.';
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
    if (window.currentProfile?.role !== 'admin') return alert('مدير النظام فقط يمكنه إدارة الحسابات.');
    if (userId === window.currentProfile.user_id && !active) return alert('لا يمكن إيقاف حساب المدير الذي تستخدمه حاليًا.');
    const role = $('pending-role-' + userId)?.value || 'employee';
    const result = await client.from('profiles').update({active,role})
      .eq('user_id',userId).eq('workspace_id',window.currentProfile.workspace_id);
    if (result.error) return alert('تعذر تحديث الحساب. تأكد من صلاحيات المدير.');
    await renderAccountRequests();
    if (typeof toast === 'function') toast(active ? 'تم تفعيل الحساب بالدور المحدد' : 'تم إيقاف الحساب');
  };

  window.updateAirEmployeeProfile = async function(userId) {
    if (window.currentProfile?.role !== 'admin') return alert('مدير النظام فقط يمكنه إدارة الحسابات.');
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
      }).subscribe();
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
      subscribeRealtime();
      if (profile.role === 'admin') renderAccountRequests();
    } catch (error) {
      console.error(error); lockApp();
      say('تعذر تحميل الصلاحيات أو بيانات الفرع. لم يتم فتح لوحة التحكم.',true);
    }
  }

  client.auth.onAuthStateChange((_event,session) => setTimeout(() => activateSession(session),0));
  (async () => {
    lockApp(); showMode('login');
    const result = await client.auth.getSession();
    if (result.error) return say('تعذر التحقق من جلسة الدخول. أعد تحميل الصفحة.',true);
    await activateSession(result.data.session);
  })();
})();
