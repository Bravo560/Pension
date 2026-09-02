/**
 * Motor de cálculo — Pensión de Vejez y Cesantía en Edad Avanzada, Ley del Seguro Social 1973 (IMSS).
 *
 * Traducido y corregido a partir del archivo Excel "Calculadoradepension2023" del cliente, tras una
 * auditoría de fórmulas (ver /auditoria-calculadora-pension.md en el proyecto de Claude). Cambios
 * respecto al Excel original:
 *   1. La UMA es un parámetro (no una constante fija) — debe actualizarse cada año.
 *   2. La ayuda por hijos SÍ se calcula: 10% de la cuantía anual de la pensión POR CADA hijo
 *      menor de 16 años (o hasta 25 si estudia), multiplicado por el número de hijos capturado.
 *      (En el Excel original esta celda estaba hardcodeada en 0 y desconectada del campo de captura.)
 *   3. Se agrega la verificación del tope legal del Art. 168 LSS: pensión + asignaciones no puede
 *      exceder el 100% del salario diario promedio anualizado usado para el cálculo.
 *
 * Funciona tanto en Node (Netlify Functions, vía require) como en el navegador (vía <script>),
 * por eso usa el patrón UMD al final del archivo.
 *
 * Fuentes: Arts. 167, 168 y 172 de la Ley del Seguro Social (texto vigente hasta el régimen de
 * transición 1997, aplicable a asegurados que cotizaron bajo la ley de 1973); Artículo Décimo
 * Cuarto Transitorio, inciso b), del Decreto que reforma la LSS (DOF 20-dic-2001, en vigor desde
 * el 01-may-2004): incremento del 11% a la cuantía de la pensión.
 */

// ---------------------------------------------------------------------------
// Tabla del Art. 167: Cuantía Básica e Incremento Anual, por rango de veces UMA
// (equivalente a "veces el salario mínimo" desde el Decreto de desindexación de 2016,
// que ordena leer toda referencia legal a "salario mínimo" como unidad de cálculo como "UMA").
// Cada fila: [desde, hasta-o-null, cuantiaBasica, incrementoAnual]. La última fila (hasta=null)
// aplica a "6.01 veces UMA en adelante".
// ---------------------------------------------------------------------------
const TABLA_CUANTIA_BASICA = [
  [0.00, 1.00, 0.8000, 0.00563],
  [1.01, 1.25, 0.7711, 0.00814],
  [1.26, 1.50, 0.5518, 0.01178],
  [1.51, 1.75, 0.4923, 0.01430],
  [1.76, 2.00, 0.4267, 0.01615],
  [2.01, 2.25, 0.3765, 0.01756],
  [2.26, 2.50, 0.3368, 0.01868],
  [2.51, 2.75, 0.3048, 0.01958],
  [2.76, 3.00, 0.2783, 0.02033],
  [3.01, 3.25, 0.2560, 0.02096],
  [3.26, 3.50, 0.2370, 0.02149],
  [3.51, 3.75, 0.2207, 0.02195],
  [3.76, 4.00, 0.2065, 0.02235],
  [4.01, 4.25, 0.1939, 0.02271],
  [4.26, 4.50, 0.1829, 0.02302],
  [4.51, 4.75, 0.1730, 0.02330],
  [4.76, 5.00, 0.1641, 0.02355],
  [5.01, 5.25, 0.1561, 0.02377],
  [5.26, 5.50, 0.1488, 0.02398],
  [5.51, 5.75, 0.1422, 0.02416],
  [5.76, 6.00, 0.1362, 0.02433],
  [6.01, null, 0.1300, 0.02450],
];

// Art. 172: porcentaje de la pensión de vejez que corresponde según la edad del asegurado
// al momento de solicitar la pensión por Cesantía en Edad Avanzada (60 a 64 años).
// A los 65 años corresponde Pensión de Vejez (100%), no Cesantía.
const TABLA_PORCENTAJE_EDAD_CESANTIA = { 60: 0.75, 61: 0.80, 62: 0.85, 63: 0.90, 64: 0.95, 65: 1.00 };

