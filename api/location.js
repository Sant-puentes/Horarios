// Vercel Function (Node.js runtime, sin dependencias externas).
// Guarda el código secreto que va embebido en el QR físico pegado en el local
// ("prueba de presencia"): api/attendance.js solo acepta marcajes que traigan
// ese código, así que para marcar hay que haber escaneado el QR del local.
//
// Vive en Redis bajo la clave "horarios:location" como {token: "..."}.
//
// A diferencia de api/shifts.js, aquí TAMBIÉN el GET exige la clave de edición
// (header "x-edit-key"): si el token se pudiera leer sin clave, cualquiera
// podría armar el link del QR sin haber ido al local y el control no serviría.
//
// GET  /api/location  -> {token}  (lo crea la primera vez si no existe)
// POST /api/location  -> {token}  (genera uno NUEVO; el QR impreso anterior
//                                  deja de funcionar y hay que reimprimirlo)
//
// Requiere las mismas variables de entorno que api/shifts.js.

const crypto = require('crypto');

const REDIS_URL = process.env.HORARIOS_KV_REST_API_URL;
const REDIS_TOKEN = process.env.HORARIOS_KV_REST_API_TOKEN;
const KEY = 'horarios:location';
const EDIT_KEY = '1111';

function newToken() {
  return crypto.randomBytes(18).toString('base64url'); // 24 caracteres, no adivinable
}

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

module.exports = async (req, res) => {
  if (!REDIS_URL || !REDIS_TOKEN) {
    res.status(500).json({
      error: 'Faltan las variables de entorno HORARIOS_KV_REST_API_URL / HORARIOS_KV_REST_API_TOKEN en Vercel.'
    });
    return;
  }
  if (req.headers['x-edit-key'] !== EDIT_KEY) {
    res.status(401).json({ error: 'Clave de edición inválida o faltante.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      let loc = await redisGet(KEY);
      if (!loc || !loc.token) {
        loc = { token: newToken() };
        await redisSet(KEY, loc);
      }
      res.status(200).json({ token: loc.token });
      return;
    }

    if (req.method === 'POST') {
      const loc = { token: newToken() };
      await redisSet(KEY, loc);
      res.status(200).json({ token: loc.token });
      return;
    }

    res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
