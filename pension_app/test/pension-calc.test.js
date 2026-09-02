/**
 * Prueba de regresión: compara el resultado del motor JS contra los valores ya verificados
 * en la auditoría del archivo Excel corregido (mismo caso: 1,726 semanas, salario $911.06,
 * UMA 2026 = $117.31, esposa sí, sin hijos ni padres, Cesantía a los 60 años).
 * Ejecutar con: npm test
 */
const assert = require('assert');
const { calcularPension, simularModalidad40 } = require('../lib/pension-calc');

function aprox(actual, esperado, tolerancia = 0.01) {
  assert.ok(
    Math.abs(actual - esperado) < tolerancia,
    `Esperado ~${esperado}, obtuvo ${actual} (diferencia ${Math.abs(actual - esperado)})`
  );
}

const r = calcularPension({
  semanasCotizadas: 1726,
  salarioDiarioPromedio: 911.06,
  umaVigente: 117.31,
  tieneEsposa: true,
  numHijos: 0,
  numPadres: 0,
  ramo: 'cesantia',
  edad: 60,
});

aprox(r.cuantiaBasicaAnual, 43229.797);
aprox(r.incrementoAnualTotal, 195531.6972);
aprox(r.cuantiaAnualPension, 238761.4942);
aprox(r.asignaciones.ayudaEsposa, 35814.22413);
aprox(r.cuantiaAnualConAyudas, 274575.71833);
aprox(r.pensionAnualVejez, 304779.0473463);
aprox(r.pensionAnualCesantia, 228584.28550972504);
aprox(r.mensual.pensionFinal, 19048.690459143752);
assert.strictEqual(r.tope.excedeTope, false);

// Caso con 2 hijos: valida la corrección del bug de "ayuda hijos siempre en $0".
const r2 = calcularPension({
  semanasCotizadas: 1726,
  salarioDiarioPromedio: 911.06,
  umaVigente: 117.31,
  tieneEsposa: false,
  numHijos: 2,
  numPadres: 0,
  ramo: 'vejez',
});
aprox(r2.asignaciones.ayudaHijos, r2.cuantiaAnualPension * 0.10 * 2);
assert.ok(r2.asignaciones.ayudaHijos > 0, 'La ayuda por hijos debe ser mayor a cero cuando numHijos > 0');

// --- Modalidad 40 ---

// Caso 1: cotiza exactamente 250 semanas en M40 -> el salario promedio proyectado debe ser
// EXACTAMENTE el salario de M40 (ajustado al tope de 25 UMA si aplica), sin mezcla.
const m40Completo = simularModalidad40({
  semanasCotizadas: 1726,
  salarioDiarioPromedio: 911.06,
  umaVigente: 117.31,
  tieneEsposa: true,
  numHijos: 0,
  numPadres: 0,
  ramo: 'cesantia',
  edad: 60,
  salarioDiarioM40: 117.31 * 25, // tope de 25 UMA
  semanasM40: 250,
});
aprox(m40Completo.salarioPromedioProyectado, 117.31 * 25);
aprox(m40Completo.semanasCotizadasProyectadas, 1726 + 250, 0.001);
assert.ok(m40Completo.pension.mensual.pensionFinal > 19048.69, 'La pensión proyectada con Modalidad 40 al tope debe ser mayor a la actual.');
assert.strictEqual(m40Completo.advertencias.length, 0, 'No debe haber advertencias cuando el salario está dentro del rango y cubre las 250 semanas.');

// Caso 2: cotiza solo 100 semanas -> el promedio proyectado debe ser una mezcla ponderada
// (100 semanas al salario de M40 + 150 semanas al salario promedio actual) / 250.
const m40Parcial = simularModalidad40({
  semanasCotizadas: 1726,
  salarioDiarioPromedio: 911.06,
  umaVigente: 117.31,
  tieneEsposa: true,
  ramo: 'cesantia',
  edad: 60,
  salarioDiarioM40: 2000,
  semanasM40: 100,
});
const mezclaEsperada = (100 * 2000 + 150 * 911.06) / 250;
aprox(m40Parcial.salarioPromedioProyectado, mezclaEsperada);
assert.ok(m40Parcial.advertencias.length > 0, 'Debe advertir que se asumió el salario actual para las semanas restantes de la ventana.');

// Caso 3: salario capturado por encima del tope de 25 UMA -> debe ajustarse al tope y advertir.
const m40SobreTope = simularModalidad40({
  semanasCotizadas: 1726,
  salarioDiarioPromedio: 911.06,
  umaVigente: 117.31,
  ramo: 'vejez',
  salarioDiarioM40: 999999,
  semanasM40: 250,
});
aprox(m40SobreTope.salarioDiarioM40Ajustado, 117.31 * 25);
assert.ok(m40SobreTope.advertencias.some((a) => a.includes('tope legal')), 'Debe advertir que se ajustó al tope de 25 UMA.');

console.log('Todas las pruebas pasaron correctamente. ✔');
