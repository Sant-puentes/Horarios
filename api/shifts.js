// Vercel Function (Node.js runtime, sin dependencias externas).
// Persiste en Redis (API REST de Upstash, vía fetch, sin el SDK @upstash/redis)
// el estado completo de la app: un blob JSON con la forma que decida el cliente
// (hoy: {cocina:{emp,shifts,rests}, barra:{emp,shifts,rests}}). Esta función no
// valida esa forma interna, solo que sea JSON válido (objeto o arreglo) — así
// el cliente puede evolucionar el formato sin requerir otro deploy de esto.
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
//
// GET (lectura) es público a propósito: cualquiera puede ver el horario sin
// clave. POST/PUT (escritura) exige el header "x-edit-key" con la misma
// clave "1111" que se pide en la app antes de dejar editar. Es una clave
// única y fija a propósito ("por el momento"); si más adelante se quiere
// algo más serio, lo natural es moverla a una variable de entorno
// (HORARIOS_EDIT_KEY) en vez de tenerla escrita aquí.

const REDIS_URL = process.env.HORARIOS_KV_REST_API_URL;
const REDIS_TOKEN = process.env.HORARIOS_KV_REST_API_TOKEN;
const KEY = 'horarios:shifts';
const EDIT_KEY = '1111';

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
      let value = null;
      if (data.result) {
        try { value = JSON.parse(data.result); } catch (e) { value = null; }
      }
      res.status(200).json(value);
      return;
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      if (req.headers['x-edit-key'] !== EDIT_KEY) {
        res.status(401).json({ error: 'Clave de edición inválida o faltante.' });
        return;
      }
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = null; }
      }
      if (body === null || typeof body !== 'object') {
        res.status(400).json({ error: 'El cuerpo debe ser un JSON válido (objeto o arreglo).' });
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