// Conversión de semanas "residuo" (después de contar años completos de 52 semanas más allá
// de las primeras 500) a fracción de año adicional reconocida.
// 0-12 semanas = 0%, 13-26 semanas = 50%, 27+ semanas = 100%.
const TABLA_SEMANAS_RESIDUO = [
  [0, 0.0],
  [13, 0.5],
  [27, 1.0],
];

const SEMANAS_MINIMAS_BASE = 500; // primeras 500 semanas: solo generan cuantía básica, sin incremento
const SEMANAS_POR_ANIO = 52;
const DIAS_ANUAL = 365;
const INCREMENTO_ARTICULO_DECIMO_CUARTO = 1.11; // +11%, vigente desde el 01-may-2004
const PCT_ESPOSA = 0.15;
const PCT_HIJO = 0.10; // por cada hijo menor de 16 años, o hasta 25 si estudia
const PCT_PADRES = 0.20; // solo a falta de esposa(o) e hijos
const PCT_SOLEDAD = 0.15; // solo si no hay esposa(o), hijos ni padres asignados

// --- Modalidad 40 (Continuación Voluntaria en el Régimen Obligatorio) ---
// El salario diario con el que alguien se da de alta en Modalidad 40 debe estar entre 1 y 25
// veces la UMA vigente (tope fijado por la ley del IMSS).
const MODALIDAD_40_UMA_MIN = 1;
const MODALIDAD_40_UMA_MAX = 25;
// Tasa de cuota mensual vigente en 2026 (crece de forma gradual cada año desde 11.166% en 2023
// hasta 18.8% en 2030, por la reforma a la Ley del Seguro Social). ACTUALIZAR CADA ENERO junto
// con la UMA — puede sobreescribirse por variable de entorno MODALIDAD_40_TASA o por parámetro.
const MODALIDAD_40_TASA_DEFAULT = 0.14438;
const MODALIDAD_40_DIAS_MES = 30.4; // aproximación de días/mes que usa el IMSS para cuotas
const MODALIDAD_40_VENTANA_SEMANAS = 250; // misma ventana que "salario promedio de últimas 250 semanas"

/** Búsqueda tipo VLOOKUP aproximado: la fila cuyo "desde" es el mayor <= valor. */
function buscarAproximado(tabla, valor, colDesde = 0) {
  let fila = tabla[0];
  for (const f of tabla) {
    if (f[colDesde] <= valor) fila = f;
    else break;
  }
  return fila;
}

/**
 * Calcula el salario diario promedio de las últimas 250 semanas (o el rango que se capture)
 * a partir del historial de periodos de cotización, replicando la hoja "Salario Promedio 250 sem".
 * @param {Array<{alta: string|Date, baja: string|Date, sbcDiario: number}>} periodos
 * @returns {{ salarioPromedio: number, totalDias: number, totalSemanas: number }}
 */
function calcularSalarioPromedio(periodos) {
  let totalDias = 0;
  let totalPesos = 0;
  for (const p of periodos) {
    const alta = new Date(p.alta);
    const baja = new Date(p.baja);
    const dias = Math.round((baja - alta) / (1000 * 60 * 60 * 24)) + 1; // +1 día, igual que en el Excel (=C5-B5, luego +1)
    if (dias <= 0) continue;
    totalDias += dias;
    totalPesos += p.sbcDiario * dias;
  }
  const totalSemanas = totalDias / 7;
  const salarioPromedio = totalDias === 0 ? 0 : totalPesos / totalDias;
  return { salarioPromedio, totalDias, totalSemanas };
}

/**
 * Determina cuántos "años reconocidos" adicionales generan incremento anual, a partir de las
 * semanas cotizadas totales (replica la hoja "Años Ant").
 */
function añosReconocidosPosteriores500Semanas(semanasCotizadas) {
  const semanasExcedentes = Math.max(0, semanasCotizadas - SEMANAS_MINIMAS_BASE);
  const añosCompletos = Math.trunc(semanasExcedentes / SEMANAS_POR_ANIO);
  const semanasResiduo = semanasExcedentes - añosCompletos * SEMANAS_POR_ANIO;
  const [, fraccionAnioResiduo] = buscarAproximado(TABLA_SEMANAS_RESIDUO, semanasResiduo);
  return añosCompletos + fraccionAnioResiduo;
}

