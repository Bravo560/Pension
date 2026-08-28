/**
 * Prueba de regresión: compara el resultado del motor JS contra los valores ya verificados
 * en la auditoría del archivo Excel corregido (mismo caso: 1,726 semanas, salario $911.06,
 * UMA 2026 = $117.31, esposa sí, sin hijos ni padres, Cesantía a los 60 años).
 * Ejecutar con: npm test
 */
const assert = require('assert');
const { calcularPension } = require('../lib/pension-calc');

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

console.log('Todas las pruebas pasaron correctamente. ✔');
