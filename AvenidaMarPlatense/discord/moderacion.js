// Sanciones: advertir, aislar, expulsar, banear, historial. Todo queda registrado
// en datos.json y en el canal de logs del staff.
const { EmbedBuilder } = require('discord.js');
const cfg = require('./config');
const { datos, guardar } = require('./datos');

const TIPOS = {
  warn: { nombre: 'Advertencia', emoji: '⚠️' },
  aislar: { nombre: 'Aislamiento', emoji: '🔇' },
  expulsar: { nombre: 'Expulsión', emoji: '👢' },
  ban: { nombre: 'Baneo', emoji: '🔨' },
  desban: { nombre: 'Desbaneo', emoji: '🔓' },
};

const ts = (iso) => Math.floor(new Date(iso).getTime() / 1000);

function textoDuracion(min) {
  if (min % 1440 === 0) return `${min / 1440} día${min / 1440 > 1 ? 's' : ''}`;
  if (min % 60 === 0) return `${min / 60} hora${min / 60 > 1 ? 's' : ''}`;
  return `${min} minutos`;
}

// Devuelve un mensaje de error si el staff no puede sancionar a ese miembro
function chequear(interaction, objetivo) {
  if (!objetivo) return 'Ese usuario no está en el servidor.';
  if (objetivo.id === interaction.user.id) return 'No podés sancionarte a vos mismo.';
  if (objetivo.id === interaction.client.user.id) return 'No me podés sancionar a mí.';
  if (objetivo.id === interaction.guild.ownerId) return 'No se puede sancionar al dueño del servidor.';
  const yo = interaction.member;
  if (interaction.guild.ownerId !== yo.id && objetivo.roles.highest.position >= yo.roles.highest.position) {
    return 'No podés sancionar a alguien con un rol igual o más alto que el tuyo.';
  }
  return null;
}

function embedSancion(s) {
  const t = TIPOS[s.tipo];
  return new EmbedBuilder()
    .setColor(cfg.COLOR)
    .setTitle(`${t.emoji} ${t.nombre} · caso #${s.id}`)
    .addFields(
      { name: 'Usuario', value: `<@${s.usuarioId}> (${s.usuarioTag})`, inline: true },
      { name: 'Staff', value: `<@${s.staffId}>`, inline: true },
      ...(s.duracion ? [{ name: 'Duración', value: textoDuracion(s.duracion), inline: true }] : []),
      { name: 'Motivo', value: s.motivo },
    )
    .setTimestamp(new Date(s.fecha));
}

async function registrar(interaction, tipo, usuario, motivo, extra = {}) {
  const s = {
    id: datos.sigId++, tipo, usuarioId: usuario.id, usuarioTag: usuario.tag || usuario.username,
    staffId: interaction.user.id, motivo, fecha: new Date().toISOString(), ...extra,
  };
  datos.sanciones.push(s);
  guardar();
  if (cfg.LOGS_CHANNEL_ID) {
    try {
      const canal = await interaction.client.channels.fetch(cfg.LOGS_CHANNEL_ID);
      await canal.send({ embeds: [embedSancion(s)] });
    } catch (err) {
      console.error('[moderacion] No se pudo escribir en el canal de logs:', err.message);
    }
  }
  return s;
}

// Avisa por mensaje privado. Si tiene los MD cerrados, no pasa nada.
async function avisar(usuario, guild, tipo, motivo, duracion) {
  const t = TIPOS[tipo];
  const e = new EmbedBuilder()
    .setColor(cfg.COLOR)
    .setTitle(`${t.emoji} Recibiste una sanción en ${guild.name}`)
    .addFields({ name: 'Tipo', value: t.nombre, inline: true }, { name: 'Motivo', value: motivo });
  if (duracion) e.addFields({ name: 'Duración', value: textoDuracion(duracion), inline: true });
  e.setFooter({ text: 'Si no estás de acuerdo, podés apelar por los medios del servidor.' });
  await usuario.send({ embeds: [e] }).catch(() => {});
}

async function warn(interaction) {
  const objetivo = interaction.options.getMember('miembro');
  const motivo = interaction.options.getString('motivo');
  const error = chequear(interaction, objetivo);
  if (error) return interaction.reply({ content: error, ephemeral: true });
  await avisar(objetivo.user, interaction.guild, 'warn', motivo);
  const s = await registrar(interaction, 'warn', objetivo.user, motivo);
  const total = datos.sanciones.filter((x) => x.usuarioId === objetivo.id && x.tipo === 'warn').length;
  return interaction.reply({ content: `⚠️ ${objetivo} recibió una advertencia (caso #${s.id}). Lleva **${total}** en total.` });
}

async function aislar(interaction) {
  const objetivo = interaction.options.getMember('miembro');
  const minutos = interaction.options.getInteger('duracion');
  const motivo = interaction.options.getString('motivo');
  const error = chequear(interaction, objetivo) || (!objetivo.moderatable && 'No puedo aislar a ese miembro: su rol está por encima del mío o me falta el permiso "Aislar miembros".');
  if (error) return interaction.reply({ content: error, ephemeral: true });
  await objetivo.timeout(minutos * 60e3, `${motivo} (por ${interaction.user.tag})`);
  await avisar(objetivo.user, interaction.guild, 'aislar', motivo, minutos);
  const s = await registrar(interaction, 'aislar', objetivo.user, motivo, { duracion: minutos });
  return interaction.reply({ content: `🔇 ${objetivo} quedó aislado por ${textoDuracion(minutos)} (caso #${s.id}).` });
}

