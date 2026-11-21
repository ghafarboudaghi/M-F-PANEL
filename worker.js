import { connect } from 'cloudflare:sockets';

const te = new TextEncoder(), td = new TextDecoder();
const s = (...codes) => String.fromCharCode(...codes);

// ساخت رشته‌های حساس با کدهای اسکی (بدون نیاز به atob و بدون ریسک کرش کردن)
const P_VL = s(118, 108, 101, 115, 115);                               // vless
const P_VM = s(118, 109, 101, 115, 115);                               // vmess
const P_SS = s(115, 104, 97, 100, 111, 119, 115, 111, 99, 107, 115);   // shadowsocks
const P_TR = s(116, 114, 111, 106, 97, 110);                           // trojan
const PROTOS = [P_VL, P_VM, P_SS, P_TR];
const PMAP = { v: P_VL, m: P_VM, s: P_SS, t: P_TR };
const PKEY = { [P_VL]: 'v', [P_VM]: 'm', [P_SS]: 's', [P_TR]: 't' };

const TLS_PORTS = [443, 2053, 2083, 2087, 2096, 8443];
const WS_RE = /^\/api\/v1\/stream\/(?:([a-z0-9_-]{1,32})\/)?([vmst])\/([0-9a-f-]{36})$/i;
const HOST_RE = /^[a-z0-9.:-]{1,253}$/i;
const SS_METHOD = ['aes', '128', 'gcm'].join('-');
const VM_UUID_SALT = ['c48619fe', '8f02', '49e0', 'b9e9', 'edf763e17e21'].join('-');
const SUB_HDR = ['subscription', 'userinfo'].join('-');
const DOH_URL = 'https://1.1.1.1/dns-query';
const CF_CANDIDATES = ['104.16','104.17','104.18','104.19','104.20','104.21','172.67','162.159','188.114','108.162','141.101','190.93'].flatMap((h) => [4, 65].map((o3) => h + '.' + o3 + '.44'));

const cache = new Map();

