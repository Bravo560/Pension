/**
 * POST /.netlify/functions/login
 * Body: { username, password }
 *
 * Valida credenciales y vigencia (15 días). Si son válidas, devuelve un token de sesión
 * simple (JWT firmado) que el frontend guarda y reenvía en cada llamada a calcular-pension.
 */
const jwt = require('jsonwebtoken');
const { getSupabase } = require('../../lib/db');
const { verifyPassword } = require('../../lib/credentials');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método no permitido' };
  }

  let username, password;
  try {
    ({ username, password } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido.' }) };
  }
  if (!username || !password) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Usuario y contraseña son obligatorios.' }) };
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Falta configurar JWT_SECRET en el servidor.' }) };
  }

  try {
    const supabase = getSupabase();
    const { data: subscriber, error } = await supabase
      .from('subscribers')
      .select('id, username, password_hash, expires_at')
      .eq('username', username)
      .maybeSingle();

    if (error) throw error;
    if (!subscriber) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Usuario o contraseña incorrectos.' }) };
    }

    const passwordOk = await verifyPassword(password, subscriber.password_hash);
    if (!passwordOk) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Usuario o contraseña incorrectos.' }) };
    }

    if (new Date(subscriber.expires_at) < new Date()) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Tu acceso venció. Renueva tu suscripción para volver a consultar.' }) };
    }

    await supabase.from('subscribers').update({ last_login_at: new Date().toISOString() }).eq('id', subscriber.id);

    const token = jwt.sign(
      { sub: subscriber.id, username: subscriber.username },
      jwtSecret,
      { expiresIn: '2h' } // sesión corta; el usuario vuelve a iniciar sesión cuando la necesite, dentro de sus 15 días
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ token, expiresAt: subscriber.expires_at }),
    };
  } catch (err) {
    console.error('login error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Error interno.' }) };
  }
};
