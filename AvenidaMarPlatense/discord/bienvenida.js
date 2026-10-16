// Mensaje de bienvenida y rol automático cuando alguien entra al server.
// Necesita "Server Members Intent" activado en el portal de Discord.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cfg = require('./config');

async function alEntrar(miembro) {
  if (cfg.AUTOROL_ID) {
    await miembro.roles.add(cfg.AUTOROL_ID, 'Rol automático al entrar')
      .catch((err) => console.error('[bienvenida] No se pudo dar el rol automático:', err.message));
  }
  if (!cfg.BIENVENIDA_CHANNEL_ID) return;

  const embed = new EmbedBuilder()
    .setColor(cfg.COLOR)
    .setTitle('¡Bienvenido/a a Avenida Marplatense!')
    .setDescription([
      `Hola ${miembro}, ya sos parte de la ciudad. 🌊`,
      '',
      `📜 Leé las **normas** antes de entrar: ${cfg.WEB}/#normas`,
      '🔗 Vinculá tu cuenta de Roblox con `/verificar`',
      '🎮 Y nos vemos en La Feliz.',
    ].join('\n'))
    .setThumbnail(miembro.user.displayAvatarURL({ size: 256 }))
    .setImage(`${cfg.WEB}/img/10.png`)
    .setFooter({ text: `Sos el miembro #${miembro.guild.memberCount}` });

  const botones = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Jugar').setStyle(ButtonStyle.Link).setURL(cfg.JUEGO),
    new ButtonBuilder().setLabel('Página web').setStyle(ButtonStyle.Link).setURL(cfg.WEB),
  );

  try {
    const canal = await miembro.client.channels.fetch(cfg.BIENVENIDA_CHANNEL_ID);
    await canal.send({ content: `${miembro}`, embeds: [embed], components: [botones] });
  } catch (err) {
    console.error('[bienvenida] No se pudo mandar el mensaje:', err.message);
  }
}

module.exports = { alEntrar };