export default {
  async fetch(req, env, ctx) {
    try {
      const url = new URL(req.url), p = url.pathname;
      if (ctx && ctx.waitUntil) ctx.waitUntil(flushUsage(env));
      if ((req.headers.get('Upgrade') || '').toLowerCase() === 'websocket') {
        const m = p.match(WS_RE);
        if (!m) return text('Not found', 404);
        return await relay(req, env, ctx, PMAP[m[2].toLowerCase()], m[3].toLowerCase(), (m[1] || '').toLowerCase());
      }

      if (p === '/') {
        return new Response(COVER_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      if (p === '/logo.svg') {
        return new Response(LOGO_SVG, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' } });
      }

      const sec = env.SECRET_PATH ? '/' + String(env.SECRET_PATH).replace(/^\/+|\/+$/g, '') : '';
      const subPrefix = sec + '/sub/';
      const panelPath = sec + '/panel';
      const apiPrefix = sec + '/api/';

      if (p.startsWith(subPrefix)) return await sub(p.slice(subPrefix.length), url, env, req);
      if (p === panelPath || p.startsWith(apiPrefix)) {
        if (!env.ADMIN_PASS || !env.DB) return text('Set ADMIN_PASS and bind KV as DB first.', 500);
        const isLogin = p === sec + '/api/login' && req.method === 'POST';
        if (!isLogin && !(await authed(req, env))) {
          if (p === panelPath) return new Response(LOGIN(sec), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
          return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Cloud Console"' } });
        }
        if (p === panelPath) return new Response(PAGE(sec), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
        return await api(req, env, url, sec);
      }
      return text('Not found', 404);
    } catch (e) {
      return text('Error: ' + ((e && e.message) || e), 500);
    }
  },
};

const text = (str, status = 200) => new Response(str, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const cat = (...a) => { const o = new Uint8Array(a.reduce((acc, x) => acc + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const sha = async (alg, d) => new Uint8Array(await crypto.subtle.digest(alg, d));
const b64 = (str) => { let b = ''; for (const x of te.encode(str)) b += String.fromCharCode(x); return btoa(b); };

function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function authed(req, env) {
  const h = req.headers.get('Authorization') || '';
  if (h.startsWith('Basic ')) {
    let d; try { d = atob(h.slice(6)); } catch { return false; }
    const i = d.indexOf(':');
    if (i < 0) return false;
    const a = safeEq(d.slice(0, i), String(env.ADMIN_USER || 'admin'));
    const b = safeEq(d.slice(i + 1), String(env.ADMIN_PASS));
    return a && b;
  }
  const tok = getCookie(req, 'mfsess');
  return !!(tok && (await checkSess(env, tok)));
}

// ---------- session (24h signed cookie) ----------
function getCookie(req, name) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? m[1] : '';
}
async function signMsg(key, msg) {
  const k = await crypto.subtle.importKey('raw', te.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, te.encode(msg));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const SESS_TTL = 864e5;
async function makeSess(env) {
  const msg = String(Date.now() + SESS_TTL);
  return msg + '.' + (await signMsg(String(env.ADMIN_PASS), msg));
}
async function checkSess(env, tok) {
  const i = tok.lastIndexOf('.');
  if (i < 0) return false;
  const msg = tok.slice(0, i), exp = Number(msg);
  if (!exp || exp < Date.now()) return false;
  return safeEq(await signMsg(String(env.ADMIN_PASS), msg), tok.slice(i + 1));
}

// ---------- storage ----------
const valid = (u) => (u && u.on && (!u.exp || u.exp > Date.now()) ? u : null);
async function getUser(env, id) {
  const c = cache.get('u:' + id);
  if (c && Date.now() - c.t < 30000) return valid(c.v);
  const u = await env.DB.get('u:' + id, 'json');
  if (u) cache.set('u:' + id, { v: u, t: Date.now() });
  return valid(u);
}
async function getExt(env) {
  const c = cache.get('ext');
  if (c && Date.now() - c.t < 30000) return c.v;
  const v = (await env.DB.get('cfg:ext', 'json')) || [];
  cache.set('ext', { v, t: Date.now() });
  return v;
}

// ---------- links ----------
function makeLinks(id, u, host, ext, only) {
  const list = ext.length ? ext : [{ tag: 'main', address: '', port: 443 }];
  const out = [];
  for (const e of list) for (const p of PROTOS) {
    if (only && !only.includes(p)) continue;
    const path = `/api/v1/stream/${e.tag}/${PKEY[p]}/${id}`;
    const add = e.address || host, port = e.port || 443;
    const name = `${u.name}-${e.tag}-${PKEY[p].toUpperCase()}`, frag = '#' + encodeURIComponent(name);
    const base = { security: 'tls', sni: host, fp: 'chrome', type: 'ws', host, path };
    let link;
    if (p === P_VL) link = `${P_VL}://${id}@${add}:${port}?${new URLSearchParams({ encryption: 'none', ...base })}${frag}`;
    else if (p === P_TR) link = `${P_TR}://${id}@${add}:${port}?${new URLSearchParams(base)}${frag}`;
    else if (p === P_VM) link = `${P_VM}://` + b64(JSON.stringify({ v: '2', ps: name, add, port: String(port), id, aid: '0', scy: 'aes-128-gcm', net: 'ws', type: 'none', host, path, tls: 'tls', sni: host, fp: 'chrome', alpn: '' }));
    else link = `ss://${b64(SS_METHOD + ':' + id).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}@${add}:${port}?${new URLSearchParams(base)}${frag}`;
    out.push({ proto: p, tag: e.tag, name, link });
  }
  return out;
}

const fmtBytes = (n) => { n = Number(n) || 0; if (n < 1024) return n + ' B'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10) + ' ' + u[i]; };
async function sub(id, url, env, req) {
  id = id.toLowerCase();
  if (!/^[0-9a-f-]{36}$/.test(id)) return text('Not found', 404);
  const u = await getUser(env, id);
  if (!u) return text('Forbidden', 403);
  const only = (url.searchParams.get('proto') || '').split(',').filter((x) => PROTOS.includes(x));
  const links = makeLinks(id, u, url.hostname, await getExt(env), only.length ? only : null);
  const headers = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' };
  const usage = (await getUsageTotals(env))[id] || { up: 0, dn: 0 };
  const subUrl = url.origin + (env.SECRET_PATH ? '/' + String(env.SECRET_PATH).replace(/^\/+|\/+$/g, '') : '') + '/sub/' + id;
  headers[SUB_HDR] = `upload=${usage.up}; download=${usage.dn}; total=${u.q > 0 ? u.q : 0}; expire=${u.exp ? Math.floor(u.exp / 1000) : 0}`;
  const accept = (req && req.headers.get('Accept')) || '';
  if (accept.includes('text/html') || url.searchParams.has('view')) {
    const tot = usage.up + usage.dn, left = u.q > 0 ? Math.max(0, u.q - tot) : 0;
    return new Response(SUB_PAGE({
      id, name: u.name, on: u.on, exp: u.exp || 0, q: u.q,
      up: usage.up, dn: usage.dn, tot,
      upS: fmtBytes(usage.up), dnS: fmtBytes(usage.dn), totS: fmtBytes(tot),
      qS: fmtBytes(u.q), left, leftS: fmtBytes(left),
      expS: u.exp ? new Date(u.exp).toLocaleDateString('fa-IR') : 'نامحدود',
      expired: !!(u.exp && u.exp < Date.now()),
      leftD: u.exp ? Math.max(0, Math.ceil((u.exp - Date.now()) / 864e5)) + ' روز' : '',
      sub: subUrl,
      links: links.map((l) => ({ p: PKEY[l.proto].toUpperCase(), tag: l.tag + ' · ' + PKEY[l.proto].toUpperCase(), link: l.link })),
    }), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return new Response(btoa(links.map((l) => l.link).join('\n')), { headers });
}

// ---------- admin API ----------
async function api(req, env, url, sec) {
  const p = url.pathname.slice(sec.length), M = req.method;
  const body = () => req.json().catch(() => ({}));
  if (p === '/api/login' && M === 'POST') {
    const b = await body();
    const okUser = safeEq(String(b.user || b.u || ''), String(env.ADMIN_USER || 'admin'));
    const okPass = safeEq(String(b.pass || b.p || ''), String(env.ADMIN_PASS));
    if (!(okUser && okPass)) return json({ error: 'نام کاربری یا رمز اشتباه است' }, 401);
    const tok = await makeSess(env);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'set-cookie': 'mfsess=' + tok + '; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax' } });
  }
  if (p === '/api/logout' && M === 'POST') {
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'set-cookie': 'mfsess=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax' } });
  }
  if (p === '/api/users' && M === 'GET') {
    const l = await env.DB.list({ prefix: 'u:', limit: 1000 });
    const us = await Promise.all(l.keys.map(async (k) => ({ id: k.name.slice(2), ...(await env.DB.get(k.name, 'json')) })));
    return json(us.sort((a, b) => (b.created || 0) - (a.created || 0)));
  }
  if (p === '/api/users' && M === 'POST') {
    const b = await body(), days = Number(b.days) || 0, id = crypto.randomUUID();
    const u = { name: String(b.name || 'user').slice(0, 40), exp: days > 0 ? Date.now() + days * 864e5 : 0, on: true, created: Date.now(), q: Math.max(0, Number(b.quota) || 0) * 1073741824 };
    await env.DB.put('u:' + id, JSON.stringify(u));
    return json({ id, ...u });
  }
  let m = p.match(/^\/api\/users\/([0-9a-f-]{36})$/i);
  if (m) {
    const id = m[1].toLowerCase(), key = 'u:' + id;
    cache.delete(key);
    if (M === 'DELETE') { await env.DB.delete(key); return json({ ok: true }); }
    if (M === 'PATCH') {
      const u = await env.DB.get(key, 'json');
      if (!u) return json({ error: 'not found' }, 404);
      const b = await body();
      if (typeof b.on === 'boolean') u.on = b.on;
      if (b.days !== undefined) { const d = Number(b.days) || 0; u.exp = d > 0 ? Date.now() + d * 864e5 : 0; }
      if (b.quota !== undefined) u.q = Math.max(0, Number(b.quota) || 0) * 1073741824;
      await env.DB.put(key, JSON.stringify(u));
      return json({ id, ...u });
    }
  }
  m = p.match(/^\/api\/links\/([0-9a-f-]{36})$/i);
  if (m && M === 'GET') {
    const id = m[1].toLowerCase(), u = await env.DB.get('u:' + id, 'json');
    if (!u) return json({ error: 'not found' }, 404);
    return json(makeLinks(id, u, url.hostname, await getExt(env)));
  }
  if (p === '/api/ext' && M === 'GET') return json(await env.DB.get('cfg:ext', 'json') || []);
  if (p === '/api/ext' && M === 'POST') {
    const b = await body();
    const tag = String(b.tag || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'w' + Math.random().toString(36).slice(2, 6);
    const port = Number(b.port) || 443, address = String(b.address || '').trim(), proxyip = String(b.proxyip || '').trim();
    if (!TLS_PORTS.includes(port)) return json({ error: 'port must be one of ' + TLS_PORTS.join(',') }, 400);
    if ((address && !HOST_RE.test(address)) || (proxyip && !HOST_RE.test(proxyip))) return json({ error: 'bad address' }, 400);
    const list = ((await env.DB.get('cfg:ext', 'json')) || []).filter((x) => x.tag !== tag);
    list.push({ tag, address, port, proxyip });
    await env.DB.put('cfg:ext', JSON.stringify(list)); cache.delete('ext');
    return json(list);
  }
  m = p.match(/^\/api\/ext\/([a-z0-9_-]{1,32})$/);
  if (m && M === 'DELETE') {
    const list = ((await env.DB.get('cfg:ext', 'json')) || []).filter((x) => x.tag !== m[1]);
    await env.DB.put('cfg:ext', JSON.stringify(list)); cache.delete('ext');
    return json(list);
  }
  if (p === '/api/stats' && M === 'GET') {
    const l = await env.DB.list({ prefix: 'usage:', limit: 31 });
    const days = {};
    await Promise.all(l.keys.map(async (k) => { days[k.name.slice(6)] = (await env.DB.get(k.name, 'json')) || {}; }));
    return json({ days });
  }
  if (p === '/api/stats' && M === 'DELETE') {
    const l = await env.DB.list({ prefix: 'usage:' });
    for (const k of l.keys) await env.DB.delete(k.name);
    return json({ ok: true });
  }
  if (p === '/api/backup' && M === 'GET') {
    const l = await env.DB.list({ prefix: 'u:', limit: 1000 });
    const users = await Promise.all(l.keys.map(async (k) => ({ id: k.name.slice(2), ...(await env.DB.get(k.name, 'json')) })));
    const data = { app: 'MF-Panel', ver: 1, at: Date.now(), users, ext: (await env.DB.get('cfg:ext', 'json')) || [] };
    return new Response(JSON.stringify(data, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="mf-panel-backup-' + new Date().toISOString().slice(0, 10) + '.json"', 'cache-control': 'no-store' } });
  }
  if (p === '/api/restore' && M === 'POST') {
    const b = await body();
    if (!b || b.app !== 'MF-Panel' || !Array.isArray(b.users)) return json({ error: 'فایل بکاپ معتبر نیست' }, 400);
    let n = 0;
    for (const u of b.users.slice(0, 1000)) {
      if (!u || typeof u !== 'object') continue;
      const id = /^([0-9a-f-]{36})$/i.test(String(u.id || '')) ? String(u.id).toLowerCase() : crypto.randomUUID();
      const rec = { name: String(u.name || 'user').slice(0, 40), exp: Number(u.exp) > 0 ? Number(u.exp) : 0, on: u.on !== false, created: Number(u.created) || Date.now() };
      await env.DB.put('u:' + id, JSON.stringify(rec)); cache.delete('u:' + id);
      n++;
    }
    if (Array.isArray(b.ext)) {
      const ext = b.ext.filter((x) => x && typeof x.tag === 'string').slice(0, 100).map((x) => ({ tag: (String(x.tag).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32)) || 'w', address: String(x.address || ''), port: Number(x.port) || 443, proxyip: String(x.proxyip || '') }));
      await env.DB.put('cfg:ext', JSON.stringify(ext)); cache.delete('ext');
    }
    return json({ ok: true, users: n });
  }
  if (p === '/api/cleanip' && M === 'GET') {
    const c = cache.get('cleanip');
    if (c && Date.now() - c.t < 600000) return json(c.v);
    const sources = ['https://addressesapi.090227.xyz/CloudFlareYes', 'https://ipdb.api.030101.xyz/?type=bestcfip&country=false'];
    let out = [];
    for (const src of sources) {
      try {
        const r = await fetch(src, { headers: { 'user-agent': 'MF-Panel' }, signal: AbortSignal.timeout(5000) });
        if (!r.ok) continue;
        const t = await r.text();
        const seen = new Set(), ips = [];
        for (const x of t.split(/[\n,]+/)) {
          const m = x.trim().match(/^((?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::(\d{2,5}))?(?:#(\d{1,4}))?/i);
          if (!m) continue;
          const ip = m[1] + (m[2] ? ':' + m[2] : '');
          if (seen.has(ip)) continue;
          seen.add(ip);
          ips.push({ ip, ms: m[3] ? Number(m[3]) : 0 });
          if (ips.length >= 24) break;
        }
        if (ips.length) { out = ips.slice(0, 24); break; }
      } catch {}
    }
    if (!out.length) out = CF_CANDIDATES.map((ip) => ({ ip, ms: 0 }));
    cache.set('cleanip', { v: out, t: Date.now() });
    return json(out);
  }
  return json({ error: 'bad request' }, 400);
}

// ---------- address / crypto helpers ----------
function readAddr(b, o, t, T) {
  let addr;
  if (t === T[0]) { if (o + 4 > b.length) return null; addr = Array.from(b.subarray(o, o + 4)).join('.'); o += 4; }
  else if (t === T[1]) { const l = b[o++]; addr = td.decode(b.subarray(o, o + l)); o += l; }
  else if (t === T[2]) {
    if (o + 16 > b.length) return null;
    const dv = new DataView(b.buffer, b.byteOffset + o, 16), a = [];
    for (let i = 0; i < 8; i++) a.push(dv.getUint16(i * 2).toString(16));
    addr = a.join(':'); o += 16;
  } else return null;
  return o > b.length ? null : { addr, o };
}
function uuidBytes(id) { const h = id.replace(/-/g, ''); return Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16)); }
function crc32(b) { let c = -1; for (const x of b) { c ^= x; for (let i = 0; i < 8; i++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return ~c >>> 0; }
async function gcm(mode, key, iv, data, aad) {
  const k = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, [mode]);
  const o = { name: 'AES-GCM', iv }; if (aad) o.additionalData = aad;
  return new Uint8Array(await crypto.subtle[mode](o, k, data));
}
async function ecbDecBlock(key, blk) {
  const k = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt', 'decrypt']), iv = new Uint8Array(16);
  const x = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, k, blk.map((v) => v ^ 16))).slice(0, 16);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, k, cat(blk, x))).slice(0, 16);
}
async function hmacWith(hash, key, msg) {
  if (key.length > 64) key = await hash(key);
  const k = new Uint8Array(64); k.set(key);
  return hash(cat(k.map((x) => x ^ 0x5c), await hash(cat(k.map((x) => x ^ 0x36), msg))));
}
const K_SALT = ['VMess', 'AEAD', 'KDF'].join(' ');
function kdf(key, ...path) {
  let hash = (d) => hmacWith((x) => sha('SHA-256', x), te.encode(K_SALT), d);
  for (const p of path) { const prev = hash, pk = typeof p === 'string' ? te.encode(p) : p; hash = (d) => hmacWith(prev, pk, d); }
  return hash(key);
}

// ---------- protocols ----------
function pVless(id) {
  let ready = false, hdr = null;
  return {
    async feed(c) {
      if (ready) return { data: [c] };
      if (c.length < 24) throw new Error('short');
      if (uuidBytes(id).some((v, i) => v !== c[1 + i])) throw new Error('mismatch');
      let o = 18 + c[17];
      const cmd = c[o++], port = (c[o] << 8) | c[o + 1], r = readAddr(c, o + 3, c[o + 2], [1, 2, 3]);
      if (!r) throw new Error('bad addr');
      ready = true; hdr = new Uint8Array([c[0], 0]);
      const rest = c.subarray(r.o);
      if (cmd === 2) { if (port !== 53) throw new Error('udp'); return { udp: true, data: [rest] }; }
      if (cmd !== 1) throw new Error('cmd');
      return { target: { host: r.addr, port }, data: [rest] };
    },
    async wrap(c) { if (!hdr) return c; const o = cat(hdr, c); hdr = null; return o; },
  };
}

function pTrojan() {
  let ready = false;
  return {
    async feed(c) {
      if (ready) return { data: [c] };
      if (c.length < 64 || c[56] !== 13 || c[57] !== 10 || c[58] !== 1) throw new Error('bad header');
      const r = readAddr(c, 60, c[59], [1, 3, 4]);
      if (!r || r.o + 4 > c.length) throw new Error('bad addr');
      ready = true;
      return { target: { host: r.addr, port: (c[r.o] << 8) | c[r.o + 1] }, data: [c.subarray(r.o + 4)] };
    },
    async wrap(c) { return c; },
  };
}

function pVmess(id) {
  let buf = new Uint8Array(0), ready = false, resp = null, dp = null, target = null;
  const K1 = ['AES', 'Auth', 'ID', 'Encryption'].join(' ');
  const K2 = ['VMess', 'Header', 'AEAD', 'Key_Length'].join(' ');
  const K3 = ['VMess', 'Header', 'AEAD', 'Nonce_Length'].join(' ');
  const K4 = ['VMess', 'Header', 'AEAD', 'Key'].join(' ');
  const K5 = ['VMess', 'Header', 'AEAD', 'Nonce'].join(' ');
  const R1 = ['AEAD', 'Resp', 'Header', 'Len', 'Key'].join(' ');
  const R2 = ['AEAD', 'Resp', 'Header', 'Len', 'IV'].join(' ');
  const R3 = ['AEAD', 'Resp', 'Header', 'Key'].join(' ');
  const R4 = ['AEAD', 'Resp', 'Header', 'IV'].join(' ');
  return {
    async feed(c) {
      if (ready) return dp ? dpFeed(dp, c) : { data: [c] };
      buf = cat(buf, c);
      if (buf.length < 42) return { data: [] };
      const cmdKey = await sha('MD5', cat(uuidBytes(id), te.encode(VM_UUID_SALT)));
      const authid = buf.slice(0, 16), nonce = buf.slice(34, 42);
      const a = await ecbDecBlock((await kdf(cmdKey, K1)).slice(0, 16), authid);
      const dv = new DataView(a.buffer), ts = dv.getUint32(0) * 4294967296 + dv.getUint32(4);
      if (crc32(a.subarray(0, 12)) !== dv.getUint32(12) || Math.abs(Date.now() / 1000 - ts) > 120) throw new Error('auth');
      const lk = (await kdf(cmdKey, K2, authid, nonce)).slice(0, 16);
      const ln = (await kdf(cmdKey, K3, authid, nonce)).slice(0, 12);
      const lp = await gcm('decrypt', lk, ln, buf.slice(16, 34), authid);
      const hl = (lp[0] << 8) | lp[1];
      if (buf.length < 42 + hl + 16) return { data: [] };
      const hk = (await kdf(cmdKey, K4, authid, nonce)).slice(0, 16);
      const hn = (await kdf(cmdKey, K5, authid, nonce)).slice(0, 12);
      const h = await gcm('decrypt', hk, hn, buf.slice(42, 42 + hl + 16), authid);
      if (h[0] !== 1) throw new Error('ver');
      const sec = h[35] & 15, opt = h[34];

      if (h[37] !== 1) throw new Error('tcp');
      const r = readAddr(h, 41, h[40], [1, 2, 3]);
      if (!r) throw new Error('addr');
      target = { host: r.addr, port: (h[38] << 8) | h[39] };
      resp = { iv: h.slice(1, 17), key: h.slice(17, 33), v: h[33] };
      if (opt & 1) {
        if (sec !== 3) throw new Error('sec ' + sec);
        if (opt & 2) throw new Error('authlen');
        dp = {
          mask: !!(opt & 4), gpad: !!(opt & 8),
          cKey: resp.key, cIv: resp.iv,
          rk: (await sha('SHA-256', resp.key)).slice(0, 16),
          riv: (await sha('SHA-256', resp.iv)).slice(0, 16),
          cshake: (opt & 4) || (opt & 8) ? makeShake(resp.iv) : null,
          ccount: 0, cbuf: new Uint8Array(0), clen: -1, cpad: 0,
          rshake: (opt & 4) || (opt & 8) ? makeShake((await sha('SHA-256', resp.iv)).slice(0, 16)) : null,
          rcount: 0, rhdr: false, done: false, tgt: target,
        };
      } else {
        if (sec !== 5 && sec !== 6) throw new Error('sec ' + sec);
      }
      ready = true;
      const rest = buf.subarray(42 + hl + 16);
     
      if (dp) return dpFeed(dp, rest);
      return { target, data: [rest] };
    },
    async wrap(c) {
      if (!resp) return c;
      const { iv, key, v } = resp;
      const bk = (await sha('SHA-256', key)).slice(0, 16), bi = (await sha('SHA-256', iv)).slice(0, 16);
      const l = await gcm('encrypt', (await kdf(bk, R1)).slice(0, 16), (await kdf(bi, R2)).slice(0, 12), new Uint8Array([0, 4]));
      const p = await gcm('encrypt', (await kdf(bk, R3)).slice(0, 16), (await kdf(bi, R4)).slice(0, 12), new Uint8Array([v, 0, 0, 0]));
      const hdr = cat(l, p);
      if (!dp) { resp = null; return cat(hdr, c); }
      if (!c.length) { dp.rhdr = true; return hdr; }
      if (dp.rhdr) return encChunk(dp, c);
      dp.rhdr = true;
      return cat(hdr, await encChunk(dp, c));
    },
    async term() {
      if (!dp || !dp.rhdr || dp.done) return null;
      dp.done = true;
      return encChunk(dp, new Uint8Array(0));
    },
  };
}

// ---- VMess AEAD data plane ----
const KC = [0x0000000000000001n,0x0000000000008082n,0x800000000000808an,0x8000000080008000n,0x000000000000808bn,0x0000000080000001n,0x8000000080008081n,0x8000000000008009n,0x000000000000008an,0x0000000000000088n,0x0000000080008009n,0x000000008000000an,0x000000008000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,0x8000000000008002n,0x8000000000000080n,0x000000000000800an,0x800000008000000an,0x8000000080008081n,0x8000000000008080n,0x0000000080000001n,0x8000000080008008n];
const ROT = [[0,36,3,41,18],[1,44,10,45,2],[62,6,43,15,61],[28,55,25,21,56],[27,20,39,8,14]];
const M64 = (1n << 64n) - 1n;
const rotl = (x, n) => { const u = BigInt.asUintN(64, x); return n ? ((u << BigInt(n)) | (u >> BigInt(64 - n))) & M64 : u; };
function keccakF(S) {
  const B = new BigInt64Array(25), C = new BigInt64Array(5);
  for (let i = 0; i < 24; i++) {
    for (let x = 0; x < 5; x++) C[x] = S[x] ^ S[x+5] ^ S[x+10] ^ S[x+15] ^ S[x+20];
    for (let x = 0; x < 5; x++) { const d = C[(x+4)%5] ^ rotl(C[(x+1)%5], 1); for (let y = 0; y < 25; y += 5) S[y+x] ^= d; }
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y + 5*((2*x + 3*y) % 5)] = rotl(S[x + 5*y], ROT[x][y]);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) S[x + 5*y] = B[x + 5*y] ^ ((~B[(x+1)%5 + 5*y]) & B[(x+2)%5 + 5*y]);
    S[0] ^= KC[i];
  }
}
function makeShake(seed) {
  const S = new BigInt64Array(25), bdv = new DataView(new Uint8Array(168).buffer), blk = new Uint8Array(bdv.buffer);
  blk.set(seed); blk[seed.length] = 0x1f; blk[167] |= 0x80;
  for (let i = 0; i < 21; i++) S[i] ^= bdv.getBigInt64(i * 8, true);
  keccakF(S);
  let q = new Uint8Array(0), pos = 0;
  const more = () => {
    const o = new Uint8Array(168), od = new DataView(o.buffer);
    for (let i = 0; i < 21; i++) od.setBigInt64(i * 8, S[i], true);
    keccakF(S);
    q = cat(q.subarray(pos), o); pos = 0;
  };
  return { next2() { if (pos + 2 > q.length) more(); const v = (q[pos] << 8) | q[pos+1]; pos += 2; return v; } };
}
const gcmNonce = (iv, count) => { const n = iv.slice(0, 12); n[0] = count >> 8; n[1] = count & 255; return n; };
async function vmGcm(mode, key, iv, count, data) {
  const k = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, [mode]);
  return new Uint8Array(await crypto.subtle[mode]({ name: 'AES-GCM', iv: gcmNonce(iv, count) }, k, data));
}
async function dpFeed(dp, c) {
  dp.cbuf = cat(dp.cbuf, c);
  const out = [];
  for (;;) {
    if (dp.clen < 0) {
      if (dp.cbuf.length < 2) break;
      const pad = dp.gpad ? dp.cshake.next2() % 64 : 0;
      const mk = dp.mask ? dp.cshake.next2() : 0;
      const L = ((dp.cbuf[0] << 8) | dp.cbuf[1]) ^ mk;
      dp.cbuf = dp.cbuf.subarray(2);
      dp.clen = L; dp.cpad = pad;
      if (dp.clen === 16 + dp.cpad) { dp.done = true; break; }
     
      if (dp.clen > 0x3fff) throw new Error('len');
    }
    if (dp.cbuf.length < dp.clen) break;
    const body = dp.cbuf.subarray(0, dp.clen - dp.cpad);
    dp.cbuf = dp.cbuf.subarray(dp.clen);
    dp.clen = -1;
    out.push(await vmGcm('decrypt', dp.cKey, dp.cIv, dp.ccount++, body));
  }
  if (!out.length) return { data: [] };
  return { target: dp.tgt, data: out };
}
async function encChunk(dp, c) {
  const out = [];
  for (let o = 0; o < c.length || !out.length; o += 1900) {
    const piece = c.subarray(o, Math.min(o + 1900, c.length));
    const pad = dp.gpad ? dp.rshake.next2() % 64 : 0;
    const mk = dp.mask ? dp.rshake.next2() : 0;
    const size = piece.length + 16 + pad;
    out.push(new Uint8Array([(size ^ mk) >> 8, (size ^ mk) & 255]));
    out.push(await vmGcm('encrypt', dp.rk, dp.riv, dp.rcount++, piece));
    if (pad) out.push(new Uint8Array(pad));
    if (o + 1900 >= c.length) break;
  }
  return cat(...out);
}

function pSS(id) {
  const KL = 16, inc = (n) => { for (let i = 11; i >= 0; i--) { n[i] = (n[i] + 1) & 255; if (n[i]) break; } };
  let buf = new Uint8Array(0), dk = null, dn = new Uint8Array(12), len = -1, got = false, ek = null, en = new Uint8Array(12);
  const derive = async (salt) => {
    const ikm = await crypto.subtle.importKey('raw', await sha('MD5', te.encode(id)), 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-1', salt, info: te.encode(['ss', 'subkey'].join('-')) }, ikm, { name: 'AES-GCM', length: 128 }, false, ['encrypt', 'decrypt']);
  };
  const dec = async (d) => { const p = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: dn }, dk, d)); inc(dn); return p; };
  const enc = async (d) => { const p = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: en }, ek, d)); inc(en); return p; };
  return {
    async feed(c) {
      buf = cat(buf, c);
      const data = []; let target;
      if (!dk) { if (buf.length < KL) return { data }; dk = await derive(buf.slice(0, KL)); buf = buf.slice(KL); }
      for (;;) {
        if (len < 0) { if (buf.length < 18) break; const l = await dec(buf.slice(0, 18)); len = (l[0] << 8) | l[1]; buf = buf.slice(18); if (len > 0x3fff) throw new Error('len'); }
        if (buf.length < len + 16) break;
        const p = await dec(buf.slice(0, len + 16)); buf = buf.slice(len + 16); len = -1;
        if (!got) {
          const r = readAddr(p, 1, p[0], [1, 3, 4]);
          if (!r || r.o + 2 > p.length) throw new Error('addr');
          got = true; target = { host: r.addr, port: (p[r.o] << 8) | p[r.o + 1] }; data.push(p.subarray(r.o + 2));
        } else data.push(p);
      }
      return { target, data };
    },
    async wrap(c) {
      const out = [];
      if (!ek) { const salt = crypto.getRandomValues(new Uint8Array(KL)); ek = await derive(salt); out.push(salt); }
      for (let o = 0; o < c.length; o += 0x3fff) {
        const p = c.subarray(o, o + 0x3fff);
        out.push(await enc(new Uint8Array([p.length >> 8, p.length & 255])), await enc(p));
      }
      return cat(...out);
    },
  };
}

// ---------- usage stats ----------
const usageAcc = new Map();
let usageLast = 0;
function addUsage(id, up, dn) {
  if (!up && !dn) return;
  const a = usageAcc.get(id) || { up: 0, dn: 0 };
  a.up += up; a.dn += dn; usageAcc.set(id, a);
}
async function flushUsage(env, force) {
  const now = Date.now();
  if (!usageAcc.size || (!force && now - usageLast < 300000)) return;
  usageLast = now;
  const key = 'usage:' + new Date().toISOString().slice(0, 10);
  try {
    const cur = (await env.DB.get(key, 'json')) || {};
    for (const [id, a] of usageAcc) {
      const c = cur[id] || { up: 0, dn: 0 };
      c.up += a.up; c.dn += a.dn; cur[id] = c;
    }
    usageAcc.clear();
    usageTotals.t = 0;
    await env.DB.put(key, JSON.stringify(cur));
  } catch {}
}
let usageTotals = { t: 0, v: null };
async function getUsageTotals(env) {
  if (usageTotals.v && Date.now() - usageTotals.t < 60000) return usageTotals.v;
  const l = await env.DB.list({ prefix: 'usage:', limit: 31 });
  const v = {};
  await Promise.all(l.keys.map(async (k) => {
    const d = (await env.DB.get(k.name, 'json')) || {};
    for (const [id, a] of Object.entries(d)) { const t = v[id] || { up: 0, dn: 0 }; t.up += a.up || 0; t.dn += a.dn || 0; v[id] = t; }
  }));
  usageTotals = { t: Date.now(), v };
  return v;
}

