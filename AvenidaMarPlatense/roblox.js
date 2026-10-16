// Jugadores en el juego de Roblox.
// Cada servidor del juego manda un "ping" cada 30 s con su cantidad de jugadores
// (script ServerScriptService > ContadorWeb). Un servidor que deja de avisar
// por más de 90 s se da por cerrado.
const express = require('express');

const VENCE_SERVIDOR_MS = 90 * 1000;
const servidores = new Map(); // jobId -> { jugadores, max, t }

function servidoresActivos() {
  const ahora = Date.now();
  for (const [id, s] of servidores) if (ahora - s.t > VENCE_SERVIDOR_MS) servidores.delete(id);
  return [...servidores.values()];
}

function resumen() {
  const activos = servidoresActivos();
  return {
    jugadores: activos.reduce((n, s) => n + s.jugadores, 0),
    servidores: activos.length,
  };
}

function rutas(app, clave) {
  if (!clave) console.warn('[roblox] Falta ROBLOX_KEY: el contador de jugadores no va a recibir datos.');

  app.post('/api/roblox/ping', express.json({ limit: '2kb' }), (req, res) => {
    if (!clave || req.get('x-avm-key') !== clave) return res.status(401).json({ error: 'Clave inválida' });
    const { jobId, jugadores, max } = req.body || {};
    if (typeof jobId !== 'string' || !jobId || jobId.length > 64) return res.status(400).json({ error: 'jobId inválido' });
    if (!Number.isInteger(jugadores) || jugadores < 0 || jugadores > 700) return res.status(400).json({ error: 'jugadores inválido' });
    if (jugadores === 0) servidores.delete(jobId); // el servidor se está cerrando
    else if (servidores.has(jobId) || servidores.size < 500) {
      servidores.set(jobId, { jugadores, max: Number.isInteger(max) ? max : null, t: Date.now() });
    }
    res.json({ ok: true });
  });

  app.get('/api/roblox', (req, res) => {
    res.json({ ...resumen(), actualizado: new Date().toISOString() });
  });
}

module.exports = { resumen, rutas };