/**
 * Calcula la proyección de pensión completa.
 *
 * @param {Object} input
 * @param {number} input.semanasCotizadas - Total de semanas cotizadas ante el IMSS.
 * @param {number} input.salarioDiarioPromedio - Salario diario promedio de las últimas 250 semanas.
 * @param {number} input.umaVigente - Valor diario de la UMA vigente al momento del cálculo.
 * @param {boolean} input.tieneEsposa - Si tiene esposa/esposo dependiente.
 * @param {number} input.numHijos - Número de hijos menores de 16 años (o hasta 25 si estudian).
 * @param {number} input.numPadres - Número de padres dependientes (solo aplica a falta de esposa(o) e hijos).
 * @param {'vejez'|'cesantia'} input.ramo - 'vejez' (65 años, 100%) o 'cesantia' (60-64 años, tabla de %).
 * @param {number} [input.edad] - Edad del asegurado (requerida y debe ser 60-64 si ramo='cesantia').
 * @returns {Object} desglose completo, en pesos anuales y mensuales.
 */
function calcularPension(input) {
  const {
    semanasCotizadas,
    salarioDiarioPromedio,
    umaVigente,
    tieneEsposa,
    numHijos = 0,
    numPadres = 0,
    ramo,
    edad,
  } = input;

  if (!semanasCotizadas || semanasCotizadas < 500) {
    throw new Error('Se requieren al menos 500 semanas cotizadas para tener derecho a esta pensión (Ley 73).');
  }
  if (!salarioDiarioPromedio || salarioDiarioPromedio <= 0) {
    throw new Error('El salario diario promedio debe ser mayor a cero.');
  }
  if (!umaVigente || umaVigente <= 0) {
    throw new Error('Falta el valor vigente de la UMA.');
  }
  if (ramo === 'cesantia') {
    if (!edad || edad < 60 || edad > 64) {
      throw new Error('Para Cesantía en Edad Avanzada la edad debe estar entre 60 y 64 años (a los 65 corresponde Vejez).');
    }
  } else if (ramo !== 'vejez') {
    throw new Error('El ramo debe ser "vejez" o "cesantia".');
  }

  // --- Cuantía Básica ---
  const vecesUma = salarioDiarioPromedio / umaVigente;
  const [, , pctCuantiaBasica, pctIncrementoAnual] = buscarAproximado(TABLA_CUANTIA_BASICA, vecesUma);
  const cuantiaDiaria = salarioDiarioPromedio * pctCuantiaBasica;
  const cuantiaBasicaAnual = cuantiaDiaria * DIAS_ANUAL;

  // --- Incremento Anual a la Cuantía Básica ---
  const añosReconocidos = añosReconocidosPosteriores500Semanas(semanasCotizadas);
  const incrementoDiario = salarioDiarioPromedio * pctIncrementoAnual;
  const incrementoAnualPorAño = incrementoDiario * DIAS_ANUAL;
  const incrementoAnualTotal = incrementoAnualPorAño * añosReconocidos;

  // --- Cuantía Anual de la Pensión (antes de asignaciones familiares) ---
  const cuantiaAnualPension = cuantiaBasicaAnual + incrementoAnualTotal;

  // --- Asignaciones Familiares y Ayuda Asistencial ---
  const ayudaEsposa = tieneEsposa ? cuantiaAnualPension * PCT_ESPOSA : 0;
  const ayudaHijos = numHijos > 0 ? cuantiaAnualPension * PCT_HIJO * numHijos : 0;
  // Padres: solo a falta de esposa(o) e hijos
  const ayudaPadres = (!tieneEsposa && numHijos === 0 && numPadres > 0)
    ? cuantiaAnualPension * PCT_PADRES * numPadres
    : 0;
  // Ayuda por soledad: solo si no hay esposa(o), hijos NI padres asignados
  const ayudaSoledad = (!tieneEsposa && numHijos === 0 && numPadres === 0)
    ? cuantiaAnualPension * PCT_SOLEDAD
    : 0;
  const totalAyudas = ayudaEsposa + ayudaHijos + ayudaPadres + ayudaSoledad;

  const cuantiaAnualConAyudas = cuantiaAnualPension + totalAyudas;

  // --- Incremento del 11% (Art. Décimo Cuarto Transitorio, inciso b) ---
  const pensionAnualVejez = cuantiaAnualConAyudas * INCREMENTO_ARTICULO_DECIMO_CUARTO;

  // --- Cesantía en Edad Avanzada: % según edad, aplicado al final ---
  const pctEdad = ramo === 'cesantia' ? TABLA_PORCENTAJE_EDAD_CESANTIA[edad] : 1.0;
  const pensionAnualFinal = pensionAnualVejez * pctEdad;

  // --- Verificación de Tope Legal (Art. 168): no debe exceder 100% del salario promedio ---
  const salarioAnualizado = salarioDiarioPromedio * DIAS_ANUAL;
  const pctDelSalario = pensionAnualFinal / salarioAnualizado;
  const excedeTope = pctDelSalario > 1;
  const pensionAnualFinalConTope = excedeTope ? salarioAnualizado : pensionAnualFinal;

  return {
    parametros: { vecesUma, pctCuantiaBasica, pctIncrementoAnual, añosReconocidos, pctEdad },
    cuantiaBasicaAnual,
    incrementoAnualTotal,
    cuantiaAnualPension,
    asignaciones: { ayudaEsposa, ayudaHijos, ayudaPadres, ayudaSoledad, totalAyudas },
    cuantiaAnualConAyudas,
    pensionAnualVejez,
    pensionAnualCesantia: ramo === 'cesantia' ? pensionAnualFinal : null,
    pensionAnualFinal, // el resultado aplicable a este ramo (vejez o cesantía), SIN aplicar el tope
    tope: { salarioAnualizado, pctDelSalario, excedeTope, pensionAnualFinalConTope },
    mensual: {
      cuantiaBasica: cuantiaBasicaAnual / 12,
      incrementoAnual: incrementoAnualTotal / 12,
      totalAyudas: totalAyudas / 12,
      pensionVejez: pensionAnualVejez / 12,
      pensionFinal: pensionAnualFinal / 12,
      pensionFinalConTope: pensionAnualFinalConTope / 12,
    },
  };
}