async function expulsar(interaction) {
  const objetivo = interaction.options.getMember('miembro');
  const motivo = interaction.options.getString('motivo');
  const error = chequear(interaction, objetivo) || (!objetivo.kickable && 'No puedo expulsar a ese miembro: su rol está por encima del mío o me falta el permiso "Expulsar miembros".');
  if (error) return interaction.reply({ content: error, ephemeral: true });
  await avisar(objetivo.user, interaction.guild, 'expulsar', motivo); // antes, porque después ya no comparte server
  await objetivo.kick(`${motivo} (por ${interaction.user.tag})`);
  const s = await registrar(interaction, 'expulsar', objetivo.user, motivo);
  return interaction.reply({ content: `👢 **${objetivo.user.tag}** fue expulsado (caso #${s.id}).` });
}

async function banear(interaction) {
  const usuario = interaction.options.getUser('usuario');
  const objetivo = interaction.options.getMember('usuario'); // null si ya no está en el server
  const motivo = interaction.options.getString('motivo');
  const borrar = interaction.options.getBoolean('borrar_mensajes') ?? false;
  if (objetivo) {
    const error = chequear(interaction, objetivo) || (!objetivo.bannable && 'No puedo banear a ese miembro: su rol está por encima del mío o me falta el permiso "Banear miembros".');
    if (error) return interaction.reply({ content: error, ephemeral: true });
    await avisar(usuario, interaction.guild, 'ban', motivo);
  }
  await interaction.guild.members.ban(usuario, { reason: `${motivo} (por ${interaction.user.tag})`, deleteMessageSeconds: borrar ? 7 * 86400 : 0 });
  const s = await registrar(interaction, 'ban', usuario, motivo);
  return interaction.reply({ content: `🔨 **${usuario.tag}** fue baneado (caso #${s.id}).` });
}

async function desbanear(interaction) {
  const id = interaction.options.getString('id').trim();
  const motivo = interaction.options.getString('motivo');
  if (!/^\d{17,20}$/.test(id)) return interaction.reply({ content: 'Eso no parece un ID de usuario de Discord.', ephemeral: true });
  const ban = await interaction.guild.bans.fetch(id).catch(() => null);
  if (!ban) return interaction.reply({ content: 'Ese usuario no está baneado.', ephemeral: true });
  await interaction.guild.members.unban(id, `${motivo} (por ${interaction.user.tag})`);
  const s = await registrar(interaction, 'desban', ban.user, motivo);
  return interaction.reply({ content: `🔓 **${ban.user.tag}** fue desbaneado (caso #${s.id}).` });
}

async function historial(interaction) {
  const usuario = interaction.options.getUser('usuario');
  const lista = datos.sanciones.filter((x) => x.usuarioId === usuario.id);
  if (!lista.length) return interaction.reply({ content: `**${usuario.tag}** no tiene sanciones registradas. ✅`, ephemeral: true });
  const conteo = Object.entries(TIPOS).map(([k, t]) => [t, lista.filter((x) => x.tipo === k).length]).filter(([, n]) => n).map(([t, n]) => `${t.emoji} ${n}`).join('  ');
  const lineas = lista.slice(-15).reverse().map((s) => {
    const t = TIPOS[s.tipo];
    return `**#${s.id}** ${t.emoji} ${t.nombre}${s.duracion ? ` (${textoDuracion(s.duracion)})` : ''} · <t:${ts(s.fecha)}:d> · por <@${s.staffId}>\n> ${s.motivo}`;
  });
  const e = new EmbedBuilder()
    .setColor(cfg.COLOR)
    .setAuthor({ name: `Historial de ${usuario.tag}`, iconURL: usuario.displayAvatarURL() })
    .setDescription(`${conteo}\n\n${lineas.join('\n')}`)
    .setFooter({ text: lista.length > 15 ? `Mostrando las últimas 15 de ${lista.length}` : `${lista.length} en total` });
  return interaction.reply({ embeds: [e], ephemeral: true });
}

async function borrarSancion(interaction) {
  const id = interaction.options.getInteger('caso');
  const i = datos.sanciones.findIndex((x) => x.id === id);
  if (i === -1) return interaction.reply({ content: `No existe el caso #${id}.`, ephemeral: true });
  const [s] = datos.sanciones.splice(i, 1);
  guardar();
  return interaction.reply({ content: `Borré el caso #${id} (${TIPOS[s.tipo].nombre} a **${s.usuarioTag}**) del historial. Ojo: esto no deshace un baneo ni un aislamiento.`, ephemeral: true });
}

async function limpiar(interaction) {
  const cantidad = interaction.options.getInteger('cantidad');
  const de = interaction.options.getUser('de');
  await interaction.deferReply({ ephemeral: true });
  let mensajes = [...(await interaction.channel.messages.fetch({ limit: 100 })).values()];
  if (de) mensajes = mensajes.filter((m) => m.author.id === de.id);
  const borrados = await interaction.channel.bulkDelete(mensajes.slice(0, cantidad), true);
  const nota = borrados.size < Math.min(cantidad, mensajes.length) ? '\n(Discord no deja borrar en masa mensajes de más de 14 días.)' : '';
  return interaction.editReply(`🧹 Borré ${borrados.size} mensaje${borrados.size === 1 ? '' : 's'}.${nota}`);
}

async function slowmode(interaction) {
  const seg = interaction.options.getInteger('segundos');
  await interaction.channel.setRateLimitPerUser(seg, `Por ${interaction.user.tag}`);
  return interaction.reply({ content: seg ? `🐢 Modo lento: un mensaje cada ${seg} segundos.` : 'Modo lento desactivado.' });
}

module.exports = { warn, aislar, expulsar, banear, desbanear, historial, borrarSancion, limpiar, slowmode };
