import { describe, expect, it } from "vitest";
import { normalizeHeader, parseRelationship, parseStudentRecords, rowsToRecords } from "./students";

const HEADER = ["Apellido", "Nombre", "DNI", "Curso", "Legajo", "Fecha de nacimiento", "Tutor apellido", "Tutor nombre", "Tutor DNI", "Vínculo"];

describe("normalizeHeader", () => {
  it("normaliza acentos, espacios y alias", () => {
    expect(normalizeHeader("Fecha de nacimiento")).toBe("fecha_nacimiento");
    expect(normalizeHeader("Vínculo")).toBe("vinculo");
    expect(normalizeHeader(" Tutor DNI ")).toBe("tutor_dni");
    expect(normalizeHeader("Documento")).toBe("dni");
  });
});

describe("rowsToRecords", () => {
  it("detecta columnas obligatorias faltantes", () => {
    expect(rowsToRecords([["Apellido", "Nombre"]]).missingColumns).toEqual(["dni", "curso"]);
  });

  it("ignora filas vacías y numera según la planilla", () => {
    const { records } = rowsToRecords([HEADER, ["", "", ""], ["Pérez", "Ana", "50111222", "1A"]]);
    expect(records).toHaveLength(1);
    expect(records[0].line).toBe(3);
    expect(records[0].values.dni).toBe("50111222");
  });
});

describe("parseStudentRecords", () => {
  it("agrupa tutores del mismo alumno", () => {
    const { records } = rowsToRecords([
      HEADER,
      ["Pérez", "Ana", "50.111.222", "1° A", "", "10/05/2014", "Pérez", "Juan", "28111222", "Padre"],
      ["Pérez", "Ana", "50111222", "1A", "", "", "Gómez", "Laura", "29111222", "madre"],
    ]);
    const { students, errors } = parseStudentRecords(records);
    expect(errors).toEqual([]);
    expect(students).toHaveLength(1);
    expect(students[0]).toMatchObject({
      dni: "50111222",
      fileNumber: "50111222",
      course: { grade: 1, division: "A" },
      lines: [2, 3],
    });
    expect(students[0].birthDate?.toISOString()).toBe("2014-05-10T00:00:00.000Z");
    expect(students[0].guardians.map((g) => [g.firstName, g.relationship])).toEqual([
      ["Juan", "PADRE"],
      ["Laura", "MADRE"],
    ]);
  });

  it("reporta errores por fila sin frenar el resto", () => {
    const { records } = rowsToRecords([
      HEADER,
      ["Pérez", "Ana", "abc", "1A"],
      ["López", "Juan", "50333444", "primero"],
      ["Sosa", "Mía", "50555666", "2B", "", "", "Sosa", "", "28555666"],
      ["Ruiz", "Tomás", "50777888", "2B"],
    ]);
    const { students, errors } = parseStudentRecords(records);
    expect(students.map((s) => s.dni)).toEqual(["50777888"]);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(errors[1].messages[0]).toContain("no reconocido");
  });

  it("detecta un alumno repetido en dos cursos", () => {
    const { records } = rowsToRecords([HEADER, ["Pérez", "Ana", "50111222", "1A"], ["Pérez", "Ana", "50111222", "1B"]]);
    expect(parseStudentRecords(records).errors[0].messages[0]).toContain("dos cursos");
  });
});

describe("parseRelationship", () => {
  it("interpreta el vínculo", () => {
    expect(parseRelationship("Madre")).toBe("MADRE");
    expect(parseRelationship("PADRE")).toBe("PADRE");
    expect(parseRelationship("tutora")).toBe("TUTOR_LEGAL");
    expect(parseRelationship("abuela")).toBe("OTRO");
    expect(parseRelationship("")).toBe("TUTOR_LEGAL");
  });
});
