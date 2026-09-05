/**
 * Envío de correos transaccionales vía Resend (https://resend.com — plan gratis: 3,000
 * correos/mes, 100/día, más que suficiente para empezar).
 */
const RESEND_API_URL = 'https://api.resend.com/emails';

async function enviarCorreo({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'Calculadora de Pensión <onboarding@resend.dev>';
  if (!apiKey) {
    throw new Error('Falta la variable de entorno RESEND_API_KEY.');
  }
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Resend respondió ${res.status}: ${detalle}`);
  }
  return res.json();
}

function correoBienvenida({ username, password, expiresAt, loginUrl }) {
  const fecha = new Date(expiresAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  return {
    subject: 'Tu acceso a la Calculadora de Pensión',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
        <h2>¡Gracias por tu suscripción!</h2>
        <p>Ya puedes consultar tu proyección de pensión. Estos son tus datos de acceso:</p>
        <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding:8px; background:#f2f2f2;"><strong>Usuario</strong></td><td style="padding:8px; background:#f2f2f2;">${username}</td></tr>
          <tr><td style="padding:8px;"><strong>Contraseña</strong></td><td style="padding:8px;">${password}</td></tr>
        </table>
        <p>Tu acceso es válido hasta el <strong>${fecha}</strong> (15 días a partir de hoy).</p>
        <p><a href="${loginUrl}" style="display:inline-block; background:#0a5c36; color:#fff; padding:10px 18px; border-radius:6px; text-decoration:none;">Consultar mi proyección</a></p>
        <p style="color:#777; font-size:12px; margin-top:24px;">Por seguridad, te recomendamos no compartir estos datos. Si no reconoces esta suscripción, ignora este correo.</p>
      </div>
    `,
  };
}

function correoAvisoVencimiento({ username, expiresAt, loginUrl, diasRestantes }) {
  const fecha = new Date(expiresAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  return {
    subject: `Tu acceso vence en ${diasRestantes} día(s)`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
        <h2>Tu acceso está por vencer</h2>
        <p>Hola, tu usuario <strong>${username}</strong> perderá acceso a la Calculadora de Pensión el <strong>${fecha}</strong>.</p>
        <p>Si quieres seguir consultando tu proyección después de esa fecha, renueva tu suscripción antes de que venza.</p>
        <p><a href="${loginUrl}" style="display:inline-block; background:#0a5c36; color:#fff; padding:10px 18px; border-radius:6px; text-decoration:none;">Renovar / Consultar</a></p>
      </div>
    `,
  };
}

module.exports = { enviarCorreo, correoBienvenida, correoAvisoVencimiento };
