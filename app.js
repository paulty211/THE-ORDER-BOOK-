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
    const out = { currency: old !== null ? old : '₦', cc: s ? '' : '234', biz: '', lastBackup: '', lang: 'en', welcomed: false, ...(s || {}) };
    if (out.currency.trim() === '#') out.currency = '₦';   // people often type # for Naira
    return out;
  };
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
    const d = daysUntil(o.due);
    if (d < 0) return { cls: 'overdue', label: t('late', -d) };
    if (d === 0) return { cls: 'today', label: withTime(t('today'), o) };
    if (d === 1) return { cls: 'soon', label: withTime(t('tomorrow'), o) };
    if (d <= 3) return { cls: 'soon', label: withTime(t('inDays', d), o) };
    return { cls: '', label: fmtDate(o.due) };
  }
  const shell = (title, body, { back = false, extra = '' } = {}) => {
    $('#app').innerHTML = `
      <header class="bar">
        ${back ? `<a class="iconbtn" href="${back === true ? '#/' : back}" aria-label="Back">←</a>` : ''}
        <h1>${title}</h1>${extra}
      </header>
      <main>${body}</main>`;
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

  /* ---------- screen 1: Orders ---------- */
  let tab = 'pending', query = '';
  function ordersScreen() {
    const pending = orders.filter(o => o.status !== 'completed');
    const owed = pending.reduce((t, o) => t + balance(o), 0);
    const dueSoon = pending.filter(o => daysUntil(o.due) <= 0).length;
    shell(`THE ORDER BOOK<span class="sub">TOB</span>`, `
      <div class="summary">
        <div class="stat"><b>${pending.length}</b><span>${t('ordersToDeliver')}${dueSoon ? t('dueOrLate', dueSoon) : ''}</span></div>
        <div class="stat"><b>${money(owed)}</b><span>${t('moneyOwed')}</span></div>
      </div>
      <div class="tabs" role="tablist">
        <button role="tab" data-tab="pending" aria-selected="${tab === 'pending'}">${t('tabTo')}</button>
        <button role="tab" data-tab="completed" aria-selected="${tab === 'completed'}">${t('tabDone')}</button>
      </div>
      <input class="search" type="search" id="q" placeholder="${t('search')}" value="${esc(query)}" autocomplete="off">
      <ul class="list" id="list"></ul>
      <a class="fab" href="#/add"><span>+</span> ${t('addOrder')}</a>`,
      { extra: `<a class="iconbtn" href="#/report">${t('report')}</a><a class="iconbtn" href="#/more">${t('settings')}</a>` });

    const renderList = () => {
      const q = query.trim().toLowerCase();
      let list = orders.filter(o => (tab === 'completed') === (o.status === 'completed'))
        .filter(o => !q || (o.name + ' ' + o.item).toLowerCase().includes(q));
      list.sort(tab === 'completed'
        ? (a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')
        : (a, b) => a.due.localeCompare(b.due) || (a.time || '99:99').localeCompare(b.time || '99:99') || a.createdAt.localeCompare(b.createdAt));
      $('#list').innerHTML = list.length ? list.map(o => {
        const di = dueInfo(o), bal = balance(o);
        return `<li><a class="order ${di.cls}" href="#/order/${o.id}">
          <div class="row"><span class="name">${esc(o.name)}</span><span class="badge ${di.cls}">${di.label}</span></div>
          <div class="what">${esc(o.item)}</div>
          <div class="row"><span style="color:var(--muted);font-size:13px">${t('total', money(o.amount))}</span>
            <span class="owing ${bal ? '' : 'clear'}">${bal ? t('owes', money(bal)) : t('paidFull')}</span></div>
        </a></li>`;
      }).join('') : `<li class="empty"><big>${q ? '🔍' : tab === 'pending' ? '📒' : '✅'}</big>${
        q ? t('noMatch') : tab === 'pending' ? t('emptyTo') : t('emptyDone')}</li>`;
    };
    renderList();
    $('#q').addEventListener('input', e => { query = e.target.value; renderList(); });
    document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; ordersScreen(); }));
  }

  /* ---------- screen 2: Add Order / Edit Order ---------- */
  function formScreen(editId) {
    const o = editId ? orders.find(x => x.id === editId) : null;
    if (editId && !o) { location.hash = '#/'; return; }
    const v = o || { name: '', phone: '', item: '', amount: '', due: '', time: '' };
    shell(o ? t('editTitle') : t('addTitle'), `
      <form id="f" novalidate>
        <label>${t('custName')}
          <input name="name" required maxlength="80" autocomplete="off" autocapitalize="words" placeholder="${t('custNamePh')}" value="${esc(v.name)}"></label>
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
    if (!o) f.name.focus();
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
        <p style="margin:4px 0 10px"><span class="badge ${di.cls}">${done ? t('deliveredBadge') : di.label}</span></p>
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
        ${done
          ? `<button class="btn secondary" id="reopen">${t('reopen')}</button>`
          : `<button class="btn" id="complete">${t('complete')}</button>`}
        <button class="btn danger" id="del">${t('del')}</button>
      </div>`, { back: true, extra: `<a class="iconbtn" href="#/edit/${o.id}">${t('edit')}</a>` });

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

  /* ---------- Weekly report ---------- */
  let weekOffset = 0;
  function reportScreen() {
    const ws = new Date(); ws.setHours(0, 0, 0, 0);
    ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7) + weekOffset * 7); // weeks start on Monday
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    const a = ymd(ws), b = ymd(we), inWeek = iso => { const d = ymd(new Date(iso)); return d >= a && d <= b; };

    const pays = [];
    orders.forEach(o => o.payments.forEach(p => { if (inWeek(p.date)) pays.push({ ...p, name: o.name }); }));
    pays.sort((x, y) => y.date.localeCompare(x.date));
    const received = pays.reduce((t, p) => t + p.amount, 0);
    const pending = orders.filter(o => o.status !== 'completed');
    const owed = pending.reduce((t, o) => t + balance(o), 0);
    const owing = pending.filter(o => balance(o) > 0).length;
    const dueWeek = pending.filter(o => o.due >= a && o.due <= b).sort((x, y) => x.due.localeCompare(y.due));
    const dueWeekBal = dueWeek.reduce((t, o) => t + balance(o), 0);
    const overdue = pending.filter(o => o.due < todayStr() && balance(o) > 0);
    const newCount = orders.filter(o => inWeek(o.createdAt)).length;
    const doneCount = orders.filter(o => o.completedAt && inWeek(o.completedAt)).length;
    const range = `${fmtShort(a)} – ${fmtShort(b)}`;
    const title = weekOffset === 0 ? t('thisWeek') : weekOffset === -1 ? t('lastWeek') : t('weeksAgo', -weekOffset);

    shell(t('reportTitle'), `
      <div class="weeknav">
        <button class="iconbtn navbtn" id="prev" aria-label="${t('prevAria')}">◀</button>
        <div><b>${weekOffset > 0 ? t('nextWeek') : title}</b><br><small>${range}</small></div>
        <button class="iconbtn navbtn" id="next" aria-label="${t('nextAria')}" ${weekOffset >= 0 ? 'disabled' : ''}>▶</button>
      </div>
      <div class="summary">
        <div class="stat good"><b>${money(received)}</b><span>${t('received')}</span></div>
        <div class="stat bad"><b>${money(owed)}</b><span>${t('stillOwed', owing)}</span></div>
      </div>
      <div class="card">
        <h2>${t('short')}</h2>
        <div class="kv"><span>${t('newOrders')}</span><b>${newCount}</b></div>
        <div class="kv"><span>${t('deliveredN')}</span><b>${doneCount}</b></div>
        <div class="kv"><span>${t('dueWeek')}</span><b>${dueWeek.length}${dueWeekBal ? t('toCollect', money(dueWeekBal)) : ''}</b></div>
        <div class="kv"><span>${t('lateOwing')}</span><b>${overdue.length}</b></div>
      </div>
      <div class="card">
        <h2>${t('paymentsRecv')}</h2>
        ${pays.length ? `<ul class="hist" style="margin-top:0">${pays.map(p =>
          `<li><span>${esc(p.name)} · ${esc(noteLabel(p.note || 'Payment'))} · ${fmtShort(ymd(new Date(p.date)))}</span><b>${money(p.amount)}</b></li>`).join('')}</ul>`
          : `<p style="margin:0;color:var(--muted)">${t('noPay')}</p>`}
      </div>
      ${dueWeek.length ? `<div class="card"><h2>${t('deliverThisWeek')}</h2><ul class="hist" style="margin-top:0">${dueWeek.map(o =>
        `<li><a href="#/order/${o.id}" style="color:inherit;text-decoration:none;flex:1">${esc(o.name)} · ${fmtShort(o.due)}</a><b>${balance(o) ? t('owedSuffix', money(balance(o))) : t('paidShort')}</b></li>`).join('')}</ul></div>` : ''}
      <button class="btn secondary" id="share">${t('share')}</button>`, { back: true });

    $('#prev').addEventListener('click', () => { weekOffset--; reportScreen(); });
    $('#next').addEventListener('click', () => { if (weekOffset < 0) { weekOffset++; reportScreen(); } });
    $('#share').addEventListener('click', async () => {
      const text = t('shareText', settings.biz || 'THE ORDER BOOK', range, money(received), money(owed), owing, newCount, doneCount);
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
    settings.lang = b.dataset.lang; saveSettings(); document.documentElement.lang = settings.lang === 'pcm' ? 'en-NG' : 'en'; rerender();
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
    shell(t('settingsTitle'), `
      <div class="card">
        <h2>${t('language')}</h2>
        ${langPicker()}
      </div>
      <div class="card">
        <h2>${t('settingsTitle')}</h2>
        <form id="sf" style="gap:12px" novalidate>
          <label>${t('bizName')} <small>${t('bizHint')}</small>
            <input name="biz" maxlength="60" value="${esc(settings.biz)}" placeholder="${t('bizPh')}"></label>
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
      <p style="text-align:center"><a href="#/welcome" class="chip" style="text-decoration:none;display:inline-block">${t('showWelcome')}</a></p>`, { back: true });
    bindLang(moreScreen);

    $('#sf').addEventListener('submit', e => {
      e.preventDefault(); const f = e.target;
      settings.biz = f.biz.value.trim(); settings.currency = f.currency.value.trim().replace(/^#$/, '₦');
      settings.cc = f.cc.value.replace(/\D/g, ''); saveSettings(); toast(t('tSettingsSaved')); location.hash = '#/';
    });
    $('#bk').addEventListener('click', () => {
      const data = JSON.stringify({ app: 'THE ORDER BOOK', version: 1, exportedAt: new Date().toISOString(), settings: { currency: settings.currency, cc: settings.cc, biz: settings.biz }, orders }, null, 2);
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
        if (data.settings) { settings = { ...settings, ...['currency', 'cc', 'biz'].reduce((r, k) => (typeof data.settings[k] === 'string' ? (r[k] = data.settings[k], r) : r), {}) }; saveSettings(); }
        toast(t('tRestored')); location.hash = '#/';
      } catch { toast(t('tBadFile')); }
      e.target.value = '';
    });
  }

  /* ---------- router ---------- */
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    if (h === 'welcome') welcomeScreen();
    else if (!settings.welcomed && !h) welcomeScreen();
    else if (h === 'add') formScreen();
    else if (h.startsWith('edit/')) formScreen(h.slice(5));
    else if (h.startsWith('order/')) detailScreen(h.slice(6));
    else if (h === 'report') reportScreen();
    else if (h === 'more') moreScreen();
    else ordersScreen();
  }
  const isFormRoute = () => /^#\/(add|edit\/|more|welcome)/.test(location.hash) || !settings.welcomed;
  window.addEventListener('hashchange', route);
  window.addEventListener('storage', e => { if (e.key === KEY && !isFormRoute()) { orders = load(); route(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !isFormRoute()) route(); });
  route();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http'))
    navigator.serviceWorker.register('sw.js').catch(() => {});
})();