// ---------- relay ----------
async function relay(req, env, ctx, proto, id, tag) {
  const uRec = await getUser(env, id);
  if (!uRec) return text('Forbidden', 403);
  if (uRec.q > 0) {
    const tot = (await getUsageTotals(env))[id];
    if (tot && tot.up + tot.dn >= uRec.q) return text('Quota exceeded', 403);
  }
  const ext = (await getExt(env)).find((x) => x.tag === tag);
  const proxyip = (ext && ext.proxyip) || env.PROXYIP || '';
  const pair = new WebSocketPair(), client = pair[0], ws = pair[1];
  ws.accept();
  const sess = proto === P_VL ? pVless(id) : proto === P_VM ? pVmess(id) : proto === P_TR ? pTrojan() : pSS(id);
  const st = { remote: null, writer: null, udp: false, buf: new Uint8Array(0), started: false };
  let q = Promise.resolve();
  const end = () => { try { ws.close(); } catch {} try { st.remote && st.remote.close(); } catch {} };
  const push = (d) => { q = q.then(() => onChunk(d)).catch((e) => { console.error('relay-error:', (e && e.message) || e); end(); }); };

  async function pump(sock) {
    let got = false;
    try {
      await sock.readable.pipeTo(new WritableStream({
        async write(chunk) {
          if (!chunk || !chunk.length) return;
          got = true;
          addUsage(id, 0, chunk.length);
          if (ws.readyState !== 1) throw new Error('closed');
          ws.send(await sess.wrap(chunk));
        },
      }));
    } catch {}
    if (sess.term && ws.readyState === 1) { try { const t = await sess.term(); if (t) ws.send(t); } catch {} }
    return got;
  }
  async function startTcp(t, first) {
    const open = async (host) => {
      const sock = connect({ hostname: host.includes(':') ? `[${host}]` : host, port: t.port });
      await sock.opened;
      const w = sock.writable.getWriter();
      if (first.length) await w.write(first);
      st.remote = sock; st.writer = w;
      return sock;
    };
    let sock, viaProxy = false;
    try { sock = await open(t.host); } catch (e) { if (!proxyip) throw e; viaProxy = true; sock = await open(proxyip); }
    (async () => {
      let got = await pump(sock);
      if (!got && !viaProxy && proxyip) { try { got = await pump(await open(proxyip)); } catch {} }
      end();
    })();
  }
  function doh(qb) {
    fetch(DOH_URL, { method: 'POST', headers: { 'content-type': 'application/dns-message' }, body: qb })
      .then((r) => r.arrayBuffer())
      .then(async (a) => {
        const r = new Uint8Array(a);
        if (ws.readyState === 1) ws.send(await sess.wrap(cat(new Uint8Array([r.length >> 8, r.length & 255]), r)));
      }).catch(() => {});
  }
  function dns(c) {
    const m = cat(st.buf, c); let o = 0;
    while (m.length - o >= 2) {
      const l = (m[o] << 8) | m[o + 1];
      if (m.length - o - 2 < l) break;
      doh(m.slice(o + 2, o + 2 + l)); o += 2 + l;
    }
    st.buf = m.slice(o);
  }
  async function onChunk(d) {
    if (typeof d === 'string') return;
    const r = await sess.feed(d instanceof Uint8Array ? d : new Uint8Array(d));
    if (r.udp) st.udp = true;
    if (r.target && !st.started) { st.started = true; const f = cat(...r.data); addUsage(id, f.length, 0); await startTcp(r.target, f); return; }
    for (const x of r.data) {
      if (!x.length) continue;
      addUsage(id, x.length, 0);
      if (st.udp) dns(x); else if (st.writer) await st.writer.write(x);
    }
  }

  ws.addEventListener('message', (e) => push(e.data));
  ws.addEventListener('close', () => { end(); if (ctx && ctx.waitUntil) ctx.waitUntil(flushUsage(env)); });
  ws.addEventListener('error', () => { end(); if (ctx && ctx.waitUntil) ctx.waitUntil(flushUsage(env)); });
  const early = req.headers.get('Sec-WebSocket-Protocol') || '';
  if (early) { try { const b = atob(early.replace(/-/g, '+').replace(/_/g, '/')); push(Uint8Array.from(b, (c) => c.charCodeAt(0))); } catch {} }
  return new Response(null, { status: 101, webSocket: client, headers: early ? { 'Sec-WebSocket-Protocol': early } : undefined });
}

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="132 95 990 1035" role="img" aria-label="M&amp;F Panel"><defs>
  <linearGradient id="mfSteel" gradientUnits="userSpaceOnUse" x1="260" y1="190" x2="1000" y2="940">
    <stop offset="0" stop-color="#fbfbfb"/><stop offset=".22" stop-color="#d4d4d4"/><stop offset=".42" stop-color="#8f8f8f"/>
    <stop offset=".6" stop-color="#d9d9d9"/><stop offset=".8" stop-color="#7d7d7d"/><stop offset="1" stop-color="#3f3f3f"/></linearGradient>
  <linearGradient id="mfSteelM" gradientUnits="userSpaceOnUse" x1="360" y1="370" x2="620" y2="810">
    <stop offset="0" stop-color="#f2f2f2"/><stop offset=".22" stop-color="#a9a9a9"/><stop offset=".5" stop-color="#4a4a4a"/><stop offset=".78" stop-color="#8d8d8d"/><stop offset="1" stop-color="#d6d6d6"/></linearGradient>
  <linearGradient id="mfSteelF" gradientUnits="userSpaceOnUse" x1="640" y1="370" x2="900" y2="800">
    <stop offset="0" stop-color="#f4f4f4"/><stop offset=".3" stop-color="#b4b4b4"/><stop offset=".6" stop-color="#555"/><stop offset=".85" stop-color="#9a9a9a"/><stop offset="1" stop-color="#d0d0d0"/></linearGradient>
  <linearGradient id="mfRoofL" gradientUnits="userSpaceOnUse" x1="478" y1="265" x2="493" y2="296"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#d2d2d2"/><stop offset=".65" stop-color="#8a8a8a"/><stop offset="1" stop-color="#474747"/></linearGradient>
  <linearGradient id="mfRoofR" gradientUnits="userSpaceOnUse" x1="776" y1="265" x2="761" y2="296"><stop offset="0" stop-color="#f2f2f2"/><stop offset=".3" stop-color="#b8b8b8"/><stop offset=".65" stop-color="#6c6c6c"/><stop offset="1" stop-color="#2e2e2e"/></linearGradient>
  <linearGradient id="mfBotL" gradientUnits="userSpaceOnUse" x1="510" y1="815" x2="491" y2="845"><stop offset="0" stop-color="#e9e9e9"/><stop offset=".16" stop-color="#a2a2a2"/><stop offset=".42" stop-color="#555"/><stop offset="1" stop-color="#171717"/></linearGradient>
  <linearGradient id="mfBotR" gradientUnits="userSpaceOnUse" x1="744" y1="815" x2="763" y2="845"><stop offset="0" stop-color="#dcdcdc"/><stop offset=".16" stop-color="#939393"/><stop offset=".42" stop-color="#4a4a4a"/><stop offset="1" stop-color="#151515"/></linearGradient>
  <linearGradient id="mfLitL" gradientUnits="userSpaceOnUse" x1="340" y1="0" x2="627" y2="0"><stop offset="0" stop-color="#f4f4f4"/><stop offset=".55" stop-color="#bcbcbc"/><stop offset="1" stop-color="#7c7c7c"/></linearGradient>
  <linearGradient id="mfLitR" gradientUnits="userSpaceOnUse" x1="914" y1="0" x2="627" y2="0"><stop offset="0" stop-color="#e8e8e8"/><stop offset=".55" stop-color="#a6a6a6"/><stop offset="1" stop-color="#6a6a6a"/></linearGradient>
  <linearGradient id="mfSideL" gradientUnits="userSpaceOnUse" x1="306" y1="0" x2="330" y2="0"><stop offset="0" stop-color="#b9b9b9"/><stop offset=".3" stop-color="#585858"/><stop offset="1" stop-color="#121212"/></linearGradient>
  <linearGradient id="mfSideR" gradientUnits="userSpaceOnUse" x1="948" y1="0" x2="924" y2="0"><stop offset="0" stop-color="#b9b9b9"/><stop offset=".3" stop-color="#585858"/><stop offset="1" stop-color="#121212"/></linearGradient>
  <linearGradient id="mfSteelV" gradientUnits="userSpaceOnUse" x1="0" y1="958" x2="0" y2="1052">
    <stop offset="0" stop-color="#f6f6f6"/><stop offset=".4" stop-color="#b3b3b3"/><stop offset=".52" stop-color="#6e6e6e"/><stop offset=".8" stop-color="#3a3a3a"/><stop offset="1" stop-color="#6a6a6a"/></linearGradient>
  <linearGradient id="mfLock" gradientUnits="userSpaceOnUse" x1="568" y1="300" x2="684" y2="420">
    <stop offset="0" stop-color="#e6e6e6"/><stop offset=".45" stop-color="#8a8a8a"/><stop offset="1" stop-color="#3c3c3c"/></linearGradient>
  <linearGradient id="mfSteelR" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8d8d8"/><stop offset=".5" stop-color="#6e6e6e"/><stop offset="1" stop-color="#1e1e1e"/></linearGradient>
  <radialGradient id="mfSphere" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#ff8a8a"/><stop offset=".3" stop-color="#ee1c1c"/><stop offset=".75" stop-color="#8a0a0a"/><stop offset="1" stop-color="#3a0000"/></radialGradient>
  <radialGradient id="mfGlowNode"><stop offset=".45" stop-color="#ff2a2a" stop-opacity=".75"/><stop offset="1" stop-color="#ff2a2a" stop-opacity="0"/></radialGradient>
  <radialGradient id="mfAura" cx="627" cy="545" r="430" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ff1f1f" stop-opacity=".30"/><stop offset=".55" stop-color="#b30000" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <radialGradient id="mfInner" cx="627" cy="560" r="330" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#2a0508"/><stop offset="1" stop-color="#060102"/></radialGradient>
  <linearGradient id="mfRedFace" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff1c1c" stop-opacity=".95"/><stop offset="1" stop-color="#ff1c1c" stop-opacity="0"/></linearGradient>
  <linearGradient id="mfRedFaceR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#ff1c1c" stop-opacity=".95"/><stop offset="1" stop-color="#ff1c1c" stop-opacity="0"/></linearGradient>
  <linearGradient id="mfLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff2a2a" stop-opacity="0"/><stop offset=".5" stop-color="#ff3a3a"/><stop offset="1" stop-color="#ff2a2a" stop-opacity="0"/></linearGradient>
  <linearGradient id="mfSweepG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="mfArcFade" gradientUnits="userSpaceOnUse" x1="300" y1="0" x2="950" y2="0"><stop offset="0" stop-color="#e8e8e8" stop-opacity=".1"/><stop offset=".5" stop-color="#f4f4f4"/><stop offset="1" stop-color="#e8e8e8" stop-opacity=".1"/></linearGradient>
  <pattern id="mfBrush" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
    <rect width="6" height="1.2" fill="#fff" opacity=".14"/><rect y="3" width="6" height="1" fill="#000" opacity=".16"/></pattern>
  <filter id="mfBlur2" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="mfBlur5" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
  <filter id="mfBlur25" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="25"/></filter>
  <filter id="mfBlur12" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>
  <clipPath id="mfMetalClip">
  <path clip-rule="evenodd" d="M627 194 L925 336 L948 380 L948 520 L936 600 L914 660 L854 740 L787 810 L721 860 L627 913 L533 860 L467 810 L400 740 L340 660 L318 600 L306 520 L306 380 L329 336Z M627 236 L900 364 L925 380 L926 520 L914 600 L895 650 L840 725 L775 790 L710 840 L627 876 L544 840 L479 790 L414 725 L359 650 L340 600 L329 520 L329 380 L354 364Z"/>
  <polygon points="362,367 450,398 614,486 617,490 617,806 551,739 550,519 419,444 437,712 360,616"/><polygon points="640,486 890,367 891,423 701,520 699,573 881,486 866,556 701,633 701,744 640,801"/><polygon points="568,298 684,298 684,376 626,425 568,376"/>
  <path d="M160 971 L171 960 L191 960 L191 1052 L160 1052Z M316 971 L305 960 L285 960 L285 1052 L316 1052Z M191 960 L238 1042 L238 1052 L222 1052 L191 998Z M285 960 L238 1042 L238 1052 L254 1052 L285 998Z M438 960 L469 960 L469 1052 L438 1052Z M438 960 L546 960 L526 986 L438 986Z M469 1003 L526 1003 L510 1028 L469 1028Z M587 960 L618 960 L618 1052 L587 1052Z M618 960 L681 960 L695 974 L695 1016 L681 1030 L618 1030 L618 1007 L664 1007 L667 1004 L667 986 L664 983 L618 983Z M813 960 L843 960 L843 1052 L813 1052Z M884 960 L914 960 L914 1052 L884 1052Z M843 960 L871 960 L914 1052 L886 1052Z M925 960 L956 960 L956 1052 L925 1052Z M925 960 L1011 960 L995 986 L925 986Z M956 1004 L997 1004 L983 1028 L956 1028Z M925 1026 L1011 1026 L1011 1052 L925 1052Z M1015 960 L1046 960 L1046 1052 L1015 1052Z M1015 1039 L1096 1039 L1106 1052 L1015 1052Z"/><path clip-rule="evenodd" d="M701 1052 L739 960 L765 960 L802 1052 L771 1052 L763 1030 L740 1030 L732 1052Z M751 986 L762 1012 L740 1012Z"/>
</clipPath>
</defs>

<g class="mf-smoke" filter="url(#mfBlur25)" opacity=".9">
  <ellipse cx="300" cy="600" rx="120" ry="190" fill="#8a0000" opacity=".30"/><ellipse cx="960" cy="600" rx="120" ry="190" fill="#8a0000" opacity=".30"/>
  <ellipse cx="330" cy="880" rx="150" ry="90" fill="#9a0c0c" opacity=".28"/><ellipse cx="930" cy="880" rx="150" ry="90" fill="#9a0c0c" opacity=".28"/>
</g>
<circle class="mf-aura" cx="627" cy="545" r="430" fill="url(#mfAura)"/>

<!-- constellation behind the shield -->
<g stroke="#ff3a3a" stroke-width="1.4" opacity=".55" fill="none">
<line x1="627" y1="150" x2="505" y2="268"/><line x1="627" y1="150" x2="742" y2="238"/><line x1="742" y1="238" x2="812" y2="300"/><line x1="812" y1="300" x2="925" y2="350"/><line x1="505" y1="268" x2="331" y2="350"/><line x1="870" y1="520" x2="925" y2="350"/><line x1="870" y1="520" x2="917" y2="728"/><line x1="378" y1="520" x2="331" y2="350"/><line x1="378" y1="520" x2="347" y2="722"/><line x1="470" y1="600" x2="378" y2="520"/><line x1="690" y1="640" x2="870" y2="520"/><line x1="560" y1="700" x2="470" y2="600"/><line x1="560" y1="700" x2="690" y2="640"/><line x1="505" y1="268" x2="627" y2="330"/><line x1="742" y1="238" x2="627" y2="330"/><line x1="470" y1="600" x2="550" y2="430"/><line x1="690" y1="640" x2="700" y2="450"/>
</g>
<g><path class="mf-spark" d="M505 253 L507.7 265.3 L520 268 L507.7 270.7 L505 283 L502.3 270.7 L490 268 L502.3 265.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M742 223 L744.7 235.3 L757 238 L744.7 240.7 L742 253 L739.3 240.7 L727 238 L739.3 235.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M812 285 L814.7 297.3 L827 300 L814.7 302.7 L812 315 L809.3 302.7 L797 300 L809.3 297.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M870 505 L872.7 517.3 L885 520 L872.7 522.7 L870 535 L867.3 522.7 L855 520 L867.3 517.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M378 505 L380.7 517.3 L393 520 L380.7 522.7 L378 535 L375.3 522.7 L363 520 L375.3 517.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M560 685 L562.7 697.3 L575 700 L562.7 702.7 L560 715 L557.3 702.7 L545 700 L557.3 697.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M690 625 L692.7 637.3 L705 640 L692.7 642.7 L690 655 L687.3 642.7 L675 640 L687.3 637.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M470 585 L472.7 597.3 L485 600 L472.7 602.7 L470 615 L467.3 602.7 L455 600 L467.3 597.3Z" fill="#ff5a4a"/></g>

