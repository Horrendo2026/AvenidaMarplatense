// Todos los comandos de barra (/) del bot y a quién le toca responder cada uno.
const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
} = require('discord.js');
const cfg = require('./config');
const { datos } = require('./datos');
const roblox = require('../roblox');
const verificacion = require('./verificacion');
const moderacion = require('./moderacion');
const sorteos = require('./sorteos');

const P = PermissionFlagsBits;
const ts = (fecha) => Math.floor(new Date(fecha).getTime() / 1000);
const num = (n) => new Intl.NumberFormat('es-AR').format(n);

function botonesLinks() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Jugar').setStyle(ButtonStyle.Link).setURL(cfg.JUEGO),
    new ButtonBuilder().setLabel('Página web').setStyle(ButtonStyle.Link).setURL(cfg.WEB),
    new ButtonBuilder().setLabel('Invitar amigos').setStyle(ButtonStyle.Link).setURL(cfg.INVITACION),
  );
}

const NORMAS = [
  ['RDM', 'Nada de matar sin un motivo de rol.'],
  ['CK', 'Muerte permanente: solo con motivo y aprobación del staff.'],
  ['BD', 'Manejá realista y roleá los choques.'],
  ['PG', 'Nada de acciones imposibles ni forzar al otro.'],
  ['RK', 'Si morís, no volvés a vengarte.'],
  ['Bait', 'No provoques tiroteos sin rol previo.'],
  ['Interrupción', 'No te metas en roles ajenos sin motivo.'],
  ['!Help', 'Solo para problemas reales o bugs.'],
  ['/accion y /pensamiento', 'Usalos realista y sin forzar.'],
  ['Staff', 'Sus decisiones se respetan. Si no estás de acuerdo, apelá.'],
];

