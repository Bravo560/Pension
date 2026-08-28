/**
 * Cliente de Supabase, compartido por todas las Netlify Functions.
 * Usa la SERVICE ROLE KEY (nunca la anon key) porque estas funciones corren en el servidor
 * y necesitan poder leer/escribir la tabla subscribers sin restricciones de RLS.
 */
const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan las variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, key);
}

module.exports = { getSupabase };
