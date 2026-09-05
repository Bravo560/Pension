/**
 * GET /.netlify/functions/config
 * Header: Authorization: Bearer <token de login.js>
 *
 * Expone parámetros del negocio que el frontend necesita para armar la interfaz (por ejemplo,
 * la lista de opciones de salario de Modalidad 40 en veces UMA). Solo expone valores que de
 * todos modos son públicos (la UMA la publica el INEGI); nunca expone llaves ni datos sensibles.
 * Se protege con sesión solo por consistencia con el resto de la app, no porque el dato en sí
 * sea secreto.
 */
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Método no permitido' };
  }

  const jwtSecret = process.env.JWT_SECRET;
  const auth = event.headers.authorization || event.headers.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Falta iniciar sesión.' }) };
  }
  try {
    jwt.verify(token, jwtSecret);
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: 'Sesión inválida o expirada, inicia sesión de nuevo.' }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      umaVigente: Number(process.env.UMA_VIGENTE || '117.31'),
      modalidad40Tasa: Number(process.env.MODALIDAD_40_TASA || '0.14438'),
      modalidad40UmaMin: 1,
      modalidad40UmaMax: 25,
    }),
  };
};
