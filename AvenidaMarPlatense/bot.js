// Bot de Discord + servidor web de Avenida Mar Platense.
// - Lee el canal de anuncios y los expone en /api/anuncios
// - Expone miembros y conectados del server en /api/discord
// - Recibe cuánta gente hay en cada servidor del juego de Roblox y lo expone en /api/roblox
// - Sirve la página (carpeta web/)
// - Comandos de barra, bienvenida, verificación con Roblox, moderación y sorteos (carpeta discord/)
require('dotenv').config();
const path = require('path');
const express = require('express');
const { Client, GatewayIntentBits, Partials, Events, ActivityType } = require('discord.js');
const roblox = require('./roblox');
const cfg = require('./discord/config');
const comandos = require('./discord/comandos');
const bienvenida = require('./discord/bienvenida');
const sorteos = require('./discord/sorteos');

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
// La bienvenida necesita el intent "Server Members" (hay que activarlo en el portal),
// así que solo se pide si está configurada. Si no, el bot no podría ni conectarse.
const usaBienvenida = Boolean(cfg.BIENVENIDA_CHANNEL_ID || cfg.AUTOROL_ID);
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
    ...(usaBienvenida ? [GatewayIntentBits.GuildMembers] : []),
  ],
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

client.on(Events.InteractionCreate, comandos.manejar);
if (usaBienvenida) client.on(Events.GuildMemberAdd, bienvenida.alEntrar);

// Estado del bot: "Jugando 23 en la ciudad" o "Mirando avenidamarplatense.com"
function actualizarEstado() {
  const { jugadores, servidores } = roblox.resumen();
  if (servidores) client.user.setActivity(`${jugadores} en la ciudad`, { type: ActivityType.Playing });
  else client.user.setActivity(cfg.WEB.replace(/^https?:\/\//, ''), { type: ActivityType.Watching });
}

async function registrarComandos() {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.commands.set(comandos.definiciones);
    console.log(`[comandos] ${comandos.definiciones.length} comandos registrados`);
  } catch (err) {
    console.error('[comandos] No se pudieron registrar. ¿El bot fue invitado con el permiso "applications.commands"?', err.message);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`[bot] Conectado como ${c.user.tag}`);
  await Promise.all([cargarAnuncios(), cargarStats(), registrarComandos()]);
  setInterval(cargarAnuncios, REFRESCO_ANUNCIOS_MS);
  setInterval(cargarStats, REFRESCO_STATS_MS);
  actualizarEstado();
  setInterval(actualizarEstado, 60 * 1000);
  sorteos.iniciarReloj(client);
  if (usaBienvenida) console.log('[bienvenida] Activada');
});

if (!DISCORD_TOKEN || !GUILD_ID || !ANUNCIOS_CHANNEL_ID) {
  console.warn('[bot] Faltan DISCORD_TOKEN, GUILD_ID o ANUNCIOS_CHANNEL_ID en .env. La web arranca igual, sin anuncios ni contador.');
} else {
  client.login(DISCORD_TOKEN).catch((err) => {
    console.error('[bot] No se pudo iniciar sesión:', err.message);
    if (/disallowed intents/i.test(err.message)) {
      console.error('[bot] Activá "Server Members Intent" en el portal de Discord (Bot > Privileged Gateway Intents), o borrá BIENVENIDA_CHANNEL_ID y AUTOROL_ID.');
    }
  });
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
roblox.rutas(app, ROBLOX_KEY);
app.use(express.static(path.join(__dirname, 'web')));
app.listen(PORT, () => console.log(`[web] http://localhost:${PORT}`));
