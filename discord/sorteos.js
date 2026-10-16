// Sorteos con botón "Participar". Se guardan en datos.json, así un reinicio del bot no los corta.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cfg = require('./config');
const { datos, guardar } = require('./datos');

const UNIDADES = { m: 60e3, h: 3600e3, d: 86400e3 };
const MAX_MS = 14 * 86400e3;

// "30m", "2h", "1d" -> milisegundos
function parsearDuracion(txt) {
  const m = /^(\d+)\s*([mhd])$/i.exec((txt || '').trim());
  if (!m) return null;
  const ms = Number(m[1]) * UNIDADES[m[2].toLowerCase()];
  return ms > 0 && ms <= MAX_MS ? ms : null;
}

const ts = (ms) => Math.floor(ms / 1000);

function embedSorteo(s) {
  const e = new EmbedBuilder()
    .setColor(cfg.COLOR)
    .setTitle('🎉 SORTEO')
    .setDescription(`**${s.premio}**`)
    .addFields(
      { name: s.terminado ? 'Terminó' : 'Termina', value: `<t:${ts(s.termina)}:R>`, inline: true },
      { name: 'Ganadores', value: String(s.ganadores), inline: true },
      { name: 'Participantes', value: String(s.participantes.length), inline: true },
    )
    .setFooter({ text: `Sorteo #${s.id}` });
  if (s.terminado) {
    e.addFields({ name: '🏆 Resultado', value: s.resultado.length ? s.resultado.map((id) => `<@${id}>`).join(', ') : 'Nadie participó.' });
  }
  return e;
}

function botonSorteo(s) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sorteo:${s.id}`).setLabel('Participar').setEmoji('🎉').setStyle(ButtonStyle.Primary).setDisabled(s.terminado),
  );
}

async function crear(interaction) {
  const premio = interaction.options.getString('premio');
  const ms = parsearDuracion(interaction.options.getString('duracion'));
  const ganadores = interaction.options.getInteger('ganadores') ?? 1;
  if (!ms) return interaction.reply({ content: 'Duración inválida. Usá por ejemplo `30m`, `2h` o `1d` (máximo 14 días).', ephemeral: true });

  const s = { id: datos.sigId++, premio, ganadores, termina: Date.now() + ms, participantes: [], terminado: false, canalId: interaction.channelId, creadorId: interaction.user.id };
  const msg = await interaction.channel.send({ embeds: [embedSorteo(s)], components: [botonSorteo(s)] });
  s.mensajeId = msg.id;
  s.mostrados = 0;
  datos.sorteos.push(s);
  guardar();
  return interaction.reply({ content: `Sorteo #${s.id} creado.`, ephemeral: true });
}

async function participar(interaction, id) {
  const s = datos.sorteos.find((x) => x.id === Number(id));
  if (!s || s.terminado) return interaction.reply({ content: 'Este sorteo ya terminó.', ephemeral: true });
  const i = s.participantes.indexOf(interaction.user.id);
  if (i === -1) s.participantes.push(interaction.user.id);
  else s.participantes.splice(i, 1);
  guardar();
  return interaction.reply({ content: i === -1 ? '🎉 ¡Estás participando! Tocá de nuevo si te querés bajar.' : 'Te bajaste del sorteo.', ephemeral: true });
}

async function finalizar(client, s) {
  const lista = [...s.participantes];
  for (let i = lista.length - 1; i > 0; i--) { // mezcla al azar
    const j = Math.floor(Math.random() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  s.resultado = lista.slice(0, s.ganadores);
  s.terminado = true;
  guardar();
  try {
    const canal = await client.channels.fetch(s.canalId);
    const msg = await canal.messages.fetch(s.mensajeId);
    await msg.edit({ embeds: [embedSorteo(s)], components: [botonSorteo(s)] });
    await msg.reply(s.resultado.length
      ? `🏆 ¡Felicitaciones ${s.resultado.map((id) => `<@${id}>`).join(', ')}! Ganaste **${s.premio}**. Hablá con <@${s.creadorId}> para reclamarlo.`
      : `Nadie participó del sorteo de **${s.premio}**.`);
  } catch (err) {
    console.error(`[sorteos] No se pudo cerrar el sorteo #${s.id}:`, err.message);
  }
}

// Cada 15 s: cierra los vencidos y actualiza el número de participantes
async function revisar(client) {
  for (const s of datos.sorteos.filter((x) => !x.terminado)) {
    if (Date.now() >= s.termina) { await finalizar(client, s); continue; }
    if (s.mostrados !== s.participantes.length) {
      s.mostrados = s.participantes.length;
      try {
        const canal = await client.channels.fetch(s.canalId);
        const msg = await canal.messages.fetch(s.mensajeId);
        await msg.edit({ embeds: [embedSorteo(s)] });
      } catch { /* el mensaje pudo haberse borrado */ }
    }
  }
  // se guardan solo los sorteos de los últimos 30 días
  const antes = datos.sorteos.length;
  datos.sorteos = datos.sorteos.filter((x) => !x.terminado || Date.now() - x.termina < 30 * 86400e3);
  if (datos.sorteos.length !== antes) guardar();
}

function iniciarReloj(client) {
  revisar(client);
  setInterval(() => revisar(client), 15000);
}

module.exports = { crear, participar, iniciarReloj };
