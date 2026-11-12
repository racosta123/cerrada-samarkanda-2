// Pruebas de /cron/diario (GitHub Actions). Ejecutar:  node test/cron-diario.test.mjs
// Worker REAL + Firestore EN MEMORIA + FCM SIMULADO (host ficticio, sin red ni llaves reales).
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSign } from 'node:crypto';
import worker from '../worker.js';

const dir = mkdtempSync(join(tmpdir(), 'mqr-')); const sh = c => execSync(c, { cwd: dir, stdio: 'pipe' });
sh('openssl genrsa -out k.pem 2048'); sh('openssl pkcs8 -topk8 -nocrypt -in k.pem -out k8.pem'); sh('openssl req -new -x509 -key k.pem -out cert.pem -days 2 -subj "/CN=t"');
const KEY8 = readFileSync(join(dir, 'k8.pem'), 'utf8'), CERT = readFileSync(join(dir, 'cert.pem'), 'utf8');
const PROJ = 'proyecto-prueba';
const RealNow = Date.now.bind(Date); let fakeNow = null;
Date.now = () => fakeNow ?? RealNow();
const b64u = b => Buffer.from(b).toString('base64url');
const idToken = uid => {
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' }));
  const p = b64u(JSON.stringify({ aud: PROJ, iss: `https://securetoken.google.com/${PROJ}`, sub: uid, user_id: uid, exp: Math.floor(RealNow() / 1000) + 3e7 }));
  return `${h}.${p}.${createSign('RSA-SHA256').update(`${h}.${p}`).sign(KEY8, 'base64url')}`;
};

