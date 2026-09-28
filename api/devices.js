// Vercel Function (Node.js runtime, sin dependencias externas).
// Registro de celulares por empleado: evita que alguien marque con el nombre de otro.
//
// Cada celular guarda un código aleatorio (en localStorage, ver index.html). Aquí se
// vincula ese código a UN empleado, y api/attendance.js solo deja marcar a ese
// empleado desde ese celular (y a ese celular, solo como ese empleado).
// Del código del celular solo se guarda su hash SHA-256, nunca el valor original.
//
// El vínculo lo aprueba el admin: genera un código de un solo uso por empleado
// (vence en 24 h) y el empleado lo canjea desde su propio celular.
//
// Vive en Redis bajo "horarios:devices" como
//   {bindings: {"grupo:idEmpleado": {hash, name, at}},
//    invites:  {"grupo:idEmpleado": {code, name, exp}}}
//
// GET  /api/devices                                 (x-edit-key) -> estado (sin hashes)
// POST /api/devices {action:'invite', key, name}    (x-edit-key) -> {code, exp}
// POST /api/devices {action:'reset', key}           (x-edit-key) -> borra vínculo e invitación
// POST /api/devices {action:'register', code, device}  (público) -> canjea el código
//
// Requiere las mismas variables de entorno que api/shifts.js.

const crypto = require('crypto');

const REDIS_URL = process.env.HORARIOS_KV_REST_API_URL;
const REDIS_TOKEN = process.env.HORARIOS_KV_REST_API_TOKEN;
const KEY = 'horarios:devices';
const EDIT_KEY = '1111';
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I/L para que no se confundan

const hashDevice = d => crypto.createHash('sha256').update(String(d)).digest('hex');
const newCode = () => Array.from({ length: 8 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const validKey = k => typeof k === 'string' && k.length <= 80 && /^(cocina|barra):.+/.test(k);

async function redisGet(key) {
  const r = await fetch(`${REDIS_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  if (!r.ok) throw new Error('redis_get_failed');
  const data = await r.json();
  if (!data.result) return null;
  try { return JSON.parse(data.result); } catch (e) { return null; }
}

async function redisSet(key, value) {
  const r = await fetch(`${REDIS_URL}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'text/plain' },
    body: JSON.stringify(value)
  });
  if (!r.ok) throw new Error('redis_set_failed');
  const data = await r.json();
  if (data.error) throw new Error(data.error);
}

async function load() {
  const st = (await redisGet(KEY)) || {};
  const out = { bindings: st.bindings || {}, invites: st.invites || {} };
  const now = Date.now();
  for (const k of Object.keys(out.invites)) if (!(out.invites[k].exp > now)) delete out.invites[k];
  return out;
}

module.exports = async (req, res) => {
  if (!REDIS_URL || !REDIS_TOKEN) {
    res.status(500).json({
      error: 'Faltan las variables de entorno HORARIOS_KV_REST_API_URL / HORARIOS_KV_REST_API_TOKEN en Vercel.'
    });
    return;
  }
  const isAdmin = req.headers['x-edit-key'] === EDIT_KEY;

  try {
    if (req.method === 'GET') {
      if (!isAdmin) { res.status(401).json({ error: 'Clave de edición inválida o faltante.' }); return; }
      const st = await load();
      const devices = {}, invites = {};
      for (const k of Object.keys(st.bindings)) devices[k] = { name: st.bindings[k].name, at: st.bindings[k].at };
      for (const k of Object.keys(st.invites)) invites[k] = { code: st.invites[k].code, exp: st.invites[k].exp };
      res.status(200).json({ devices, invites });
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = null; }
      }
      const action = body && body.action;

      // Público: el empleado canjea su código desde su propio celular.
      if (action === 'register') {
        const code = normCode(body.code);
        const device = typeof body.device === 'string' ? body.device : '';
        if (!code || device.length < 16 || device.length > 128) {
          res.status(400).json({ error: 'Faltan datos para registrar el celular.' });
          return;
        }
        const st = await load();
        const key = Object.keys(st.invites).find(k => st.invites[k].code === code);
        if (!key) {
          res.status(404).json({ error: 'Código inválido o vencido. Pídele uno nuevo al administrador.' });
          return;
        }
        const h = hashDevice(device);
        const other = Object.keys(st.bindings).find(k => k !== key && st.bindings[k].hash === h);
        if (other) {
          res.status(409).json({
            error: 'Este celular ya está registrado a nombre de otra persona. Pídele al administrador que lo restablezca.'
          });
          return;
        }
        const name = st.invites[key].name;
        st.bindings[key] = { hash: h, name, at: new Date().toISOString() };
        delete st.invites[key];
        await redisSet(KEY, st);
        res.status(200).json({ ok: true, name });
        return;
      }

      // Todo lo demás es solo para el admin.
      if (!isAdmin) { res.status(401).json({ error: 'Clave de edición inválida o faltante.' }); return; }

      if (action === 'invite') {
        if (!validKey(body.key)) { res.status(400).json({ error: 'Empleado inválido.' }); return; }
        const name = String(body.name || '').slice(0, 60);
        const st = await load();
        const inv = { code: newCode(), name, exp: Date.now() + INVITE_TTL_MS };
        st.invites[body.key] = inv;
        await redisSet(KEY, st);
        res.status(200).json({ code: inv.code, exp: inv.exp });
        return;
      }

      if (action === 'reset') {
        if (!validKey(body.key)) { res.status(400).json({ error: 'Empleado inválido.' }); return; }
        const st = await load();
        delete st.bindings[body.key];
        delete st.invites[body.key];
        await redisSet(KEY, st);
        res.status(200).json({ ok: true });
        return;
      }

      res.status(400).json({ error: 'Acción desconocida.' });
      return;
    }

    res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