// categoria: para agrupar en /ayuda
const COMANDOS = [
  // ---------- General ----------
  {
    categoria: 'General',
    data: new SlashCommandBuilder().setName('ayuda').setDescription('Muestra todos los comandos del bot'),
    ejecutar: async (i) => {
      const grupos = {};
      for (const c of COMANDOS) (grupos[c.categoria] ||= []).push(`\`/${c.data.name}\` ${c.data.description}`);
      const e = new EmbedBuilder().setColor(cfg.COLOR).setTitle('Comandos de AVM BOT');
      for (const [cat, lineas] of Object.entries(grupos)) e.addFields({ name: cat, value: lineas.join('\n') });
      return i.reply({ embeds: [e], ephemeral: true });
    },
  },
  {
    categoria: 'General',
    data: new SlashCommandBuilder().setName('jugadores').setDescription('Cuánta gente está jugando ahora en Roblox'),
    ejecutar: async (i) => {
      const { jugadores, servidores } = roblox.resumen();
      const e = new EmbedBuilder()
        .setColor(cfg.COLOR)
        .setTitle(`🟢 ${num(jugadores)} jugando ahora`)
        .setDescription(servidores
          ? `Repartidos en **${servidores}** servidor${servidores === 1 ? '' : 'es'}.`
          : 'No hay servidores abiertos en este momento. ¡Entrá y arrancá vos!');
      return i.reply({ embeds: [e], components: [botonesLinks()] });
    },
  },
  {
    categoria: 'General',
    data: new SlashCommandBuilder().setName('servidor').setDescription('Información del servidor de Discord'),
    ejecutar: async (i) => {
      const g = await i.client.guilds.fetch({ guild: i.guildId, withCounts: true, force: true });
      const e = new EmbedBuilder()
        .setColor(cfg.COLOR)
        .setTitle(g.name)
        .setThumbnail(g.iconURL({ size: 256 }))
        .addFields(
          { name: 'Miembros', value: num(g.approximateMemberCount ?? g.memberCount), inline: true },
          { name: 'En línea', value: num(g.approximatePresenceCount ?? 0), inline: true },
          { name: 'Boosts', value: `${g.premiumSubscriptionCount ?? 0} (nivel ${g.premiumTier})`, inline: true },
          { name: 'Dueño', value: `<@${g.ownerId}>`, inline: true },
          { name: 'Creado', value: `<t:${ts(g.createdAt)}:D>`, inline: true },
          { name: 'Jugando en Roblox', value: num(roblox.resumen().jugadores), inline: true },
        );
      return i.reply({ embeds: [e] });
    },
  },
  {
    categoria: 'General',
    data: new SlashCommandBuilder().setName('usuario').setDescription('Información de un miembro')
      .addUserOption((o) => o.setName('miembro').setDescription('De quién (si no ponés nada, vos)')),
    ejecutar: async (i) => {
      const usuario = i.options.getUser('miembro') || i.user;
      const miembro = i.options.getMember('miembro') || (usuario.id === i.user.id ? i.member : null);
      const v = datos.vinculos[usuario.id];
      const sanciones = datos.sanciones.filter((x) => x.usuarioId === usuario.id).length;
      const e = new EmbedBuilder()
        .setColor(miembro?.displayColor || cfg.COLOR)
        .setAuthor({ name: usuario.tag, iconURL: usuario.displayAvatarURL() })
        .setThumbnail(usuario.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: 'Cuenta creada', value: `<t:${ts(usuario.createdAt)}:R>`, inline: true },
          ...(miembro ? [{ name: 'Entró al server', value: `<t:${ts(miembro.joinedAt)}:R>`, inline: true }] : []),
          { name: 'Roblox', value: v ? `[${v.nombre}](${verificacion.linkPerfil(v.robloxId)})` : 'Sin vincular', inline: true },
        );
      if (miembro) {
        const roles = miembro.roles.cache.filter((r) => r.id !== i.guildId).sort((a, b) => b.position - a.position).map((r) => `${r}`);
        e.addFields({ name: `Roles (${roles.length})`, value: roles.slice(0, 15).join(' ') || 'Ninguno' });
      }
      if (sanciones && i.memberPermissions.has(P.ModerateMembers)) e.setFooter({ text: `${sanciones} sanción(es) registradas · /historial` });
      return i.reply({ embeds: [e] });
    },
  },
  {
    categoria: 'General',
    data: new SlashCommandBuilder().setName('avatar').setDescription('Muestra la foto de perfil en grande')
      .addUserOption((o) => o.setName('miembro').setDescription('De quién (si no ponés nada, vos)')),
    ejecutar: async (i) => {
      const u = i.options.getUser('miembro') || i.user;
      const e = new EmbedBuilder().setColor(cfg.COLOR).setTitle(`Avatar de ${u.username}`).setImage(u.displayAvatarURL({ size: 1024 }));
      return i.reply({ embeds: [e] });
    },
  },
  {
    categoria: 'General',
    data: new SlashCommandBuilder().setName('normas').setDescription('Resumen de las normas del servidor'),
    ejecutar: async (i) => {
      const e = new EmbedBuilder()
        .setColor(cfg.COLOR)
        .setTitle('📜 Normas de Avenida Marplatense')
        .setDescription(NORMAS.map(([t, d], n) => `**${n + 1}. ${t}:** ${d}`).join('\n'))
        .setFooter({ text: 'Romperlas puede llevar a advertencias, aislamiento o ban.' });
      const boton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Leer las normas completas').setStyle(ButtonStyle.Link).setURL(`${cfg.WEB}/#normas`),
      );
      return i.reply({ embeds: [e], components: [boton] });
    },
  },
  {
    categoria: 'General',
    data: new SlashCommandBuilder().setName('links').setDescription('Links del juego, la web y el Discord'),
    ejecutar: (i) => i.reply({ content: '🔗 **Avenida Marplatense**', components: [botonesLinks()] }),
  },

  // ---------- Roblox ----------
  {
    categoria: 'Roblox',
    data: new SlashCommandBuilder().setName('verificar').setDescription('Vinculá tu cuenta de Roblox con Discord')
      .addStringOption((o) => o.setName('usuario').setDescription('Tu nombre de usuario de Roblox').setRequired(true).setMaxLength(20)),
    ejecutar: verificacion.iniciar,
  },
  {
    categoria: 'Roblox',
    data: new SlashCommandBuilder().setName('desvincular').setDescription('Desvincula tu cuenta de Roblox'),
    ejecutar: verificacion.desvincular,
  },
  {
    categoria: 'Roblox',
    data: new SlashCommandBuilder().setName('roblox').setDescription('Muestra la cuenta de Roblox vinculada de alguien')
      .addUserOption((o) => o.setName('miembro').setDescription('De quién (si no ponés nada, vos)')),
    ejecutar: verificacion.verPerfil,
  },

  // ---------- Moderación ----------
  {
    categoria: 'Moderación',
    data: new SlashCommandBuilder().setName('warn').setDescription('Da una advertencia a un miembro')
      .setDefaultMemberPermissions(P.ModerateMembers)
      .addUserOption((o) => o.setName('miembro').setDescription('A quién').setRequired(true))
      .addStringOption((o) => o.setName('motivo').setDescription('Por qué').setRequired(true).setMaxLength(500)),
    ejecutar: moderacion.warn,
  },
  {
    categoria: 'Moderación',
    data: new SlashCommandBuilder().setName('aislar').setDescription('Aísla (timeout) a un miembro por un tiempo')
      .setDefaultMemberPermissions(P.ModerateMembers)
      .addUserOption((o) => o.setName('miembro').setDescription('A quién').setRequired(true))
      .addIntegerOption((o) => o.setName('duracion').setDescription('Cuánto tiempo').setRequired(true).addChoices(
        { name: '5 minutos', value: 5 }, { name: '10 minutos', value: 10 }, { name: '1 hora', value: 60 },
        { name: '6 horas', value: 360 }, { name: '1 día', value: 1440 }, { name: '1 semana', value: 10080 },
      ))
      .addStringOption((o) => o.setName('motivo').setDescription('Por qué').setRequired(true).setMaxLength(500)),
    ejecutar: moderacion.aislar,
  },
  {
    categoria: 'Moderación',
    data: new SlashCommandBuilder().setName('expulsar').setDescription('Expulsa a un miembro (puede volver a entrar)')
      .setDefaultMemberPermissions(P.KickMembers)
      .addUserOption((o) => o.setName('miembro').setDescription('A quién').setRequired(true))
      .addStringOption((o) => o.setName('motivo').setDescription('Por qué').setRequired(true).setMaxLength(500)),
    ejecutar: moderacion.expulsar,
  },
  {
    categoria: 'Moderación',
    data: new SlashCommandBuilder().setName('banear').setDescription('Banea a un usuario')
      .setDefaultMemberPermissions(P.BanMembers)
      .addUserOption((o) => o.setName('usuario').setDescription('A quién').setRequired(true))
      .addStringOption((o) => o.setName('motivo').setDescription('Por qué').setRequired(true).setMaxLength(500))
      .addBooleanOption((o) => o.setName('borrar_mensajes').setDescription('Borrar sus mensajes de los últimos 7 días')),
    ejecutar: moderacion.banear,
  },
  {
    categoria: 'Moderación',
    data: new SlashCommandBuilder().setName('desbanear').setDescription('Saca el ban a un usuario')
      .setDefaultMemberPermissions(P.BanMembers)
      .addStringOption((o) => o.setName('id').setDescription('ID de Discord del usuario').setRequired(true))
      .addStringOption((o) => o.setName('motivo').setDescription('Por qué').setRequired(true).setMaxLength(500)),
    ejecutar: moderacion.desbanear,
  },
  {
    categoria: 'Moderación',
    data: new SlashCommandBuilder().setName('historial').setDescription('Sanciones de un usuario')
      .setDefaultMemberPermissions(P.ModerateMembers)
      .addUserOption((o) => o.setName('usuario').setDescription('De quién').setRequired(true)),
    ejecutar: moderacion.historial,
  },
  {
    categoria: 'Moderación',
    data: new SlashCommandBuilder().setName('borrarsancion').setDescription('Borra un caso del historial')
      .setDefaultMemberPermissions(P.ModerateMembers)
      .addIntegerOption((o) => o.setName('caso').setDescription('Número de caso (#)').setRequired(true).setMinValue(1)),
    ejecutar: moderacion.borrarSancion,
  },
  {
    categoria: 'Moderación',
    data: new SlashCommandBuilder().setName('limpiar').setDescription('Borra mensajes del canal')
      .setDefaultMemberPermissions(P.ManageMessages)
      .addIntegerOption((o) => o.setName('cantidad').setDescription('Cuántos (1 a 100)').setRequired(true).setMinValue(1).setMaxValue(100))
      .addUserOption((o) => o.setName('de').setDescription('Solo los de este usuario')),
    ejecutar: moderacion.limpiar,
  },
  {
    categoria: 'Moderación',
    data: new SlashCommandBuilder().setName('slowmode').setDescription('Pone modo lento en el canal')
      .setDefaultMemberPermissions(P.ManageChannels)
      .addIntegerOption((o) => o.setName('segundos').setDescription('Segundos entre mensajes (0 = apagado)').setRequired(true).setMinValue(0).setMaxValue(21600)),
    ejecutar: moderacion.slowmode,
  },

  // ---------- Staff ----------
  {
    categoria: 'Staff',
    data: new SlashCommandBuilder().setName('decir').setDescription('El bot publica un mensaje lindo (embed)')
      .setDefaultMemberPermissions(P.ManageGuild)
      .addStringOption((o) => o.setName('mensaje').setDescription('Texto. Usá \\n para bajar de línea').setRequired(true).setMaxLength(2000))
      .addStringOption((o) => o.setName('titulo').setDescription('Título (opcional)').setMaxLength(200))
      .addChannelOption((o) => o.setName('canal').setDescription('Dónde (si no, acá)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
    ejecutar: async (i) => {
      const canal = i.options.getChannel('canal') || i.channel;
      const e = new EmbedBuilder().setColor(cfg.COLOR).setDescription(i.options.getString('mensaje').replace(/\\n/g, '\n'));
      const titulo = i.options.getString('titulo');
      if (titulo) e.setTitle(titulo);
      await canal.send({ embeds: [e] });
      return i.reply({ content: `Publicado en ${canal}.`, ephemeral: true });
    },
  },
  {
    categoria: 'Staff',
    data: new SlashCommandBuilder().setName('encuesta').setDescription('Crea una encuesta con reacciones')
      .setDefaultMemberPermissions(P.ManageMessages)
      .addStringOption((o) => o.setName('pregunta').setDescription('La pregunta').setRequired(true).setMaxLength(250))
      .addStringOption((o) => o.setName('opcion1').setDescription('Opción 1').setRequired(true).setMaxLength(100))
      .addStringOption((o) => o.setName('opcion2').setDescription('Opción 2').setRequired(true).setMaxLength(100))
      .addStringOption((o) => o.setName('opcion3').setDescription('Opción 3').setMaxLength(100))
      .addStringOption((o) => o.setName('opcion4').setDescription('Opción 4').setMaxLength(100))
      .addStringOption((o) => o.setName('opcion5').setDescription('Opción 5').setMaxLength(100)),
    ejecutar: async (i) => {
      const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
      const opciones = [1, 2, 3, 4, 5].map((n) => i.options.getString(`opcion${n}`)).filter(Boolean);
      const e = new EmbedBuilder()
        .setColor(cfg.COLOR)
        .setTitle(`📊 ${i.options.getString('pregunta')}`)
        .setDescription(opciones.map((o, n) => `${emojis[n]} ${o}`).join('\n\n'))
        .setFooter({ text: `Encuesta de ${i.user.username} · votá con las reacciones` });
      await i.reply({ embeds: [e] });
      const msg = await i.fetchReply();
      for (let n = 0; n < opciones.length; n++) await msg.react(emojis[n]);
    },
  },
  {
    categoria: 'Staff',
    data: new SlashCommandBuilder().setName('sorteo').setDescription('Crea un sorteo con botón para participar')
      .setDefaultMemberPermissions(P.ManageGuild)
      .addStringOption((o) => o.setName('premio').setDescription('Qué se sortea').setRequired(true).setMaxLength(200))
      .addStringOption((o) => o.setName('duracion').setDescription('Ej: 30m, 2h, 1d (máx. 14d)').setRequired(true))
      .addIntegerOption((o) => o.setName('ganadores').setDescription('Cuántos ganan (1 por defecto)').setMinValue(1).setMaxValue(20)),
    ejecutar: sorteos.crear,
  },
];

const porNombre = new Map(COMANDOS.map((c) => [c.data.name, c]));
const definiciones = COMANDOS.map((c) => c.data.toJSON());

async function responderError(interaction, err) {
  console.error(`[comandos] Error en ${interaction.commandName || interaction.customId}:`, err);
  const texto = '❌ Algo salió mal. Probá de nuevo en un rato o avisale al staff.';
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp({ content: texto, ephemeral: true });
    else await interaction.reply({ content: texto, ephemeral: true });
  } catch { /* la interacción ya venció */ }
}

async function manejar(interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      const c = porNombre.get(interaction.commandName);
      if (c) await c.ejecutar(interaction);
    } else if (interaction.isButton()) {
      const [tipo, id] = interaction.customId.split(':');
      if (tipo === 'verif') await verificacion.comprobar(interaction);
      else if (tipo === 'sorteo') await sorteos.participar(interaction, id);
    }
  } catch (err) {
    await responderError(interaction, err);
  }
}

module.exports = { definiciones, manejar };
