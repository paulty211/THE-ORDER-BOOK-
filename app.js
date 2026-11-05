/* THE ORDER BOOK (TOB) – offline-first order tracker. Data stays on the device (localStorage). */
(() => {
  'use strict';

  /* ---------- storage ---------- */
  const KEY = 'tob.orders.v1', CUR_KEY = 'tob.currency';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(orders)); } catch { toast('Could not save – storage full or blocked'); } };
  let orders = load();
  let currency = (() => { try { return localStorage.getItem(CUR_KEY) ?? ''; } catch { return ''; } })();
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : NaN; };
  const money = n => currency + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
  const daysUntil = s => dayNum(s) - dayNum(todayStr());
  const fmtDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };
  const paid = o => o.payments.reduce((t, p) => t + p.amount, 0);
  const balance = o => Math.max(0, +(o.amount - paid(o)).toFixed(2));
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
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
        ${back ? '<a class="iconbtn" href="#/" aria-label="Back">←</a>' : ''}
        <h1>${title}</h1>${extra}
      </header>
      <main>${body}</main>`;
    window.scrollTo(0, 0);
  };

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
      <input class="search" type="search" id="q" placeholder="Search customer or order" value="${esc(query)}" autocomplete="off">
      <ul class="list" id="list"></ul>
      <a class="fab" href="#/add"><span>+</span> Add order</a>`,
      { extra: '<button class="iconbtn" id="cur" title="Set currency symbol">' + (currency ? 'Currency: ' + currency : 'Set currency') + '</button>' });

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
    $('#cur').addEventListener('click', () => {
      const v = prompt('Currency symbol to show before amounts (e.g. $, £, ₦, KSh). Leave empty for none:', currency);
      if (v === null) return;
      currency = v.trim().slice(0, 5);
      try { localStorage.setItem(CUR_KEY, currency); } catch {}
      ordersScreen();
    });
  }

  /* ---------- screen 2: Add Order ---------- */
  function addScreen() {
    shell('Add Order', `
      <form id="f" novalidate>
        <label>Customer name
          <input name="name" required maxlength="80" autocomplete="off" autocapitalize="words" placeholder="e.g. Mrs. Adeyemi"></label>
        <label>Phone <small>(optional)</small>
          <input name="phone" type="tel" maxlength="30" placeholder="For calling when ready"></label>
        <label>Order
          <textarea name="item" required maxlength="500" placeholder="e.g. 2 agbada, size L – navy blue"></textarea></label>
        <div class="two">
          <label>Total amount
            <input name="amount" required inputmode="decimal" placeholder="0.00"></label>
          <label>Deposit paid
            <input name="deposit" inputmode="decimal" placeholder="0.00"></label>
        </div>
        <div class="balance"><span>Balance due</span><b id="bal">${money(0)}</b></div>
        <label>Collection date
          <input name="due" type="date" required min="${todayStr()}" value=""></label>
        <div class="err" id="err" role="alert"></div>
        <button class="btn" type="submit">Save order</button>
        <a class="btn secondary" href="#/">Cancel</a>
      </form>`, { back: true });

    const f = $('#f'), upd = () => {
      const a = num(f.amount.value) || 0, d = num(f.deposit.value) || 0;
      $('#bal').textContent = money(Math.max(0, a - d));
    };
    f.amount.addEventListener('input', upd); f.deposit.addEventListener('input', upd);
    f.addEventListener('submit', e => {
      e.preventDefault();
      const name = f.name.value.trim(), item = f.item.value.trim();
      const amount = num(f.amount.value), dep = f.deposit.value.trim() === '' ? 0 : num(f.deposit.value);
      const due = f.due.value;
      const fail = m => { $('#err').textContent = m; };
      if (!name) return fail('Enter the customer name.');
      if (!item) return fail('Describe the order.');
      if (!(amount > 0)) return fail('Enter the total amount.');
      if (!(dep >= 0)) return fail('Deposit must be a number.');
      if (dep > amount) return fail('Deposit cannot be more than the total amount.');
      if (!due) return fail('Pick a collection date.');
      const now = new Date().toISOString();
      const o = { id: uid(), name, phone: f.phone.value.trim(), item, amount, due, status: 'pending', createdAt: now,
        payments: dep > 0 ? [{ amount: dep, date: now, note: 'Deposit' }] : [] };
      orders.push(o); save(); tab = 'pending';
      toast('Order saved'); location.hash = '#/';
    });
    f.name.focus();
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

      <div class="actions">
        ${done
          ? `<button class="btn secondary" id="reopen">Reopen order</button>`
          : `<button class="btn" id="complete">✓ Mark as completed</button>`}
        <button class="btn danger" id="del">Delete order</button>
      </div>`, { back: true });

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
    const c = $('#complete');
    if (c) c.addEventListener('click', () => {
      if (bal > 0 && !confirm(`${esc0(o.name)} still owes ${money(bal)}. Mark as completed anyway?`)) return;
      o.status = 'completed'; o.completedAt = new Date().toISOString(); save();
      tab = 'pending'; toast('Order completed'); location.hash = '#/';
    });
    const r = $('#reopen');
    if (r) r.addEventListener('click', () => { o.status = 'pending'; delete o.completedAt; save(); toast('Order reopened'); detailScreen(id); });
    $('#del').addEventListener('click', () => {
      if (!confirm(`Delete the order for ${esc0(o.name)}? This cannot be undone.`)) return;
      orders = orders.filter(x => x.id !== id); save(); toast('Order deleted'); location.hash = '#/';
    });
  }
  const esc0 = s => s; // confirm() takes plain text

  /* ---------- router ---------- */
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    if (h === 'add') addScreen();
    else if (h.startsWith('order/')) detailScreen(h.slice(6));
    else ordersScreen();
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('storage', e => { if (e.key === KEY) { orders = load(); route(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !location.hash.startsWith('#/add')) route(); });
  route();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http'))
    navigator.serviceWorker.register('sw.js').catch(() => {});
})();
