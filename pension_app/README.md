# Calculadora de Pensión Ley 73 — con suscripción y pago

Esta aplicación permite que una persona pague una suscripción con Mercado Pago y reciba
automáticamente por correo un usuario y contraseña válidos por 15 días para consultar su
proyección de pensión (Ley 73 IMSS: Vejez y Cesantía en Edad Avanzada).

La lógica de cálculo (`lib/pension-calc.js`) está basada en tu archivo Excel original, con las
correcciones descritas en la auditoría (`auditoria-calculadora-pension.md`, en tu proyecto de
Claude): UMA actualizada, la ayuda por hijos corregida, y la verificación del tope legal del
100% del salario promedio agregada.

Además incluye dos funciones adicionales en la calculadora:

- **Subir el Reporte de Semanas Cotizadas del IMSS (PDF, opcional):** la persona puede subir su
  reporte y la app intenta leer automáticamente sus semanas cotizadas y su salario promedio de
  las últimas 250 semanas, dejándolos precargados (pero siempre editables) en el formulario. El
  formato de este reporte no está estandarizado por el IMSS para lectura automática, así que es
  un "mejor esfuerzo": si no logra leer un dato, la persona simplemente lo captura a mano, como
  ya funcionaba antes.
- **Simulador de Modalidad 40:** si la persona activa la casilla y captura el salario diario y las
  semanas que planea cotizar en Modalidad 40, la app muestra una comparación estimada entre su
  pensión actual y la pensión proyectada con Modalidad 40, más el costo mensual y total estimado.
  Es una aproximación pensada para ayudar a decidir si vale la pena — no un cálculo oficial (los
  detalles y advertencias de esta estimación están documentados en `lib/pension-calc.js`, función
  `simularModalidad40`).

## Qué necesitas antes de empezar (todo gratis, ~30-45 min la primera vez)

No necesitas saber programar para configurar esto — son formularios web. Sigue el orden:

### 1. Crear cuenta en Supabase (base de datos)

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta gratis.
2. Crea un "New Project" (elige una contraseña de base de datos y guárdala en un lugar seguro).
3. Cuando el proyecto esté listo, ve a **SQL Editor** (menú izquierdo) → **New query**.
4. Copia y pega todo el contenido del archivo `sql/schema.sql` de este proyecto, y dale **Run**.
5. Ve a **Project Settings > API**. Vas a necesitar dos valores más adelante:
   - **Project URL** → esta es tu `SUPABASE_URL`.
   - **service_role key** (no la "anon" key) → esta es tu `SUPABASE_SERVICE_ROLE_KEY`. Es secreta, no la compartas.

### 2. Crear cuenta en Resend (envío de correos)

