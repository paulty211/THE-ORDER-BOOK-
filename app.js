/* THE ORDER BOOK (TOB) – offline-first order tracker. Data stays on the device (localStorage). */
(() => {
  'use strict';

  /* ---------- storage ---------- */
  const KEY = 'tob.orders.v1', SET_KEY = 'tob.settings.v1', OLD_CUR_KEY = 'tob.currency';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(orders)); } catch { toast('Could not save – storage full or blocked'); } };
  const loadSettings = () => {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(SET_KEY)) || {}; } catch {}
    if (s.currency === undefined) { try { s.currency = localStorage.getItem(OLD_CUR_KEY) || ''; } catch { s.currency = ''; } }
    return { currency: '', cc: '', biz: '', lastBackup: '', ...s };
  };
  const saveSettings = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch {} };
  let orders = load();
  let settings = loadSettings();
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
  const paid = o => o.payments.reduce((t, p) => t + p.amount, 0);
  const balance = o => Math.max(0, +(o.amount - paid(o)).toFixed(2));
  const clip = (s, n) => s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }
  function dueInfo(o) {
    if (o.status === 'completed') return { cls: 'done', label: 'Completed' };
    const d = daysUntil(o.due);
    if (d < 0) return { cls: 'overdue', label: `${-d} day${d === -1 ? '' : 's'} overdue` };
    if (d === 0) return { cls: 'today', label: 'Due today' };
    if (d === 1) return { cls: 'soon', label: 'Tomorrow' };
    if (d <= 3) return { cls: 'soon', label: `In ${d} days` };
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
        <div class="stat"><b>${pending.length}</b><span>Pending orders${dueSoon ? ` · ${dueSoon} due/overdue` : ''}</span></div>
        <div class="stat"><b>${money(owed)}</b><span>Balance to collect</span></div>
      </div>
      <div class="tabs" role="tablist">
        <button role="tab" data-tab="pending" aria-selected="${tab === 'pending'}">Pending</button>
        <button role="tab" data-tab="completed" aria-selected="${tab === 'completed'}">Completed</button>
      </div>
      <input class="search" type="search" id="q" placeholder="Search customer or order details" value="${esc(query)}" autocomplete="off">
      <ul class="list" id="list"></ul>
      <a class="fab" href="#/add"><span>+</span> Add order</a>`,
      { extra: '<a class="iconbtn" href="#/report">Report</a><a class="iconbtn" href="#/more">More</a>' });

    const renderList = () => {
      const q = query.trim().toLowerCase();
      let list = orders.filter(o => (tab === 'completed') === (o.status === 'completed'))
        .filter(o => !q || (o.name + ' ' + o.item).toLowerCase().includes(q));
      list.sort(tab === 'completed'
        ? (a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')
        : (a, b) => a.due.localeCompare(b.due) || a.createdAt.localeCompare(b.createdAt));
      $('#list').innerHTML = list.length ? list.map(o => {
        const di = dueInfo(o), bal = balance(o);
        return `<li><a class="order ${di.cls}" href="#/order/${o.id}">
          <div class="row"><span class="name">${esc(o.name)}</span><span class="badge ${di.cls}">${di.label}</span></div>
          <div class="what">${esc(o.item)}</div>
          <div class="row"><span style="color:var(--muted);font-size:13px">Total ${money(o.amount)}</span>
            <span class="owing ${bal ? '' : 'clear'}">${bal ? 'Owes ' + money(bal) : 'Fully paid'}</span></div>
        </a></li>`;
      }).join('') : `<li class="empty"><big>${q ? '🔍' : tab === 'pending' ? '📒' : '✅'}</big>${
        q ? 'No matching orders.' : tab === 'pending' ? 'No pending orders.<br>Tap “Add order” to record your first one.' : 'No completed orders yet.'}</li>`;
    };
    renderList();
    $('#q').addEventListener('input', e => { query = e.target.value; renderList(); });
    document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; ordersScreen(); }));
  }

  /* ---------- screen 2: Add Order / Edit Order ---------- */
  function formScreen(editId) {
    const o = editId ? orders.find(x => x.id === editId) : null;
    if (editId && !o) { location.hash = '#/'; return; }
    const v = o || { name: '', phone: '', item: '', amount: '', due: '' };
    shell(o ? 'Edit Order' : 'Add Order', `
      <form id="f" novalidate>
        <label>Customer name
          <input name="name" required maxlength="80" autocomplete="off" autocapitalize="words" placeholder="e.g. Mrs. Adeyemi" value="${esc(v.name)}"></label>
        <label>Phone / WhatsApp <small>(optional – needed to message the customer)</small>
          <input name="phone" type="tel" maxlength="30" placeholder="e.g. 0803 123 4567" value="${esc(v.phone)}"></label>
        <label>Order details
          <textarea name="item" required maxlength="500" placeholder="e.g. ${esc(example())}">${esc(v.item)}</textarea>
          <small>Meals, outfits, hair, cakes, prints, repairs… whatever you are making or selling.</small></label>
        <div class="two">
          <label>Total amount
            <input name="amount" required inputmode="decimal" placeholder="0.00" value="${o ? o.amount : ''}"></label>
          ${o ? `<label>Paid so far<input value="${money(paid(o))}" disabled></label>`
              : `<label>Deposit paid<input name="deposit" inputmode="decimal" placeholder="0.00"></label>`}
        </div>
        <div class="balance"><span>Balance due</span><b id="bal">${money(o ? balance(o) : 0)}</b></div>
        <label>Collection date
          <input name="due" type="date" required ${o ? '' : `min="${todayStr()}"`} value="${esc(v.due)}"></label>
        <div class="err" id="err" role="alert"></div>
        <button class="btn" type="submit">${o ? 'Save changes' : 'Save order'}</button>
        <a class="btn secondary" href="${o ? '#/order/' + o.id : '#/'}">Cancel</a>
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
      if (!name) return fail('Enter the customer name.');
      if (!item) return fail('Describe the order.');
      if (!(amount > 0)) return fail('Enter the total amount.');
      if (!(dep >= 0)) return fail('Deposit must be a number.');
      if (dep > amount) return fail('Deposit cannot be more than the total amount.');
      if (o && amount < already) return fail(`Total cannot be less than the ${money(already)} already paid.`);
      if (!due) return fail('Pick a collection date.');
      if (o) {
        Object.assign(o, { name, item, amount, due, phone: f.phone.value.trim() });
        save(); toast('Changes saved'); location.hash = '#/order/' + o.id;
      } else {
        const now = new Date().toISOString();
        orders.push({ id: uid(), name, phone: f.phone.value.trim(), item, amount, due, status: 'pending', createdAt: now,
          payments: dep > 0 ? [{ amount: dep, date: now, note: 'Deposit' }] : [] });
        save(); tab = 'pending'; toast('Order saved'); location.hash = '#/';
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
    if (!n) { toast('Add your country code first (More → Settings)'); location.hash = '#/more'; return; }
    const bal = balance(o), what = clip(o.item, 70), sign = settings.biz ? `\n– ${settings.biz}` : '';
    const text = kind === 'ready'
      ? `Hello ${o.name}, your order (${what}) is ready for collection.${bal ? ` Balance to pay: ${money(bal)}.` : ' Thank you!'}${sign}`
      : `Hello ${o.name}, a friendly reminder that the balance of ${money(bal)} for your order (${what}) is due${
          o.status === 'completed' ? '' : ' by ' + fmtDate(o.due)}. Thank you!${sign}`;
    window.open(`https://wa.me/${n}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  /* ---------- screen 3: Order Details ---------- */
  function detailScreen(id) {
    const o = orders.find(x => x.id === id);
    if (!o) { location.hash = '#/'; return; }
    const bal = balance(o), done = o.status === 'completed', di = dueInfo(o);
    shell('Order Details', `
      <div class="card">
        <p class="big-name">${esc(o.name)}</p>
        <p style="margin:4px 0 10px"><span class="badge ${di.cls}">${done ? 'Completed' : di.label}</span></p>
        ${o.phone ? `<a href="tel:${esc(o.phone)}" class="chip" style="text-decoration:none;display:inline-block">📞 ${esc(o.phone)}</a>` : ''}
        <h2 style="margin-top:14px">Order details</h2>
        <p class="notes">${esc(o.item)}</p>
        <div class="kv" style="margin-top:10px"><span>Collection date</span><b>${fmtDate(o.due)}</b></div>
      </div>

      <div class="card">
        <h2>Payment</h2>
        <div class="kv"><span>Total</span><b>${money(o.amount)}</b></div>
        <div class="kv"><span>Paid so far</span><b>${money(paid(o))}</b></div>
        <div class="kv total"><span>Balance</span><b style="color:${bal ? 'var(--bad)' : 'var(--ok)'}">${bal ? money(bal) : 'Paid in full'}</b></div>
        ${bal && !done ? `
          <form id="pay" style="margin-top:14px" novalidate>
            <div class="pay-row"><input name="amt" inputmode="decimal" placeholder="Amount received" aria-label="Amount received">
              <button class="btn small" type="submit">Add</button></div>
            <div class="chips"><button type="button" class="chip" id="full">Pay full balance (${money(bal)})</button></div>
            <div class="err" id="err" role="alert"></div>
          </form>` : ''}
        ${o.payments.length ? `<ul class="hist">${o.payments.map(p =>
          `<li><span>${esc(p.note || 'Payment')} · ${new Date(p.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span><b>${money(p.amount)}</b></li>`).join('')}</ul>` : ''}
      </div>

      <div class="card">
        <h2>Message customer on WhatsApp</h2>
        ${o.phone ? `<div class="actions">
          <button class="btn wa" id="wa-ready">Order is ready for collection</button>
          ${bal ? `<button class="btn wa" id="wa-due">Balance reminder (${money(bal)})</button>` : ''}
        </div>` : `<p style="margin:0;color:var(--muted)">Add the customer’s phone number (tap Edit) to send messages.</p>`}
      </div>

      <div class="actions">
        ${done
          ? `<button class="btn secondary" id="reopen">Reopen order</button>`
          : `<button class="btn" id="complete">✓ Mark as completed</button>`}
        <button class="btn danger" id="del">Delete order</button>
      </div>`, { back: true, extra: `<a class="iconbtn" href="#/edit/${o.id}">✎ Edit</a>` });

    const pay = (amount, note) => {
      o.payments.push({ amount, date: new Date().toISOString(), note }); save();
      toast(balance(o) ? 'Payment recorded' : 'Paid in full 🎉'); detailScreen(id);
    };
    const pf = $('#pay');
    if (pf) {
      pf.addEventListener('submit', e => {
        e.preventDefault();
        const a = num(pf.amt.value);
        if (!(a > 0)) return ($('#err').textContent = 'Enter the amount received.');
        if (a > bal + 0.001) return ($('#err').textContent = `That is more than the balance (${money(bal)}).`);
        pay(a, 'Payment');
      });
      $('#full').addEventListener('click', () => pay(bal, 'Final payment'));
    }
    const w1 = $('#wa-ready'), w2 = $('#wa-due');
    if (w1) w1.addEventListener('click', () => whatsapp(o, 'ready'));
    if (w2) w2.addEventListener('click', () => whatsapp(o, 'due'));
    const c = $('#complete');
    if (c) c.addEventListener('click', () => {
      if (bal > 0 && !confirm(`${o.name} still owes ${money(bal)}. Mark as completed anyway?`)) return;
      o.status = 'completed'; o.completedAt = new Date().toISOString(); save();
      tab = 'pending'; toast('Order completed'); location.hash = '#/';
    });
    const r = $('#reopen');
    if (r) r.addEventListener('click', () => { o.status = 'pending'; delete o.completedAt; save(); toast('Order reopened'); detailScreen(id); });
    $('#del').addEventListener('click', () => {
      if (!confirm(`Delete the order for ${o.name}? This cannot be undone.`)) return;
      orders = orders.filter(x => x.id !== id); save(); toast('Order deleted'); location.hash = '#/';
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
    const title = weekOffset === 0 ? 'This week' : weekOffset === -1 ? 'Last week' : `${-weekOffset} weeks ago`;

    shell('Weekly Report', `
      <div class="weeknav">
        <button class="iconbtn navbtn" id="prev" aria-label="Previous week">◀</button>
        <div><b>${weekOffset > 0 ? 'Upcoming week' : title}</b><br><small>${range}</small></div>
        <button class="iconbtn navbtn" id="next" aria-label="Next week" ${weekOffset >= 0 ? 'disabled' : ''}>▶</button>
      </div>
      <div class="summary">
        <div class="stat good"><b>${money(received)}</b><span>Money received</span></div>
        <div class="stat bad"><b>${money(owed)}</b><span>Still owed · ${owing} order${owing === 1 ? '' : 's'}</span></div>
      </div>
      <div class="card">
        <h2>This week at a glance</h2>
        <div class="kv"><span>New orders</span><b>${newCount}</b></div>
        <div class="kv"><span>Orders completed</span><b>${doneCount}</b></div>
        <div class="kv"><span>Orders due this week</span><b>${dueWeek.length}${dueWeekBal ? ' · ' + money(dueWeekBal) + ' to collect' : ''}</b></div>
        <div class="kv"><span>Overdue with balance</span><b>${overdue.length}</b></div>
      </div>
      <div class="card">
        <h2>Payments received</h2>
        ${pays.length ? `<ul class="hist" style="margin-top:0">${pays.map(p =>
          `<li><span>${esc(p.name)} · ${esc(p.note || 'Payment')} · ${fmtShort(ymd(new Date(p.date)))}</span><b>${money(p.amount)}</b></li>`).join('')}</ul>`
          : '<p style="margin:0;color:var(--muted)">No payments recorded this week.</p>'}
      </div>
      ${dueWeek.length ? `<div class="card"><h2>Due this week</h2><ul class="hist" style="margin-top:0">${dueWeek.map(o =>
        `<li><a href="#/order/${o.id}" style="color:inherit;text-decoration:none;flex:1">${esc(o.name)} · ${fmtShort(o.due)}</a><b>${balance(o) ? money(balance(o)) + ' owed' : 'Paid'}</b></li>`).join('')}</ul></div>` : ''}
      <button class="btn secondary" id="share">Share this report</button>`, { back: true });

    $('#prev').addEventListener('click', () => { weekOffset--; reportScreen(); });
    $('#next').addEventListener('click', () => { if (weekOffset < 0) { weekOffset++; reportScreen(); } });
    $('#share').addEventListener('click', async () => {
      const text = `${settings.biz || 'THE ORDER BOOK'} – weekly report (${range})\nMoney received: ${money(received)}\nStill owed: ${money(owed)} (${owing} order${owing === 1 ? '' : 's'})\nNew orders: ${newCount} · Completed: ${doneCount}`;
      try {
        if (navigator.share) await navigator.share({ text });
        else { await navigator.clipboard.writeText(text); toast('Report copied'); }
      } catch { /* cancelled */ }
    });
  }

  /* ---------- More: settings, backup & restore ---------- */
  function moreScreen() {
    const lb = settings.lastBackup ? new Date(settings.lastBackup).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'never';
    shell('More', `
      <div class="card">
        <h2>Settings</h2>
        <form id="sf" style="gap:12px" novalidate>
          <label>Business name <small>(signs your WhatsApp messages)</small>
            <input name="biz" maxlength="60" value="${esc(settings.biz)}" placeholder="e.g. Ada’s Kitchen"></label>
          <label>Currency symbol
            <input name="currency" maxlength="5" value="${esc(settings.currency)}" placeholder="e.g. ₦, $, £, KSh"></label>
          <label>Your country code <small>(so numbers like 0803… work on WhatsApp)</small>
            <input name="cc" inputmode="numeric" maxlength="5" value="${esc(settings.cc)}" placeholder="e.g. 234 for Nigeria, 233 Ghana, 254 Kenya"></label>
          <button class="btn" type="submit">Save settings</button>
        </form>
      </div>
      <div class="card">
        <h2>Backup &amp; restore</h2>
        <p style="margin:0 0 12px;color:var(--muted);font-size:14px">Your orders are stored only on this phone. Save a backup file regularly so nothing is lost if the phone is lost, reset or the browser data is cleared.<br>Last backup: <b>${lb}</b> · ${orders.length} order${orders.length === 1 ? '' : 's'}</p>
        <div class="actions">
          <button class="btn" id="bk">Download backup</button>
          <button class="btn secondary" id="rs">Restore from backup file</button>
          <input type="file" id="file" accept=".json,application/json" hidden>
        </div>
      </div>`, { back: true });

    $('#sf').addEventListener('submit', e => {
      e.preventDefault(); const f = e.target;
      settings.biz = f.biz.value.trim(); settings.currency = f.currency.value.trim();
      settings.cc = f.cc.value.replace(/\D/g, ''); saveSettings(); toast('Settings saved'); location.hash = '#/';
    });
    $('#bk').addEventListener('click', () => {
      const data = JSON.stringify({ app: 'THE ORDER BOOK', version: 1, exportedAt: new Date().toISOString(), settings: { currency: settings.currency, cc: settings.cc, biz: settings.biz }, orders }, null, 2);
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `tob-backup-${todayStr()}.json` });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      settings.lastBackup = new Date().toISOString(); saveSettings(); toast('Backup downloaded'); moreScreen();
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
          .map(o => ({ id: o.id, name: o.name, phone: String(o.phone || ''), item: o.item, amount: o.amount, due: o.due,
            status: o.status === 'completed' ? 'completed' : 'pending', createdAt: String(o.createdAt || new Date().toISOString()),
            ...(o.completedAt ? { completedAt: String(o.completedAt) } : {}),
            payments: o.payments.filter(p => p && Number.isFinite(p.amount)).map(p => ({ amount: p.amount, date: String(p.date || new Date().toISOString()), note: String(p.note || 'Payment') })) }));
        if (!clean.length) throw 0;
        if (!confirm(`Restore ${clean.length} order${clean.length === 1 ? '' : 's'} from this backup?\nOrders with the same ID are replaced; your other orders are kept.`)) return;
        const map = new Map(orders.map(o => [o.id, o])); clean.forEach(o => map.set(o.id, o));
        orders = [...map.values()]; save();
        if (data.settings) { settings = { ...settings, ...['currency', 'cc', 'biz'].reduce((r, k) => (typeof data.settings[k] === 'string' ? (r[k] = data.settings[k], r) : r), {}) }; saveSettings(); }
        toast('Backup restored'); location.hash = '#/';
      } catch { toast('That file is not a valid TOB backup'); }
      e.target.value = '';
    });
  }

  /* ---------- router ---------- */
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    if (h === 'add') formScreen();
    else if (h.startsWith('edit/')) formScreen(h.slice(5));
    else if (h.startsWith('order/')) detailScreen(h.slice(6));
    else if (h === 'report') reportScreen();
    else if (h === 'more') moreScreen();
    else ordersScreen();
  }
  const isFormRoute = () => /^#\/(add|edit\/|more)/.test(location.hash);
  window.addEventListener('hashchange', route);
  window.addEventListener('storage', e => { if (e.key === KEY && !isFormRoute()) { orders = load(); route(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !isFormRoute()) route(); });
  route();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http'))
    navigator.serviceWorker.register('sw.js').catch(() => {});
})();
