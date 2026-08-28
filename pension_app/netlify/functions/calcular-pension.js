/**
 * POST /.netlify/functions/calcular-pension
 * Header: Authorization: Bearer <token de login.js>
 * Body: ver /lib/pension-calc.js -> calcularPension()
 *
 * Requiere sesión válida (token emitido por login.js) y que la suscripción no haya vencido.
 * Guarda cada cálculo en la tabla "calculations" para trazabilidad/soporte.
 */
const jwt = require('jsonwebtoken');
const { getSupabase } = require('../../lib/db');
const { calcularPension } = require('../../lib/pension-calc');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método no permitido' };
  }

  const jwtSecret = process.env.JWT_SECRET;
  const auth = event.headers.authorization || event.headers.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Falta iniciar sesión.' }) };
  }

  let payload;
  try {
    payload = jwt.verify(token, jwtSecret);
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: 'Sesión inválida o expirada, inicia sesión de nuevo.' }) };
  }

  const supabase = getSupabase();

  // Revalida vigencia de 15 días contra la base de datos (no solo el token de sesión de 2h).
  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('id, expires_at')
    .eq('id', payload.sub)
    .maybeSingle();
  if (!subscriber || new Date(subscriber.expires_at) < new Date()) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Tu acceso venció. Renueva tu suscripción.' }) };
  }

  let input;
  try {
    input = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido.' }) };
  }

  try {
    // La UMA es un parámetro del negocio, no algo que el usuario deba capturar: se toma del
    // servidor (variable de entorno UMA_VIGENTE) salvo que el body la traiga explícitamente
    // (por ejemplo, para simular años futuros con un valor distinto).
    const umaVigente = input.umaVigente || Number(process.env.UMA_VIGENTE || '117.31');
    const resultado = calcularPension({ ...input, umaVigente });
    await supabase.from('calculations').insert({ subscriber_id: subscriber.id, input, resultado });
    return { statusCode: 200, body: JSON.stringify(resultado) };
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: err.message }) };
  }
};
