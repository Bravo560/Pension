/**
 * POST /.netlify/functions/mp-webhook
 *
 * Mercado Pago llama a esta URL cuando cambia el estado de un pago. Aquí es donde
 * REALMENTE se otorga el acceso: se verifica que el pago esté "approved" consultando
 * la API de Mercado Pago (nunca confiar en el payload del webhook por sí solo), y
 * entonces se genera el usuario/contraseña, se guarda en Supabase con 15 días de
 * vigencia, y se envía el correo de bienvenida.
 *
 * Configura esta URL en tu cuenta de Mercado Pago > Tu negocio > Configuración > Webhooks,
 * o simplemente déjala como notification_url en create-preference.js (ya está incluida ahí).
 */
const crypto = require('crypto');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { getSupabase } = require('../../lib/db');
const { generarUsername, generarPassword, hashPassword } = require('../../lib/credentials');
const { enviarCorreo, correoBienvenida } = require('../../lib/email');

const DIAS_VIGENCIA = 15;
const SITE_URL = process.env.SITE_URL || 'http://localhost:8888';

/**
 * Valida la firma del webhook (header x-signature) según la documentación de Mercado Pago.
 * Si no configuraste MP_WEBHOOK_SECRET todavía, se omite la validación (solo para pruebas
 * iniciales) — en producción SIEMPRE debe estar configurado.
 * https://www.mercadopago.com.mx/developers/es/docs/your-integrations/notifications/webhooks
 */
function firmaValida(headers, dataId) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('MP_WEBHOOK_SECRET no configurado: se omite la validación de firma (solo aceptable en pruebas).');
    return true;
  }
  const xSignature = headers['x-signature'] || headers['X-Signature'];
  const xRequestId = headers['x-request-id'] || headers['X-Request-Id'];
  if (!xSignature || !xRequestId) return false;

  const partes = Object.fromEntries(xSignature.split(',').map((p) => p.trim().split('=')));
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return hmac === v1;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método no permitido' };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'JSON inválido' };
  }

  // Mercado Pago envía distintos formatos según el evento; nos interesa "payment".
  const tipo = body.type || event.queryStringParameters?.topic;
  const dataId = body.data?.id || event.queryStringParameters?.id;
  if (tipo !== 'payment' || !dataId) {
    // Otros tipos de evento (merchant_order, etc.) los ignoramos, pero respondemos 200
    // para que Mercado Pago no siga reintentando.
    return { statusCode: 200, body: 'ignorado' };
  }

  if (!firmaValida(event.headers || {}, dataId)) {
    console.error('Firma de webhook inválida, se rechaza la notificación.');
    return { statusCode: 401, body: 'firma inválida' };
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return { statusCode: 500, body: 'Falta MP_ACCESS_TOKEN' };
  }

  try {
    const client = new MercadoPagoConfig({ accessToken });
    const payment = await new Payment(client).get({ id: dataId });

    if (payment.status !== 'approved') {
      // pending, rejected, in_process, etc.: no otorgamos acceso todavía.
      return { statusCode: 200, body: `pago en estado ${payment.status}, sin acción` };
    }

    const email = payment.metadata?.email || payment.payer?.email;
    if (!email) {
      console.error('Pago aprobado sin correo asociado, no se puede otorgar acceso automáticamente:', dataId);
      return { statusCode: 200, body: 'aprobado sin correo, revisar manualmente' };
    }

    const supabase = getSupabase();

    // Evita duplicar el acceso si Mercado Pago reintenta el mismo webhook.
    const { data: existente } = await supabase
      .from('subscribers')
      .select('id')
      .eq('mp_payment_id', String(payment.id))
      .maybeSingle();
    if (existente) {
      return { statusCode: 200, body: 'ya procesado' };
    }

    const username = generarUsername(email);
    const passwordPlano = generarPassword();
    const passwordHash = await hashPassword(passwordPlano);
    const expiresAt = new Date(Date.now() + DIAS_VIGENCIA * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from('subscribers').insert({
      email,
      username,
      password_hash: passwordHash,
      expires_at: expiresAt,
      mp_payment_id: String(payment.id),
    });
    if (error) throw error;

    const { subject, html } = correoBienvenida({
      username,
      password: passwordPlano,
      expiresAt,
      loginUrl: `${SITE_URL}/login.html`,
    });
    await enviarCorreo({ to: email, subject, html });

    return { statusCode: 200, body: 'acceso creado y correo enviado' };
  } catch (err) {
    console.error('mp-webhook error:', err);

    // El botón "Simular notificaciones" del panel de Mercado Pago siempre manda un id de pago
    // de prueba (normalmente "123456") que NO existe de verdad en tu cuenta. Al buscarlo en la
    // API, Mercado Pago responde "no encontrado" — eso no es un error real de tu servidor (con
    // un pago real, el id sí existe y esta búsqueda funciona sin problema), así que respondemos
    // 200 en ese caso para no reportarlo como falla.
    const pareceNoEncontrado =
      err?.status === 404 ||
      /404|not[_ ]?found/i.test(String(err?.message || '')) ||
      (Array.isArray(err?.cause) && err.cause.some((c) => /not[_ ]?found/i.test(String(c?.code || c?.description || ''))));
    if (pareceNoEncontrado) {
      return { statusCode: 200, body: 'notificación de prueba (el pago no existe en tu cuenta), sin acción' };
    }

    // 500 para que Mercado Pago reintente la notificación más tarde (esto sí es un error real).
    return { statusCode: 500, body: 'error interno' };
  }
};
