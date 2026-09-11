// Análisis de ejemplo del tutorial guiado: un caso completo que el estudiante ve
// y edita. Se construye con las mismas fábricas del modelo (ids frescos,
// referencias por id), así que es un análisis normal más.

import { createAnalysis, createRow, createDataEntry, createStudent, createBranch } from "./analysisModel.js";

const ref = (datum) => ({ kind: "ref", dataId: datum.id });
const op = (operator) => ({ kind: "op", op: operator });
const literal = (value) => ({ kind: "literal", value });

// Ejemplo del tutorial guiado: decidir si un estudiante aprueba una asignatura.
// Encadena suma → promedio → decisión, ideal para explicar la tabla fila por fila.
export function createStudentGradeExample() {
  const analysis = createAnalysis({
    title: "¿El estudiante aprueba la asignatura?",
    description: "A partir de tres notas, calcular el promedio y decidir si el estudiante aprueba según la nota aprobatoria.",
    statement:
      "Un estudiante obtuvo 4 en el primer parcial, 3 en el segundo y 5 en el tercero. La nota aprobatoria de la asignatura es 3. Calcule el promedio de las tres notas y determine si el estudiante aprueba.",
    group: "N1",
  });
  analysis.students = [createStudent({ idNumber: "1001", fullName: "Ana Pérez" })];

  // Datos de entrada identificados a partir del enunciado (fragmento + valor).
  const nota1 = createDataEntry({ name: "nota1", type: "numeric", source: "4 en el primer parcial", value: "4" });
  const nota2 = createDataEntry({ name: "nota2", type: "numeric", source: "3 en el segundo", value: "3" });
  const nota3 = createDataEntry({ name: "nota3", type: "numeric", source: "5 en el tercero", value: "5" });
  const notaAprobatoria = createDataEntry({ name: "notaAprobatoria", type: "numeric", source: "La nota aprobatoria de la asignatura es 3", value: "3" });
  const sumaNotas = createDataEntry({ name: "sumaNotas", type: "numeric" });
  const promedio = createDataEntry({ name: "promedio", type: "numeric" });
  const aprobado = createDataEntry({ name: "aprobado", type: "logical" });

  analysis.data = [nota1, nota2, nota3, notaAprobatoria, sumaNotas, promedio, aprobado];

  const row1 = createRow({
    problem: "Sumar las tres notas",
    inputIds: [nota1.id, nota2.id, nota3.id],
    operation: [ref(nota1), op("add"), ref(nota2), op("add"), ref(nota3)],
    resultId: sumaNotas.id,
    purpose: "operation",
    subsequentUse: "Se usará para calcular el promedio.",
  });

  const row2 = createRow({
    problem: "Calcular el promedio",
    inputIds: [sumaNotas.id],
    operation: [ref(sumaNotas), op("div"), literal("3")],
    resultId: promedio.id,
    purpose: "operation",
    subsequentUse: "Se comparará con la nota aprobatoria.",
  });

  // Una condición evaluada como decisión: comprueba y, con sus caminos, decide.
  const row3 = createRow({
    kind: "condition",
    conditionName: "cumpleNotaAprobatoria",
    condition: "¿El promedio es mayor o igual a la nota aprobatoria?",
    operation: [ref(promedio), op("ge"), ref(notaAprobatoria)],
    evaluateNow: true,
    resultId: aprobado.id,
    purpose: "decision",
    subsequentUse: "Determina si el estudiante aprueba o reprueba.",
    ifTrue: createBranch({ type: "response", value: [literal("Aprueba")] }),
    ifFalse: createBranch({ type: "response", value: [literal("Reprueba")] }),
  });

  row1.usedInRowId = row2.id;
  row2.usedInRowId = row3.id;

  analysis.rows = [row1, row2, row3];
  return analysis;
}
