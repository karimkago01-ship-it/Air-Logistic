/* Air Logistic secure employee access + shared cloud data */
(() => {
  'use strict';
  const CFG = {
    url: 'https://jynzwuamihnwbbnvqlqw.supabase.co',
    key: 'sb_publishable_4LoEfXDeogMpZ18AfQtz_Q_2zjBcyKi'
  };
  const $ = id => document.getElementById(id);
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
  let syncTimer = null, realtimeChannel = null, syncBusy = false;
  const deleteQueue = [];

  function lockApp() { document.body.classList.add('auth-locked'); $('authGate')?.classList.remove('hidden'); }
  function unlockApp() { document.body.classList.remove('auth-locked'); $('authGate')?.classList.add('hidden'); }
  function roleName(role) {
    return ({admin:'مدير النظام',manager:'مدير',employee:'موظف',courier:'مندوب'})[role] || 'مستخدم';
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
      email, password, options:{data:{full_name},emailRedirectTo:location.origin + location.pathname}
    });
    button.disabled = false; button.textContent = 'إرسال طلب إنشاء الحساب';
    if (result.error) return say('تعذر إنشاء الحساب. راجع البريد أو جرّب بريدًا آخر.', true);
    if (result.data.session) say('تم إنشاء الحساب. جارٍ التحقق من صلاحية المدير...');
    else {
      say('تم إرسال الطلب. افتح رسالة تأكيد البريد الإلكتروني أولًا، ثم سجّل الدخول. أول حساب يصبح مدير النظام، وبعده يلزم اعتماد المدير.');
      showMode('login');
    }
  });

  $('resetForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const email = $('resetEmail').value.trim().toLowerCase();
    const result = await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin + location.pathname});
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
    if (!profile || !profile.active || syncBusy) return;
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
    } finally { syncBusy = false; }
  }

  async function loadCloudData() {
    const profile = window.currentProfile;
    const result = await client.from('app_records').select('collection,record_id,data,created_by')
      .eq('workspace_id',profile.workspace_id);
    if (result.error) throw result.error;
    const next = defaults();
    for (const row of (result.data || [])) {
      if (!keys.includes(row.collection)) continue;
      const item = row.data || {};
      if (row.collection !== 'shipments') item._cloudId = item._cloudId || row.record_id;
      item._createdBy = item._createdBy || row.created_by || null;
      next[row.collection].push(item);
    }
    if (!(result.data || []).length && profile.role === 'admin' && oldSnapshot) {
      for (const key of keys) if (Array.isArray(oldSnapshot[key])) next[key] = oldSnapshot[key];
      if (oldSnapshot.policies && typeof oldSnapshot.policies === 'object') next.policies = oldSnapshot.policies;
      db = next;
      const migrated = await syncDBToCloud();
      if (migrated) { try { localStorage.removeItem('air_logistic_full_v1'); } catch (_) {} }
    } else {
      db = next;
      if ((result.data || []).length && profile.role === 'admin') { try { localStorage.removeItem('air_logistic_full_v1'); } catch (_) {} }
    }
    if (typeof render === 'function') render();
  }

  window.save = function() {
    if (typeof render === 'function') render();
    if (!window.currentProfile?.active) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncDBToCloud,350);
  };

  window.queueAirLogisticCloudDelete = function(collection,record_id) {
    deleteQueue.push({collection,record_id:String(record_id)});
  };
  window.deleteShip = function(id) {
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
    if (result.error) { pendingBox.textContent = 'تعذر تحميل طلبات الحسابات.'; return; }
    const users = result.data || [];
    const pending = users.filter(x => !x.active);
    const approved = users.filter(x => x.active && x.user_id !== window.currentProfile.user_id);
    pendingBox.innerHTML = pending.length
      ? '<div class="tablewrap"><table><thead><tr><th>الاسم</th><th>الدور المطلوب</th><th>تاريخ الطلب</th><th>القرار</th></tr></thead><tbody>' +
        pending.map(x => '<tr><td>' + esc(x.full_name) + '</td><td><select id="role-' + x.user_id + '"><option value="employee">موظف</option><option value="manager">مدير</option><option value="courier">مندوب</option></select></td><td>' + new Date(x.created_at).toLocaleString('ar-EG') + '</td><td><button class="success" onclick="setAirEmployeeAccess(\'' + x.user_id + '\',true)">اعتماد</button> <button class="danger" onclick="setAirEmployeeAccess(\'' + x.user_id + '\',false)">رفض</button></td></tr>').join('') +
        '</tbody></table></div>' : '<p class="muted">لا توجد طلبات معلقة.</p>';
    approvedBox.innerHTML = approved.length
      ? '<div class="tablewrap"><table><thead><tr><th>الاسم</th><th>الدور</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>' +
        approved.map(x => '<tr><td>' + esc(x.full_name) + '</td><td>' + roleName(x.role) + '</td><td>معتمد</td><td><button class="danger" onclick="setAirEmployeeAccess(\'' + x.user_id + '\',false)">إيقاف الحساب</button></td></tr>').join('') +
        '</tbody></table></div>' : '<p class="muted">لا توجد حسابات أخرى.</p>';
  }
  window.renderAccountRequests = renderAccountRequests;

  window.setAirEmployeeAccess = async function(userId,active) {
    if (window.currentProfile?.role !== 'admin') return alert('مدير النظام فقط يمكنه اعتماد الحسابات.');
    const role = $('role-' + userId)?.value || 'employee';
    const result = await client.from('profiles').update({active,role})
      .eq('user_id',userId).eq('workspace_id',window.currentProfile.workspace_id);
    if (result.error) return alert('تعذر تحديث الحساب. تأكد من صلاحيات المدير.');
    await renderAccountRequests();
    if (typeof toast === 'function') toast(active ? 'تم اعتماد الحساب' : 'تم إيقاف الحساب');
  };

  function subscribeRealtime() {
    if (realtimeChannel) client.removeChannel(realtimeChannel);
    const workspaceId = window.currentProfile.workspace_id;
    realtimeChannel = client.channel('air-logistic-' + workspaceId)
      .on('postgres_changes',{event:'*',schema:'public',table:'app_records',filter:'workspace_id=eq.' + workspaceId},payload => {
        const row = payload.new || payload.old;
        if (!row || !keys.includes(row.collection)) return;
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