<!-- orbit ring -->
<circle cx="627" cy="505" r="366" fill="none" stroke="#ff2a2a" stroke-width="2" opacity=".55" filter="url(#mfBlur2)"/>
<circle cx="627" cy="505" r="366" fill="none" stroke="#ff4a3a" stroke-width="1.3" opacity=".8"/>
<circle cx="627" cy="505" r="352" fill="none" stroke="#d9d9d9" stroke-width="2.2" opacity=".55"/>
<path d="M328.5 318.5 A352 352 0 0 1 553.8 160.7" fill="none" stroke="url(#mfArcFade)" stroke-width="6" stroke-linecap="round"/>
<path d="M700.2 160.7 A352 352 0 0 1 925.5 318.5" fill="none" stroke="url(#mfArcFade)" stroke-width="6" stroke-linecap="round"/>
<g class="mf-spin"><path d="M957.8 384.6 A352 352 0 0 1 937.8 670.3" fill="none" stroke="#ff6a5a" stroke-width="4.5" stroke-linecap="round" filter="url(#mfBlur2)"/>
  <path d="M957.8 384.6 A352 352 0 0 1 937.8 670.3" fill="none" stroke="#fff3f0" stroke-width="2" stroke-linecap="round"/></g>
<g class="mf-spin rev"><path d="M310.0 688.0 A366 366 0 0 1 261.9 530.5" fill="none" stroke="#ff4a3a" stroke-width="3" stroke-linecap="round" filter="url(#mfBlur2)"/>
  <path d="M310.0 688.0 A366 366 0 0 1 261.9 530.5" fill="none" stroke="#ffd0c8" stroke-width="1.4" stroke-linecap="round"/></g>

<!-- shield interior + frame -->
<polygon points="627,236 900,364 925,380 926,520 914,600 895,650 840,725 775,790 710,840 627,876 544,840 479,790 414,725 359,650 340,600 329,520 329,380 354,364" fill="url(#mfInner)"/>
<g stroke="#ff3a3a" stroke-width="1.1" opacity=".35" fill="none">
  <line x1="627" y1="236" x2="470" y2="600"/><line x1="627" y1="236" x2="790" y2="640"/><line x1="470" y1="600" x2="790" y2="640"/>
  <line x1="378" y1="520" x2="627" y2="876"/><line x1="870" y1="520" x2="627" y2="876"/></g>
<polyline points="330,680 392,760 459,830 525,880 627,933 729,880 795,830 862,760 924,680" fill="none" stroke="#ff1c1c" stroke-width="9" opacity=".55" filter="url(#mfBlur5)"/>
<polyline points="330,686 392,766 459,836 525,886 627,939 729,886 795,836 862,766 924,686" fill="none" stroke="#ff3030" stroke-width="3"/>
<path fill-rule="evenodd" fill="#1a1a1c" d="M627 194 L925 336 L948 380 L948 520 L936 600 L914 660 L854 740 L787 810 L721 860 L627 913 L533 860 L467 810 L400 740 L340 660 L318 600 L306 520 L306 380 L329 336Z M627 236 L900 364 L925 380 L926 520 L914 600 L895 650 L840 725 L775 790 L710 840 L627 876 L544 840 L479 790 L414 725 L359 650 L340 600 L329 520 L329 380 L354 364Z"/>
<polygon points="329,336 627,194 627,236 354,364" fill="url(#mfRoofL)"/>
<polygon points="627,194 925,336 900,364 627,236" fill="url(#mfRoofR)"/>
<polygon points="359,650 414,725 479,790 544,840 627,876 627,913 533,860 467,810 400,740 340,660" fill="#3c3c3e"/>
<polygon points="895,650 840,725 775,790 710,840 627,876 627,913 721,860 787,810 854,740 914,660" fill="#343436"/>
<polygon points="359,650 414,725 479,790 544,840 627,876 627,892 535,855 470,805 405,740 350,665" fill="url(#mfLitL)"/>
<polygon points="895,650 840,725 775,790 710,840 627,876 627,892 719,855 784,805 849,740 904,665" fill="url(#mfLitR)"/>
<polygon points="350,665 405,740 470,805 535,855 627,892 627,913 533,860 467,810 400,740 340,660" fill="#1b1b1d"/>
<polygon points="904,665 849,740 784,805 719,855 627,892 627,913 721,860 787,810 854,740 914,660" fill="#171719"/>
<polygon points="306,380 329,380 329,520 340,600 359,650 340,660 318,600 306,520" fill="url(#mfSideL)"/>
<polygon points="948,380 925,380 926,520 914,600 895,650 914,660 936,600 948,520" fill="url(#mfSideR)"/>
<g fill="url(#mfBrush)">
  <polygon points="329,336 627,194 925,336 900,364 627,236 354,364"/>
  <polygon points="340,660 400,740 467,810 533,860 627,913 721,860 787,810 854,740 914,660 895,650 840,725 775,790 710,840 627,876 544,840 479,790 414,725 359,650"/>
</g>
<polyline points="329,336 306,380 306,520 318,600 340,660" fill="none" stroke="#e8e8e8" stroke-width="2" opacity=".85"/>
<polyline points="925,336 948,380 948,520 936,600 914,660" fill="none" stroke="#e8e8e8" stroke-width="2" opacity=".85"/>
<polyline points="329,336 627,194 925,336" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="miter" opacity=".95"/>
<polyline points="359,650 414,725 479,790 544,840 627,876 710,840 775,790 840,725 895,650" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="miter" opacity=".9"/>

<!-- red light spilling on the inner faces -->
<polygon points="362,380 386,388 392,600 366,610" fill="url(#mfRedFace)" opacity=".75"/>
<polygon points="551,560 580,560 584,735 551,739" fill="url(#mfRedFaceR)" opacity=".0"/>
<polygon points="552,540 574,540 578,735 552,738" fill="#ff1c1c" opacity=".55" filter="url(#mfBlur5)"/>
<line x1="627" y1="430" x2="627" y2="805" stroke="#ff2a2a" stroke-width="3" opacity=".8" filter="url(#mfBlur2)"/>
<line x1="627" y1="430" x2="627" y2="805" stroke="#ffb0a8" stroke-width="1" opacity=".8"/>

<!-- red light in the M window and F gaps -->
<polygon points="432,452 546,520 540,540 436,484" fill="#ff1c1c" opacity=".85" filter="url(#mfBlur5)"/>
<polygon points="704,530 886,436 886,452 706,545" fill="#ff1c1c" opacity=".7" filter="url(#mfBlur5)"/>
<polygon points="704,640 862,566 862,580 706,652" fill="#ff1c1c" opacity=".65" filter="url(#mfBlur5)"/>

<!-- M -->
<polygon points="362,367 450,398 614,486 617,490 617,806 551,739 550,519 419,444 437,712 360,616" fill="url(#mfSteelM)"/>
<polygon points="362,367 450,398 614,486 617,490 617,806 551,739 550,519 419,444 437,712 360,616" fill="url(#mfBrush)"/>
<polygon points="597,492 617,490 617,806 597,786" fill="#000" opacity=".28"/>
<polyline points="362,367 450,398 614,486" fill="none" stroke="#fff" stroke-width="2.8" stroke-linejoin="miter"/>
<polyline points="419,444 550,519" fill="none" stroke="#ff2a2a" stroke-width="3" filter="url(#mfBlur2)"/>
<polyline points="419,444 437,712" fill="none" stroke="#fff" stroke-width="3" opacity=".9"/>
<polyline points="437,712 360,616" fill="none" stroke="#ffb0a8" stroke-width="2.4" opacity=".9"/>
<polyline points="617,490 617,806" fill="none" stroke="#fff" stroke-width="2.2" opacity=".9"/>

<!-- F -->
<polygon points="640,486 890,367 891,423 701,520 699,573 881,486 866,556 701,633 701,744 640,801" fill="url(#mfSteelF)"/>
<polygon points="640,486 890,367 891,423 701,520 699,573 881,486 866,556 701,633 701,744 640,801" fill="url(#mfBrush)"/>
<polygon points="640,486 661,497 661,790 640,801" fill="#fff" opacity=".14"/>
<polyline points="640,486 890,367" fill="none" stroke="#fff" stroke-width="2.8"/>
<polyline points="699,573 881,486" fill="none" stroke="#fff" stroke-width="2.4" opacity=".95"/>
<polyline points="891,423 701,520" fill="none" stroke="#ff2a2a" stroke-width="3.2" filter="url(#mfBlur2)"/>
<polyline points="866,556 701,633" fill="none" stroke="#ff2a2a" stroke-width="3.2" filter="url(#mfBlur2)"/>
<polyline points="701,744 640,801" fill="none" stroke="#ffb0a8" stroke-width="2.2"/>
<polyline points="890,367 891,423" fill="none" stroke="#fff" stroke-width="2.2"/>

<!-- padlock -->
<g class="mf-shackle">
  <path d="M579 304 L579 288 A47 47 0 0 1 673 288 L673 304" fill="none" stroke="url(#mfLock)" stroke-width="13"/>
  <path d="M579 304 L579 288 A47 47 0 0 1 673 288 L673 304" fill="none" stroke="#fff" stroke-width="2" opacity=".55" transform="translate(-4,-4)"/>
  <path d="M591 304 L591 288 A35 35 0 0 1 661 288 L661 304" fill="none" stroke="#ff2a2a" stroke-width="4" opacity=".95" filter="url(#mfBlur2)"/>
</g>
<polyline points="568,376 626,425 684,376" fill="none" stroke="#ff2a2a" stroke-width="9" opacity=".7" filter="url(#mfBlur5)"/>
<polygon points="568,298 684,298 684,376 626,425 568,376" fill="url(#mfLock)"/>
<polygon points="568,298 684,298 684,376 626,425 568,376" fill="url(#mfBrush)"/>
<polygon points="577,307 675,307 675,371 626,414 577,371" fill="none" stroke="#fff" stroke-width="1.6" opacity=".55"/>
<polyline points="568,376 626,425 684,376" fill="none" stroke="#ff3a3a" stroke-width="2.6"/>
<g class="mf-key">
  <circle cx="626" cy="332" r="19" fill="#ff1c1c" opacity=".6" filter="url(#mfBlur5)"/>
  <circle cx="626" cy="332" r="13" fill="#0c0204" stroke="#ff3a3a" stroke-width="2.6"/>
  <path d="M619 340 L633 340 L636 386 L626 392 L616 386 Z" fill="#0c0204" stroke="#ff3a3a" stroke-width="2.4" stroke-linejoin="round"/>
</g>

<!-- orbit nodes -->
<g class="mf-node mf-n1">
  <circle cx="627" cy="150" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="627" cy="150" r="33" fill="url(#mfSteelR)"/>
  <circle cx="627" cy="150" r="27" fill="url(#mfSphere)"/>
  <circle cx="618" cy="139" r="7" fill="#fff" opacity=".35"/>
  <circle cx="627" cy="150" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="627" cy="150" r="3" fill="#fff"/>
</g><g class="mf-node mf-n2">
  <circle cx="331" cy="350" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="331" cy="350" r="33" fill="url(#mfSteelR)"/>
  <circle cx="331" cy="350" r="27" fill="url(#mfSphere)"/>
  <circle cx="322" cy="339" r="7" fill="#fff" opacity=".35"/>
  <circle cx="331" cy="350" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="331" cy="350" r="3" fill="#fff"/>
</g><g class="mf-node mf-n3">
  <circle cx="925" cy="350" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="925" cy="350" r="33" fill="url(#mfSteelR)"/>
  <circle cx="925" cy="350" r="27" fill="url(#mfSphere)"/>
  <circle cx="916" cy="339" r="7" fill="#fff" opacity=".35"/>
  <circle cx="925" cy="350" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="925" cy="350" r="3" fill="#fff"/>
</g><g class="mf-node mf-n4">
  <circle cx="347" cy="722" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="347" cy="722" r="33" fill="url(#mfSteelR)"/>
  <circle cx="347" cy="722" r="27" fill="url(#mfSphere)"/>
  <circle cx="338" cy="711" r="7" fill="#fff" opacity=".35"/>
  <circle cx="347" cy="722" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="347" cy="722" r="3" fill="#fff"/>
</g><g class="mf-node mf-n5">
  <circle cx="917" cy="728" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="917" cy="728" r="33" fill="url(#mfSteelR)"/>
  <circle cx="917" cy="728" r="27" fill="url(#mfSphere)"/>
  <circle cx="908" cy="717" r="7" fill="#fff" opacity=".35"/>
  <circle cx="917" cy="728" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="917" cy="728" r="3" fill="#fff"/>
</g>

<!-- wordmark -->
<g fill="#ff1c1c" opacity=".5" filter="url(#mfBlur5)" transform="translate(0,8)"><path d="M160 971 L171 960 L191 960 L191 1052 L160 1052Z M316 971 L305 960 L285 960 L285 1052 L316 1052Z M191 960 L238 1042 L238 1052 L222 1052 L191 998Z M285 960 L238 1042 L238 1052 L254 1052 L285 998Z M438 960 L469 960 L469 1052 L438 1052Z M438 960 L546 960 L526 986 L438 986Z M469 1003 L526 1003 L510 1028 L469 1028Z M587 960 L618 960 L618 1052 L587 1052Z M618 960 L681 960 L695 974 L695 1016 L681 1030 L618 1030 L618 1007 L664 1007 L667 1004 L667 986 L664 983 L618 983Z M813 960 L843 960 L843 1052 L813 1052Z M884 960 L914 960 L914 1052 L884 1052Z M843 960 L871 960 L914 1052 L886 1052Z M925 960 L956 960 L956 1052 L925 1052Z M925 960 L1011 960 L995 986 L925 986Z M956 1004 L997 1004 L983 1028 L956 1028Z M925 1026 L1011 1026 L1011 1052 L925 1052Z M1015 960 L1046 960 L1046 1052 L1015 1052Z M1015 1039 L1096 1039 L1106 1052 L1015 1052Z"/><path fill-rule="evenodd" d="M701 1052 L739 960 L765 960 L802 1052 L771 1052 L763 1030 L740 1030 L732 1052Z M751 986 L762 1012 L740 1012Z"/></g>
<g stroke="#070103" stroke-width="3.2" paint-order="stroke" stroke-linejoin="miter">
<path d="M160 971 L171 960 L191 960 L191 1052 L160 1052Z M316 971 L305 960 L285 960 L285 1052 L316 1052Z M191 960 L238 1042 L238 1052 L222 1052 L191 998Z M285 960 L238 1042 L238 1052 L254 1052 L285 998Z M438 960 L469 960 L469 1052 L438 1052Z M438 960 L546 960 L526 986 L438 986Z M469 1003 L526 1003 L510 1028 L469 1028Z M587 960 L618 960 L618 1052 L587 1052Z M618 960 L681 960 L695 974 L695 1016 L681 1030 L618 1030 L618 1007 L664 1007 L667 1004 L667 986 L664 983 L618 983Z M813 960 L843 960 L843 1052 L813 1052Z M884 960 L914 960 L914 1052 L884 1052Z M843 960 L871 960 L914 1052 L886 1052Z M925 960 L956 960 L956 1052 L925 1052Z M925 960 L1011 960 L995 986 L925 986Z M956 1004 L997 1004 L983 1028 L956 1028Z M925 1026 L1011 1026 L1011 1052 L925 1052Z M1015 960 L1046 960 L1046 1052 L1015 1052Z M1015 1039 L1096 1039 L1106 1052 L1015 1052Z" fill="url(#mfSteelV)"/>
<path fill-rule="evenodd" d="M701 1052 L739 960 L765 960 L802 1052 L771 1052 L763 1030 L740 1030 L732 1052Z M751 986 L762 1012 L740 1012Z" fill="url(#mfSteelV)"/>
</g>
<path d="M419 1050 L349 986 Q349 962 372 962 Q395 962 395 982 L340 1028 Q331 1050 365 1050 Q395 1050 408 1030" fill="none" stroke="#070103" stroke-width="23.5" stroke-linejoin="miter" stroke-linecap="butt"/>
<path d="M419 1050 L349 986 Q349 962 372 962 Q395 962 395 982 L340 1028 Q331 1050 365 1050 Q395 1050 408 1030" fill="none" stroke="url(#mfSteelV)" stroke-width="20" stroke-linejoin="miter" stroke-linecap="butt"/>
<path d="M160 971 L171 960 L191 960 L191 1052 L160 1052Z M316 971 L305 960 L285 960 L285 1052 L316 1052Z M191 960 L238 1042 L238 1052 L222 1052 L191 998Z M285 960 L238 1042 L238 1052 L254 1052 L285 998Z M438 960 L469 960 L469 1052 L438 1052Z M438 960 L546 960 L526 986 L438 986Z M469 1003 L526 1003 L510 1028 L469 1028Z M587 960 L618 960 L618 1052 L587 1052Z M618 960 L681 960 L695 974 L695 1016 L681 1030 L618 1030 L618 1007 L664 1007 L667 1004 L667 986 L664 983 L618 983Z M813 960 L843 960 L843 1052 L813 1052Z M884 960 L914 960 L914 1052 L884 1052Z M843 960 L871 960 L914 1052 L886 1052Z M925 960 L956 960 L956 1052 L925 1052Z M925 960 L1011 960 L995 986 L925 986Z M956 1004 L997 1004 L983 1028 L956 1028Z M925 1026 L1011 1026 L1011 1052 L925 1052Z M1015 960 L1046 960 L1046 1052 L1015 1052Z M1015 1039 L1096 1039 L1106 1052 L1015 1052Z" fill="url(#mfBrush)"/>
<path fill-rule="evenodd" d="M701 1052 L739 960 L765 960 L802 1052 L771 1052 L763 1030 L740 1030 L732 1052Z M751 986 L762 1012 L740 1012Z" fill="url(#mfBrush)"/>
<rect x="260" y="1086" width="734" height="3" fill="url(#mfLine)"/>
<rect x="420" y="1081" width="414" height="13" fill="url(#mfLine)" opacity=".5" filter="url(#mfBlur5)"/>


