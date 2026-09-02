/**
 * POST /.netlify/functions/create-preference
 * Body: { email: string }
 *
 * Crea una preferencia de pago de Mercado Pago (Checkout Pro) y devuelve la URL a la que
 * el navegador debe redirigir al usuario para pagar. Al aprobarse el pago, Mercado Pago
 * llamará a mp-webhook.js, que es donde realmente se genera el acceso (nunca confiar en
 * lo que pase en el navegador para dar acceso).
 */
const { MercadoPagoConfig, Preference } = require('mercadopago');

const PRECIO_SUSCRIPCION = Number(process.env.PRECIO_SUSCRIPCION_MXN || '199');
const SITE_URL = process.env.SITE_URL || 'http://localhost:8888';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método no permitido' };
  }

  let email;
  try {
    ({ email } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido.' }) };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Correo inválido.' }) };
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Falta configurar MP_ACCESS_TOKEN en el servidor.' }) };
  }

  try {
    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: [
          {
            title: 'Suscripción Calculadora de Pensión (15 días)',
            quantity: 1,
            unit_price: PRECIO_SUSCRIPCION,
            currency_id: 'MXN',
          },
        ],
        payer: { email },
        // Guardamos el correo en metadata para poder leerlo desde el webhook aunque
        // el pago se confirme minutos/horas después.
        metadata: { email },
        back_urls: {
          success: `${SITE_URL}/gracias.html`,
          failure: `${SITE_URL}/index.html?pago=fallido`,
          pending: `${SITE_URL}/index.html?pago=pendiente`,
        },
        auto_return: 'approved',
        notification_url: `${SITE_URL}/.netlify/functions/mp-webhook`,
      },
    });

    // Con credenciales de PRUEBA (Access Token que empieza con TEST-), Mercado Pago devuelve
    // dos URLs distintas: "init_point" (checkout de producción) y "sandbox_init_point"
    // (checkout de pruebas). Si usamos init_point mientras probamos, Mercado Pago rechaza el
    // pago con el error "una de las partes es de prueba" — por eso preferimos sandbox_init_point
    // cuando existe. Con credenciales de producción, Mercado Pago no manda un sandbox_init_point
    // utilizable, así que ahí se usa init_point normalmente.
    const checkoutUrl = result.sandbox_init_point || result.init_point;

    return {
      statusCode: 200,
      body: JSON.stringify({ init_point: checkoutUrl, preference_id: result.id }),
    };
  } catch (err) {
    console.error('create-preference error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'No se pudo crear la preferencia de pago.' }) };
  }
};
