/**
 * Generación de credenciales (usuario y contraseña) tras un pago aprobado, y utilidades de hash.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const ALFABETO_SIN_AMBIGUOS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin O/0, I/1, para evitar confusiones al leer el correo

function randomString(length, alfabeto = ALFABETO_SIN_AMBIGUOS) {
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    out += alfabeto[bytes[i] % alfabeto.length];
  }
  return out;
}

/** Genera un nombre de usuario legible a partir del correo, con sufijo aleatorio para evitar choques. */
function generarUsername(email) {
  const local = (email.split('@')[0] || 'usuario').toLowerCase().replace(/[^a-z0-9]/g, '');
  const sufijo = randomString(4, '23456789');
  return `${local.slice(0, 12)}${sufijo}`;
}

/** Genera una contraseña temporal de 10 caracteres, fácil de transcribir desde un correo. */
function generarPassword() {
  return randomString(10);
}

async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = { generarUsername, generarPassword, hashPassword, verifyPassword };
