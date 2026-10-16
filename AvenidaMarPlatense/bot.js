// Bot de Discord + servidor web de Avenida Mar Platense.
// - Lee el canal de anuncios y los expone en /api/anuncios
// - Expone miembros y conectados del server en /api/discord
// - Sirve la página (carpeta web/)
require('dotenv').config();
const path = require('path');
const express = require('express');
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');

const { DISCORD_TOKEN, GUILD_ID, ANUNCIOS_CHANNEL_ID } = process.env;
const PORT = process.env.PORT || 3000;
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
    link: msg.url,
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
app.use(express.static(path.join(__dirname, 'web')));
app.listen(PORT, () => console.log(`[web] http://localhost:${PORT}`));