<!-- light sweep across the metal -->
<g clip-path="url(#mfMetalClip)"><g class="mf-sweep"><rect x="300" y="120" width="120" height="1000" fill="url(#mfSweepG)" transform="skewX(-18)"/></g></g>
</svg>`;

// ---------- Cover & Panel UI ----------
// ---------- Cover & Panel UI ----------
const COVER_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M&F Panel</title>
<style>
:root{--bg:#050304;--red:#ff2a2a;--red2:#c1121f;--soft:cubic-bezier(.45,0,.55,1);--out:cubic-bezier(.22,1,.36,1)}
*{box-sizing:border-box}
body{margin:0;min-height:100svh;display:grid;place-items:center;background:radial-gradient(55% 45% at 88% 102%,rgba(255,42,42,.13),transparent 70%),var(--bg);color:#f6efef;font-family:Tahoma,"Segoe UI",system-ui,sans-serif;overflow:hidden}
.smoke{position:fixed;border-radius:50%;pointer-events:none;will-change:transform;z-index:0}
.s1{width:46vmax;height:46vmax;left:-14vmax;bottom:-20vmax;background:radial-gradient(circle,rgba(179,18,26,.55) 0%,rgba(120,0,10,.25) 45%,transparent 70%);animation:dr1 38s var(--soft) infinite}
.s2{width:34vmax;height:34vmax;right:-10vmax;top:-14vmax;background:radial-gradient(circle,rgba(122,10,18,.5),transparent 68%);animation:dr2 44s var(--soft) infinite}
.s3{width:26vmax;height:26vmax;right:16vmax;bottom:-8vmax;background:radial-gradient(circle,rgba(160,160,170,.28),transparent 66%);animation:dr3 52s var(--soft) infinite}
#net{position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none}
.embers{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:0}
.em{position:absolute;bottom:-12px;width:var(--s);height:var(--s);border-radius:50%;opacity:0;will-change:transform,opacity;background:radial-gradient(circle,#fff2ee 0%,#ff6a55 40%,transparent 72%);animation:rise var(--d) linear var(--l) infinite}
@keyframes rise{0%{transform:translate3d(0,0,0) scale(.7);opacity:0}12%{opacity:.9}100%{transform:translate3d(var(--x),-105vh,0) scale(.2);opacity:0}}
@keyframes dr1{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(5vmax,-4vmax,0) scale(1.12)}}
@keyframes dr2{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(-4vmax,5vmax,0) scale(1.1)}}
@keyframes dr3{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(6vmax,-3vmax,0)}}
.card{position:relative;z-index:2;text-align:center;padding:40px 52px;border-radius:26px;background:#150c0f;border:1px solid rgba(255,90,90,.22);box-shadow:0 20px 50px -28px rgba(255,30,30,.4);animation:cardIn 1.1s var(--out) .15s both}
@keyframes cardIn{from{opacity:0;transform:translate3d(0,34px,0) scale(.96)}}
.stage{position:relative;width:min(300px,64vw);aspect-ratio:990/1035;margin:0 auto;animation:float 8s var(--soft) 1.6s infinite}
@keyframes float{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-9px,0)}}
.stage img{display:block;width:100%;height:100%;filter:drop-shadow(0 14px 40px rgba(255,30,30,.45));animation:logoIn 1.6s var(--out) .1s both}
@keyframes logoIn{from{opacity:0;transform:scale(.86)}}
.halo{position:absolute;left:50%;top:42%;width:88%;aspect-ratio:1;margin:-44% 0 0 -44%;border-radius:50%;pointer-events:none;opacity:.85;
 background:conic-gradient(from 0deg,transparent 0 42%,rgba(255,70,55,.62) 82%,transparent 100%);
 -webkit-mask:radial-gradient(circle farthest-side,transparent 78%,#000 88%,#000 94%,transparent 100%);mask:radial-gradient(circle farthest-side,transparent 78%,#000 88%,#000 94%,transparent 100%);animation:spin 13s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.pill{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;margin-top:10px;border-radius:99px;font-size:13px;color:#ffc9c2;background:rgba(255,255,255,.06);border:1px solid rgba(255,120,110,.22);animation:fadeUp 1s var(--out) 1s both}
.pill i{width:8px;height:8px;border-radius:50%;background:#ff4a3a;box-shadow:0 0 10px #ff4a3a;animation:pulse 2.4s var(--soft) infinite}
@keyframes pulse{50%{opacity:.3}}
h1{margin:14px 0 0;font-size:18px;letter-spacing:.5px;color:#ffd9d4;animation:fadeUp 1s var(--out) 1.15s both}
@keyframes fadeUp{from{opacity:0;transform:translate3d(0,12px,0)}}
p{margin:6px 0 0;color:#a1969a;font-size:13px;animation:fadeUp 1s var(--out) 1.3s both}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style></head><body>
<div class="smoke s1"></div><div class="smoke s2"></div><div class="smoke s3"></div>
<canvas id="net" aria-hidden="true"></canvas><div class="embers" id="embers" aria-hidden="true"></div>
<div class="card"><div class="stage"><div class="halo"></div><img src="/logo.svg" alt="M&amp;F Panel"></div>
<span class="pill"><i></i>Edge Telemetry Service</span>
<h1>All regional endpoints operational.</h1><p>M&amp;F Panel</p></div>
<script>
(function(){var c=document.getElementById('net');if(!c)return;
 var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 var weak=(navigator.deviceMemory&&navigator.deviceMemory<=4)||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)||/Android [2-6]\.|iPhone OS 1[0-2]_/.test(navigator.userAgent);
 var x=null,P=[],run=false;
 function rs(){c.width=innerWidth;c.height=innerHeight}
 function init(){x=c.getContext('2d');rs();
  var N=Math.min(24,Math.round(innerWidth/50));
  for(var i=0;i<N;i++)P.push({x:Math.random()*c.width,y:Math.random()*c.height,vx:(Math.random()-.5)*.35,vy:(Math.random()-.5)*.35});
  requestAnimationFrame(tick)}
 var last=0;
 function tick(t){if(!run||!x)return;if(t-last<40){requestAnimationFrame(tick);return}last=t;
  x.clearRect(0,0,c.width,c.height);
  for(var i=0;i<P.length;i++){var p=P[i];p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>c.width)p.vx*=-1;if(p.y<0||p.y>c.height)p.vy*=-1;
   x.beginPath();x.arc(p.x,p.y,1.6,0,7);x.fillStyle='rgba(255,80,60,.75)';x.fill();
   for(var j=i+1;j<P.length;j++){var q=P[j],dx=p.x-q.x,dy=p.y-q.y,d=dx*dx+dy*dy;
    if(d<13000){x.globalAlpha=1-d/13000;x.beginPath();x.moveTo(p.x,p.y);x.lineTo(q.x,q.y);x.strokeStyle='rgba(255,60,50,.5)';x.lineWidth=1;x.stroke();x.globalAlpha=1}}}
  requestAnimationFrame(tick)}
 function resume(){run=!reduce&&!weak&&!document.hidden;if(run&&x)requestAnimationFrame(tick)}
 if(!weak)init();else if(c.parentNode)c.parentNode.removeChild(c);
 document.addEventListener('visibilitychange',resume);
 var e=document.getElementById('embers'),M=weak?4:7;
 for(var k=0;k<M;k++){var d=document.createElement('i');d.className='em';
  d.style.cssText='--s:'+(2+Math.random()*4).toFixed(1)+'px;--d:'+(9+Math.random()*9).toFixed(1)+'s;--x:'+((Math.random()-.5)*18).toFixed(1)+'vmax;--l:'+(-Math.random()*18).toFixed(1)+'s;left:'+(Math.random()*100).toFixed(1)+'%';
  e.appendChild(d)}})();
</script></body></html>`;

const LOGIN = (sec) => `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M&F Panel — ورود</title>
<link rel="icon" type="image/svg+xml" href="/logo.svg">
<style>
:root{--bg:#050304;--red:#ff2a2a;--red2:#c1121f;--soft:cubic-bezier(.45,0,.55,1);--out:cubic-bezier(.22,1,.36,1)}
*{box-sizing:border-box}
body{margin:0;min-height:100svh;display:grid;place-items:center;background:radial-gradient(55% 45% at 88% 102%,rgba(255,42,42,.13),transparent 70%),var(--bg);color:#f6efef;font-family:Tahoma,"Segoe UI",system-ui,sans-serif;overflow:hidden}
.smoke{position:fixed;border-radius:50%;pointer-events:none;will-change:transform;z-index:0}
.s1{width:46vmax;height:46vmax;left:-14vmax;bottom:-20vmax;background:radial-gradient(circle,rgba(179,18,26,.55) 0%,rgba(120,0,10,.25) 45%,transparent 70%);animation:dr1 38s var(--soft) infinite}
.s2{width:34vmax;height:34vmax;right:-10vmax;top:-14vmax;background:radial-gradient(circle,rgba(122,10,18,.5),transparent 68%);animation:dr2 44s var(--soft) infinite}
#net{position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none}
.card{position:relative;z-index:2;width:min(360px,92vw);padding:34px 30px 28px;border-radius:26px;background:#150c0f;border:1px solid rgba(255,90,90,.22);box-shadow:0 20px 50px -28px rgba(255,30,30,.4);animation:cardIn 1s var(--out) .1s both;text-align:center}
@keyframes cardIn{from{opacity:0;transform:translate3d(0,34px,0) scale(.96)}}
.stage{position:relative;width:110px;margin:0 auto 4px;animation:float 8s var(--soft) 1.4s infinite}
@keyframes float{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-7px,0)}}
.stage img{display:block;width:100%;filter:drop-shadow(0 10px 26px rgba(255,30,30,.45));animation:logoIn 1.4s var(--out) .1s both}
@keyframes logoIn{from{opacity:0;transform:scale(.86)}}
.halo{position:absolute;left:50%;top:44%;width:150%;aspect-ratio:1;margin:-75% 0 0 -75%;border-radius:50%;pointer-events:none;opacity:.8;
 background:conic-gradient(from 0deg,transparent 0 55%,rgba(255,70,55,.55) 88%,transparent 100%);
 -webkit-mask:radial-gradient(circle farthest-side,transparent 74%,#000 86%,#000 94%,transparent 100%);mask:radial-gradient(circle farthest-side,transparent 74%,#000 86%,#000 94%,transparent 100%);animation:spin 12s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
h1{margin:8px 0 2px;font-size:19px;letter-spacing:.4px}
h1 b{background:linear-gradient(90deg,#ff6a55,#ff2a2a);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:#a1969a;font-size:12px;margin:0 0 18px}
input{width:100%;background:rgba(255,255,255,.05);color:#f6efef;border:1px solid rgba(255,90,90,.2);border-radius:13px;padding:12px 14px;font:inherit;font-size:14px;margin-bottom:10px;transition:.25s var(--soft);text-align:right}
input::placeholder{color:#7d7276}
input:focus{outline:0;border-color:var(--red);box-shadow:0 0 0 4px rgba(255,42,42,.16);background:rgba(255,255,255,.08)}
button{width:100%;background:linear-gradient(90deg,var(--red2),var(--red));border:0;border-radius:13px;padding:12px;font:inherit;font-weight:800;color:#fff;cursor:pointer;transition:.2s var(--out);box-shadow:0 12px 28px -10px rgba(255,42,42,.7);position:relative;overflow:hidden}
button::after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-60%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent);transform:skewX(-20deg);animation:shine 5.5s var(--soft) 1.5s infinite}
@keyframes shine{0%{transform:translate3d(0,0,0) skewX(-20deg)}35%,100%{transform:translate3d(420%,0,0) skewX(-20deg)}}
button:hover{box-shadow:0 18px 36px -10px rgba(255,42,42,.9)}
button:disabled{opacity:.6;cursor:wait}
.err{min-height:18px;font-size:12px;color:#ff9c9c;margin:8px 0 0}
.shake{animation:shake .4s}
@keyframes shake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
.note{color:#7d7276;font-size:11px;margin-top:12px}
.foot{display:inline-flex;align-items:center;gap:8px;padding:6px 13px;margin-top:16px;border-radius:99px;font-size:11.5px;color:#ffc9c2;background:rgba(255,255,255,.05);border:1px solid rgba(255,120,110,.22)}
.foot i{width:7px;height:7px;border-radius:50%;background:#ff4a3a;box-shadow:0 0 10px #ff4a3a;animation:pulse 2.4s var(--soft) infinite}
@keyframes pulse{50%{opacity:.3}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style></head><body>
<div class="smoke s1"></div><div class="smoke s2"></div>
<canvas id="net" aria-hidden="true"></canvas>
<div class="card" id="card"><div class="stage"><div class="halo"></div><img src="/logo.svg" alt="M&amp;F Panel"></div>
<h1>M&amp;F <b>PANEL</b></h1><p class="sub">ورود به کنسول مدیریت</p>
<form id="f" autocomplete="off"><input id="u" placeholder="نام کاربری" autocomplete="username" required>
<input id="p" type="password" placeholder="رمز عبور" autocomplete="current-password" required>
<button id="b">ورود</button><div class="err" id="e"></div></form>
<span class="foot"><i></i>نشست ۲۴ ساعته</span></div>
<script>
(function(){var c=document.getElementById('net');if(!c)return;
 var weak=(navigator.deviceMemory&&navigator.deviceMemory<=4)||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4);
 if(weak){if(c.parentNode)c.parentNode.removeChild(c);return}
 var x=c.getContext('2d');function rs(){c.width=innerWidth;c.height=innerHeight}rs();
 var P=[],N=Math.min(20,Math.round(innerWidth/60));
 for(var i=0;i<N;i++)P.push({x:Math.random()*c.width,y:Math.random()*c.height,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3});
 var run=true,last=0;
 function tick(t){if(!run||!x||document.hidden){requestAnimationFrame(tick);return}if(t-last<40){requestAnimationFrame(tick);return}last=t;
  x.clearRect(0,0,c.width,c.height);
  for(var i=0;i<P.length;i++){var p=P[i];p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>c.width)p.vx*=-1;if(p.y<0||p.y>c.height)p.vy*=-1;
   x.beginPath();x.arc(p.x,p.y,1.5,0,7);x.fillStyle='rgba(255,80,60,.7)';x.fill();
   for(var j=i+1;j<P.length;j++){var q=P[j],dx=p.x-q.x,dy=p.y-q.y,d=dx*dx+dy*dy;
    if(d<13000){x.globalAlpha=1-d/13000;x.beginPath();x.moveTo(p.x,p.y);x.lineTo(q.x,q.y);x.strokeStyle='rgba(255,60,50,.45)';x.lineWidth=1;x.stroke();x.globalAlpha=1}}}
  requestAnimationFrame(tick)}
 requestAnimationFrame(tick)})();
var B=${JSON.stringify(sec)};
function $(i){return document.getElementById(i)}
$('f').onsubmit=async function(ev){ev.preventDefault();
 var b=document.getElementById('b'),e=document.getElementById('e');e.textContent='';
 b.disabled=true;try{
  var r=await fetch(B+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({u:document.getElementById('u').value,p:document.getElementById('p').value})});
  if(r.ok){location.reload();return}
  var j=await r.json().catch(function(){return{}});
  e.textContent=j.error||'ورود ناموفق بود';var c=document.getElementById('card');c.classList.remove('shake');void c.offsetWidth;c.classList.add('shake');
 }catch(x){e.textContent='خطای شبکه'}
 b.disabled=false};
</script></body></html>`;

