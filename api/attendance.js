// Vercel Function (Node.js runtime, sin dependencias externas).
// Persiste en la MISMA base de datos Redis que api/shifts.js (vía fetch a la
// API REST de Upstash), pero bajo su propia clave: "horarios:attendance".
// Guarda un arreglo plano de marcajes: [{id, empId, group, name, type, ts}, ...]
// donde type es 'entrada' | 'salida' y ts es un ISO string generado por el
// servidor (nunca por el reloj del dispositivo que marca, para evitar que
// alguien adelante/atrase su hora real).
//
// GET  /api/attendance         -> devuelve el arreglo completo de marcajes.
// POST /api/attendance {name, loc} -> `loc` es el código del QR del local
//   (ver api/location.js); si el admin ya generó uno, es obligatorio. Busca un empleado (en Cocina o en Barra y
//   servicio, leyendo el roster actual desde "horarios:shifts") cuyo nombre
//   coincida con `name` (sin distinguir mayúsculas ni acentos). Si lo
//   encuentra, decide automáticamente si el marcaje es 'entrada' o 'salida'
//   mirando cuál fue su último marcaje, y lo agrega. Responde con el marcaje
//   creado.
//
// Requiere las mismas variables de entorno que api/shifts.js:
//   HORARIOS_KV_REST_API_URL
//   HORARIOS_KV_REST_API_TOKEN
//
// Límite conocido: si dos personas marcan en el mismo instante exacto puede
// perderse una escritura (lectura-modificación-escritura no es atómica). Con
// el volumen esperado (un par de marcajes por persona al día) el riesgo es
// mínimo; si se vuelve un problema, migrar a un comando atómico de Redis
// (p. ej. RPUSH) en vez de GET+SET del blob completo.

const REDIS_URL = process.env.HORARIOS_KV_REST_API_URL;
const REDIS_TOKEN = process.env.HORARIOS_KV_REST_API_TOKEN;
const KEY = 'horarios:attendance';
const ROSTER_KEY = 'horarios:shifts';
const LOC_KEY = 'horarios:location'; // código del QR físico del local (ver api/location.js)
const MAX_AGE_DAYS = 45; // se podan marcajes más viejos que esto en cada escritura

function normalize(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
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

function findEmployee(roster, name) {
  if (!roster) return null;
  const target = normalize(name);
  if (!target) return null;
  const groups = [['cocina', roster.cocina], ['barra', roster.barra]];
  for (const [group, g] of groups) {
    const emp = g && Array.isArray(g.emp) ? g.emp.find(e => normalize(e.n) === target) : null;
    if (emp) return { group, emp };
  }
  return null;
}

module.exports = async (req, res) => {
  if (!REDIS_URL || !REDIS_TOKEN) {
    res.status(500).json({
      error: 'Faltan las variables de entorno HORARIOS_KV_REST_API_URL / HORARIOS_KV_REST_API_TOKEN en Vercel.'
    });
    return;
  }

  try {
    if (req.method === 'GET') {
      const records = (await redisGet(KEY)) || [];
      res.status(200).json(records);
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = null; }
      }
      const name = body && typeof body.name === 'string' ? body.name : '';
      if (!name.trim()) {
        res.status(400).json({ error: 'Falta el nombre.' });
        return;
      }

      // Prueba de presencia: si el admin ya generó el QR del local, el marcaje
      // debe traer ese código (viene en el link del QR escaneado). Si todavía
      // no existe, se deja marcar como antes para no bloquear el sistema
      // mientras se configura.
      const loc = await redisGet(LOC_KEY);
      if (loc && loc.token && (typeof body.loc !== 'string' || body.loc !== loc.token)) {
        res.status(403).json({
          error: 'Para marcar tienes que escanear el QR pegado en el local con la cámara de tu celular.'
        });
        return;
      }

      const roster = await redisGet(ROSTER_KEY);
      const found = findEmployee(roster, name);
      if (!found) {
        res.status(404).json({
          error: 'No encontramos a nadie con ese nombre. Verifica cómo está escrito en el sistema (pregunta al administrador).'
        });
        return;
      }

      let records = (await redisGet(KEY)) || [];

      // podar marcajes viejos para no crecer sin límite
      const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
      records = records.filter(r => {
        const t = Date.parse(r.ts);
        return !Number.isFinite(t) || t >= cutoff;
      });

      const last = [...records]
        .reverse()
        .find(r => r.empId === found.emp.id && r.group === found.group);
      const type = !last || last.type === 'salida' ? 'entrada' : 'salida';

      const record = {
        id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        empId: found.emp.id,
        group: found.group,
        name: found.emp.n,
        type,
        ts: new Date().toISOString()
      };
      records.push(record);
      await redisSet(KEY, records);

      res.status(200).json({ ok: true, record });
      return;
    }

    res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
