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

const cache = new Map();

export default {
  async fetch(req, env) {
    try {
      const url = new URL(req.url), p = url.pathname;
      if ((req.headers.get('Upgrade') || '').toLowerCase() === 'websocket') {
        const m = p.match(WS_RE);
        if (!m) return text('Not found', 404);
        return await relay(req, env, PMAP[m[2].toLowerCase()], m[3].toLowerCase(), (m[1] || '').toLowerCase());
      }

      if (p === '/') {
        return new Response(COVER_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }

      const sec = env.SECRET_PATH ? '/' + String(env.SECRET_PATH).replace(/^\/+|\/+$/g, '') : '';
      const subPrefix = sec + '/sub/';
      const panelPath = sec + '/panel';
      const apiPrefix = sec + '/api/';

      if (p.startsWith(subPrefix)) return await sub(p.slice(subPrefix.length), url, env);
      if (p === panelPath || p.startsWith(apiPrefix)) {
        if (!env.ADMIN_PASS || !env.DB) return text('Set ADMIN_PASS and bind KV as DB first.', 500);
        if (!authed(req, env)) return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Cloud Console"' } });
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
function authed(req, env) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Basic ')) return false;
  let d; try { d = atob(h.slice(6)); } catch { return false; }
  const i = d.indexOf(':');
  if (i < 0) return false;
  const a = safeEq(d.slice(0, i), String(env.ADMIN_USER || 'admin'));
  const b = safeEq(d.slice(i + 1), String(env.ADMIN_PASS));
  return a && b;
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
    else if (p === P_VM) link = `${P_VM}://` + b64(JSON.stringify({ v: '2', ps: name, add, port: String(port), id, aid: '0', scy: 'zero', net: 'ws', type: 'none', host, path, tls: 'tls', sni: host, fp: 'chrome', alpn: '' }));
    else link = `ss://${b64(SS_METHOD + ':' + id).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}@${add}:${port}?${new URLSearchParams(base)}${frag}`;
    out.push({ proto: p, tag: e.tag, name, link });
  }
  return out;
}

async function sub(id, url, env) {
  id = id.toLowerCase();
  if (!/^[0-9a-f-]{36}$/.test(id)) return text('Not found', 404);
  const u = await getUser(env, id);
  if (!u) return text('Forbidden', 403);
  const only = (url.searchParams.get('proto') || '').split(',').filter((x) => PROTOS.includes(x));
  const links = makeLinks(id, u, url.hostname, await getExt(env), only.length ? only : null);
  const headers = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' };
  if (u.exp) headers[SUB_HDR] = `upload=0; download=0; total=0; expire=${Math.floor(u.exp / 1000)}`;
  return new Response(btoa(links.map((l) => l.link).join('\n')), { headers });
}

// ---------- admin API ----------
async function api(req, env, url, sec) {
  const p = url.pathname.slice(sec.length), M = req.method;
  const body = () => req.json().catch(() => ({}));
  if (p === '/api/users' && M === 'GET') {
    const l = await env.DB.list({ prefix: 'u:', limit: 1000 });
    const us = await Promise.all(l.keys.map(async (k) => ({ id: k.name.slice(2), ...(await env.DB.get(k.name, 'json')) })));
    return json(us.sort((a, b) => (b.created || 0) - (a.created || 0)));
  }
  if (p === '/api/users' && M === 'POST') {
    const b = await body(), days = Number(b.days) || 0, id = crypto.randomUUID();
    const u = { name: String(b.name || 'user').slice(0, 40), exp: days > 0 ? Date.now() + days * 864e5 : 0, on: true, created: Date.now() };
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
  let buf = new Uint8Array(0), ready = false, resp = null;
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
      if (ready) return { data: [c] };
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
      if ((h[35] & 15) !== 6 || (h[34] & 1)) throw new Error('sec');
      if (h[37] !== 1) throw new Error('tcp');
      const r = readAddr(h, 41, h[40], [1, 2, 3]);
      if (!r) throw new Error('addr');
      resp = { iv: h.slice(1, 17), key: h.slice(17, 33), v: h[33] };
      ready = true;
      return { target: { host: r.addr, port: (h[38] << 8) | h[39] }, data: [buf.subarray(42 + hl + 16)] };
    },
    async wrap(c) {
      if (!resp) return c;
      const { iv, key, v } = resp; resp = null;
      const bk = (await sha('SHA-256', key)).slice(0, 16), bi = (await sha('SHA-256', iv)).slice(0, 16);
      const l = await gcm('encrypt', (await kdf(bk, R1)).slice(0, 16), (await kdf(bi, R2)).slice(0, 12), new Uint8Array([0, 4]));
      const p = await gcm('encrypt', (await kdf(bk, R3)).slice(0, 16), (await kdf(bi, R4)).slice(0, 12), new Uint8Array([v, 0, 0, 0]));
      return cat(l, p, c);
    },
  };
}

function pSS(id) {
  const KL = 16, inc = (n) => { for (let i = 0; i < 12; i++) { n[i] = (n[i] + 1) & 255; if (n[i]) break; } };
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

// ---------- relay ----------
async function relay(req, env, proto, id, tag) {
  if (!(await getUser(env, id))) return text('Forbidden', 403);
  const ext = (await getExt(env)).find((x) => x.tag === tag);
  const proxyip = (ext && ext.proxyip) || env.PROXYIP || '';
  const pair = new WebSocketPair(), client = pair[0], ws = pair[1];
  ws.accept();
  const sess = proto === P_VL ? pVless(id) : proto === P_VM ? pVmess(id) : proto === P_TR ? pTrojan() : pSS(id);
  const st = { remote: null, writer: null, udp: false, buf: new Uint8Array(0) };
  let q = Promise.resolve();
  const end = () => { try { ws.close(); } catch {} try { st.remote && st.remote.close(); } catch {} };
  const push = (d) => { q = q.then(() => onChunk(d)).catch(end); };

  async function pump(sock) {
    let got = false;
    try {
      await sock.readable.pipeTo(new WritableStream({
        async write(chunk) {
          got = true;
          if (ws.readyState !== 1) throw new Error('closed');
          ws.send(await sess.wrap(chunk));
        },
      }));
    } catch {}
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
    if (r.target) { await startTcp(r.target, cat(...r.data)); return; }
    for (const x of r.data) {
      if (!x.length) continue;
      if (st.udp) dns(x); else if (st.writer) await st.writer.write(x);
    }
  }

  ws.addEventListener('message', (e) => push(e.data));
  ws.addEventListener('close', end);
  ws.addEventListener('error', end);
  const early = req.headers.get('Sec-WebSocket-Protocol') || '';
  if (early) { try { const b = atob(early.replace(/-/g, '+').replace(/_/g, '/')); push(Uint8Array.from(b, (c) => c.charCodeAt(0))); } catch {} }
  return new Response(null, { status: 101, webSocket: client, headers: early ? { 'Sec-WebSocket-Protocol': early } : undefined });
}

// ---------- Cover & Panel UI ----------
const COVER_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Edge Node Status</title><style>body{background:#0b0f17;color:#cbd5e1;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{background:#151c28;border:1px solid #263147;padding:24px 32px;border-radius:12px;text-align:center}.dot{display:inline-block;width:10px;height:10px;background:#10b981;border-radius:50%;margin-right:8px}</style></head><body><div class="card"><h3><span class="dot"></span>Edge Telemetry Service</h3><p>All regional endpoints operational.</p></div></body></html>`;

const PAGE = (sec) => `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Cloud Console</title>
<style>
body{margin:0 auto;background:#080b12;color:#f4f7ff;font:15px system-ui,Tahoma,sans-serif;padding:16px;max-width:900px}
h1{color:#00f0ff;font-size:20px}h2{font-size:16px;margin:22px 0 6px;color:#9da9bd}
form{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 14px}
input,select,button{background:#0f1420;color:inherit;border:1px solid #273248;border-radius:8px;padding:9px 12px;font:inherit}
button{cursor:pointer}button.p{background:#00f0ff;color:#031319;border:0;font-weight:700}
.row{background:#0f1420;border:1px solid #273248;border-radius:12px;padding:10px 12px;margin-bottom:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.row b{flex:1 1 120px}.m{color:#9da9bd;font-size:13px}.off{opacity:.55}.lk{display:flex;gap:8px;align-items:center;padding:4px 12px}
</style></head><body>
<h1>Cloud Console</h1>
<h2>Endpoint Nodes</h2>
<form id="fx"><input id="xt" placeholder="تگ/لوکیشن (مثلا de)" size="14">
<input id="xa" placeholder="آدرس/IP تمیز (خالی = خود Worker)" size="22">
<select id="xp"><option>443</option><option>2053</option><option>2083</option><option>2087</option><option>2096</option><option>8443</option></select>
<input id="xi" placeholder="FALLBACK HOST (اختیاری)" size="16"><button class="p">افزودن</button></form>
<div id="x"></div>
<h2>کاربران</h2>
<form id="f"><input id="n" placeholder="نام کاربر" required>
<input id="d" type="number" min="0" placeholder="روز (۰ = نامحدود)"><button class="p">ساخت کاربر</button></form>
<div id="l"></div>
<script>
var B = ${JSON.stringify(sec)};
function $(i){return document.getElementById(i)}
async function call(u,m,b){var r=await fetch(B+u,{method:m||'GET',headers:{'content-type':'application/json'},body:b?JSON.stringify(b):undefined});if(!r.ok)throw new Error(await r.text());return r.json()}
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e}
function btn(t,fn){var e=el('button','',t);e.onclick=function(){fn().catch(function(x){alert(x.message)})};return e}
function copy(t){navigator.clipboard.writeText(t).catch(function(){prompt('Copy:',t)})}
async function loadExt(){var l=await call('/api/ext'),b=$('x');b.textContent='';
 if(!l.length)b.append(el('div','m','خالی؛ تگ پیش‌فرض main استفاده می‌شود.'));
 l.forEach(function(e){var r=el('div','row');
  r.append(el('b','',e.tag),el('span','m',(e.address||'(host)')+':'+e.port+(e.proxyip?' → '+e.proxyip:'')),
   btn('حذف',async function(){await call('/api/ext/'+e.tag,'DELETE');loadExt()}));b.append(r)})}
async function load(){var us=await call('/api/users'),b=$('l');b.textContent='';
 if(!us.length){b.textContent='کاربری وجود ندارد.';return}
 us.forEach(function(u){var w=el('div'),r=el('div','row'+(u.on?'':' off')),d=el('div');
  r.append(el('b','',u.name),el('span','m',u.exp?('انقضا: '+new Date(u.exp).toLocaleDateString('fa-IR')):'نامحدود'),
   btn('ساب',async function(){copy(location.origin+B+'/sub/'+u.id)}),
   btn('کانفیگ‌ها',async function(){if(d.firstChild){d.textContent='';return}
    (await call('/api/links/'+u.id)).forEach(function(x){var q=el('div','lk');q.append(el('span','m',x.proto+' · '+x.tag),btn('کپی',async function(){copy(x.link)}));d.append(q)})}),
   btn(u.on?'غیرفعال':'فعال',async function(){await call('/api/users/'+u.id,'PATCH',{on:!u.on});load()}),
   btn('حذف',async function(){if(confirm('حذف شود؟')){await call('/api/users/'+u.id,'DELETE');load()}}));
  w.append(r,d);b.append(w)})}
$('fx').onsubmit=async function(e){e.preventDefault();
 try{await call('/api/ext','POST',{tag:$('xt').value,address:$('xa').value,port:$('xp').value,proxyip:$('xi').value});e.target.reset();loadExt()}catch(x){alert(x.message)}};
$('f').onsubmit=async function(e){e.preventDefault();
 await call('/api/users','POST',{name:$('n').value,days:$('d').value});e.target.reset();load()};
loadExt().then(load).catch(function(){$('l').textContent='خطا در بارگذاری'});
</script></body></html>`;