const PAGE = (sec) => `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>M&F PANEL</title>
<link rel="icon" type="image/svg+xml" href="/logo.svg">

<style>
:root{--bg:#050304;--card:rgba(17,11,13,.82);--line:rgba(255,90,90,.20);--field:rgba(255,255,255,.05);
 --txt:#f6efef;--mut:#a1969a;--red:#ff2a2a;--red2:#c1121f;--gr:#ff6a55;--out:cubic-bezier(.22,1,.36,1);--soft:cubic-bezier(.45,0,.55,1)}
*{box-sizing:border-box}
body{margin:0;padding:20px 14px 70px;max-width:940px;margin-inline:auto;color:var(--txt);font:15px/1.7 system-ui,Tahoma,"Segoe UI",sans-serif;
 background:radial-gradient(55% 40% at 85% -5%,rgba(255,42,42,.12),transparent 65%),radial-gradient(45% 35% at 0% 105%,rgba(178,18,31,.14),transparent 60%),var(--bg);
 -webkit-font-smoothing:antialiased}
.smoke{position:fixed;border-radius:50%;pointer-events:none;z-index:-1;will-change:transform}
.s1{width:52vmax;height:52vmax;left:-20vmax;top:30svh;background:radial-gradient(circle,rgba(179,18,26,.4) 0%,rgba(120,0,10,.18) 45%,transparent 70%);animation:dr1 40s var(--soft) infinite}
.s2{width:40vmax;height:40vmax;right:-14vmax;top:-12vmax;background:radial-gradient(circle,rgba(122,10,18,.45),transparent 68%);animation:dr2 46s var(--soft) infinite}
@keyframes dr1{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(5vmax,-4vmax,0) scale(1.1)}}
@keyframes dr2{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(-4vmax,5vmax,0) scale(1.1)}}
#net{position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none}
.embers{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:-1}
.em{position:absolute;bottom:-12px;width:var(--s);height:var(--s);border-radius:50%;opacity:0;will-change:transform,opacity;background:radial-gradient(circle,#fff2ee 0%,#ff6a55 40%,transparent 72%);animation:rise var(--d) linear var(--l) infinite}
@keyframes rise{0%{transform:translate3d(0,0,0) scale(.7);opacity:0}12%{opacity:.9}100%{transform:translate3d(var(--x),-105vh,0) scale(.2);opacity:0}}

header{display:flex;align-items:center;gap:13px;padding:18px 4px 6px;animation:fadeUp 1s var(--out) .1s both}
@keyframes fadeUp{from{opacity:0;transform:translate3d(0,12px,0)}}
.logo{width:52px;height:54px;flex:none;animation:float 8s var(--soft) 1.6s infinite}
@keyframes float{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-7px,0)}}
.logo img{display:block;width:100%;height:100%;filter:drop-shadow(0 8px 22px rgba(255,30,30,.45))}
h1{font-size:20px;margin:0;letter-spacing:.4px}
h1 b{background:linear-gradient(90deg,#ff6a55,#ff2a2a);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:var(--mut);font-size:12px;margin:0}
.pill{display:inline-flex;align-items:center;gap:8px;padding:6px 13px;border-radius:99px;font-size:11.5px;color:#ffc9c2;background:rgba(255,255,255,.05);border:1px solid rgba(255,120,110,.22);margin-top:6px}
.pill i{width:7px;height:7px;border-radius:50%;background:#ff4a3a;box-shadow:0 0 10px #ff4a3a;animation:pulse 2.4s var(--soft) infinite}
@keyframes pulse{50%{opacity:.3}}

.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:18px 0;animation:fadeUp 1s var(--out) .25s both}
.stat{position:relative;background:#140b0e;border:1px solid var(--line);border-radius:18px;padding:12px 16px;overflow:hidden}
.stat b{font-size:24px;display:block}
.stat span{color:var(--mut);font-size:12px}
.stat:after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:radial-gradient(60% 90% at 85% 0%,rgba(255,42,42,.14),transparent 70%)}

section{position:relative;background:transparent;border:1px solid var(--line);border-radius:22px;padding:16px 18px;margin:14px 0;animation:fadeUp 1s var(--out) .35s both;box-shadow:0 14px 34px -22px rgba(255,30,30,.3);overflow:hidden;isolation:isolate}
section::before{content:"";position:absolute;inset:-120%;z-index:-2;pointer-events:none;
 background:conic-gradient(from 0deg,transparent 0 74%,rgba(255,110,95,.85) 88%,transparent 100%);animation:bspin 8s linear infinite;will-change:transform}
section::after{content:"";position:absolute;inset:1px;border-radius:21px;background:#140b0e;z-index:-1;pointer-events:none}
@keyframes bspin{to{transform:rotate(1turn)}}
h2{display:flex;align-items:center;gap:8px;font-size:15px;margin:0 0 12px;color:#f0d9d9}
h2 .ic{width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,rgba(255,42,42,.22),rgba(193,18,31,.22));display:inline-flex;align-items:center;justify-content:center;color:#ff8a7a}

form{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}
input,select{background:var(--field);color:var(--txt);border:1px solid var(--line);border-radius:12px;padding:10px 12px;font:inherit;transition:.25s var(--soft)}
input::placeholder{color:#7d7276}
input:focus,select:focus{outline:0;border-color:var(--red);box-shadow:0 0 0 4px rgba(255,42,42,.16);background:rgba(255,255,255,.08)}
button{background:var(--field);color:var(--txt);border:1px solid var(--line);border-radius:12px;padding:10px 14px;font:inherit;cursor:pointer;transition:.2s var(--out)}
button:hover{border-color:rgba(255,110,100,.55);transform:translateY(-1px)}
button.p{position:relative;overflow:hidden;background:linear-gradient(90deg,var(--red2),var(--red));border:0;font-weight:800;color:#fff;box-shadow:0 12px 28px -10px rgba(255,42,42,.7)}
button.p::after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-60%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent);transform:skewX(-20deg);animation:shine 5.5s var(--soft) 1.5s infinite}
@keyframes shine{0%{transform:translate3d(0,0,0) skewX(-20deg)}35%,100%{transform:translate3d(420%,0,0) skewX(-20deg)}}
button.p:hover{box-shadow:0 18px 36px -10px rgba(255,42,42,.9)}
button.dngr{color:#ffb3b0;border-color:rgba(255,60,60,.3)}
button.dngr:hover{background:rgba(255,42,42,.12)}

.row{background:var(--field);border:1px solid rgba(255,90,90,.14);border-radius:16px;padding:10px 14px;margin-bottom:8px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;transition:.25s var(--soft)}
.row:hover{border-color:rgba(255,110,100,.4)}
.row b{flex:1 1 110px}
.off{opacity:.55}
.sbar{flex:1 1 100%;height:5px;border-radius:3px;background:rgba(255,255,255,.07);overflow:hidden}
.sbar i{display:block;height:100%;background:linear-gradient(90deg,#ff2a2a,#ff7a5c);border-radius:3px;transition:width .6s var(--soft)}
.m{color:var(--mut);font-size:12.5px}
.empty{color:var(--mut);text-align:center;padding:18px;border:1px dashed rgba(255,90,90,.25);border-radius:14px}
.badge{font-size:11px;padding:2px 10px;border-radius:99px;font-weight:600}
.b-gr{background:rgba(255,106,85,.14);color:#ffab9d}.b-am{background:rgba(245,158,11,.15);color:#fbbf24}
.b-rd{background:rgba(255,42,42,.18);color:#ff9c9c}.b-cy{background:rgba(255,255,255,.07);color:#e6c9c9}
.chip{font-size:11px;font-weight:700;padding:2px 9px;border-radius:7px;letter-spacing:.4px}
.chip.vless{background:rgba(255,42,42,.15);color:#ff9c8f}
.chip.vmess{background:rgba(255,106,85,.14);color:#ffc2ae}
.chip.trojan{background:rgba(193,18,31,.24);color:#ff7b7b}
.chip.shadowsocks{background:rgba(255,255,255,.08);color:#e8d5d5}
.lk{display:flex;gap:8px;align-items:center;padding:5px 12px;flex-wrap:wrap}
.switch{position:relative;width:42px;height:23px;flex:none}
.switch input{opacity:0;width:0;height:0}
.sl{position:absolute;inset:0;background:#3a2a2e;border-radius:99px;cursor:pointer;transition:.2s}
.sl:before{content:'';position:absolute;width:17px;height:17px;border-radius:50%;background:#8a7378;top:3px;right:3px;transition:.2s}
.switch input:checked+.sl{background:linear-gradient(90deg,var(--red2),var(--red))}
.switch input:checked+.sl:before{transform:translateX(-19px);background:#fff}
.ava{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,rgba(255,42,42,.3),rgba(193,18,31,.3));border:1px solid rgba(255,110,100,.4);display:flex;align-items:center;justify-content:center;font-weight:800;color:#ffc2ba;flex:none}
.iprow{display:flex;gap:8px;align-items:center;padding:6px 12px;border-radius:12px;background:var(--field);border:1px solid rgba(255,90,90,.14);margin-bottom:6px;transition:.2s}
.ubar{display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap}
.ubar select{padding:7px 10px;font-size:13px;border-radius:10px}
#pnav{display:flex;gap:8px;align-items:center;justify-content:center;padding:6px 0 2px}
#pnav button{padding:6px 14px;font-size:13px}
#pnav button:disabled{opacity:.4;cursor:default;transform:none}
.iprow:hover{border-color:var(--red)}
.spin{width:18px;height:18px;border:2.5px solid rgba(255,255,255,.15);border-top-color:var(--red);border-radius:50%;animation:sp .8s linear infinite;display:inline-block;vertical-align:-4px}
@keyframes sp{to{transform:rotate(360deg)}}
#toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(20px);background:#1d0d10;border:1px solid var(--red);color:#ffd9d4;padding:10px 22px;border-radius:12px;opacity:0;transition:.3s;pointer-events:none;z-index:50;box-shadow:0 0 30px -6px rgba(255,42,42,.6)}
#toast.on{opacity:1;transform:translateX(-50%) translateY(0)}
#modal{position:fixed;inset:0;background:rgba(5,3,4,.88);display:none;align-items:center;justify-content:center;z-index:40}
#modal.on{display:flex}
.mbox{background:#150a0d;border:1px solid var(--line);border-radius:22px;padding:20px;text-align:center;max-width:320px;width:92%;box-shadow:0 30px 80px -30px rgba(255,30,30,.5)}
.mbox img{background:#fff;border-radius:12px;padding:8px;width:220px;height:220px}
.mbox code{display:block;direction:ltr;font-size:10.5px;color:var(--mut);word-break:break-all;margin:10px 0}
@media (max-width:560px){.stats{grid-template-columns:1fr 1fr}form input{flex:1 1 45%}}
html.low #net,html.low .embers,html.low .smoke{display:none}
html.low *,html.low *::before,html.low *::after{animation-play-state:paused!important}
html.low section::before{animation-play-state:running!important}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style></head><body>
<div class="smoke s1"></div><div class="smoke s2"></div>
<canvas id="net" aria-hidden="true"></canvas><div class="embers" id="embers" aria-hidden="true"></div>
<header><div class="logo"><img src="/logo.svg" alt="M&amp;F"></div>
<div><h1>M&amp;F <b>PANEL</b></h1><p class="sub">مدیریت کاربران و نودهای اتصال</p></div>
<div style="flex:1"></div><span class="pill"><i></i>آنلاین</span><button id="bbk" title="دریافت فایل بکاپ JSON">بکاپ</button><button id="brs" title="بازیابی از فایل بکاپ">بازیابی</button><input id="bfile" type="file" accept="application/json,.json" style="display:none"><button id="blo" title="پایان نشست">خروج</button></header>

<div class="stats">
<div class="stat"><b id="sU">-</b><span>کل کاربران</span></div>
<div class="stat"><b id="sA" style="color:#ff8a7a">-</b><span>فعال</span></div>
<div class="stat"><b id="sX" style="color:#ff6a55">-</b><span>نودهای نهایی</span></div>
</div>

<section><h2><span class="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/></svg></span>IP تمیز (فست‌ترین IPهای کلادفلر)</h2>
<button class="p" id="bip">دریافت IP تمیز</button> <button id="btall" style="display:none">تست لایو همه</button> <span class="m" id="ipst">از منابع به‌روز «IP تمیز» گرفته می‌شود و می‌توانید مستقیم در نود استفاده کنید.</span>
<div id="ips" style="margin-top:10px"></div></section>

<section><h2><span class="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M5 12l4-4M5 12l4 4M19 5v14"/></svg></span>نودهای نهایی (Endpoint)</h2>
<form id="fx"><input id="xt" placeholder="تگ / لوکیشن (مثلا de)" size="14">
<input id="xa" placeholder="آدرس / IP تمیز (خالی = خود Worker)" size="24">
<select id="xp"><option>443</option><option>2053</option><option>2083</option><option>2087</option><option>2096</option><option>8443</option></select>
<input id="xi" placeholder="FALLBACK HOST (اختیاری)" size="16"><button class="p">افزودن</button></form>
<div id="x"></div></section>

<section><h2><span class="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M17 11a4 4 0 100-8M22 21c0-3-1.5-5-4-5.7"/></svg></span>کاربران</h2>
<form id="f"><input id="n" placeholder="نام کاربر" required>
<input id="d" type="number" min="0" placeholder="روز (۰ = نامحدود)" style="width:140px">
<input id="qt" type="number" min="0" step="any" placeholder="حجم GB (خالی = نامحدود)" style="width:170px"><button class="p">ساخت کاربر</button></form>
<input id="q" placeholder="جستجوی کاربر..." style="width:100%;margin-bottom:10px">
<div class="ubar"><select id="srt"><option value="new">جدیدترین</option><option value="old">قدیمی‌ترین</option><option value="name">نام (الفبا)</option><option value="exp">نزدیک‌ترین انقضا</option></select>
<select id="pp"><option value="10">۱۰ در صفحه</option><option value="25">۲۵ در صفحه</option><option value="50">۵۰ در صفحه</option><option value="0">همه</option></select></div>
<div id="l"></div><div id="pnav"></div></section>

<section><h2><span class="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg></span>آمار مصرف
<span style="flex:1"></span>
<button id="sref" title="به‌روزرسانی آمار">به‌روزرسانی</button>
<button id="srs" class="dngr" title="پاک کردن همه آمار">ریست</button></h2>
<div id="stats"><div class="empty">در حال بارگذاری...</div></div></section>

<div id="toast"></div>
<div id="modal" onclick="if(event.target===this)this.classList.remove('on')"><div class="mbox">
<h3 style="margin:0 0 10px">لینک اشتراک</h3><img id="qimg" alt="QR"><code id="qurl"></code>
<button class="p" onclick="cp($('qurl').textContent);document.getElementById('modal').classList.remove('on')">کپی لینک</button>
<button onclick="document.getElementById('modal').classList.remove('on')">بستن</button></div></div>

<script>
var B=${JSON.stringify(sec)};
function $(i){return document.getElementById(i)}
function toast(t){var e=$('toast');e.textContent=t;e.classList.add('on');clearTimeout(e._t);e._t=setTimeout(function(){e.classList.remove('on')},2200)}
async function call(u,m,b){var r=await fetch(B+u,{method:m||'GET',headers:{'content-type':'application/json'},body:b?JSON.stringify(b):undefined});if(r.status===401){location.reload();throw new Error('نشست منقضی شد؛ دوباره وارد شوید')}if(!r.ok)throw new Error(await r.text());return r.json()}
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e}
function btn(t,fn,cls){var e=el('button',cls||'',t);e.onclick=function(){var p=fn();if(p&&p.catch)p.catch(function(x){toast(x.message)})};return e}
function cp(t){navigator.clipboard.writeText(t).then(function(){toast('کپی شد')}).catch(function(){prompt('Copy:',t)})}
function chip(p){return el('span','chip '+p,p)}
function fmtB(n){if(!n)return '۰';var u=['B','KB','MB','GB','TB'],i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return (n>=100?Math.round(n):Math.round(n*10)/10)+u[i]}
async function loadStats(){var b=$('stats');
 try{var s=await call('/api/stats'),agg={};
  Object.keys(s.days).forEach(function(d){Object.keys(s.days[d]).forEach(function(id){var a=agg[id]||{up:0,dn:0};a.up+=s.days[d][id].up||0;a.dn+=s.days[d][id].dn||0;agg[id]=a})});
  var mx=0;Object.keys(agg).forEach(function(id){mx=Math.max(mx,agg[id].up+agg[id].dn)});
  var rows=Object.keys(agg).map(function(id){var u=USERS.find(function(x){return x.id===id});var a=agg[id];return {id:id,name:u?u.name:'(حذف‌شده)',up:a.up,dn:a.dn,tot:a.up+a.dn}}).sort(function(a,b){return b.tot-a.tot});
  b.textContent='';
  if(!rows.length){b.append(el('div','empty','هنوز مصرفی ثبت نشده است.'));return}
  var head=el('div','row');head.style.opacity='.65';
  head.append(el('b','','کاربر'),el('span','m','↑ آپلود'),el('span','m','↓ دانلود'),el('b','','مجموع'));b.append(head);
  rows.forEach(function(r){var row=el('div','row');
   var bar=el('div','sbar');var f=el('i');f.style.width=(mx?Math.max(3,Math.round(r.tot/mx*100)):0)+'%';bar.append(f);
   var nm=el('div');nm.style.flex='1 1 110px';nm.append(el('b','',r.name),bar);
   row.append(nm,el('span','m',fmtB(r.up)),el('span','m',fmtB(r.dn)),el('b','',fmtB(r.tot)));
   b.append(row)})}
 catch(x){b.textContent='';b.append(el('div','empty','خطا در بارگذاری آمار'))}}
$('sref').onclick=loadStats;
$('srs').onclick=function(){if(confirm('همه آمار مصرف پاک شود؟'))call('/api/stats','DELETE').then(function(){toast('آمار پاک شد');loadStats()})};
loadStats();
function badge(u){if(!u.on)return el('span','badge b-rd','غیرفعال');
 var us=STATS[u.id];
 if(u.q>0){var used=(us?(us.up||0)+(us.dn||0):0);
  var t=el('span','badge '+(used>=u.q?'b-rd':'b-am'),fmtB(used)+' / '+fmtB(u.q));
  if(used>=u.q)t.title='سهمیه تمام شد — اتصال جدید بسته است';return t}
 if(!u.exp)return el('span','badge b-gr','نامحدود');
 var d=Math.ceil((u.exp-Date.now())/864e5);
 if(d<=0)return el('span','badge b-rd','منقضی');
 if(d<=7)return el('span','badge b-am',d+' روز مانده');
 return el('span','badge b-gr',new Date(u.exp).toLocaleDateString('fa-IR'))}

async function loadExt(){var l=await call('/api/ext'),b=$('x');b.textContent='';
 $('sX').textContent=l.length;
 if(!l.length){b.append(el('div','empty','خالی است؛ به‌صورت پیش‌فرض خود Worker استفاده می‌شود.'));return}
 l.forEach(function(e){var r=el('div','row');
  r.append(el('b','',e.tag),el('span','m',(e.address||'(host)')+':'+e.port+(e.proxyip?' → '+e.proxyip:'')),
   btn('حذف',async function(){await call('/api/ext/'+e.tag,'DELETE');loadExt();toast('حذف شد')},'dngr'));b.append(r)})}
var USERS=[],STATS={};
async function load(){
 var pr=[call('/api/users'),call('/api/stats').catch(function(){return {days:{}}})];
 var res=await Promise.all(pr);USERS=res[0];
 STATS={};Object.keys(res[1].days||{}).forEach(function(d){Object.keys(res[1].days[d]).forEach(function(id){var a=STATS[id]||{up:0,dn:0};a.up+=res[1].days[d][id].up||0;a.dn+=res[1].days[d][id].dn||0;STATS[id]=a})});
 $('sU').textContent=USERS.length;
 $('sA').textContent=USERS.filter(function(u){return u.on&&(!u.exp||u.exp>Date.now())}).length;
 render()}
var PG=1;
function cmpUsers(k,a,b){if(k==='old')return (a.created||0)-(b.created||0);
 if(k==='name')return String(a.name).localeCompare(String(b.name),'fa');
 if(k==='exp')return ((a.exp&&a.exp>Date.now()?a.exp:Infinity))>((b.exp&&b.exp>Date.now()?b.exp:Infinity))?1:-1;
 return (b.created||0)-(a.created||0)}
function render(){var q=($('q').value||'').toLowerCase(),b=$('l');b.textContent='';
 var us=USERS.filter(function(u){return !q||u.name.toLowerCase().indexOf(q)>=0});
 var k=$('srt').value;us.sort(function(a,b2){return cmpUsers(k,a,b2)});
 var per=Number($('pp').value)||0,tot=per?Math.max(1,Math.ceil(us.length/per)):1;
 if(PG>tot)PG=tot;if(PG<1)PG=1;
 var page=per?us.slice((PG-1)*per,PG*per):us;
 if(!us.length){b.append(el('div','empty','کاربری یافت نشد.'));$('pnav').textContent='';return}
 page.forEach(function(u){var w=el('div'),r=el('div','row'+(u.on?'':' off'));
  var av=el('div','ava',(u.name[0]||'?').toUpperCase());
  var info=el('div');info.style.flex='1 1 130px';
  info.append(el('b','',u.name),el('div','m',u.id.slice(0,8)+'…'));
  r.append(av,info,badge(u),
   btn('ساب',function(){qr(u)}),
   btn('پروفایل',function(){window.open(B+'/sub/'+u.id+'?view=1','_blank')}),
   btn('کانفیگ‌ها',async function(){if(w._open){w._open=false;d.textContent='';return}w._open=true;
    var d=w.querySelector('.cfg')||el('div','cfg');if(!d.parentNode)w.append(d);d.textContent='جاری...';
    d.textContent='';(await call('/api/links/'+u.id)).forEach(function(x){var q2=el('div','lk');
     q2.append(chip(x.proto),el('span','m',x.tag),
      btn('کپی',function(){cp(x.link)}));d.append(q2)})}),
   btn('حجم',function(){var v=prompt('سهمیه حجم به GB (۰ یا خالی = نامحدود):',u.q?(u.q/1073741824):'');
    if(v===null)return;var g=Number(v)||0;call('/api/users/'+u.id,'PATCH',{quota:g}).then(function(){load();toast(g?'سهمیه '+g+'GB شد':'نامحدود شد')})}),
   btn(u.on?'غیرفعال':'فعال',async function(){await call('/api/users/'+u.id,'PATCH',{on:!u.on});load()}),
   btn('حذف',function(){if(confirm('حذف شود؟'))call('/api/users/'+u.id,'DELETE').then(function(){load();toast('حذف شد')})},'dngr'));
  w.append(r);b.append(w)});
 var pn=$('pnav');pn.textContent='';
 if(per&&tot>1){var prev=btn('قبلی',function(){PG--;render()});prev.disabled=PG<=1;
  var next=btn('بعدی',function(){PG++;render()});next.disabled=PG>=tot;
  pn.append(prev,el('span','m','صفحه '+PG+' از '+tot+' ('+us.length+' کاربر)'),next)}}
function qr(u){var link=location.origin+B+'/sub/'+u.id;
 $('qimg').src='https://api.qrserver.com/v1/create-qr-code/?size=220x220&data='+encodeURIComponent(link);
 $('qurl').textContent=link;$('modal').classList.add('on')}

var IPS=[];
function msBadge(ms){if(ms===-1)return el('span','badge b-cy','...');if(ms===null||ms===undefined)return el('span','badge b-rd','خطا');
 if(!ms)return el('span','badge b-cy','پیشنهادی');
 return el('span','badge '+(ms<300?'b-gr':ms<900?'b-am':'b-rd'),ms+'ms')}
function testIp(o,done){var st=performance.now();
 fetch('https://'+o.ip+'/cdn-cgi/trace',{mode:'no-cors',signal:AbortSignal.timeout(5000)})
 .then(function(){done(Math.round(performance.now()-st))})
 .catch(function(e){done(e&&e.name==='TimeoutError'?null:Math.round(performance.now()-st))})}
function renderIps(){var b=$('ips');b.textContent='';
 if(!IPS.length){b.append(el('div','empty','لیست خالی است.'));return}
 IPS.forEach(function(o){var r=el('div','iprow');
  r.append(msBadge(o.ms),el('b','',o.ip),
   btn('تست',function(){o.ms=-1;renderIps();testIp(o,function(ms){o.ms=ms;renderIps()})}),
   btn('استفاده در نود',function(){$('xa').value=o.ip;toast('در فرم نود قرار گرفت')}));
  b.append(r)})}
$('bip').onclick=async function(){var b=$('ips'),s=$('ipst');b.textContent='';s.innerHTML='<span class="spin"></span> در حال دریافت IP تمیز...';
 this.disabled=true;try{
 var l=await call('/api/cleanip');
 if(!l.length){s.textContent='دریافت ناموفق بود؛ دوباره تلاش کنید.';return}
 IPS=l;renderIps();
 s.textContent=l.length+' IP تمیز آماده استفاده — با «تست لایو» سرعت واقعی را بسنجید.';
 $('btall').style.display=''}catch(x){s.textContent=x.message}this.disabled=false};
$('btall').onclick=function(){var s=$('ipst');if(!IPS.length)return;this.disabled=true;
 var done=0;function fin(){done++;if(done===IPS.length){IPS.sort(function(a,b){return (a.ms===null?1e9:(a.ms||1e8))-(b.ms===null?1e9:(b.ms||1e8))});renderIps();
  var ok=IPS.filter(function(o){return o.ms!==null}).length;s.textContent='تست کامل شد: '+ok+' از '+IPS.length+' پاسخ دادند (مرتب بر اساس سرعت)';$('btall').disabled=false}}
 var W=6;for(var g=0;g<IPS.length;g+=W){(function(gr){for(var j=gr;j<Math.min(gr+W,IPS.length);j++){(function(o){o.ms=-1;renderIps();testIp(o,function(ms){o.ms=ms;fin()})})(IPS[j])}})(g)}};

$('fx').onsubmit=async function(e){e.preventDefault();
 try{await call('/api/ext','POST',{tag:$('xt').value,address:$('xa').value,port:$('xp').value,proxyip:$('xi').value});e.target.reset();loadExt();toast('نود اضافه شد')}catch(x){toast(x.message)}};
$('f').onsubmit=async function(e){e.preventDefault();
 try{await call('/api/users','POST',{name:$('n').value,days:$('d').value,quota:$('qt').value});e.target.reset();load();toast('کاربر ساخته شد')}catch(x){toast(x.message)}};
$('q').oninput=function(){PG=1;render()};
$('srt').onchange=function(){PG=1;render()};
$('pp').onchange=function(){PG=1;render()};
$('blo').onclick=async function(){try{await fetch(B+'/api/logout',{method:'POST'})}catch(x){}location.reload()};
$('bbk').onclick=function(){var a=document.createElement('a');a.href=B+'/api/backup';a.download='mf-panel-backup.json';document.body.append(a);a.click();a.remove();toast('بکاپ در حال دانلود است')};
$('brs').onclick=function(){$('bfile').click()};
$('bfile').onchange=async function(){var f=this.files[0];this.value='';if(!f)return;
 if(!confirm('بازیابی، کاربران و نودهای فعلی را با محتوای فایل ترکیب/جایگزین می‌کند. ادامه؟'))return;
 try{var txt=await f.text(),b=JSON.parse(txt);
  var r=await call('/api/restore','POST',b);
  toast('بازیابی شد: '+r.users+' کاربر');load();loadExt()}catch(x){toast(x.message||'فایل نامعتبر است')}};
loadExt().then(load).catch(function(){$('l').textContent='خطا در بارگذاری'});
</script>
<script>
(function(){var c=document.getElementById('net');if(!c)return;
 var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 var weak=(navigator.deviceMemory&&navigator.deviceMemory<=4)||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)||/Android [2-6]\.|iPhone OS 1[0-2]_/.test(navigator.userAgent);
 var x=null,P=[],run=false;
 function rs(){c.width=innerWidth;c.height=innerHeight}
 function init(){x=c.getContext('2d');rs();
  var N=Math.min(24,Math.round(innerWidth/56));
  for(var i=0;i<N;i++)P.push({x:Math.random()*c.width,y:Math.random()*c.height,vx:(Math.random()-.5)*.35,vy:(Math.random()-.5)*.35});
  requestAnimationFrame(tick)}
 var last=0;
 function tick(t){if(!run||!x)return;if(t-last<40){requestAnimationFrame(tick);return}last=t;
  x.clearRect(0,0,c.width,c.height);
  for(var i=0;i<P.length;i++){var p=P[i];p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>c.width)p.vx*=-1;if(p.y<0||p.y>c.height)p.vy*=-1;
   x.beginPath();x.arc(p.x,p.y,1.6,0,7);x.fillStyle='rgba(255,80,60,.7)';x.fill();
   for(var j=i+1;j<P.length;j++){var q=P[j],dx=p.x-q.x,dy=p.y-q.y,d=dx*dx+dy*dy;
    if(d<13000){x.globalAlpha=1-d/13000;x.beginPath();x.moveTo(p.x,p.y);x.lineTo(q.x,q.y);x.strokeStyle='rgba(255,60,50,.45)';x.lineWidth=1;x.stroke();x.globalAlpha=1}}}
  requestAnimationFrame(tick)}
 function resume(){run=!reduce&&!weak&&!document.hidden;if(run&&x)requestAnimationFrame(tick)}
 if(!weak)init();else if(c.parentNode)c.parentNode.removeChild(c);
 document.addEventListener('visibilitychange',resume);
 var st;
 addEventListener('scroll',function(){document.documentElement.classList.add('low');run=false;clearTimeout(st);
  st=setTimeout(function(){document.documentElement.classList.remove('low');resume()},350)},{passive:true});
 var e=document.getElementById('embers'),M=weak?4:7;
 for(var k=0;k<M;k++){var d=document.createElement('i');d.className='em';
  d.style.cssText='--s:'+(2+Math.random()*4).toFixed(1)+'px;--d:'+(9+Math.random()*9).toFixed(1)+'s;--x:'+((Math.random()-.5)*18).toFixed(1)+'vmax;--l:'+(-Math.random()*18).toFixed(1)+'s;left:'+(Math.random()*100).toFixed(1)+'%';
  e.appendChild(d)}})();
</script></body></html>`;

