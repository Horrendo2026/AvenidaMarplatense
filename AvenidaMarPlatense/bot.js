// Bot de Discord + servidor web de Avenida Mar Platense.
// - Lee el canal de anuncios y los expone en /api/anuncios
// - Expone miembros y conectados del server en /api/discord
// - Recibe cuánta gente hay en cada servidor del juego de Roblox y lo expone en /api/roblox
// - Sirve la página (carpeta web/)
require('dotenv').config();
const path = require('path');
const express = require('express');
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');

const { DISCORD_TOKEN, GUILD_ID, ANUNCIOS_CHANNEL_ID, ROBLOX_KEY } = process.env;
const PORT = process.env.PORT || 3000;
// Canal al que lleva el botón "Ver en Discord" de cada anuncio
const CANAL_VER_EN_DISCORD = process.env.VER_EN_DISCORD_CANAL_ID || '1327811262503059476';
const MAX_ANUNCIOS = 20;
const REFRESCO_ANUNCIOS_MS = 30 * 60 * 1000; // los links de imágenes de Discord vencen, así que se renuevan cada 30 min
const REFRESCO_STATS_MS = 5 * 60 * 1000;

let anuncios = [];
let stats = null;

// ---------- Discord ----------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel],
});

function aAnuncio(msg) {
  const quien = msg.member ?? msg.author;
  const imagenes = [...msg.attachments.values()]
    .filter((a) => a.contentType?.startsWith('image/'))
    .map((a) => a.url);
  for (const e of msg.embeds) if (e.image?.url) imagenes.push(e.image.url);
  return {
    id: msg.id,
    autor: msg.member?.displayName ?? msg.author.globalName ?? msg.author.username,
    avatar: quien.displayAvatarURL({ size: 64 }),
    texto: msg.cleanContent,
    imagenes,
    fecha: msg.createdAt.toISOString(),
    editado: msg.editedAt ? msg.editedAt.toISOString() : null,
    link: `https://discord.com/channels/${msg.guildId}/${CANAL_VER_EN_DISCORD}`,
  };
}

async function cargarAnuncios() {
  try {
    const canal = await client.channels.fetch(ANUNCIOS_CHANNEL_ID);
    const mensajes = await canal.messages.fetch({ limit: MAX_ANUNCIOS });
    anuncios = [...mensajes.values()]
      .filter((m) => !m.system && (m.content || m.attachments.size || m.embeds.some((e) => e.image)))
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
      .map(aAnuncio);
    console.log(`[anuncios] ${anuncios.length} cargados`);
  } catch (err) {
    console.error('[anuncios] No se pudo leer el canal:', err.message);
  }
}

async function cargarStats() {
  try {
    const g = await client.guilds.fetch({ guild: GUILD_ID, withCounts: true, force: true });
    stats = {
      nombre: g.name,
      icono: g.iconURL({ size: 128 }),
      miembros: g.approximateMemberCount,
      enLinea: g.approximatePresenceCount,
      actualizado: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[stats] No se pudo leer el server:', err.message);
  }
}

// Cualquier cambio en el canal recarga la lista (con una pequeña espera por si llegan varios juntos)
let espera;
function recargarPronto(channelId) {
  if (channelId !== ANUNCIOS_CHANNEL_ID) return;
  clearTimeout(espera);
  espera = setTimeout(cargarAnuncios, 1500);
}
client.on(Events.MessageCreate, (m) => recargarPronto(m.channelId));
client.on(Events.MessageUpdate, (_, m) => recargarPronto(m.channelId));
client.on(Events.MessageDelete, (m) => recargarPronto(m.channelId));

client.once(Events.ClientReady, async (c) => {
  console.log(`[bot] Conectado como ${c.user.tag}`);
  await Promise.all([cargarAnuncios(), cargarStats()]);
  setInterval(cargarAnuncios, REFRESCO_ANUNCIOS_MS);
  setInterval(cargarStats, REFRESCO_STATS_MS);
});

if (!DISCORD_TOKEN || !GUILD_ID || !ANUNCIOS_CHANNEL_ID) {
  console.warn('[bot] Faltan DISCORD_TOKEN, GUILD_ID o ANUNCIOS_CHANNEL_ID en .env. La web arranca igual, sin anuncios ni contador.');
} else {
  client.login(DISCORD_TOKEN).catch((err) => console.error('[bot] No se pudo iniciar sesión:', err.message));
}

// ---------- Web ----------
const app = express();
app.use('/api', (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*'); // por si la página se aloja en otro dominio
  res.set('Cache-Control', 'no-store');
  next();
});
app.get('/api/anuncios', (req, res) => res.json({ anuncios }));
app.get('/api/discord', (req, res) => {
  if (!stats) return res.status(503).json({ error: 'El bot todavía no se conectó a Discord.' });
  res.json(stats);
});
// ---------- Roblox: jugadores en el juego ----------
// Cada servidor del juego manda un "ping" cada 30 s con su cantidad de jugadores.
// Un servidor que deja de avisar por más de 90 s se da por cerrado.
const VENCE_SERVIDOR_MS = 90 * 1000;
const servidores = new Map(); // jobId -> { jugadores, max, t }

function servidoresActivos() {
  const ahora = Date.now();
  for (const [id, s] of servidores) if (ahora - s.t > VENCE_SERVIDOR_MS) servidores.delete(id);
  return [...servidores.values()];
}

app.post('/api/roblox/ping', express.json({ limit: '2kb' }), (req, res) => {
  if (!ROBLOX_KEY || req.get('x-avm-key') !== ROBLOX_KEY) return res.status(401).json({ error: 'Clave inválida' });
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
  const activos = servidoresActivos();
  res.json({
    jugadores: activos.reduce((n, s) => n + s.jugadores, 0),
    servidores: activos.length,
    actualizado: new Date().toISOString(),
  });
});

if (!ROBLOX_KEY) console.warn('[roblox] Falta ROBLOX_KEY en .env: el contador de jugadores no va a recibir datos.');

app.use(express.static(path.join(__dirname, 'web')));
app.listen(PORT, () => console.log(`[web] http://localhost:${PORT}`));
