# Avenida Mar Platense: web + bot de Discord

Un solo programa que hace tres cosas:

- **Publica la página** (carpeta `web/`).
- **Lee el canal de anuncios** de tu Discord. Lo que el staff publica ahí aparece en la sección "Anuncios" de la web. Si editás o borrás el mensaje, también se actualiza.
- **Cuenta miembros y conectados** del server y los muestra en la web.

## 1. Crear el bot en Discord

1. Entrá a https://discord.com/developers/applications → **New Application** → ponele un nombre (ej: "AVM Web").
2. Menú **Bot**:
   - Tocá **Reset Token** y copiá el token. Es la contraseña del bot: no la compartas con nadie ni la subas a internet.
   - Activá **Message Content Intent** (en "Privileged Gateway Intents") y guardá.
3. Menú **OAuth2 → URL Generator**:
   - Scopes: `bot`
   - Permisos: **View Channels** y **Read Message History**
   - Abrí el link que se genera y agregá el bot a tu server.
4. Si el canal de anuncios es privado, asegurate de que el bot (o su rol) pueda **ver** el canal.

## 2. Sacar los IDs

En Discord: **Ajustes de usuario → Avanzado → Modo desarrollador** (activarlo). Después:

- Clic derecho en el ícono del server → **Copiar ID del servidor** → `GUILD_ID`
- Clic derecho en el canal de anuncios → **Copiar ID del canal** → `ANUNCIOS_CHANNEL_ID`

## 3. Configurar y arrancar

Necesitás [Node.js](https://nodejs.org) 18 o más nuevo.

1. Copiá `.env.example` como `.env` y completá el token y los dos IDs.
2. En la carpeta del proyecto:

```bash
npm install
```

```bash
npm start
```

3. Abrí http://localhost:3000. En la consola tiene que decir `[bot] Conectado como ...` y `[anuncios] N cargados`.

## 4. Subirlo a internet

El bot tiene que estar prendido siempre. Si lo corrés en tu PC, la web y los anuncios se caen cuando la apagás. Opciones:

- **Railway** o **Render**: subís esta carpeta (por ejemplo, desde GitHub), cargás las variables del `.env` en el panel ("Variables" / "Environment") y como comando de inicio ponés `npm start`. Te dan una dirección pública para la web.
- **Un VPS** (Contabo, Hetzner, Oracle Free Tier…) con `npm start` corriendo con `pm2`.

**No subas el archivo `.env`** a GitHub (ya está en `.gitignore`).

### ¿La página en un lado y el bot en otro?

Si preferís alojar solo la página en Netlify, Vercel o GitHub Pages y el bot en Railway, abrí `web/index.html`, buscá `var API = '';` y poné la dirección del bot, por ejemplo:

```js
var API = 'https://avm-bot.up.railway.app';
```

## Comandos del bot

Escribí `/ayuda` en Discord para ver la lista. Resumen:

| Categoría | Comandos |
|---|---|
| General | `/ayuda` `/jugadores` `/servidor` `/usuario` `/avatar` `/normas` `/links` |
| Roblox | `/verificar` `/desvincular` `/roblox` |
| Moderación (solo staff) | `/warn` `/aislar` `/expulsar` `/banear` `/desbanear` `/historial` `/borrarsancion` `/limpiar` `/slowmode` |
| Staff | `/decir` `/encuesta` `/sorteo` |

Los comandos de moderación solo los ven quienes tienen el permiso de Discord correspondiente (Aislar miembros, Expulsar, Banear, etc.). Se puede ajustar en **Ajustes del servidor → Integraciones → AVM BOT**.

Además:
- **Estado en vivo**: el bot muestra "Jugando X en la ciudad" con la gente que hay en Roblox.
- **Bienvenida y rol automático**: con `BIENVENIDA_CHANNEL_ID` y/o `AUTOROL_ID`. Requiere activar **Server Members Intent** en el portal (Bot → Privileged Gateway Intents).
- **Sanciones**: quedan guardadas y se publican en `LOGS_CHANNEL_ID`.

### Que no se borren los datos en Railway

Las vinculaciones de Roblox, sanciones y sorteos se guardan en un archivo. En Railway hay que agregar un **Volume** al servicio (clic derecho en el servicio → **Attach Volume**) con *mount path* `/data`, y la variable `DATA_DIR=/data`. Sin eso, se borran en cada deploy.

### Permisos del bot

El rol del bot tiene que estar **por encima** de los roles que da (verificado, rol automático) y de los miembros que modera.

## Cómo publicar un anuncio

Escribí en el canal de anuncios como siempre. Se puede usar el formato de Discord: **negrita**, *cursiva*, `código`, títulos con `#`, listas con `-`, links e imágenes adjuntas. La web muestra los últimos 20 mensajes y se actualiza sola cada 2 minutos.