1. Entra a [resend.com](https://resend.com) y crea una cuenta gratis (100 correos/día, 3,000/mes gratis).
2. Ve a **API Keys** → **Create API Key** → cópiala, esta es tu `RESEND_API_KEY`.
3. Para probar rápido puedes dejar `EMAIL_FROM` como `onboarding@resend.dev` (Resend lo permite para pruebas).
   Cuando quieras usar tu propio dominio (ej. `no-responder@tudominio.com`), sigue la guía de Resend
   para "verificar un dominio" (agregar unos registros DNS) — no es obligatorio para empezar.

### 3. Configurar Mercado Pago

1. Entra a tu cuenta de [Mercado Pago Developers](https://www.mercadopago.com.mx/developers/panel).
2. En **Tus integraciones**, crea una aplicación (o usa una existente).
3. Copia el **Access Token de producción** → este es tu `MP_ACCESS_TOKEN`. (Usa el de "pruebas"
   mientras validas que todo funcione, y cámbialo al de producción cuando quieras cobrar de verdad.)
4. En **Webhooks**, configura la URL: `https://TU-SITIO.netlify.app/.netlify/functions/mp-webhook`
   (la reemplazas cuando tengas tu URL real de Netlify en el paso 5). Copia la **clave secreta**
   que te muestra ahí → esta es tu `MP_WEBHOOK_SECRET`.

### 4. Generar tu propia "llave" de sesión (JWT_SECRET)

Es una cadena de texto larga y aleatoria que solo tu servidor conoce, para firmar las sesiones
de inicio de sesión. Puedes generarla en [randomkeygen.com](https://randomkeygen.com) (usa una
de la sección "CodeIgniter Encryption Keys") o pedirle a Claude que te genere una.

### 5. Desplegar en Netlify

No necesitas usar la línea de comandos ni instalar "git" en tu computadora — todo esto se hace
arrastrando archivos en el navegador.

#### 5.1. Prepara los archivos en tu computadora

1. Descarga el archivo `calculadora-pension-app.zip` que te envié en el chat.
2. Descomprímelo (doble clic en Windows, o clic derecho > "Extraer todo" / en Mac doble clic).
   Te va a quedar una carpeta llamada `pension_app` con todo el proyecto adentro.

#### 5.2. Crea el repositorio en GitHub (aquí vive tu código; Netlify se conecta a él)

1. Entra a [github.com](https://github.com) y crea una cuenta gratis si no tienes una.
2. Arriba a la derecha, clic en el ícono **"+"** > **New repository**.
3. Ponle un nombre, por ejemplo `calculadora-pension`. Déjalo como **Private** (privado, para que
   nadie más vea tu código). NO marques la opción de agregar un README (ya tenemos uno). Clic en
   **Create repository**.
4. En la pantalla que aparece, busca el enlace que dice **"uploading an existing file"**
   (a veces aparece como "upload an existing file"). Haz clic ahí.
5. Abre la carpeta `pension_app` que descomprimiste, selecciona **todo** su contenido (todos los
   archivos y carpetas de adentro: `public`, `netlify`, `lib`, `sql`, `test`, `netlify.toml`,
   `package.json`, `README.md`, `.env.example`, `.gitignore` — no la carpeta `pension_app` en sí,
   sino lo que hay DENTRO de ella) y arrástralo a la página de GitHub.
6. Espera a que termine de subir (la barra de progreso), escribe cualquier mensaje abajo (por
   ejemplo "Primera versión") y clic en **Commit changes**.

#### 5.3. Conecta ese repositorio con Netlify

1. Entra a [netlify.com](https://netlify.com) y crea una cuenta gratis — lo más fácil es elegir
   **"Sign up with GitHub"** para que queden conectados automáticamente.
2. En tu panel de Netlify, clic en **Add new site** (o **"Add new project"**) > **Import an existing project**.
3. Elige **Deploy with GitHub**. Te va a pedir autorizar el acceso — acéptalo, y si te pregunta a
   qué repositorios dar acceso, elige el repositorio `calculadora-pension` que acabas de crear (o
   "All repositories" si prefieres).
4. Netlify va a mostrarte una pantalla de configuración. Revisa que diga:
   - **Base directory**: vacío (déjalo en blanco)
   - **Build command**: vacío (déjalo en blanco, no necesitamos este paso)
   - **Publish directory**: `public`
   Estos valores ya están definidos en el archivo `netlify.toml` del proyecto, así que Netlify
   normalmente los detecta solo. Si ves campos distintos, corrígelos como arriba.
5. **Todavía no le des clic a "Deploy"** — antes, baja hasta **"Add environment variables"** (o
   entra después a **Site configuration > Environment variables** una vez creado el sitio) y agrega,
   una por una, TODAS las variables que están en el archivo `.env.example`, con tus valores reales
   (los que fuiste guardando en los pasos 1 a 4 de esta guía). Por ahora, en `SITE_URL` pon
   cualquier cosa provisional como `https://pendiente.netlify.app` — la corregiremos en el
   siguiente paso en cuanto Netlify te dé tu URL real.
6. Clic en **Deploy** (o **Deploy site**). Espera 1-2 minutos mientras Netlify instala todo.

#### 5.4. Ajusta la URL final

1. Cuando termine, Netlify te muestra tu URL real, algo como `https://nombre-al-azar-123.netlify.app`
   (puedes cambiarle el nombre en **Site configuration > General > Site details > Change site name**
   para que sea algo como `https://calculadora-pension-tuempresa.netlify.app`).
2. Copia esa URL y:
   - Ve a **Site configuration > Environment variables**, edita `SITE_URL` y pon esa URL exacta
     (sin `/` al final).
   - Regresa a Mercado Pago Developers > Webhooks y actualiza la URL configurada ahí por:
     `https://TU-URL-REAL.netlify.app/.netlify/functions/mp-webhook`
3. Ve a la pestaña **Deploys** de tu sitio en Netlify y clic en **Trigger deploy > Deploy site**
   para que la nueva URL quede aplicada de verdad (Netlify no relee las variables de entorno
   automáticamente hasta que vuelves a desplegar).

A partir de aquí, cada vez que quieras actualizar el código, subes los archivos nuevos a ese mismo
repositorio de GitHub (arrastrándolos igual que en el paso 5.2, GitHub los reemplaza solo) y
Netlify vuelve a desplegar automáticamente en cuanto detecta el cambio.

## Cómo probarlo de principio a fin

1. Usa el Access Token de **pruebas** de Mercado Pago (no el de producción) mientras validas el flujo.
2. Entra a tu sitio, escribe un correo y da clic en "Suscribirme y pagar".
3. Mercado Pago te llevará a un checkout de prueba — usa una de sus
   [tarjetas de prueba](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards).
4. Si el pago se aprueba, en unos segundos deberías recibir el correo con tu usuario y contraseña
   (revisa spam si usaste `onboarding@resend.dev`).
5. Inicia sesión en `/login.html` y prueba la calculadora con datos de ejemplo:
   - Semanas cotizadas: `1726`
   - Salario diario promedio: `911.06`
   - Cesantía, edad 60, con esposa(o), sin hijos ni padres
   - El resultado esperado es una pensión mensual estimada de **$19,048** (antes del ajuste
     por tope, que en este caso no aplica).
6. Cuando todo funcione bien, cambia `MP_ACCESS_TOKEN` al de producción para cobrar de verdad.

## Estructura del proyecto

```
public/                    → páginas web (landing, login, calculadora)
netlify/functions/         → backend (Netlify Functions, Node.js)
  create-preference.js     → inicia el pago con Mercado Pago
  mp-webhook.js             → confirma el pago y genera el usuario/contraseña
  login.js                  → valida usuario/contraseña y vigencia
  calcular-pension.js       → hace el cálculo (requiere sesión válida)
  send-warnings.js          → correo automático unos días antes de vencer (corre solo, 1 vez al día)
lib/                        → lógica compartida (cálculo, credenciales, base de datos, correos)
sql/schema.sql               → estructura de la base de datos (Supabase)
test/pension-calc.test.js    → prueba automática que valida el cálculo contra el Excel auditado
```

## Actualizar la UMA y la tasa de Modalidad 40 cada año

El valor de la UMA lo publica el INEGI cada año (normalmente a finales de enero), y entra en
vigor el 1 de febrero. Cuando cambie, solo tienes que actualizar la variable de entorno
`UMA_VIGENTE` en Netlify (Site settings > Environment variables) — no necesitas tocar código.

La tasa de cuota de Modalidad 40 (variable `MODALIDAD_40_TASA`) también sube cada año, por una
reforma que la va subiendo gradualmente hasta 2030. Verifica el valor vigente cada enero en el
sitio del IMSS y actualiza esa misma variable de entorno.

## Preguntas legales pendientes de confirmar con un especialista

La auditoría (ver el documento en tu proyecto de Claude) señala un punto que vale la pena
confirmar con un abogado en materia de pensiones o directamente con el IMSS antes de operar
esto de cara al público: si el incremento del 11% (Artículo Décimo Cuarto Transitorio) aplica
de forma universal a todos los pensionados Ley 73, o si tiene alguna condición de elegibilidad
adicional. La app actualmente lo aplica de forma universal, como hacía tu Excel original.