// ---------- QR encoder (byte mode, ECC M, v1-10) ----------
function qrMatrix(text) {
  const bytes = new TextEncoder().encode(text);
  const GF = (() => {
    const exp = new Uint8Array(512), log = new Uint8Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) { exp[i] = x; log[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
    return { exp, log, mul: (a, b) => (a && b) ? exp[log[a] + log[b]] : 0 };
  })();
  const SPEC = [
    [1, 16, [[1, 16, 10]]],
    [2, 28, [[1, 28, 16]]],
    [3, 44, [[1, 44, 26]]],
    [4, 64, [[2, 32, 18]]],
    [5, 86, [[2, 43, 24]]],
    [6, 108, [[4, 27, 16]]],
    [7, 124, [[4, 31, 18]]],
    [8, 154, [[2, 38, 22], [2, 39, 22]]],
    [9, 182, [[3, 36, 22], [2, 37, 22]]],
    [10, 216, [[4, 43, 26], [2, 44, 26]]],
  ];
  const ALIGN = [0, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  let ver = 0, spec = null;
  for (const sp of SPEC) {
    const cap = sp[1] * 8 - 4 - 8;
    if (bytes.length <= Math.floor(cap / 8)) { ver = sp[0]; spec = sp; break; }
  }
  if (!ver) throw new Error('QR: payload too long');
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
  put(4, 4); put(bytes.length, 8);
  for (const b of bytes) put(b, 8);
  const totalBits = spec[1] * 8;
  put(0, Math.min(4, totalBits - bits.length));
  while (bits.length % 8) bits.push(0);
  const dataCW = [];
  for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; dataCW.push(b); }
  const PAD = [0xec, 0x11];
  for (let i = 0; dataCW.length < spec[1]; i++) dataCW.push(PAD[i % 2]);
  const rsDiv = (degree) => {
    const res = new Array(degree).fill(0);
    res[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        res[j] = GF.mul(res[j], root);
        if (j + 1 < degree) res[j] ^= res[j + 1];
      }
      root = GF.mul(root, 2);
    }
    return res;
  };
  const rsRem = (data, div) => {
    const res = new Array(div.length).fill(0);
    for (const b of data) {
      const f = b ^ res.shift();
      res.push(0);
      for (let i = 0; i < div.length; i++) res[i] ^= GF.mul(div[i], f);
    }
    return res;
  };
  const blocks = [];
  for (const [cnt, dper, eper] of spec[2]) {
    const div = rsDiv(eper);
    for (let b = 0; b < cnt; b++) {
      const off = blocks.reduce((a, x) => a + x.data.length, 0);
      const data = dataCW.slice(off, off + dper);
      blocks.push({ data, ecc: rsRem(data, div) });
    }
  }
  const seq = [];
  const maxD = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.data.length) seq.push(b.data[i]);
  const maxE = Math.max(...blocks.map((b) => b.ecc.length));
  for (let i = 0; i < maxE; i++) for (const b of blocks) if (i < b.ecc.length) seq.push(b.ecc[i]);
  const codewords = new Uint8Array(seq);
  const n = ver * 4 + 17;
  const M = Array.from({ length: n }, () => new Uint8Array(n));
  const F = Array.from({ length: n }, () => new Uint8Array(n));
  const setF = (r, c, v) => { if (r >= 0 && r < n && c >= 0 && c < n) { M[r][c] = v; F[r][c] = 1; } };
  const finder = (r, c) => {
    for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
      const d = Math.max(Math.abs(i - 3), Math.abs(j - 3));
      setF(r + i, c + j, d !== 2 && d !== 4 ? 1 : 0);
    }
  };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) { const v = i % 2 ? 0 : 1; setF(6, i, v); setF(i, 6, v); }
  setF(n - 8, 8, 1);
  const ap = ALIGN[ver];
  for (const r of ap) for (const c of ap) {
    if ((r <= 8 && c <= 8) || (r <= 8 && c >= n - 9) || (r >= n - 9 && c <= 8)) continue;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) setF(r + i, c + j, Math.max(Math.abs(i), Math.abs(j)) !== 1 ? 1 : 0);
  }
  let fmt = 0;
  const bch = (() => { let d = fmt << 10; for (let i = 14; i >= 10; i--) if ((d >> i) & 1) d ^= 0x537 << (i - 10); return ((fmt << 10) | d) ^ 0x5412; })();
  const fmtBit = (i) => (bch >> i) & 1;
  for (let i = 0; i <= 5; i++) setF(8, i, fmtBit(i));
  setF(8, 7, fmtBit(6)); setF(8, 8, fmtBit(7)); setF(7, 8, fmtBit(8));
  for (let i = 9; i < 15; i++) setF(14 - i, 8, fmtBit(i));
  for (let i = 0; i < 8; i++) setF(8, n - 1 - i, fmtBit(i));
  for (let i = 8; i < 15; i++) setF(n - 15 + i, 8, fmtBit(i));
  if (ver >= 7) {
    let d = ver << 12;
    for (let i = 17; i >= 12; i--) if ((d >> i) & 1) d ^= 0x1f25 << (i - 12);
    const vi = (ver << 12) | d;
    for (let i = 0; i < 18; i++) {
      const v = (vi >> i) & 1, r = Math.floor(i / 3), c = i % 3;
      setF(r, n - 11 + c, v); setF(n - 11 + c, r, v);
    }
  }
  let bi = 0, up = true;
  for (let c = n - 1; c > 0; c -= 2) {
    if (c === 6) c--;
    for (let k = 0; k < n; k++) {
      const r = up ? n - 1 - k : k;
      for (const cc of [c, c - 1]) {
        if (F[r][cc]) continue;
        const bit = bi < codewords.length * 8 ? ((codewords[bi >> 3] >> (7 - (bi & 7))) & 1) : 0;
        M[r][cc] = bit ^ ((r + cc) % 2 ? 0 : 1);
        bi++;
      }
    }
    up = !up;
  }
  return M;
}