/**
 * Simula el efecto de pagar Modalidad 40 (Continuación Voluntaria en el Régimen Obligatorio)
 * sobre el salario promedio de las últimas 250 semanas y, por lo tanto, sobre la pensión.
 *
 * IMPORTANTE — esto es una ESTIMACIÓN, no el cálculo exacto que hará el IMSS: el salario
 * promedio real de las últimas 250 semanas depende de tu historial semana por semana (Salario
 * Base de Cotización de cada periodo), que el IMSS reconstruye al momento del trámite. Aquí se
 * aproxima asumiendo que, si vas a cotizar menos de 250 semanas en Modalidad 40, las semanas
 * restantes hasta completar la ventana de 250 mantienen el salario promedio que ya capturaste.
 * Es una referencia para decidir si conviene explorar Modalidad 40, no una cifra definitiva:
 * antes de pagarla, confirma la proyección con el IMSS o un especialista en pensiones.
 *
 * @param {Object} input - mismos campos que calcularPension() (semanasCotizadas,
 *   salarioDiarioPromedio, umaVigente, tieneEsposa, numHijos, numPadres, ramo, edad), más:
 * @param {number} input.salarioDiarioM40 - Salario diario con el que se daría de alta en Modalidad 40.
 * @param {number} input.semanasM40 - Número de semanas que planea cotizar en Modalidad 40.
 * @param {number} [input.tasaM40] - Tasa de cuota mensual vigente (por defecto, la de 2026).
 * @returns {Object} desglose de la simulación, incluyendo `pension` (mismo formato que calcularPension).
 */