const store = new Map(); let fcm = []; let fcmStatus = 200;
const fv = v => v === null ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? { integerValue: String(v) } : { timestampValue: v.__ts };
const put = (path, o) => store.set(path, Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fv(v)])));
const base = `/v1/projects/${PROJ}/databases/(default)/documents`;
const docOut = (path, fields) => ({ name: `projects/${PROJ}/databases/(default)/documents/${path}`, fields });
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)); const m = opts.method || 'GET';
  const R = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
  if (u.hostname === 'oauth2.googleapis.com') return R({ access_token: 'tok' });
  if (u.hostname === 'www.googleapis.com') return R({ k1: CERT }, 200, { 'cache-control': 'max-age=3600' });
  if (u.hostname === 'fcm.googleapis.com') { const b = JSON.parse(opts.body).message; fcm.push({ token: b.token, body: b.notification.body }); return R({}, fcmStatus); }
  if (u.hostname !== 'firestore.googleapis.com') throw new Error('red inesperada: ' + u.hostname);
  if (u.pathname.endsWith(':commit')) {
    for (const w of JSON.parse(opts.body).writes) {
      const p = w.update.name.split('/documents/')[1];
      if (w.currentDocument?.exists === false && store.has(p)) return R({ error: { status: 'ALREADY_EXISTS' } }, 409);
      store.set(p, w.update.fields);
    }
    return R({});
  }
  const path = decodeURIComponent(u.pathname.slice(base.length + 1));
  if (m === 'GET') {
    if (path.includes('/')) { const f = store.get(path); return f ? R(docOut(path, f)) : R({}, 404); }
    return R({ documents: [...store].filter(([k]) => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/')).map(([k, f]) => docOut(k, f)) });
  }
  if (m === 'DELETE') { store.delete(path); return R({}); }
  if (m === 'PATCH') {
    const body = JSON.parse(opts.body); const mask = u.searchParams.getAll('updateMask.fieldPaths');
    if (u.searchParams.get('currentDocument.exists') === 'true' && !store.has(path)) return R({}, 404);
    if (mask.length) { const cur = { ...(store.get(path) || {}) }; mask.forEach(k => { if (body.fields[k]) cur[k] = body.fields[k]; }); store.set(path, cur); }
    else store.set(path, body.fields);
    return R({});
  }
  if (m === 'POST') { store.set(`${path}/auto${store.size}`, JSON.parse(opts.body).fields); return R({}); }
  throw new Error('método ' + m);
};
console.error = () => {};
const SECRETO = 'x'.repeat(48);
const env = { CRON_SECRET: SECRETO, FIREBASE_PROJECT: PROJ, SA_EMAIL: 'sa@test', SA_PRIVATE_KEY: KEY8, ALLOWED_ORIGIN: 'https://x' };
const jefe = (id, nom, dom, uid, extra = {}) => put(`personas/${id}`, { nombre: nom, rol: 'residente', estado: 'activo', uid, domicilio: dom, domicilioNorm: dom.toUpperCase(), jefeId: null, creadoEn: { __ts: '2026-10-01T00:00:00Z' }, ...extra });
const pago = (id, dom, monto = 350) => put(`finanzas/${id}`, { tipo: 'ingreso', categoria: 'Cuota', casa: dom, monto, ts: { __ts: '2026-11-20T18:00:00Z' } });
const reset = (inicio = '2026-11-01T07:00:00.000Z') => {
  store.clear(); fcm = []; fcmStatus = 200; fakeNow = null;
  put('config/cobranza', { cuotaMensual: 350, fechaInicioCobro: { __ts: inicio } });
  put('usuarios/uM', { nombre: 'McRub', rol: 'master', estado: 'activo' });
  put('usuarios/uA', { nombre: 'Miguel', rol: 'admin', estado: 'activo' });
  put('usuarios/uJA', { nombre: 'Jefa Admin', rol: 'residente', esAdmin: true, estado: 'activo', casa: 'Casa 9' });
  put('usuarios/uR', { nombre: 'Rosa', rol: 'residente', estado: 'activo', casa: 'Casa 1' });
  // Casa 1: debe, con push · Casa 2: al corriente, con push · Casa 3: debe, SIN push · Casa 4: suspendida
  // Casa 5: debe, alta el 4 de nov (el día 5 ya cuenta un mes completo; el 1 todavía no con el reloj "de hoy")
  put('usuarios/u1', { nombre: 'Uno', rol: 'residente', estado: 'activo', casa: 'Casa 1', fcmToken: 'tok1' });
  put('usuarios/u2', { nombre: 'Dos', rol: 'residente', estado: 'activo', casa: 'Casa 2', fcmToken: 'tok2' });
  put('usuarios/u3', { nombre: 'Tres', rol: 'residente', estado: 'activo', casa: 'Casa 3' });
  put('usuarios/u4', { nombre: 'Cuatro', rol: 'residente', estado: 'suspendido', casa: 'Casa 4', fcmToken: 'tok4' });
  put('usuarios/u5', { nombre: 'Cinco', rol: 'residente', estado: 'activo', casa: 'Casa 5', fcmToken: 'tok5' });
  jefe('p1', 'Uno', 'Casa 1', 'u1'); jefe('p2', 'Dos', 'Casa 2', 'u2'); jefe('p3', 'Tres', 'Casa 3', 'u3');
  jefe('p4', 'Cuatro', 'Casa 4', 'u4', { estado: 'suspendido' });
  jefe('p5', 'Cinco', 'Casa 5', 'u5', { creadoEn: { __ts: '2026-11-04T18:00:00Z' } });
  put('personas/pf1', { nombre: 'Hijo de Uno', rol: 'residente', estado: 'activo', uid: 'uF', domicilio: '', jefeId: 'p1', creadoEn: { __ts: '2026-10-01T00:00:00Z' } });
  put('usuarios/uF', { nombre: 'Hijo de Uno', rol: 'residente', estado: 'activo', casa: 'Casa 1', fcmToken: 'tokF' });
  pago('f2', 'Casa 2');
};
let pass = 0; const t = async (n, fn) => { reset(); await fn(); pass++; console.log('  ok -', n); };
const cronHttp = async (fecha, body, { secreto = SECRETO, metodo = 'POST', e = env } = {}) => {
  if (fecha) fakeNow = Date.parse(fecha + 'T16:00:00Z');
  const headers = { 'Content-Type': 'application/json' }; if (secreto !== null) headers['X-Cron-Secret'] = secreto;
  const r = await worker.fetch(new Request('https://w/cron/diario', { method: metodo, headers, body: metodo === 'POST' ? JSON.stringify(body || {}) : undefined }), e);
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const foto = () => JSON.stringify([...store].sort());
const estado = id => store.get('personas/' + id).estado.stringValue;
const bitacora = () => [...store.keys()].filter(k => k.startsWith('bitacora/')).length;

console.log('\n[1] autenticación');
await t('sin secret, secret incorrecto, secret más corto/largo o GET: 401 y no toca nada', async () => {
  const antes = foto();
  for (const s of [null, '', 'x', 'x'.repeat(47), 'x'.repeat(49), 'y'.repeat(48)]) {
    const r = await cronHttp('2026-12-05', { modo: 'aplicar' }, { secreto: s }); assert.equal(r.status, 401, String(s)); assert.equal(r.body.error, 'No autorizado');
  }
  assert.equal((await cronHttp('2026-12-05', null, { metodo: 'GET' })).status, 401);
  assert.equal(foto(), antes); assert.equal(fcm.length, 0);
});
await t('Worker sin CRON_SECRET (o corto): 401 aunque manden algo', async () => {
  assert.equal((await cronHttp('2026-12-05', { modo: 'aplicar' }, { secreto: '', e: { ...env, CRON_SECRET: undefined } })).status, 401);
  assert.equal((await cronHttp('2026-12-05', { modo: 'aplicar' }, { secreto: 'abc', e: { ...env, CRON_SECRET: 'abc' } })).status, 401);
});

console.log('\n[2] simulación');
await t('sin modo o modo raro = simular: solo conteos, cero escrituras y cero push', async () => {
  for (const f of ['2026-12-01', '2026-12-05']) for (const m of [undefined, 'simular', 'APLICAR']) {
    const antes = foto(); const r = await cronHttp(f, { modo: m });
    assert.equal(r.status, 200); assert.equal(r.body.modo, 'simular'); assert.equal(foto(), antes); assert.equal(fcm.length, 0);
  }
  const r = await cronHttp('2026-12-01', {});
  assert.equal(r.body.hoyTocaRecordatorio, true); assert.equal(r.body.recordatoriosPorEnviar, 2);
  assert.ok(!JSON.stringify(r.body).match(/Uno|Casa|tok|350/), 'sin datos personales en la respuesta');
});

console.log('\n[3] aplicar: idempotente');
await t('día 1: recordatorios; correr dos veces no duplica', async () => {
  let r = await cronHttp('2026-12-01', { modo: 'aplicar' });
  assert.equal(r.status, 200); assert.equal(r.body.recordatoriosEnviados, 2); assert.equal(r.body.suspensionAplicada, false);
  r = await cronHttp('2026-12-01', { modo: 'aplicar' });
  assert.equal(r.body.recordatoriosEnviados, 0); assert.equal(fcm.length, 2);
  assert.ok(!store.has('cron_lock/diario'), 'suelta el candado');
});
await t('día 5 y retraso (día 9): suspende una sola vez en el mes', async () => {
  let r = await cronHttp('2026-12-05', { modo: 'aplicar' });
  assert.equal(r.body.suspensionAplicada, true); assert.ok(r.body.suspendidas >= 2); assert.equal(estado('p1'), 'suspendido'); assert.equal(estado('p2'), 'activo');
  const b = bitacora();
  r = await cronHttp('2026-12-05', { modo: 'aplicar' }); assert.equal(r.body.suspensionAplicada, false);
  r = await cronHttp('2026-12-09', { modo: 'aplicar' }); assert.equal(r.body.suspensionAplicada, false);
  assert.equal(bitacora(), b);
});
await t('si no corrió el día 5, el día 7 (retraso) sí aplica el mes', async () => {
  const r = await cronHttp('2026-12-07', { modo: 'aplicar' }); assert.equal(r.body.suspensionAplicada, true); assert.equal(estado('p1'), 'suspendido');
});
await t('candado: corrida simultánea no hace nada; candado viejo (>15 min) se recupera', async () => {
  fakeNow = Date.parse('2026-12-05T16:00:00Z');
  put('cron_lock/diario', { hasta: fakeNow + 60000 });
  let r = await cronHttp(null, { modo: 'aplicar' }); assert.equal(r.body.enCurso, true); assert.equal(estado('p1'), 'activo');
  put('cron_lock/diario', { hasta: fakeNow - 1 });
  r = await cronHttp(null, { modo: 'aplicar' }); assert.equal(r.body.suspensionAplicada, true); assert.ok(!store.has('cron_lock/diario'));
});

console.log(`\n${pass} pruebas OK`);