// ---------- user profile page ----------
const QR_SRC = "function qrMatrix(text) {\n  const bytes = new TextEncoder().encode(text);\n  const GF = (() => {\n    const exp = new Uint8Array(512), log = new Uint8Array(256);\n    let x = 1;\n    for (let i = 0; i < 255; i++) { exp[i] = x; log[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }\n    for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];\n    return { exp, log, mul: (a, b) => (a && b) ? exp[log[a] + log[b]] : 0 };\n  })();\n  const SPEC = [\n    [1, 16, [[1, 16, 10]]],\n    [2, 28, [[1, 28, 16]]],\n    [3, 44, [[1, 44, 26]]],\n    [4, 64, [[2, 32, 18]]],\n    [5, 86, [[2, 43, 24]]],\n    [6, 108, [[4, 27, 16]]],\n    [7, 124, [[4, 31, 18]]],\n    [8, 154, [[2, 38, 22], [2, 39, 22]]],\n    [9, 182, [[3, 36, 22], [2, 37, 22]]],\n    [10, 216, [[4, 43, 26], [2, 44, 26]]],\n  ];\n  const ALIGN = [0, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];\n  let ver = 0, spec = null;\n  for (const sp of SPEC) {\n    const cap = sp[1] * 8 - 4 - 8;\n    if (bytes.length <= Math.floor(cap / 8)) { ver = sp[0]; spec = sp; break; }\n  }\n  if (!ver) throw new Error('QR: payload too long');\n  const bits = [];\n  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };\n  put(4, 4); put(bytes.length, 8);\n  for (const b of bytes) put(b, 8);\n  const totalBits = spec[1] * 8;\n  put(0, Math.min(4, totalBits - bits.length));\n  while (bits.length % 8) bits.push(0);\n  const dataCW = [];\n  for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; dataCW.push(b); }\n  const PAD = [0xec, 0x11];\n  for (let i = 0; dataCW.length < spec[1]; i++) dataCW.push(PAD[i % 2]);\n  const rsDiv = (degree) => {\n    const res = new Array(degree).fill(0);\n    res[degree - 1] = 1;\n    let root = 1;\n    for (let i = 0; i < degree; i++) {\n      for (let j = 0; j < degree; j++) {\n        res[j] = GF.mul(res[j], root);\n        if (j + 1 < degree) res[j] ^= res[j + 1];\n      }\n      root = GF.mul(root, 2);\n    }\n    return res;\n  };\n  const rsRem = (data, div) => {\n    const res = new Array(div.length).fill(0);\n    for (const b of data) {\n      const f = b ^ res.shift();\n      res.push(0);\n      for (let i = 0; i < div.length; i++) res[i] ^= GF.mul(div[i], f);\n    }\n    return res;\n  };\n  const blocks = [];\n  for (const [cnt, dper, eper] of spec[2]) {\n    const div = rsDiv(eper);\n    for (let b = 0; b < cnt; b++) {\n      const off = blocks.reduce((a, x) => a + x.data.length, 0);\n      const data = dataCW.slice(off, off + dper);\n      blocks.push({ data, ecc: rsRem(data, div) });\n    }\n  }\n  const seq = [];\n  const maxD = Math.max(...blocks.map((b) => b.data.length));\n  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.data.length) seq.push(b.data[i]);\n  const maxE = Math.max(...blocks.map((b) => b.ecc.length));\n  for (let i = 0; i < maxE; i++) for (const b of blocks) if (i < b.ecc.length) seq.push(b.ecc[i]);\n  const codewords = new Uint8Array(seq);\n  const n = ver * 4 + 17;\n  const M = Array.from({ length: n }, () => new Uint8Array(n));\n  const F = Array.from({ length: n }, () => new Uint8Array(n));\n  const setF = (r, c, v) => { if (r >= 0 && r < n && c >= 0 && c < n) { M[r][c] = v; F[r][c] = 1; } };\n  const finder = (r, c) => {\n    for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {\n      const d = Math.max(Math.abs(i - 3), Math.abs(j - 3));\n      setF(r + i, c + j, d !== 2 && d !== 4 ? 1 : 0);\n    }\n  };\n  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);\n  for (let i = 8; i < n - 8; i++) { const v = i % 2 ? 0 : 1; setF(6, i, v); setF(i, 6, v); }\n  setF(n - 8, 8, 1);\n  const ap = ALIGN[ver];\n  for (const r of ap) for (const c of ap) {\n    if ((r <= 8 && c <= 8) || (r <= 8 && c >= n - 9) || (r >= n - 9 && c <= 8)) continue;\n    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) setF(r + i, c + j, Math.max(Math.abs(i), Math.abs(j)) !== 1 ? 1 : 0);\n  }\n  let fmt = 0;\n  const bch = (() => { let d = fmt << 10; for (let i = 14; i >= 10; i--) if ((d >> i) & 1) d ^= 0x537 << (i - 10); return ((fmt << 10) | d) ^ 0x5412; })();\n  const fmtBit = (i) => (bch >> i) & 1;\n  for (let i = 0; i <= 5; i++) setF(8, i, fmtBit(i));\n  setF(8, 7, fmtBit(6)); setF(8, 8, fmtBit(7)); setF(7, 8, fmtBit(8));\n  for (let i = 9; i < 15; i++) setF(14 - i, 8, fmtBit(i));\n  for (let i = 0; i < 8; i++) setF(8, n - 1 - i, fmtBit(i));\n  for (let i = 8; i < 15; i++) setF(n - 15 + i, 8, fmtBit(i));\n  if (ver >= 7) {\n    let d = ver << 12;\n    for (let i = 17; i >= 12; i--) if ((d >> i) & 1) d ^= 0x1f25 << (i - 12);\n    const vi = (ver << 12) | d;\n    for (let i = 0; i < 18; i++) {\n      const v = (vi >> i) & 1, r = Math.floor(i / 3), c = i % 3;\n      setF(r, n - 11 + c, v); setF(n - 11 + c, r, v);\n    }\n  }\n  let bi = 0, up = true;\n  for (let c = n - 1; c > 0; c -= 2) {\n    if (c === 6) c--;\n    for (let k = 0; k < n; k++) {\n      const r = up ? n - 1 - k : k;\n      for (const cc of [c, c - 1]) {\n        if (F[r][cc]) continue;\n        const bit = bi < codewords.length * 8 ? ((codewords[bi >> 3] >> (7 - (bi & 7))) & 1) : 0;\n        M[r][cc] = bit ^ ((r + cc) % 2 ? 0 : 1);\n        bi++;\n      }\n    }\n    up = !up;\n  }\n  return M;\n}";

function SUB_PAGE(d) {
  const J = JSON.stringify(d).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="fa" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${d.name ? d.name.replace(/[<>&]/g, '') + ' | ' : ''}M&amp;F Panel</title>
<style>
:root{--bg:#070508;--card:#140d10;--red:#ff3b30;--red2:#c1121f;--tx:#f4eded;--mut:#a39498;--ok:#34c759;--line:rgba(255,100,90,.16)}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;min-height:100svh;background:radial-gradient(70% 40% at 50% -10%,rgba(255,59,48,.12),transparent 70%),var(--bg);color:var(--tx);font-family:Tahoma,"Segoe UI",system-ui,sans-serif;display:flex;justify-content:center;padding:18px 14px 40px}
.w{width:100%;max-width:430px;display:flex;flex-direction:column;gap:14px}
.h{display:flex;align-items:center;gap:10px;padding:4px 2px}
.h img{width:34px;height:34px}
.h b{font-size:15px;flex:1}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;box-shadow:0 12px 34px -22px rgba(255,40,30,.5)}
.qrw{display:flex;flex-direction:column;align-items:center;gap:12px}
#qr{width:230px;height:230px;border-radius:14px;background:#fff;padding:10px}
.st{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;padding:5px 12px;border-radius:99px;border:1px solid var(--line);background:rgba(255,255,255,.05)}
.st i{width:8px;height:8px;border-radius:50%}
.st.on i{background:var(--ok);box-shadow:0 0 9px var(--ok)}
.st.off i{background:var(--red);box-shadow:0 0 9px var(--red)}
.uname{font-size:17px;font-weight:bold;margin-top:2px}
.uid{font-size:11.5px;color:var(--mut);direction:ltr;unicode-bidi:embed}
.brow{display:flex;gap:9px;margin-top:12px}
.bb{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;padding:11px;border-radius:12px;border:0;font-family:inherit;font-size:13.5px;font-weight:bold;color:#fff;cursor:pointer;transition:transform .15s,filter .15s}
.bb:active{transform:scale(.96)}
.bb.p{background:linear-gradient(135deg,var(--red),var(--red2))}
.bb.g{background:rgba(255,255,255,.07);border:1px solid var(--line)}
.bb svg{width:16px;height:16px;fill:currentColor}
.mrow{display:flex;justify-content:space-between;align-items:baseline;padding:7px 0;font-size:13.5px}
.mrow+.mrow{border-top:1px dashed rgba(255,255,255,.07)}
.mrow span{color:var(--mut)}
.mrow b{direction:ltr;unicode-bidi:embed;font-size:13.5px}
.bar{height:9px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;margin:10px 0 6px}
.bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--red),#ff7a5c);transition:width .8s cubic-bezier(.22,1,.36,1)}
.bar i.warn{background:linear-gradient(90deg,#e6a700,#ffb84d)}
.pct{font-size:12px;color:var(--mut);text-align:left;direction:ltr}
.sec{display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:12.5px;color:var(--mut)}
details{border:1px solid var(--line);border-radius:14px;background:var(--card);overflow:hidden}
summary{padding:13px 16px;font-size:13.5px;font-weight:bold;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center}
summary::-webkit-details-marker{display:none}
summary::after{content:'+';font-size:17px;color:var(--mut)}
details[open] summary::after{content:'−'}
.lk{display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid rgba(255,255,255,.06)}
.chip{font-size:10px;font-weight:bold;padding:3px 8px;border-radius:7px;background:rgba(255,80,60,.15);color:#ff8d7e;letter-spacing:.4px}
.lk .nm{flex:1;font-size:12px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr;text-align:left}
.mini{border:0;background:rgba(255,255,255,.08);color:var(--tx);font-family:inherit;font-size:11.5px;padding:6px 12px;border-radius:9px;cursor:pointer}
.mini:active{transform:scale(.95)}
.foot{text-align:center;color:#5d5256;font-size:11px;margin-top:6px}
#toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%) translateY(20px);background:#241318;border:1px solid var(--line);color:var(--tx);padding:9px 20px;border-radius:99px;font-size:13px;opacity:0;transition:.3s;pointer-events:none;z-index:9}
#toast.on{opacity:1;transform:translateX(-50%)}
.exp-lost{color:var(--red)}
</style></head><body>
<div class="w">
 <div class="h"><img src="/logo.svg" alt="M&F Panel"><b>M&amp;F PANEL</b></div>
 <div class="card qrw">
  <svg id="qr" viewBox="0 0 33 33" preserveAspectRatio="xMidYMid meet"></svg>
  <div style="text-align:center">
   <span class="st ${d.on ? 'on' : 'off'}"><i></i>${d.on ? 'فعال' : 'غیرفعال'}</span>
   <div class="uname">${d.name.replace(/[<>&]/g, '')}</div>
   <div class="uid">${d.id}</div>
  </div>
  <div class="brow">
   <button class="bb p" id="csub"><svg viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>کپی لینک ساب</button>
   <button class="bb g" id="dl"><svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>کانفیگ‌ها</button>
  </div>
 </div>
 <div class="card">
  <div class="mrow"><span>آپلود</span><b>${d.upS}</b></div>
  <div class="mrow"><span>دانلود</span><b>${d.dnS}</b></div>
  <div class="mrow"><span>مجموع مصرف</span><b>${d.totS}</b></div>
  ${d.q > 0 ? `<div class="bar"><i id="ub" style="width:0"></i></div><div class="pct" id="upct"></div><div class="mrow" style="border:0;padding-bottom:0"><span>سهمیه کل</span><b>${d.qS}</b></div><div class="mrow" style="border:0"><span>باقی‌مانده</span><b class="${d.left <= 0 ? 'exp-lost' : ''}">${d.leftS}</b></div>` : '<div class="mrow" style="border:0"><span>سهمیه</span><b>نامحدود</b></div>'}
  <div class="sec"><span>آخرین ۳۱ روز</span><span id="upd"></span></div>
 </div>
 <div class="card">
  <div class="mrow" style="padding:2px 0"><span>تاریخ انقضا</span><b class="${d.expired ? 'exp-lost' : ''}" id="expt">${d.expS}</b></div>
  ${d.exp ? `<div class="mrow" style="border:0"><span>زمان باقی‌مانده</span><b>${d.leftD}</b></div>` : ''}
 </div>
 <details id="cfgd">
  <summary>کانفیگ‌ها (${d.links.length})</summary>
  <div id="lks"></div>
 </details>
 <div class="foot">M&amp;F Panel · Subscription Profile</div>
</div>
<div id="toast"></div>
<script>
var qrMatrix=(new Function(${JSON.stringify(QR_SRC)} + ";return qrMatrix;"))();
var D=${J};
function fmtB(n){n=Number(n)||0;if(n<1024)return n+' B';var u=['KB','MB','GB','TB'],i=-1;do{n/=1024;i++}while(n>=1024&&i<u.length-1);return (n>=100?n.toFixed(0):n>=10?n.toFixed(1):n.toFixed(2))+' '+u[i]}
function toast(m){var t=document.getElementById('toast');t.textContent=m;t.classList.add('on');setTimeout(function(){t.classList.remove('on')},1800)}
function cp(s){(navigator.clipboard?navigator.clipboard.writeText(s):Promise.reject()).then(function(){toast('کپی شد')}).catch(function(){var i=document.createElement('textarea');i.value=s;document.body.append(i);i.select();try{document.execCommand('copy');toast('کپی شد')}catch(e){toast('کپی نشد')}i.remove()})}
(function(){var M=function(){try{return qrMatrix(D.sub)}catch(e){return null}}(),qr=document.getElementById('qr');
 if(!M){qr.parentNode.innerHTML='<div style="width:230px;height:230px;display:grid;place-items:center;color:#a39498;font-size:12px">QR unavailable</div>';return}
 var NS='http://www.w3.org/2000/svg',n=M.length;
 qr.setAttribute('viewBox','0 0 '+n+' '+n);qr.style.background='#fff';
 var pad=2;qr.setAttribute('viewBox','0 0 '+(n+pad*2)+' '+(n+pad*2));
 var g=document.createElementNS(NS,'g');g.setAttribute('fill','#140d10');
 for(var r=0;r<n;r++)for(var c=0;c<n;c++)if(M[r][c]){var rc=document.createElementNS(NS,'rect');rc.setAttribute('x',c+pad);rc.setAttribute('y',r+pad);rc.setAttribute('width',1);rc.setAttribute('height',1);g.append(rc)}
 qr.append(g)})();
document.getElementById('csub').onclick=function(){cp(D.sub)};
document.getElementById('dl').onclick=function(){document.getElementById('cfgd').open=true;document.getElementById('cfgd').scrollIntoView({behavior:'smooth',block:'start'})};
var lb=document.getElementById('lks');
D.links.forEach(function(l){var w=document.createElement('div');w.className='lk';
 var ch=document.createElement('span');ch.className='chip';ch.textContent=l.p;w.append(ch);
 var nm=document.createElement('span');nm.className='nm';nm.textContent=l.tag;w.append(nm);
 var b=document.createElement('button');b.className='mini';b.textContent='کپی';b.onclick=function(){cp(l.link)};w.append(b);lb.append(w)});
if(D.q>0){var pct=Math.min(100,D.tot/D.q*100),ub=document.getElementById('ub');
 setTimeout(function(){ub.style.width=pct.toFixed(1)+'%';if(pct>=85)ub.classList.add('warn')},120);
 document.getElementById('upct').textContent=pct.toFixed(1)+'% used'}
if(D.exp){var el2=document.getElementById('upd');if(el2)el2.textContent=new Date(Date.now()).toLocaleDateString('fa-IR')}
try{if(D.exp){var e=new Date(D.exp),t=document.getElementById('expt');t.textContent=e.toLocaleDateString('fa-IR')+' '+e.toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'})}}catch(e){}
</script></body></html>`;
}
