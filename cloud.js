/* Online registration for THE ORDER BOOK, using a Supabase project over plain fetch (no library).
 * Only the business profile is uploaded – never customers, orders or payments. */
(() => {
  const C = window.TOB_CLOUD || {};
  const base = (C.url || '').replace(/\/+$/, '');
  const enabled = !!(base && C.key);
  const SKEY = 'tob.cloud.session.v1';
  const readS = () => { try { return JSON.parse(localStorage.getItem(SKEY)); } catch { return null; } };
  const writeS = s => { try { s ? localStorage.setItem(SKEY, JSON.stringify(s)) : localStorage.removeItem(SKEY); } catch {} };

  async function call(path, { method = 'POST', body, token, prefer } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { apikey: C.key, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(prefer ? { Prefer: prefer } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let data = null; try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) { const e = new Error((data && (data.message || data.msg || data.error_description)) || 'HTTP ' + res.status); e.status = res.status; e.body = data; throw e; }
    return data;
  }
  const keep = d => ({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), user_id: d.user && d.user.id });

  // Every phone silently gets an anonymous account, so it can only ever read or change its own registration.
  async function session() {
    let s = readS();
    if (s && s.access_token && s.expires_at * 1000 > Date.now() + 60000) return s;
    if (s && s.refresh_token) {
      try { s = keep(await call('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: s.refresh_token } })); writeS(s); return s; } catch { /* fall through to a new account */ }
    }
    s = keep(await call('/auth/v1/signup', { body: {} }));
    writeS(s); return s;
  }

  async function register(p) {
    const row = () => s => ({
      owner_id: s.user_id, business_code: p.code, business_name: p.name, owner_name: p.owner, business_type: p.type, phone: p.phone,
      address: p.address || null, email: p.email || null, cac_number: p.cac || null, language: p.lang || null, app_version: p.version || null
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const s = await session();
      try {
        await call('/rest/v1/businesses?on_conflict=owner_id', { token: s.access_token, prefer: 'resolution=merge-duplicates,return=minimal', body: row()(s) });
        return true;
      } catch (e) {
        if (e.status === 401 && attempt === 0) { writeS({ ...s, expires_at: 0 }); continue; }   // token rejected: refresh the SAME login (new account only if that fails)
        if (e.status === 409 && /business_code/.test((e.body && (e.body.message || e.body.details)) || '')) { const err = new Error('code taken'); err.code = 'code_taken'; throw err; }
        throw e;
      }
    }
  }
  window.TOB_CLOUD_API = { enabled, register };
})();
