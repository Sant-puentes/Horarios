// Vercel Function (Node.js runtime, sin dependencias externas).
// Persiste el arreglo completo de turnos en Redis usando la API REST de
// Upstash directamente (fetch), sin instalar el SDK @upstash/redis.
//
// Requiere estas dos variables de entorno en Vercel (Project Settings ->
// Environment Variables), apuntando a la MISMA base de datos Redis que ya
// está conectada al proyecto del tablero, pero con nombres propios de este
// proyecto para no chocar con las variables que ya usa esa app:
//   HORARIOS_KV_REST_API_URL   (valor: el mismo que KV_REST_API_URL del tablero)
//   HORARIOS_KV_REST_API_TOKEN (valor: el mismo que KV_REST_API_TOKEN del tablero,
//                                el de lectura/escritura, no el read-only)
//
// Además, para no pisar las claves del otro proyecto dentro de la misma
// base de datos, todo se guarda bajo una clave exclusiva: "horarios:shifts".

const REDIS_URL = process.env.HORARIOS_KV_REST_API_URL;
const REDIS_TOKEN = process.env.HORARIOS_KV_REST_API_TOKEN;
const KEY = 'horarios:shifts';

module.exports = async (req, res) => {
  if (!REDIS_URL || !REDIS_TOKEN) {
    res.status(500).json({
      error: 'Faltan las variables de entorno HORARIOS_KV_REST_API_URL / HORARIOS_KV_REST_API_TOKEN en Vercel.'
    });
    return;
  }

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${REDIS_URL}/get/${KEY}`, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
      });
      if (!r.ok) {
        res.status(502).json({ error: 'Redis respondió con error al leer.' });
        return;
      }
      const data = await r.json();
      let shifts = [];
      if (data.result) {
        try { shifts = JSON.parse(data.result); } catch (e) { shifts = []; }
      }
      res.status(200).json(Array.isArray(shifts) ? shifts : []);
      return;
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = null; }
      }
      if (!Array.isArray(body)) {
        res.status(400).json({ error: 'El cuerpo debe ser un arreglo JSON de turnos.' });
        return;
      }

      const r = await fetch(`${REDIS_URL}/set/${KEY}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${REDIS_TOKEN}`,
          'Content-Type': 'text/plain'
        },
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        res.status(502).json({ error: 'Redis respondió con error al guardar.' });
        return;
      }
      const data = await r.json();
      if (data.error) {
        res.status(502).json({ error: data.error });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message || err) });
  }
};
