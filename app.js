/* THE ORDER BOOK (TOB) – offline-first order tracker. Data stays on the device (localStorage). */
(() => {
  'use strict';

  /* ---------- storage ---------- */
  const KEY = 'tob.orders.v1', SET_KEY = 'tob.settings.v1', OLD_CUR_KEY = 'tob.currency';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(orders)); } catch { toast(t('tNoSave')); } };
  const loadSettings = () => {
    let s = null, old = null;
    try { s = JSON.parse(localStorage.getItem(SET_KEY)); } catch {}
    try { old = localStorage.getItem(OLD_CUR_KEY); } catch {}
    // First time opening the app: start with Nigeria settings (₦ and country code 234).
    const out = { currency: old !== null ? old : '₦', cc: s ? '' : '234', biz: '', owner: '', type: '', bizPhone: '', address: '', email: '', regNo: '', registeredAt: '', bizId: '', regDismiss: false, consent: false, syncedHash: '', syncedAt: '',
      lastBackup: '', lang: 'en', welcomed: false, ...(s || {}) };
    if (out.bizInfo && !out.address) out.address = out.bizInfo;   // older versions kept one free-text line
    if (out.currency.trim() === '#') out.currency = '₦';   // people often type # for Naira
    return out;
  };
  const PROFILE_KEYS = ['currency', 'cc', 'biz', 'owner', 'type', 'bizPhone', 'address', 'email', 'regNo', 'registeredAt', 'bizId'];
  const isRegistered = () => !!(settings.biz && settings.owner && settings.type && settings.bizPhone && settings.registeredAt);
  const bizLine = () => [settings.address, settings.bizPhone, settings.regNo ? 'RC ' + settings.regNo : ''].filter(Boolean).join(' · ');
  const cloud = window.TOB_CLOUD_API || { enabled: false };
  const newBizId = () => 'TOB-' + Math.random().toString(36).slice(2, 7).toUpperCase();
  const profileHash = () => JSON.stringify(['biz', 'owner', 'type', 'bizPhone', 'address', 'email', 'regNo', 'bizId', 'lang'].map(k => settings[k]));
  let syncing = false, syncState = '';   // syncState: '' | 'busy' | 'fail'
  const syncHtml = () => !cloud.enabled || !isRegistered() ? ''
    : settings.syncedHash === profileHash() ? t('cloudSynced')
    : syncState === 'busy' ? t('cloudSyncing')
    : syncState === 'fail' ? `${t('cloudFail')} <button type="button" id="syncretry" class="chip">${t('retry')}</button>`
    : t('cloudPending');
  function paintSync() {
    const el = $('#syncstate'); if (el) el.innerHTML = syncHtml();
    const id = $('#bizid'); if (id) id.textContent = settings.bizId;
  }
  async function syncProfile() {
    if (!cloud.enabled || !isRegistered() || syncing || settings.syncedHash === profileHash()) return;
    if (navigator.onLine === false) { paintSync(); return; }
    syncing = true; syncState = 'busy'; paintSync();
    try {
      for (let i = 0; ; i++) {
        try {
          await cloud.register({ code: settings.bizId, name: settings.biz, owner: settings.owner, type: settings.type, phone: settings.bizPhone,
            address: settings.address, email: settings.email, cac: settings.regNo, lang: settings.lang, version: 'web-1' });
          break;
        } catch (e) { if (e.code === 'code_taken' && i < 3) { settings.bizId = newBizId(); saveSettings(); continue; } throw e; }
      }
      settings.syncedHash = profileHash(); settings.syncedAt = new Date().toISOString(); saveSettings(); syncState = '';
    } catch (e) { syncState = 'fail'; }
    syncing = false; paintSync();
    if (!syncState && settings.syncedHash !== profileHash()) syncProfile();   // changed while uploading
  }
  const saveSettings = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch {} };
  let orders = load();
  let settings = loadSettings();
  if (!settings.welcomed && orders.length) { settings.welcomed = true; saveSettings(); }   // existing users skip the welcome
  const t = (k, ...a) => {
    const L = window.TOB_STRINGS, v = (L[settings.lang] && L[settings.lang][k] !== undefined) ? L[settings.lang][k] : L.en[k];
    return typeof v === 'function' ? v(...a) : v;
  };
  const noteLabel = n => ({ Deposit: t('noteDeposit'), Payment: t('notePayment'), 'Final payment': t('noteFinal') }[n] || n);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : NaN; };
  const money = n => settings.currency + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayStr = () => ymd(new Date());
  const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
  const daysUntil = s => dayNum(s) - dayNum(todayStr());
  const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = s => parseDay(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const fmtShort = s => parseDay(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const fmtTime = tm => tm ? new Date(2000, 0, 1, +tm.slice(0, 2), +tm.slice(3, 5)).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
  const withTime = (label, o) => o.time ? `${label} · ${fmtTime(o.time)}` : label;
  // Exact moment the order is due (only when a time was set), and how long ago it passed.
  const dueAt = o => { if (!o.time) return null; const [y, m, d] = o.due.split('-').map(Number); return new Date(y, m - 1, d, +o.time.slice(0, 2), +o.time.slice(3, 5)); };
  const minsLate = o => { const at = dueAt(o); return at ? Math.floor((Date.now() - at) / 60000) : -1; };   // > 0 once the time has passed
  const isLate = o => o.status !== 'completed' && (o.time ? minsLate(o) > 0 : daysUntil(o.due) < 0);
  const paid = o => o.payments.reduce((t, p) => t + p.amount, 0);
  const balance = o => Math.max(0, +(o.amount - paid(o)).toFixed(2));
  const clip = (s, n) => s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }
  function dueInfo(o) {
    if (o.status === 'completed') return { cls: 'done', label: t('deliveredBadge') };
    const d = daysUntil(o.due), lm = minsLate(o);
    if (o.time && lm > 0) {   // a time was set: count lateness by the minute / hour
      const hrs = Math.floor(lm / 60);
      return { cls: 'overdue', label: lm < 60 ? t('lateMins', lm) : hrs < 24 ? t('lateHours', hrs) : t('late', Math.floor(hrs / 24)) };
    }
    if (d < 0) return { cls: 'overdue', label: t('late', -d) };
    if (d === 0) return { cls: 'today', label: withTime(t('today'), o) };
    if (d === 1) return { cls: 'soon', label: withTime(t('tomorrow'), o) };
    if (d <= 3) return { cls: 'soon', label: withTime(t('inDays', d), o) };
    return { cls: '', label: fmtDate(o.due) };
  }
  const navBar = active => `<nav class="tabbar">${[
    ['orders', '#/', '📒', t('navOrders')], ['customers', '#/customers', '👥', t('navCustomers')],
    ['report', '#/report', '📊', t('navReport')], ['more', '#/more', '🏪', t('navSettings')]
  ].map(([k, h, i, l]) => `<a href="${h}" class="${k === active ? 'on' : ''}"${k === active ? ' aria-current="page"' : ''}><span>${i}</span>${l}</a>`).join('')}</nav>`;
  const shell = (title, body, { back = false, extra = '', nav = '' } = {}) => {
    $('#app').innerHTML = `
      <header class="bar">
        ${back ? `<a class="iconbtn" href="${back === true ? '#/' : back}" aria-label="Back">←</a>` : ''}
        <h1>${title}</h1>${extra}
      </header>
      <main${nav ? ' class="withnav"' : ''}>${body}</main>${nav ? navBar(nav) : ''}`;
    window.scrollTo(0, 0);
  };
  // Examples shown in the "Order details" box – food, fashion, beauty, events, print/crafts and repairs.
  const EXAMPLES = [
    // Food
    '3 trays jollof rice + 20 puff-puff, Saturday party',
    'Birthday cake, 2 layers, vanilla – write “Happy 5th Ada”',
    '1 dozen meat pies + 2 crates of zobo drink',
    '5 lunch boxes daily, Mon–Fri – rice and stew',
    'Small chops for 50 guests – samosa, spring roll, chicken',
    // Fashion
    '2 agbada, size L – navy blue',
    'Wedding gele + 6 aso-ebi blouses',
    'Pair of leather sandals, size 42, brown',
    'Ankara tote bag with zip, medium',
    // Beauty
    'Full head knotless braids, medium length',
    'Bridal makeup + 2 bridesmaids, 9am',
    'Wig revamp – bone straight, 24 inches',
    // Events
    'Decor for 100 guests – gold and white',
    'Hire: 100 chairs + 4 canopies, Saturday',
    // Print & crafts
    '50 printed T-shirts, white, size M',
    '200 flyers + 1 banner (6ft x 3ft)',
    'Dining table, 6 seats, mahogany',
    // Repairs & services
    'Fix phone screen – Samsung A12',
    'Wash and iron 3 suits + 2 duvets',
    'Fix generator – won’t start',
    'Bouquet of 12 roses, red, with card'
  ];
  const example = () => EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)];

  let liveRefresh = null;   // set by the screen on show; called every minute and when the app comes back

  const orderCard = o => {
    const di = dueInfo(o), bal = balance(o);
    return `<li><a class="order ${di.cls}" href="#/order/${o.id}">
          <div class="row"><span class="name">${esc(o.name)}</span><span class="badge ${di.cls}">${di.label}</span></div>
          <div class="what">${esc(o.item)}</div>
          <div class="row"><span style="color:var(--muted);font-size:13px">${t('total', money(o.amount))}</span>
            <span class="owing ${bal ? '' : 'clear'}">${bal ? t('owes', money(bal)) : t('paidFull')}</span></div>
        </a></li>`;
  };

  /* ---------- customers (grouped from orders; repeat = 2+ orders) ---------- */
  const phoneKey = p => { const d = (p || '').replace(/\D/g, ''); return d.length >= 7 ? 'p' + d.slice(-10) : ''; };
  const nameKey = n => 'n' + n.trim().toLowerCase().replace(/\s+/g, ' ');
  function customers() {
    const byName = new Map();   // an order with no phone joins the phone-customer of the same name
    orders.forEach(o => { const pk = phoneKey(o.phone); if (pk) byName.set(nameKey(o.name), pk); });
    const m = new Map();
    orders.forEach(o => {
      const k = phoneKey(o.phone) || byName.get(nameKey(o.name)) || nameKey(o.name);
      if (!m.has(k)) m.set(k, { key: k, orders: [] });
      m.get(k).orders.push(o);
    });
    return [...m.values()].map(c => {
      c.orders.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
      c.name = (c.orders.find(o => o.name.trim() !== o.name.trim().toLowerCase()) || c.orders[0]).name.trim();   // prefer the capitalised spelling
      const withPhone = c.orders.find(o => o.phone); c.phone = withPhone ? withPhone.phone : '';
      c.total = c.orders.reduce((s, o) => s + o.amount, 0);
      c.paid = c.orders.reduce((s, o) => s + paid(o), 0);
      c.owed = c.orders.reduce((s, o) => s + balance(o), 0);
      c.last = c.orders[0].createdAt; c.first = c.orders[c.orders.length - 1].createdAt;
      c.repeat = c.orders.length >= 2;
      return c;
    });
  }
  let prefill = null, custTab = 'all', custQuery = '';

  function customersScreen() {
    const all = customers(), rep = all.filter(c => c.repeat);
    shell(t('customersTitle'), `
      <div class="summary">
        <div class="stat"><b>${all.length}</b><span>${t('custTotal')}</span></div>
        <div class="stat good"><b>${rep.length}</b><span>${t('custRepeat')}${all.length ? ` · ${Math.round(rep.length / all.length * 100)}%` : ''}</span></div>
      </div>
      <div class="tabs" role="tablist">
        <button role="tab" data-ct="all" aria-selected="${custTab === 'all'}">${t('tabAll')}</button>
        <button role="tab" data-ct="repeat" aria-selected="${custTab === 'repeat'}">⭐ ${t('tabRepeat')}</button>
      </div>
      <input class="search" type="search" id="cq" placeholder="${t('searchCust')}" value="${esc(custQuery)}" autocomplete="off">
      <ul class="list" id="clist"></ul>`, { nav: 'customers' });
    const draw = () => {
      const q = custQuery.trim().toLowerCase();
      const list = (custTab === 'repeat' ? rep : all)
        .filter(c => !q || (c.name + ' ' + c.phone).toLowerCase().includes(q))
        .sort(custTab === 'repeat' ? (x, y) => y.orders.length - x.orders.length || y.last.localeCompare(x.last) : (x, y) => y.last.localeCompare(x.last));
      $('#clist').innerHTML = list.length ? list.map(c => `<li><a class="order cust ${c.repeat ? 'repeat' : ''}" href="#/customer/${encodeURIComponent(c.key)}">
          <div class="row"><span class="name">${esc(c.name)}</span>
            <span class="badge ${c.repeat ? 'paid' : ''}">${c.repeat ? t('repeatBadge', c.orders.length) : t('newBadge')}</span></div>
          <div class="what">${c.phone ? esc(c.phone) + ' · ' : ''}${t('ordersN', c.orders.length)} · ${t('totalOrdered')} ${money(c.total)}</div>
          <div class="row"><span style="color:var(--muted);font-size:13px">${t('lastOrder')}: ${fmtShort(ymd(new Date(c.last)))}</span>
            <span class="owing ${c.owed ? '' : 'clear'}">${c.owed ? t('owes', money(c.owed)) : t('paidFull')}</span></div>
        </a></li>`).join('')
        : `<li class="empty"><big>${q ? '🔍' : '👥'}</big>${q ? t('noMatch') : custTab === 'repeat' ? t('emptyRepeat') : t('emptyCust')}</li>`;
    };
    draw();
    $('#cq').addEventListener('input', e => { custQuery = e.target.value; draw(); });
    document.querySelectorAll('[data-ct]').forEach(b => b.addEventListener('click', () => { custTab = b.dataset.ct; customersScreen(); }));
  }

  function customerScreen(key) {
    const c = customers().find(x => x.key === key);
    if (!c) { location.hash = '#/customers'; return; }
    const wa = c.phone ? waNumber(c.phone) : '';
    shell(t('custDetail'), `
      <div class="card">
        <p class="big-name">${esc(c.name)}</p>
        <p style="margin:4px 0 10px"><span class="badge ${c.repeat ? 'paid' : ''}">${c.repeat ? t('repeatBadge', c.orders.length) : t('newBadge')}</span></p>
        ${c.phone ? `<a href="tel:${esc(c.phone)}" class="chip" style="text-decoration:none;display:inline-block">📞 ${esc(c.phone)}</a>` : ''}
        ${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener" class="chip" style="text-decoration:none;display:inline-block">💬 WhatsApp</a>` : ''}
        <div class="kv" style="margin-top:10px"><span>${t('firstOrder')}</span><b>${fmtShort(ymd(new Date(c.first)))}</b></div>
        <div class="kv"><span>${t('lastOrder')}</span><b>${fmtShort(ymd(new Date(c.last)))}</b></div>
        <div class="kv"><span>${t('totalOrdered')}</span><b>${money(c.total)}</b></div>
        <div class="kv"><span>${t('totalPaid')}</span><b>${money(c.paid)}</b></div>
        <div class="kv total"><span>${t('stillOwes')}</span><b style="color:${c.owed ? 'var(--bad)' : 'var(--ok)'}">${c.owed ? money(c.owed) : t('paidFull')}</b></div>
      </div>
      <button class="btn" id="newfor">${t('newOrderFor', esc(c.name))}</button>
      <h2 class="sect">${t('ordersHdr')} (${c.orders.length})</h2>
      <ul class="list">${c.orders.map(orderCard).join('')}</ul>`, { back: '#/customers' });
    $('#newfor').addEventListener('click', () => { prefill = { name: c.name, phone: c.phone }; location.hash = '#/add'; });
  }

  /* ---------- screen 1: Orders ---------- */
  let tab = 'pending', query = '';
  function ordersScreen() {
    const stats = () => {
      const pending = orders.filter(o => o.status !== 'completed');
      const dueSoon = pending.filter(o => daysUntil(o.due) <= 0 || isLate(o)).length;
      return { n: pending.length, owed: pending.reduce((t, o) => t + balance(o), 0), dueSoon };
    };
    const st = stats();
    shell(`THE ORDER BOOK<span class="sub">TOB</span>`, `
      ${!isRegistered() && !settings.regDismiss ? `<div class="regbanner"><span>🏪 ${t('bannerReg')}</span><a class="btn small" href="#/more">${t('bannerBtn')}</a><button class="iconbtn" id="regx" aria-label="Close">✕</button></div>` : ''}
      <div class="summary">
        <div class="stat"><b id="s-n">${st.n}</b><span id="s-lbl">${t('ordersToDeliver')}${st.dueSoon ? t('dueOrLate', st.dueSoon) : ''}</span></div>
        <div class="stat"><b id="s-owed">${money(st.owed)}</b><span>${t('moneyOwed')}</span></div>
      </div>
      <div class="tabs" role="tablist">
        <button role="tab" data-tab="pending" aria-selected="${tab === 'pending'}">${t('tabTo')}</button>
        <button role="tab" data-tab="completed" aria-selected="${tab === 'completed'}">${t('tabDone')}</button>
      </div>
      <input class="search" type="search" id="q" placeholder="${t('search')}" value="${esc(query)}" autocomplete="off">
      <ul class="list" id="list"></ul>
      <a class="fab" href="#/add"><span>+</span> ${t('addOrder')}</a>`,
      { nav: 'orders' });

    const renderList = () => {
      const q = query.trim().toLowerCase();
      let list = orders.filter(o => (tab === 'completed') === (o.status === 'completed'))
        .filter(o => !q || (o.name + ' ' + o.item).toLowerCase().includes(q));
      list.sort(tab === 'completed'
        ? (a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')
        : (a, b) => a.due.localeCompare(b.due) || (a.time || '99:99').localeCompare(b.time || '99:99') || a.createdAt.localeCompare(b.createdAt));
      $('#list').innerHTML = list.length ? list.map(orderCard).join('') : `<li class="empty"><big>${q ? '🔍' : tab === 'pending' ? '📒' : '✅'}</big>${
        q ? t('noMatch') : tab === 'pending' ? t('emptyTo') : t('emptyDone')}</li>`;
    };
    const rx = $('#regx'); if (rx) rx.addEventListener('click', () => { settings.regDismiss = true; saveSettings(); ordersScreen(); });
    renderList();
    // Live refresh: update badges, colours and counts in place (no scroll jump, search box untouched).
    liveRefresh = () => {
      const s = stats();
      $('#s-n').textContent = s.n; $('#s-owed').textContent = money(s.owed);
      $('#s-lbl').textContent = t('ordersToDeliver') + (s.dueSoon ? t('dueOrLate', s.dueSoon) : '');
      renderList();
    };
    $('#q').addEventListener('input', e => { query = e.target.value; renderList(); });
    document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; ordersScreen(); }));
  }

  /* ---------- screen 2: Add Order / Edit Order ---------- */
  function formScreen(editId) {
    const o = editId ? orders.find(x => x.id === editId) : null;
    if (editId && !o) { location.hash = '#/'; return; }
    const v = o || { name: '', phone: '', item: '', amount: '', due: '', time: '', ...(prefill || {}) };
    prefill = null;
    const known = o ? [] : customers();
    shell(o ? t('editTitle') : t('addTitle'), `
      <form id="f" novalidate>
        <label>${t('custName')}
          <input name="name" required maxlength="80" autocomplete="off" autocapitalize="words" placeholder="${t('custNamePh')}" value="${esc(v.name)}" ${o ? '' : 'list="custlist"'}>${o ? '' : `<datalist id="custlist">${known.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>`}</label>
        <label>${t('phone')} <small>${t('phoneHint')}</small>
          <input name="phone" type="tel" maxlength="30" placeholder="e.g. 0803 123 4567" value="${esc(v.phone)}"></label>
        <label>${t('orderDetails')}
          <textarea name="item" required maxlength="500" placeholder="e.g. ${esc(example())}">${esc(v.item)}</textarea>
          <small>${t('orderHint')}</small></label>
        <div class="two">
          <label>${t('totalPrice')} <small>${t('totalHint')}</small>
            <input name="amount" required inputmode="decimal" placeholder="0.00" value="${o ? o.amount : ''}"></label>
          ${o ? `<label>${t('paidSoFarLabel')} <small>&nbsp;</small><input value="${money(paid(o))}" disabled></label>`
              : `<label>${t('deposit')} <small>${t('depositHint')}</small><input name="deposit" inputmode="decimal" placeholder="0.00"></label>`}
        </div>
        <div class="balance"><span>${t('balanceBox')}</span><b id="bal">${money(o ? balance(o) : 0)}</b></div>
        <label>${t('collection')} <small>${t('collectionHint')}</small>
          <input name="due" type="date" required ${o ? '' : `min="${todayStr()}"`} value="${esc(v.due)}"></label>
        <label>${t('dueTime')} <small>${t('dueTimeHint')}</small>
          <input name="time" type="time" value="${esc(v.time || '')}"></label>
        <div class="err" id="err" role="alert"></div>
        <button class="btn" type="submit">${o ? t('saveChanges') : t('saveOrder')}</button>
        <a class="btn secondary" href="${o ? '#/order/' + o.id : '#/'}">${t('cancel')}</a>
      </form>`, { back: o ? '#/order/' + o.id : true });

    const f = $('#f'), already = o ? paid(o) : 0, upd = () => {
      const a = num(f.amount.value) || 0, d = o ? already : (num(f.deposit.value) || 0);
      $('#bal').textContent = money(Math.max(0, a - d));
    };
    f.amount.addEventListener('input', upd); if (f.deposit) f.deposit.addEventListener('input', upd);
    f.addEventListener('submit', e => {
      e.preventDefault();
      const name = f.name.value.trim(), item = f.item.value.trim();
      const amount = num(f.amount.value), due = f.due.value;
      const dep = o || f.deposit.value.trim() === '' ? 0 : num(f.deposit.value);
      const fail = m => { $('#err').textContent = m; };
      if (!name) return fail(t('eName'));
      if (!item) return fail(t('eItem'));
      if (!(amount > 0)) return fail(t('ePrice'));
      if (!(dep >= 0)) return fail(t('eDepNum'));
      if (dep > amount) return fail(t('eDepMore'));
      if (o && amount < already) return fail(t('eBelowPaid', money(already)));
      if (!due) return fail(t('eDate'));
      if (o) {
        Object.assign(o, { name, item, amount, due, time: f.time.value, phone: f.phone.value.trim() });
        save(); toast(t('tChangesSaved')); location.hash = '#/order/' + o.id;
      } else {
        const now = new Date().toISOString();
        orders.push({ id: uid(), name, phone: f.phone.value.trim(), item, amount, due, time: f.time.value, status: 'pending', createdAt: now,
          payments: dep > 0 ? [{ amount: dep, date: now, note: 'Deposit' }] : [] });
        save(); tab = 'pending'; toast(t('tOrderSaved')); location.hash = '#/';
      }
    });
    if (!o) {
      f.name.addEventListener('change', () => {   // picking a known customer fills in their phone number
        const c = known.find(x => x.name.toLowerCase() === f.name.value.trim().toLowerCase());
        if (c && c.phone && !f.phone.value.trim()) f.phone.value = c.phone;
      });
      if (!f.name.value) f.name.focus();
    }
  }

  /* ---------- WhatsApp ---------- */
  function waNumber(phone) {
    const d = phone.replace(/\D/g, '');
    if (phone.trim().startsWith('+')) return d;
    if (d.startsWith('00')) return d.slice(2);
    if (d.startsWith('0')) { const cc = settings.cc.replace(/\D/g, ''); return cc ? cc + d.slice(1) : ''; }
    return d;
  }
  function whatsapp(o, kind) {
    const n = waNumber(o.phone);
    if (!n) { toast(t('tNoCC')); location.hash = '#/more'; return; }
    const bal = balance(o), what = clip(o.item, 70), sign = settings.biz ? `\n– ${settings.biz}` : '';
    const text = (kind === 'ready'
      ? t('msgReady', o.name, what, bal ? money(bal) : '')
      : t('msgDue', o.name, money(bal), what, o.status === 'completed' ? '' : fmtDate(o.due) + (o.time ? ' at ' + fmtTime(o.time) : ''))) + sign;
    window.open(`https://wa.me/${n}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  /* ---------- screen 3: Order Details ---------- */
  function detailScreen(id) {
    const o = orders.find(x => x.id === id);
    if (!o) { location.hash = '#/'; return; }
    const bal = balance(o), done = o.status === 'completed', di = dueInfo(o);
    shell(t('detailsTitle'), `
      <div class="card">
        <p class="big-name">${esc(o.name)}</p>
        <p style="margin:4px 0 10px"><span class="badge ${di.cls}" id="dbadge">${done ? t('deliveredBadge') : di.label}</span></p>
        ${o.phone ? `<a href="tel:${esc(o.phone)}" class="chip" style="text-decoration:none;display:inline-block">📞 ${esc(o.phone)}</a>` : ''}
        <h2 style="margin-top:14px">${t('orderDetails')}</h2>
        <p class="notes">${esc(o.item)}</p>
        <div class="kv" style="margin-top:10px"><span>${t('collection')}</span><b>${fmtDate(o.due)}${o.time ? ' · ' + fmtTime(o.time) : ''}</b></div>
      </div>

      <div class="card">
        <h2>${t('money')}</h2>
        <div class="kv"><span>${t('totalPriceRow')}</span><b>${money(o.amount)}</b></div>
        <div class="kv"><span>${t('paidRow')}</span><b>${money(paid(o))}</b></div>
        <div class="kv total"><span>${t('balanceRow')}</span><b style="color:${bal ? 'var(--bad)' : 'var(--ok)'}">${bal ? money(bal) : t('paidFull')}</b></div>
        ${bal && !done ? `
          <form id="pay" style="margin-top:14px" novalidate>
            <div class="pay-row"><input name="amt" inputmode="decimal" placeholder="${t('amtPh')}" aria-label="${t('amtPh')}">
              <button class="btn small" type="submit">${t('saveBtn')}</button></div>
            <div class="chips"><button type="button" class="chip" id="full">${t('payAll', money(bal))}</button></div>
            <div class="err" id="err" role="alert"></div>
          </form>` : ''}
        ${o.payments.length ? `<ul class="hist">${o.payments.map(p =>
          `<li><span>${esc(noteLabel(p.note || 'Payment'))} · ${new Date(p.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span><b>${money(p.amount)}</b></li>`).join('')}</ul>` : ''}
      </div>

      <div class="card">
        <h2>${t('waHeading')}</h2>
        ${o.phone ? `<div class="actions">
          <button class="btn wa" id="wa-ready">${t('waReady')}</button>
          ${bal ? `<button class="btn wa" id="wa-due">${t('waDue', money(bal))}</button>` : ''}
        </div>` : `<p style="margin:0;color:var(--muted)">${t('waNoPhone')}</p>`}
      </div>

      <div class="actions">
        <a class="btn secondary" href="#/receipt/${o.id}">${t('receiptBtn')}</a>
        ${done
          ? `<button class="btn secondary" id="reopen">${t('reopen')}</button>`
          : `<button class="btn" id="complete">${t('complete')}</button>`}
        <button class="btn danger" id="del">${t('del')}</button>
      </div>`, { back: true, extra: `<a class="iconbtn" href="#/edit/${o.id}">${t('edit')}</a>` });

    if (!done) liveRefresh = () => { const d = dueInfo(o), el = $('#dbadge'); if (el) { el.className = 'badge ' + d.cls; el.textContent = d.label; } };
    const pay = (amount, note) => {
      o.payments.push({ amount, date: new Date().toISOString(), note }); save();
      toast(balance(o) ? t('tPaySaved') : t('tFullPaid')); detailScreen(id);
    };
    const pf = $('#pay');
    if (pf) {
      pf.addEventListener('submit', e => {
        e.preventDefault();
        const a = num(pf.amt.value);
        if (!(a > 0)) return ($('#err').textContent = t('eAmt'));
        if (a > bal + 0.001) return ($('#err').textContent = t('eTooMuch', money(bal)));
        pay(a, 'Payment');
      });
      $('#full').addEventListener('click', () => pay(bal, 'Final payment'));
    }
    const w1 = $('#wa-ready'), w2 = $('#wa-due');
    if (w1) w1.addEventListener('click', () => whatsapp(o, 'ready'));
    if (w2) w2.addEventListener('click', () => whatsapp(o, 'due'));
    const c = $('#complete');
    if (c) c.addEventListener('click', () => {
      if (bal > 0 && !confirm(t('cNotPaid', o.name, money(bal)))) return;
      o.status = 'completed'; o.completedAt = new Date().toISOString(); save();
      tab = 'pending'; toast(t('tDelivered')); location.hash = '#/';
    });
    const r = $('#reopen');
    if (r) r.addEventListener('click', () => { o.status = 'pending'; delete o.completedAt; save(); toast(t('tReopened')); detailScreen(id); });
    $('#del').addEventListener('click', () => {
      if (!confirm(t('cDelete', o.name))) return;
      orders = orders.filter(x => x.id !== id); save(); toast(t('tDeleted')); location.hash = '#/';
    });
  }

  /* ---------- Receipt ---------- */
  function receiptScreen(id) {
    const o = orders.find(x => x.id === id);
    if (!o) { location.hash = '#/'; return; }
    const bal = balance(o), no = o.id.slice(-5).toUpperCase(), biz = settings.biz || 'THE ORDER BOOK';
    const issued = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const due = fmtDate(o.due) + (o.time ? ' · ' + fmtTime(o.time) : '');
    shell(t('receipt'), `
      <article class="receipt" id="receipt">
        <header class="rc-head">
          <b class="rc-biz">${esc(biz)}</b>
          ${bizLine() ? `<span>${esc(bizLine())}</span>` : ''}
        </header>
        <div class="rc-title">${t('receipt').toUpperCase()}</div>
        <div class="rc-meta"><span>${t('receiptNo')} <b>${no}</b></span><span>${t('receiptDate')}: <b>${issued}</b></span></div>
        <div class="rc-block"><small>${t('customerLbl')}</small><b>${esc(o.name)}</b>${o.phone ? `<span>${esc(o.phone)}</span>` : ''}</div>
        <div class="rc-block"><small>${t('orderDetails')}</small><span class="rc-item">${esc(o.item)}</span></div>
        <div class="rc-block"><small>${t('collection')}</small><b>${due}</b></div>
        <div class="rc-block">
          <small>${t('paymentsHdr')}</small>
          ${o.payments.length ? o.payments.map(p => `<div class="rc-row"><span>${esc(noteLabel(p.note || 'Payment'))} · ${fmtShort(ymd(new Date(p.date)))}</span><b>${money(p.amount)}</b></div>`).join('')
            : `<span>${t('noPayYet')}</span>`}
        </div>
        <div class="rc-totals">
          <div class="rc-row"><span>${t('totalPriceRow')}</span><b>${money(o.amount)}</b></div>
          <div class="rc-row"><span>${t('paidRow')}</span><b>${money(paid(o))}</b></div>
          <div class="rc-row big"><span>${t('balanceRow')}</span><b>${money(bal)}</b></div>
        </div>
        <div class="rc-stamp ${bal ? 'part' : 'full'}">${bal ? t('stampPart') : t('stampPaid')}</div>
        <p class="rc-thanks">${t('thanks')}</p>
      </article>
      <div class="actions noprint" style="margin-top:14px">
        <button class="btn wa" id="sendrc">📄 ${t('sendPdf')}</button>
        <p class="hint">${t('pdfHint', esc(o.name))}</p>
        <button class="btn secondary" id="print">${t('printBtn')}</button>
      </div>`, { back: '#/order/' + o.id });
    $('#print').addEventListener('click', () => window.print());
    $('#sendrc').addEventListener('click', async e => {
      const btn = e.currentTarget, label = btn.innerHTML; btn.disabled = true; btn.textContent = t('pdfMaking');
      try {
        const blob = await receiptPdf(o, { no, biz, due, issued });
        const file = new File([blob], `Receipt-${o.name.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'customer'}-${no}.pdf`, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file], title: `${t('receipt')} ${no}` }); }   // phone: pick WhatsApp, then the customer
          catch (err) { if (err && err.name !== 'AbortError') throw err; }
        } else {   // computer / older phone: save the PDF, then open the customer's chat so it can be attached
          const url = URL.createObjectURL(blob);
          const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
          document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
          toast(t('pdfSaved'));
          const n = o.phone ? waNumber(o.phone) : '';
          if (n) setTimeout(() => window.open(`https://wa.me/${n}`, '_blank', 'noopener'), 900);
        }
      } catch (err) { toast(t('pdfFail')); }
      btn.disabled = false; btn.innerHTML = label;
    });
  }

  /* ---------- Receipt as a PDF file (drawn on a canvas, wrapped in a one-page PDF) ---------- */
  function drawReceipt(ctx, o, m) {
    const W = 720, P = 48, F = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', G = '#1f5c4a';
    const bal = balance(o); let y = 0;
    const font = (sz, w = 400) => { ctx.font = `${w} ${sz}px ${F}`; };
    const wrap = (txt, maxW) => {
      const out = [];
      String(txt).split('\n').forEach(par => {
        let line = '';
        par.split(' ').forEach(word => { const test = line ? line + ' ' + word : word; if (ctx.measureText(test).width > maxW && line) { out.push(line); line = word; } else line = test; });
        out.push(line);
      });
      return out;
    };
    const center = (txt, sz, w, col, gap) => { font(sz, w); ctx.fillStyle = col; ctx.textAlign = 'center'; wrap(txt, W - P * 2).forEach(l => { ctx.fillText(l, W / 2, y + sz); y += sz * 1.3; }); y += gap; };
    const left = (txt, sz, w, col, gap) => { font(sz, w); ctx.fillStyle = col; ctx.textAlign = 'left'; wrap(txt, W - P * 2).forEach(l => { ctx.fillText(l, P, y + sz); y += sz * 1.35; }); y += gap; };
    const row = (l, r, sz, w, col, gap) => { font(sz, w); ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.fillText(l, P, y + sz); ctx.textAlign = 'right'; ctx.fillText(r, W - P, y + sz); y += sz * 1.5 + gap; };
    const rule = (col, wd, dash) => { ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(P, y); ctx.lineTo(W - P, y); ctx.stroke(); ctx.setLineDash([]); y += 14; };
    const label = txt => { left(txt.toUpperCase(), 14, 700, '#777', 2); };

    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, 4000);
    y = P;
    center(m.biz, 32, 800, G, 4);
    if (bizLine()) center(bizLine(), 17, 400, '#555', 4);
    y += 6; rule('#cfc9bb', 2, [8, 6]); y += 4;
    center(t('receipt').toUpperCase().split('').join(' '), 20, 800, G, 8);
    row(`${t('receiptNo')} ${m.no}`, `${t('receiptDate')}: ${m.issued}`, 15, 400, '#555', 6);
    rule('#eee7d8', 1.5);
    label(t('customerLbl')); left(o.name, 22, 700, '#1a1a1a', 0); if (o.phone) left(o.phone, 18, 400, '#1a1a1a', 0); y += 6; rule('#eee7d8', 1.5);
    label(t('orderDetails')); left(o.item, 19, 400, '#1a1a1a', 4); rule('#eee7d8', 1.5);
    label(t('collection')); left(m.due, 19, 700, '#1a1a1a', 4); rule('#eee7d8', 1.5);
    label(t('paymentsHdr'));
    if (o.payments.length) o.payments.forEach(p => row(`${noteLabel(p.note || 'Payment')} · ${fmtShort(ymd(new Date(p.date)))}`, money(p.amount), 19, 400, '#1a1a1a', 0));
    else left(t('noPayYet'), 19, 400, '#1a1a1a', 0);
    y += 8; rule(G, 3); y += 2;
    row(t('totalPriceRow'), money(o.amount), 19, 400, '#1a1a1a', 0);
    row(t('paidRow'), money(paid(o)), 19, 400, '#1a1a1a', 0);
    row(t('balanceRow'), money(bal), 24, 800, G, 4);
    y += 18;
    const stamp = bal ? t('stampPart') : t('stampPaid'), col = bal ? '#b4531a' : '#2e7d32';
    font(22, 800); const sw = ctx.measureText(stamp.split('').join(' ')).width + 40;
    ctx.save(); ctx.translate(W / 2, y + 26); ctx.rotate(-0.07); ctx.strokeStyle = col; ctx.lineWidth = 4;
    ctx.strokeRect(-sw / 2, -26, sw, 52); ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(stamp.split('').join(' '), 0, 8); ctx.restore();
    y += 78;
    center(t('thanks'), 17, 400, '#555', 0); y += P - 10;
    return Math.ceil(y);
  }

  async function receiptPdf(o, m) {
    const S = 2, W = 720;
    const probe = document.createElement('canvas').getContext('2d');
    const H = drawReceipt(probe, o, m);
    const cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
    const ctx = cv.getContext('2d'); ctx.scale(S, S); drawReceipt(ctx, o, m);
    const jpg = new Uint8Array(await new Promise((res, rej) => cv.toBlob(b => b ? b.arrayBuffer().then(res, rej) : rej(new Error('no image')), 'image/jpeg', 0.92)));
    // one-page PDF, 420pt wide, the receipt image filling the page
    const pw = 420, ph = Math.round(pw * H / W), enc = new TextEncoder(), parts = [], off = [];
    let len = 0; const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (n, body, stream) => { off[n] = len; push(`${n} 0 obj\n${body}\n`); if (stream) { push('stream\n'); push(stream); push('\nendstream\n'); } push('endobj\n'); };
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    push('%PDF-1.4\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`);
    obj(4, `<< /Length ${content.length} >>`, content);
    obj(5, `<< /Type /XObject /Subtype /Image /Width ${W * S} /Height ${H * S} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`, jpg);
    const xref = len; push(`xref\n0 6\n0000000000 65535 f \n` + [1, 2, 3, 4, 5].map(n => String(off[n]).padStart(10, '0') + ' 00000 n \n').join(''));
    push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  /* ---------- Reports (weekly + monthly) ---------- */
  let reportMode = 'week', weekOffset = 0, monthOffset = 0;
  function reportScreen() {
    const M = reportMode === 'month', off = M ? monthOffset : weekOffset;
    let start, end;
    if (M) { const n = new Date(); start = new Date(n.getFullYear(), n.getMonth() + monthOffset, 1); end = new Date(start.getFullYear(), start.getMonth() + 1, 0); }
    else { start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + weekOffset * 7); end = new Date(start); end.setDate(end.getDate() + 6); } // weeks start on Monday
    const a = ymd(start), b = ymd(end), inRange = iso => { const d = ymd(new Date(iso)); return d >= a && d <= b; };

    const pays = [];
    orders.forEach(o => o.payments.forEach(p => { if (inRange(p.date)) pays.push({ ...p, name: o.name, key: o.id }); }));
    pays.sort((x, y) => y.date.localeCompare(x.date));
    const received = pays.reduce((s, p) => s + p.amount, 0);
    const pending = orders.filter(o => o.status !== 'completed');
    const owed = pending.reduce((s, o) => s + balance(o), 0);
    const owing = pending.filter(o => balance(o) > 0).length;
    const dueIn = pending.filter(o => o.due >= a && o.due <= b).sort((x, y) => x.due.localeCompare(y.due) || (x.time || '99:99').localeCompare(y.time || '99:99'));
    const dueInBal = dueIn.reduce((s, o) => s + balance(o), 0);
    const overdue = pending.filter(o => isLate(o) && balance(o) > 0);
    const newCount = orders.filter(o => inRange(o.createdAt)).length;
    const doneCount = orders.filter(o => o.completedAt && inRange(o.completedAt)).length;
    const range = M ? start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : `${fmtShort(a)} – ${fmtShort(b)}`;
    const title = off === 0 ? t(M ? 'thisMonth' : 'thisWeek') : off === -1 ? t(M ? 'lastMonth' : 'lastWeek') : t(M ? 'monthsAgo' : 'weeksAgo', -off);

    // Monthly extras: money received per week, and top customers
    let extras = '';
    if (M) {
      const byWeek = new Map();
      pays.forEach(p => { const d = new Date(p.date); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const k = ymd(d); byWeek.set(k, (byWeek.get(k) || 0) + p.amount); });
      const weeks = []; const w = new Date(start); w.setDate(w.getDate() - ((w.getDay() + 6) % 7));
      while (ymd(w) <= b) { weeks.push([ymd(w), byWeek.get(ymd(w)) || 0]); w.setDate(w.getDate() + 7); }
      const max = Math.max(1, ...weeks.map(x => x[1]));
      const byCust = new Map();
      pays.forEach(p => { const c = customers().find(x => x.orders.some(o => o.id === p.key)); const k = c ? c.key : p.name; const e = byCust.get(k) || { name: c ? c.name : p.name, sum: 0 }; e.sum += p.amount; byCust.set(k, e); });
      const top = [...byCust.values()].sort((x, y) => y.sum - x.sum).slice(0, 5);
      extras = `<div class="card"><h2>${t('byWeek')}</h2>${weeks.map(([k, v]) => `<div class="bar-row"><span>${t('weekOf', fmtShort(k))}</span><b>${money(v)}</b><i style="width:${Math.round(v / max * 100)}%"></i></div>`).join('')}</div>
        ${top.length ? `<div class="card"><h2>${t('topCust')}</h2><ul class="hist" style="margin-top:0">${top.map((c, i) => `<li><span>${i + 1}. ${esc(c.name)}</span><b>${money(c.sum)}</b></li>`).join('')}</ul></div>` : ''}`;
    }

    shell(t(M ? 'reportTitleM' : 'reportTitle'), `
      <div class="tabs" role="tablist">
        <button role="tab" data-mode="week" aria-selected="${!M}">${t('tabWeekly')}</button>
        <button role="tab" data-mode="month" aria-selected="${M}">${t('tabMonthly')}</button>
      </div>
      <div class="weeknav">
        <button class="iconbtn navbtn" id="prev" aria-label="${t(M ? 'prevAriaM' : 'prevAria')}">◀</button>
        <div><b>${title}</b><br><small>${range}</small></div>
        <button class="iconbtn navbtn" id="next" aria-label="${t(M ? 'nextAriaM' : 'nextAria')}" ${off >= 0 ? 'disabled' : ''}>▶</button>
      </div>
      <div class="summary">
        <div class="stat good"><b>${money(received)}</b><span>${t('received')}</span></div>
        <div class="stat bad"><b>${money(owed)}</b><span>${t('stillOwed', owing)}</span></div>
      </div>
      <div class="card">
        <h2>${t(M ? 'shortM' : 'short')}</h2>
        <div class="kv"><span>${t('newOrders')}</span><b>${newCount}</b></div>
        <div class="kv"><span>${t('deliveredN')}</span><b>${doneCount}</b></div>
        <div class="kv"><span>${t(M ? 'dueMonth' : 'dueWeek')}</span><b>${dueIn.length}${dueInBal ? t('toCollect', money(dueInBal)) : ''}</b></div>
        <div class="kv"><span>${t('lateOwing')}</span><b>${overdue.length}</b></div>
      </div>
      ${extras}
      <div class="card">
        <h2>${t('paymentsRecv')}</h2>
        ${pays.length ? `<ul class="hist" style="margin-top:0">${pays.map(p =>
          `<li><span>${esc(p.name)} · ${esc(noteLabel(p.note || 'Payment'))} · ${fmtShort(ymd(new Date(p.date)))}</span><b>${money(p.amount)}</b></li>`).join('')}</ul>`
          : `<p style="margin:0;color:var(--muted)">${t(M ? 'noPayM' : 'noPay')}</p>`}
      </div>
      ${dueIn.length ? `<div class="card"><h2>${t(M ? 'deliverThisMonth' : 'deliverThisWeek')}</h2><ul class="hist" style="margin-top:0">${dueIn.map(o =>
        `<li><a href="#/order/${o.id}" style="color:inherit;text-decoration:none;flex:1">${esc(o.name)} · ${fmtShort(o.due)}</a><b>${balance(o) ? t('owedSuffix', money(balance(o))) : t('paidShort')}</b></li>`).join('')}</ul></div>` : ''}
      <button class="btn secondary" id="share">${t('share')}</button>`, { nav: 'report' });

    document.querySelectorAll('[data-mode]').forEach(x => x.addEventListener('click', () => { reportMode = x.dataset.mode; reportScreen(); }));
    $('#prev').addEventListener('click', () => { if (M) monthOffset--; else weekOffset--; reportScreen(); });
    $('#next').addEventListener('click', () => { if (off < 0) { if (M) monthOffset++; else weekOffset++; reportScreen(); } });
    $('#share').addEventListener('click', async () => {
      const text = t(M ? 'shareTextM' : 'shareText', settings.biz || 'THE ORDER BOOK', range, money(received), money(owed), owing, newCount, doneCount);
      try {
        if (navigator.share) await navigator.share({ text });
        else { await navigator.clipboard.writeText(text); toast(t('copied')); }
      } catch { /* cancelled */ }
    });
  }

  /* ---------- language + welcome ---------- */
  const langPicker = () => `<div class="langs" role="group" aria-label="Language">${
    Object.keys(window.TOB_STRINGS).map(k => `<button type="button" class="lang" data-lang="${k}" aria-pressed="${settings.lang === k}">${window.TOB_STRINGS[k].langName}</button>`).join('')}</div>`;
  const bindLang = rerender => document.querySelectorAll('.lang').forEach(b => b.addEventListener('click', () => {
    settings.lang = b.dataset.lang; saveSettings(); syncProfile(); document.documentElement.lang = settings.lang === 'pcm' ? 'en-NG' : 'en'; rerender();
  }));

  function welcomeScreen() {
    $('#app').innerHTML = `
      <div class="welcome">
        <img class="wlogo" src="icons/icon.svg" alt="" width="84" height="84">
        <h1>${t('welcomeTitle')}</h1>
        <p class="wtag">${t('welcomeTag')}</p>
        <div class="card">
          <h2>${t('chooseLang')}</h2>${langPicker()}
        </div>
        <div class="card">
          <h2>${t('how')}</h2>
          <ol class="steps">
            <li><b>${t('step1')}</b><span>${t('step1d')}</span></li>
            <li><b>${t('step2')}</b><span>${t('step2d')}</span></li>
            <li><b>${t('step3')}</b><span>${t('step3d')}</span></li>
          </ol>
        </div>
        <form id="wf" novalidate>
          <label>${t('welcomeBiz')}
            <input name="biz" maxlength="60" value="${esc(settings.biz)}" placeholder="${t('bizPh')}" autocomplete="off"></label>
          <button class="btn" type="submit">${t('start')}</button>
        </form>
        <p class="wnote">${t('welcomeNote')}</p>
      </div>`;
    window.scrollTo(0, 0);
    bindLang(() => { const v = $('#wf [name=biz]').value; settings.biz = v.trim(); saveSettings(); welcomeScreen(); });
    $('#wf').addEventListener('submit', e => {
      e.preventDefault(); settings.biz = e.target.biz.value.trim(); settings.welcomed = true; saveSettings(); location.hash = '#/';
      route();
    });
  }

  /* ---------- More: settings, backup & restore ---------- */
  function moreScreen() {
    const lb = settings.lastBackup ? new Date(settings.lastBackup).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : t('never');
    const reg = isRegistered(), since = settings.registeredAt ? new Date(settings.registeredAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const TYPES = ['food', 'fashion', 'beauty', 'events', 'print', 'repair', 'cleaning', 'retail', 'other'];
    shell(t('bizTitle'), `
      <div class="card">
        <h2>${reg ? t('regTitleDone') : t('regTitle')}</h2>
        ${reg ? `<div class="regbadge"><b>✓ ${t('regStatusYes')}</b><span>${t('regId')}: <b id="bizid">${esc(settings.bizId)}</b> · ${t('regSince')} ${since}</span><span id="syncstate">${syncHtml()}</span></div>`
              : `<p class="reghint">${t('regStatusNo')}</p>`}
        <form id="rf" style="gap:12px" novalidate>
          <label>${t('bizNameStar')} <small>${t('bizHint')}</small>
            <input name="biz" maxlength="60" value="${esc(settings.biz)}" placeholder="${t('bizPh')}" autocomplete="organization"></label>
          <label>${t('ownerName')}
            <input name="owner" maxlength="60" value="${esc(settings.owner)}" autocapitalize="words" autocomplete="name"></label>
          <label>${t('bizType')}
            <select name="type"><option value="">${t('typePick')}</option>${TYPES.map(k => `<option value="${k}" ${settings.type === k ? 'selected' : ''}>${t('type_' + k)}</option>`).join('')}</select></label>
          <label>${t('bizPhone')}
            <input name="bizPhone" type="tel" maxlength="30" value="${esc(settings.bizPhone)}" placeholder="e.g. 0803 123 4567" autocomplete="tel"></label>
          <label>${t('bizAddress')}
            <input name="address" maxlength="120" value="${esc(settings.address)}" placeholder="${t('bizAddressPh')}" autocomplete="street-address"></label>
          <label>${t('email')}
            <input name="email" type="email" maxlength="80" value="${esc(settings.email)}" placeholder="name@example.com" autocomplete="email"></label>
          <label>${t('regNo')} <small>${t('regNoHint')}</small>
            <input name="regNo" maxlength="30" value="${esc(settings.regNo)}" placeholder="e.g. 1234567"></label>
          ${cloud.enabled && !settings.consent ? `<label class="consent"><input type="checkbox" name="consent"><span>${t('consentText')}</span></label>` : ''}
          <div class="err" id="rerr" role="alert"></div>
          <button class="btn" type="submit">${reg ? t('saveProfile') : t('registerBtn')}</button>
          <p class="reghint" style="margin:0">${t('regHint')}</p>
        </form>
      </div>
      <div class="card">
        <h2>${t('prefsTitle')}</h2>
        <p style="margin:0 0 8px;font-weight:600;font-size:14px">${t('language')}</p>
        ${langPicker()}
        <form id="sf" style="gap:12px;margin-top:14px" novalidate>
          <label>${t('moneySign')} <small>${t('moneyHint')}</small>
            <input name="currency" maxlength="5" value="${esc(settings.currency)}" placeholder="₦"></label>
          <label>${t('cc')} <small>${t('ccHint')}</small>
            <input name="cc" inputmode="numeric" maxlength="5" value="${esc(settings.cc)}" placeholder="234"></label>
          <button class="btn" type="submit">${t('saveSettings')}</button>
        </form>
      </div>
      <div class="card">
        <h2>${t('backupTitle')}</h2>
        <p style="margin:0 0 12px;color:var(--muted);font-size:14px">${t('backupText')}<br>${t('lastBackup')}: <b>${lb}</b> · ${t('onPhone', orders.length)}</p>
        <div class="actions">
          <button class="btn" id="bk">${t('saveBackup')}</button>
          <button class="btn secondary" id="rs">${t('restore')}</button>
          <input type="file" id="file" accept=".json,application/json" hidden>
        </div>
      </div>
      <p style="text-align:center"><a href="#/welcome" class="chip" style="text-decoration:none;display:inline-block">${t('showWelcome')}</a></p>`, { nav: 'more' });
    bindLang(moreScreen);

    $('#rf').addEventListener('submit', e => {
      e.preventDefault(); const f = e.target, v = k => f[k].value.trim();
      if (!v('biz') || !v('owner') || !f.type.value || !v('bizPhone')) { $('#rerr').textContent = t('eReg'); return; }
      if (cloud.enabled && !settings.consent && !f.consent.checked) { $('#rerr').textContent = t('eConsent'); return; }
      if (cloud.enabled && !settings.consent) settings.consent = true;
      const first = !settings.registeredAt;
      Object.assign(settings, { biz: v('biz'), owner: v('owner'), type: f.type.value, bizPhone: v('bizPhone'), address: v('address'), email: v('email'), regNo: v('regNo') });
      if (first) { settings.registeredAt = new Date().toISOString(); settings.bizId = newBizId(); }
      saveSettings(); toast(t(first ? 'tRegistered' : 'tProfileSaved')); moreScreen(); syncProfile();
    });
    $('#sf').addEventListener('submit', e => {
      e.preventDefault(); const f = e.target;
      settings.currency = f.currency.value.trim().replace(/^#$/, '₦'); settings.cc = f.cc.value.replace(/\D/g, '');
      saveSettings(); toast(t('tSettingsSaved')); moreScreen();
    });
    $('#bk').addEventListener('click', () => {
      const data = JSON.stringify({ app: 'THE ORDER BOOK', version: 1, exportedAt: new Date().toISOString(), settings: Object.fromEntries(PROFILE_KEYS.map(k => [k, settings[k]])), orders }, null, 2);
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `tob-backup-${todayStr()}.json` });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      settings.lastBackup = new Date().toISOString(); saveSettings(); toast(t('tBackupSaved')); moreScreen();
    });
    $('#rs').addEventListener('click', () => $('#file').click());
    $('#file').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const list = Array.isArray(data) ? data : data.orders;
        if (!Array.isArray(list)) throw 0;
        const clean = list.filter(o => o && typeof o.id === 'string' && typeof o.name === 'string' && typeof o.item === 'string'
          && Number.isFinite(o.amount) && /^\d{4}-\d{2}-\d{2}$/.test(o.due) && Array.isArray(o.payments))
          .map(o => ({ id: o.id, name: o.name, phone: String(o.phone || ''), item: o.item, amount: o.amount, due: o.due, ...(/^\d{2}:\d{2}$/.test(o.time || '') ? { time: o.time } : {}),
            status: o.status === 'completed' ? 'completed' : 'pending', createdAt: String(o.createdAt || new Date().toISOString()),
            ...(o.completedAt ? { completedAt: String(o.completedAt) } : {}),
            payments: o.payments.filter(p => p && Number.isFinite(p.amount)).map(p => ({ amount: p.amount, date: String(p.date || new Date().toISOString()), note: String(p.note || 'Payment') })) }));
        if (!clean.length) throw 0;
        if (!confirm(t('cRestore', clean.length))) return;
        const map = new Map(orders.map(o => [o.id, o])); clean.forEach(o => map.set(o.id, o));
        orders = [...map.values()]; save();
        if (data.settings) { settings = { ...settings, ...PROFILE_KEYS.reduce((r, k) => (typeof data.settings[k] === 'string' ? (r[k] = data.settings[k], r) : r), {}) }; saveSettings(); }
        toast(t('tRestored')); location.hash = '#/';
      } catch { toast(t('tBadFile')); }
      e.target.value = '';
    });
  }

  /* ---------- router ---------- */
  function route() {
    liveRefresh = null;
    const h = location.hash.replace(/^#\/?/, '');
    if (h === 'welcome') welcomeScreen();
    else if (!settings.welcomed && !h) welcomeScreen();
    else if (h === 'add') formScreen();
    else if (h.startsWith('edit/')) formScreen(h.slice(5));
    else if (h.startsWith('order/')) detailScreen(h.slice(6));
    else if (h.startsWith('receipt/')) receiptScreen(h.slice(8));
    else if (h === 'customers') customersScreen();
    else if (h.startsWith('customer/')) customerScreen(decodeURIComponent(h.slice(9)));
    else if (h === 'report') reportScreen();
    else if (h === 'more') moreScreen();
    else ordersScreen();
  }
  const isFormRoute = () => /^#\/(add|edit\/|more|welcome)/.test(location.hash) || !settings.welcomed;
  window.addEventListener('hashchange', route);
  window.addEventListener('storage', e => { if (e.key === KEY && !isFormRoute()) { orders = load(); route(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) return; syncProfile(); if (liveRefresh) liveRefresh(); else if (!isFormRoute()) route(); });
  setInterval(() => { if (!document.hidden && liveRefresh) liveRefresh(); }, 30000);
  route();
  window.addEventListener('online', syncProfile);
  document.addEventListener('click', e => { if (e.target && e.target.id === 'syncretry') { syncState = ''; syncProfile(); } });
  setTimeout(syncProfile, 1200);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http'))
    navigator.serviceWorker.register('sw.js').catch(() => {});
})();
