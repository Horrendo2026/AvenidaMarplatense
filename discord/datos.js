// Datos que el bot tiene que recordar (vinculaciones de Roblox, sanciones, sorteos).
// Se guardan en un archivo JSON. En Railway hay que montar un Volume en /data
// y poner DATA_DIR=/data, si no se borran en cada deploy.
const fs = require('fs');
const path = require('path');

const DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const ARCHIVO = path.join(DIR, 'datos.json');

const datos = { vinculos: {}, sanciones: [], sorteos: [], sigId: 1 };

try {
  fs.mkdirSync(DIR, { recursive: true });
  Object.assign(datos, JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')));
  console.log(`[datos] Cargados desde ${ARCHIVO}`);
} catch (err) {
  if (err.code !== 'ENOENT') console.error('[datos] No se pudo leer el archivo:', err.message);
}

function guardar() {
  try {
    const tmp = ARCHIVO + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(datos, null, 2));
    fs.renameSync(tmp, ARCHIVO); // así nunca queda un archivo a medio escribir
  } catch (err) {
    console.error('[datos] No se pudo guardar:', err.message);
  }
}

module.exports = { datos, guardar };
