/**
 * Función programada (scheduled function) — corre una vez al día.
 * Busca suscriptores cuya vigencia de 15 días vence en los próximos WARNING_DAYS_BEFORE días
 * y que todavía no recibieron el aviso, y les envía un correo recordándoles renovar.
 *
 * Netlify la ejecuta sola según el "schedule" (cron) definido en netlify.toml — no necesita
 * que nadie la llame manualmente.
 */
const { getSupabase } = require('../../lib/db');
const { enviarCorreo, correoAvisoVencimiento } = require('../../lib/email');

const WARNING_DAYS_BEFORE = Number(process.env.WARNING_DAYS_BEFORE || '3');
const SITE_URL = process.env.SITE_URL || 'http://localhost:8888';

exports.handler = async () => {
  const supabase = getSupabase();
  const ahora = new Date();
  const limite = new Date(ahora.getTime() + WARNING_DAYS_BEFORE * 24 * 60 * 60 * 1000);

  const { data: porAvisar, error } = await supabase
    .from('subscribers')
    .select('id, email, username, expires_at')
    .is('warned_at', null)
    .gt('expires_at', ahora.toISOString())
    .lte('expires_at', limite.toISOString());

  if (error) {
    console.error('send-warnings: error consultando suscriptores:', error);
    return { statusCode: 500, body: 'error' };
  }

  let enviados = 0;
  for (const s of porAvisar || []) {
    try {
      const diasRestantes = Math.max(1, Math.ceil((new Date(s.expires_at) - ahora) / (24 * 60 * 60 * 1000)));
      const { subject, html } = correoAvisoVencimiento({
        username: s.username,
        expiresAt: s.expires_at,
        loginUrl: `${SITE_URL}/login.html`,
        diasRestantes,
      });
      await enviarCorreo({ to: s.email, subject, html });
      await supabase.from('subscribers').update({ warned_at: new Date().toISOString() }).eq('id', s.id);
      enviados++;
    } catch (err) {
      console.error(`send-warnings: no se pudo avisar a ${s.email}:`, err);
    }
  }

  console.log(`send-warnings: ${enviados} correo(s) de aviso enviados.`);
  return { statusCode: 200, body: `${enviados} avisos enviados` };
};
