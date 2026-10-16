// Configuración del bot. Los IDs vienen de las variables (.env o Railway).
// Si una variable no está, esa función simplemente queda apagada.
module.exports = {
  COLOR: 0xec1c2b, // rojo AVM
  WEB: process.env.WEB_URL || 'https://avenidamarplatense.com',
  JUEGO: 'https://www.roblox.com/es/games/18884953296/Villa-Marplatense-RolePlay',
  INVITACION: 'https://discord.gg/vVxQPSKRra',

  BIENVENIDA_CHANNEL_ID: process.env.BIENVENIDA_CHANNEL_ID, // canal donde saluda a los nuevos
  AUTOROL_ID: process.env.AUTOROL_ID, // rol que se da al entrar
  VERIFICADO_ROL_ID: process.env.VERIFICADO_ROL_ID, // rol que se da al vincular Roblox
  LOGS_CHANNEL_ID: process.env.LOGS_CHANNEL_ID, // canal del staff donde se registran las sanciones
};
