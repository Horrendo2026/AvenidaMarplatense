// Vincular la cuenta de Discord con la de Roblox.
// 1) /verificar usuario  -> el bot da un código de palabras
// 2) el jugador lo pega en "Acerca de" de su perfil de Roblox
// 3) toca "Ya lo puse" -> el bot lee el perfil, y si está el código, lo vincula
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cfg = require('./config');
const { datos, guardar } = require('./datos');

// Solo palabras (sin números), porque Roblox censura los números en el perfil
const PALABRAS = ['mate', 'alfajor', 'lobo', 'faro', 'puerto', 'escollera', 'rambla', 'playa', 'gaviota', 'medialuna',
  'colectivo', 'vereda', 'barrio', 'costa', 'muelle', 'arena', 'sombrilla', 'churro', 'caracol', 'bondi'];
const VENCE_MS = 15 * 60 * 1000;
const pendientes = new Map(); // discordId -> { robloxId, nombre, codigo, expira }

const normalizar = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

function generarCodigo() {
  const elegidas = [];
  while (elegidas.length < 4) {
    const p = PALABRAS[Math.floor(Math.random() * PALABRAS.length)];
    if (!elegidas.includes(p)) elegidas.push(p);
  }
  return 'AVM ' + elegidas.join(' ');
}

async function buscarUsuario(nombre) {
  const r = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [nombre], excludeBannedUsers: true }),
  });
  if (!r.ok) throw new Error(`Roblox respondió ${r.status}`);
  return (await r.json()).data[0] || null; // { id, name, displayName }
}

async function perfil(robloxId) {
  const r = await fetch(`https://users.roblox.com/v1/users/${robloxId}`);
  if (!r.ok) throw new Error(`Roblox respondió ${r.status}`);
  return r.json(); // { id, name, displayName, description, created }
}

async function fotoRoblox(robloxId) {
  try {
    const r = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxId}&size=150x150&format=Png`);
    return (await r.json()).data?.[0]?.imageUrl || null;
  } catch {
    return null;
  }
}

const linkPerfil = (id) => `https://www.roblox.com/users/${id}/profile`;

async function iniciar(interaction) {
  const nombre = interaction.options.getString('usuario').trim();
  await interaction.deferReply({ ephemeral: true });

  const usuario = await buscarUsuario(nombre);
  if (!usuario) return interaction.editReply(`No encontré ningún usuario de Roblox llamado **${nombre}**. Fijate que esté bien escrito (es el nombre de usuario, no el apodo).`);

  const otro = Object.entries(datos.vinculos).find(([did, v]) => v.robloxId === usuario.id && did !== interaction.user.id);
  if (otro) return interaction.editReply(`La cuenta **${usuario.name}** ya está vinculada a otro usuario de Discord. Si es tuya, pedile al staff que la desvincule.`);

  const codigo = generarCodigo();
  pendientes.set(interaction.user.id, { robloxId: usuario.id, nombre: usuario.name, codigo, expira: Date.now() + VENCE_MS });

  const embed = new EmbedBuilder()
    .setColor(cfg.COLOR)
    .setTitle('Verificá tu cuenta de Roblox')
    .setThumbnail(await fotoRoblox(usuario.id))
    .setDescription([
      `Cuenta: **${usuario.name}** (${usuario.displayName})`,
      '',
      '**1.** Entrá a tu perfil de Roblox y tocá el lápiz de **"Acerca de"**.',
      '**2.** Pegá este código en cualquier parte del texto y guardá:',
      `\`\`\`${codigo}\`\`\``,
      '**3.** Volvé acá y tocá **Ya lo puse**.',
      '',
      'Tenés 15 minutos. Después de verificar podés borrar el código del perfil.',
    ].join('\n'));

  const botones = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('verif:comprobar').setLabel('Ya lo puse').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setLabel('Abrir mi perfil').setStyle(ButtonStyle.Link).setURL(linkPerfil(usuario.id)),
  );
  return interaction.editReply({ embeds: [embed], components: [botones] });
}

async function comprobar(interaction) {
  const p = pendientes.get(interaction.user.id);
  if (!p || p.expira < Date.now()) {
    pendientes.delete(interaction.user.id);
    return interaction.reply({ content: 'Se venció el código o no empezaste una verificación. Usá `/verificar` de nuevo.', ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });

  const { description } = await perfil(p.robloxId);
  if (!normalizar(description || '').includes(normalizar(p.codigo))) {
    return interaction.editReply(`Todavía no veo el código en tu perfil de **${p.nombre}**. Fijate que hayas guardado los cambios y que el código esté completo:\n\`${p.codigo}\`\n(Roblox a veces tarda unos segundos en actualizar el perfil.)`);
  }

  pendientes.delete(interaction.user.id);
  datos.vinculos[interaction.user.id] = { robloxId: p.robloxId, nombre: p.nombre, fecha: new Date().toISOString() };
  guardar();

  const avisos = [];
  const miembro = interaction.member;
  if (cfg.VERIFICADO_ROL_ID) {
    await miembro.roles.add(cfg.VERIFICADO_ROL_ID, 'Verificó su cuenta de Roblox').catch(() => avisos.push('No pude darte el rol de verificado (avisale al staff).'));
  }
  await miembro.setNickname(p.nombre, 'Verificó su cuenta de Roblox').catch(() => avisos.push('No pude cambiarte el apodo (pasa si tenés un rol más alto que el mío).'));

  return interaction.editReply(`✅ ¡Listo! Tu Discord quedó vinculado con **${p.nombre}**. Ya podés borrar el código de tu perfil.${avisos.length ? '\n\n' + avisos.join('\n') : ''}`);
}

async function desvincular(interaction) {
  const v = datos.vinculos[interaction.user.id];
  if (!v) return interaction.reply({ content: 'No tenés ninguna cuenta de Roblox vinculada.', ephemeral: true });
  delete datos.vinculos[interaction.user.id];
  guardar();
  if (cfg.VERIFICADO_ROL_ID) await interaction.member.roles.remove(cfg.VERIFICADO_ROL_ID).catch(() => {});
  return interaction.reply({ content: `Desvinculaste la cuenta **${v.nombre}**.`, ephemeral: true });
}

async function verPerfil(interaction) {
  const usuario = interaction.options.getUser('miembro') || interaction.user;
  const v = datos.vinculos[usuario.id];
  if (!v) {
    const quien = usuario.id === interaction.user.id ? 'No tenés' : `**${usuario.username}** no tiene`;
    return interaction.reply({ content: `${quien} una cuenta de Roblox vinculada. Se vincula con \`/verificar\`.`, ephemeral: true });
  }
  await interaction.deferReply();
  const info = await perfil(v.robloxId).catch(() => null);
  const embed = new EmbedBuilder()
    .setColor(cfg.COLOR)
    .setAuthor({ name: usuario.username, iconURL: usuario.displayAvatarURL() })
    .setTitle(info ? `${info.displayName} (@${info.name})` : v.nombre)
    .setURL(linkPerfil(v.robloxId))
    .setThumbnail(await fotoRoblox(v.robloxId))
    .addFields(
      { name: 'Vinculado', value: `<t:${Math.floor(new Date(v.fecha).getTime() / 1000)}:R>`, inline: true },
      ...(info?.created ? [{ name: 'Cuenta de Roblox creada', value: `<t:${Math.floor(new Date(info.created).getTime() / 1000)}:D>`, inline: true }] : []),
    );
  return interaction.editReply({ embeds: [embed] });
}

module.exports = { iniciar, comprobar, desvincular, verPerfil, fotoRoblox, linkPerfil };
