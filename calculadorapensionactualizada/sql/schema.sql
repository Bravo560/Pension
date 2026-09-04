-- Esquema de base de datos para la app de Calculadora de Pensión.
-- Ejecutar este script en el "SQL Editor" de tu proyecto de Supabase (https://supabase.com).

create table if not exists subscribers (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  username          text not null unique,
  password_hash     text not null,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  mp_payment_id     text,               -- id del pago en Mercado Pago, para trazabilidad
  mp_preference_id  text,               -- id de la preferencia de pago creada al iniciar el checkout
  warned_at         timestamptz,        -- cuándo se envió el correo de "tu acceso está por vencer"
  last_login_at     timestamptz
);

-- Guarda cada cálculo que un suscriptor realiza (opcional, útil para soporte/auditoría).
create table if not exists calculations (
  id              uuid primary key default gen_random_uuid(),
  subscriber_id   uuid references subscribers(id) on delete cascade,
  created_at      timestamptz not null default now(),
  input           jsonb not null,
  resultado       jsonb not null
);

create index if not exists idx_subscribers_expires_at on subscribers(expires_at);
create index if not exists idx_calculations_subscriber on calculations(subscriber_id);

-- Nota de seguridad: este esquema asume que SOLO las Netlify Functions (con la "service role key"
-- de Supabase, nunca expuesta al navegador) leen y escriben estas tablas. Si en el futuro accedes
-- a Supabase directamente desde el navegador, activa Row Level Security (RLS) y define políticas
-- antes de hacerlo.
