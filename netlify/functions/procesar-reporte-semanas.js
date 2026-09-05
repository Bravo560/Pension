/**
 * POST /.netlify/functions/procesar-reporte-semanas
 * Header: Authorization: Bearer <token de login.js>
 * Body: { pdfBase64: string }
 *
 * Intenta leer automáticamente el PDF "Reporte de Semanas Cotizadas" del IMSS para extraer el
 * total de semanas cotizadas y, si el reporte incluye el detalle necesario, un estimado del
 * salario promedio de las últimas 250 semanas.
 *
 * OJO: el IMSS no publica una especificación oficial de este reporte para lectura automática,
 * y su formato varía según de dónde se descargue (IMSS Digital, ventanilla, etc.) y según el
 * historial laboral de cada persona. Por eso esto es "mejor esfuerzo": si no encuentra los
 * datos con confianza suficiente, regresa encontrado=false para ese campo y el frontend debe
 * dejar que la persona los capture manualmente (igual que ya funciona hoy). Nunca se debe
 * confiar ciegamente en lo extraído — el frontend SIEMPRE debe mostrarlo en campos editables
 * para que la persona lo revise antes de calcular.
 */
const jwt = require('jsonwebtoken');
const pdf = require('pdf-parse');
const { calcularSalarioPromedio } = require('../../lib/pension-calc');

const TAMAÑO_MAXIMO_BYTES = 8 * 1024 * 1024; // 8 MB
const VENTANA_DIAS = 1750; // 250 semanas * 7 días

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
  try {
    jwt.verify(token, jwtSecret);
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: 'Sesión inválida o expirada, inicia sesión de nuevo.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido.' }) };
  }
  if (!body.pdfBase64) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Falta el archivo PDF.' }) };
  }

  let buffer;
  try {
    buffer = Buffer.from(body.pdfBase64, 'base64');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'El archivo no se pudo leer. Intenta subirlo de nuevo.' }) };
  }
  if (buffer.length === 0 || buffer.length > TAMAÑO_MAXIMO_BYTES) {
    return { statusCode: 400, body: JSON.stringify({ error: 'El archivo debe ser un PDF de máximo 8 MB.' }) };
  }

  try {
    const data = await pdf(buffer);
    const resultado = extraerDatos(data.text || '');
    return { statusCode: 200, body: JSON.stringify(resultado) };
  } catch (err) {
    console.error('procesar-reporte-semanas error:', err);
    return {
      statusCode: 200,
      body: JSON.stringify({
        encontrado: false,
        semanasCotizadas: null,
        salarioDiarioPromedio: null,
        advertencias: ['No se pudo leer este PDF automáticamente. Captura tus datos manualmente abajo.'],
      }),
    };
  }
};

function extraerDatos(texto) {
  const advertencias = [];
  const limpio = texto.replace(/\s+/g, ' ');

  // Total de semanas: variantes vistas en distintos formatos del reporte del IMSS.
  const patronesSemanas = [
    /total\s+de\s+semanas\s+cotizadas\D{0,20}(\d{2,5})/i,
    /semanas\s+cotizadas\s+(?:vigentes\s+)?al?\D{0,30}(\d{2,5})/i,
    /semanas\s+cotizadas\D{0,20}(\d{2,5})/i,
  ];
  let semanasCotizadas = null;
  for (const re of patronesSemanas) {
    const m = limpio.match(re);
    if (m) {
      semanasCotizadas = Number(m[1]);
      break;
    }
  }

  // Periodos con salario base de cotización (SBC), si el reporte trae ese nivel de detalle.
  const periodos = extraerPeriodos(texto);
  let salarioPromedio = null;
  if (periodos.length > 0) {
    const ordenados = [...periodos].sort((a, b) => new Date(b.alta) - new Date(a.alta));
    const ventana = [];
    let diasAcumulados = 0;
    for (const p of ordenados) {
      if (diasAcumulados >= VENTANA_DIAS) break;
      ventana.push(p);
      diasAcumulados += (new Date(p.baja) - new Date(p.alta)) / (1000 * 60 * 60 * 24) + 1;
    }
    const r = calcularSalarioPromedio(ventana);
    if (r.totalDias > 0) salarioPromedio = r.salarioPromedio;
  }

  const encontradoSemanas = semanasCotizadas !== null && semanasCotizadas > 0;
  const encontradoSalario = salarioPromedio !== null && salarioPromedio > 0;

  if (!encontradoSemanas) {
    advertencias.push('No se encontró el total de semanas cotizadas en el PDF; captúralo manualmente.');
  }
  if (!encontradoSalario) {
    advertencias.push('No se encontró suficiente detalle de salarios por periodo en el PDF para estimar tu salario promedio de las últimas 250 semanas; captúralo manualmente (el reporte simple del IMSS no siempre incluye esta información — puede requerir el reporte con detalle de movimientos).');
  }

  return {
    encontrado: encontradoSemanas || encontradoSalario,
    semanasCotizadas: encontradoSemanas ? semanasCotizadas : null,
    salarioDiarioPromedio: encontradoSalario ? Number(salarioPromedio.toFixed(2)) : null,
    advertencias,
  };
}

/**
 * Busca en el texto líneas con dos fechas (alta/baja de un periodo de cotización) seguidas de
 * un monto en pesos (el salario base de cotización de ese periodo). El formato exacto varía
 * mucho entre reportes del IMSS, así que esto es deliberadamente flexible ("best effort").
 */
function extraerPeriodos(texto) {
  const periodos = [];
  const re = /(\d{2}\/\d{2}\/\d{4})\D{1,40}(\d{2}\/\d{2}\/\d{4})\D{1,40}\$?\s?([\d,]+\.\d{2})/g;
  let m;
  while ((m = re.exec(texto)) !== null) {
    const [, altaStr, bajaStr, montoStr] = m;
    const alta = parseFechaMx(altaStr);
    const baja = parseFechaMx(bajaStr);
    const sbcDiario = Number(montoStr.replace(/,/g, ''));
    if (alta && baja && baja >= alta && sbcDiario > 0 && sbcDiario < 10000) {
      periodos.push({ alta, baja, sbcDiario });
    }
  }
  return periodos;
}

function parseFechaMx(str) {
  const [d, m, y] = str.split('/').map(Number);
  if (!d || !m || !y) return null;
  return new Date(Date.UTC(y, m - 1, d));
}