function simularModalidad40(input) {
  const {
    semanasCotizadas,
    salarioDiarioPromedio,
    umaVigente,
    salarioDiarioM40,
    semanasM40,
    tasaM40 = MODALIDAD_40_TASA_DEFAULT,
  } = input;

  if (!salarioDiarioPromedio || salarioDiarioPromedio <= 0) {
    throw new Error('Falta tu salario diario promedio actual para poder comparar contra Modalidad 40.');
  }
  if (!semanasCotizadas || semanasCotizadas <= 0) {
    throw new Error('Faltan tus semanas cotizadas actuales para poder comparar contra Modalidad 40.');
  }
  if (!salarioDiarioM40 || salarioDiarioM40 <= 0) {
    throw new Error('Falta el salario diario con el que planeas darte de alta en Modalidad 40.');
  }
  if (!semanasM40 || semanasM40 <= 0) {
    throw new Error('Falta el número de semanas que planeas cotizar en Modalidad 40.');
  }
  if (!umaVigente || umaVigente <= 0) {
    throw new Error('Falta el valor vigente de la UMA.');
  }

  const advertencias = [];
  const umaMin = MODALIDAD_40_UMA_MIN * umaVigente;
  const umaMax = MODALIDAD_40_UMA_MAX * umaVigente;
  let salarioAjustado = salarioDiarioM40;
  if (salarioAjustado > umaMax) {
    advertencias.push(`El salario que capturaste supera el tope legal de Modalidad 40 (25 UMA = $${umaMax.toFixed(2)}/día). Se usó el tope para el cálculo.`);
    salarioAjustado = umaMax;
  } else if (salarioAjustado < umaMin) {
    advertencias.push(`El salario que capturaste está por debajo del mínimo de Modalidad 40 (1 UMA = $${umaMin.toFixed(2)}/día). Se usó el mínimo para el cálculo.`);
    salarioAjustado = umaMin;
  }

  const semanasEnVentana = Math.min(semanasM40, MODALIDAD_40_VENTANA_SEMANAS);
  const semanasRestantesVentana = MODALIDAD_40_VENTANA_SEMANAS - semanasEnVentana;
  const salarioPromedioProyectado = semanasRestantesVentana === 0
    ? salarioAjustado
    : (semanasEnVentana * salarioAjustado + semanasRestantesVentana * salarioDiarioPromedio) / MODALIDAD_40_VENTANA_SEMANAS;

  if (semanasM40 < MODALIDAD_40_VENTANA_SEMANAS) {
    advertencias.push(`Vas a cotizar ${semanasM40} semana(s) en Modalidad 40 (menos de 250), así que se asumió que las ${semanasRestantesVentana} semana(s) restantes de la ventana de cálculo mantienen tu salario promedio actual. Tu historial real de esas semanas puede ser distinto.`);
  }

  const semanasCotizadasProyectadas = semanasCotizadas + semanasM40;

  const pension = calcularPension({
    ...input,
    semanasCotizadas: semanasCotizadasProyectadas,
    salarioDiarioPromedio: salarioPromedioProyectado,
  });

  const costoMensualEstimado = salarioAjustado * MODALIDAD_40_DIAS_MES * tasaM40;
  const mesesM40 = semanasM40 / (SEMANAS_POR_ANIO / 12);
  const costoTotalEstimado = costoMensualEstimado * mesesM40;

  return {
    salarioDiarioM40Ajustado: salarioAjustado,
    salarioPromedioProyectado,
    semanasCotizadasProyectadas,
    pension,
    costoMensualEstimado,
    costoTotalEstimado,
    tasaM40,
    advertencias,
  };
}

const PensionCalc = {
  calcularPension,
  calcularSalarioPromedio,
  simularModalidad40,
  añosReconocidosPosteriores500Semanas,
  TABLA_CUANTIA_BASICA,
  TABLA_PORCENTAJE_EDAD_CESANTIA,
  TABLA_SEMANAS_RESIDUO,
  MODALIDAD_40_UMA_MIN,
  MODALIDAD_40_UMA_MAX,
  MODALIDAD_40_TASA_DEFAULT,
};

// UMD: funciona con require() en Node y como <script> global en el navegador.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PensionCalc;
}
if (typeof window !== 'undefined') {
  window.PensionCalc = PensionCalc;
}
