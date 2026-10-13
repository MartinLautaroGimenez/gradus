import { describe, expect, it } from "vitest";
import { parseCourseList, parseStaffRecords, parseStaffRoles } from "./staff";
import { readRecords } from "./students";
import { STAFF_COLUMNS } from "./staff";

describe("parseStaffRoles", () => {
  it.each([
    ["Directora", ["DIRECTIVO"]],
    ["vicedirector", ["DIRECTIVO"]],
    ["Preceptora", ["PRECEPTOR"]],
    ["Profesor", ["DOCENTE"]],
    ["Preceptor, Docente", ["PRECEPTOR", "DOCENTE"]],
    ["preceptora y profesora", ["PRECEPTOR", "DOCENTE"]],
    ["Administración", ["ADMINISTRATIVO"]],
    ["Secretaria", ["ADMINISTRATIVO"]],
  ])("%s", (input, expected) => {
    expect(parseStaffRoles(input)).toEqual(expected);
  });

  it("rechaza roles desconocidos o vacíos", () => {
    expect(parseStaffRoles("portero")).toBeNull();
    expect(parseStaffRoles("Preceptor, astronauta")).toBeNull();
    expect(parseStaffRoles("")).toBeNull();
  });
});

describe("parseCourseList", () => {
  it("lee varios cursos", () => {
    expect(parseCourseList("1° A, 1° B y 2A")).toEqual([
      { grade: 1, division: "A" },
      { grade: 1, division: "B" },
      { grade: 2, division: "A" },
    ]);
    expect(parseCourseList("1° A, quinto")).toBeNull();
  });
});

describe("parseStaffRecords", () => {
  const header = ["Apellido", "Nombre", "DNI", "Rol", "Email", "Teléfono", "Cursos"];

  it("lee personal válido", () => {
    const { records } = readRecords(
      [header, ["Quiroga", "Diego", "28.111.222", "Preceptor", "dq@ejemplo.com", "261 555-0001", "1° A, 1° B"], ["Bustos", "Laura", "25111222", "Directora"]],
      STAFF_COLUMNS,
    );
    const { staff, errors } = parseStaffRecords(records);
    expect(errors).toEqual([]);
    expect(staff[0]).toMatchObject({ dni: "28111222", roles: ["PRECEPTOR"], courses: [{ grade: 1, division: "A" }, { grade: 1, division: "B" }] });
    expect(staff[1]).toMatchObject({ roles: ["DIRECTIVO"], courses: [], email: null });
  });

  it("detecta errores por fila", () => {
    const { records } = readRecords(
      [
        header,
        ["Pérez", "Ana", "29000001", "Portera"],
        ["Gómez", "Luis", "29000002", "Docente", "", "", "1° A"],
        ["Ruiz", "Eva", "29000003", "Preceptora", "", "", "1° A"],
        ["Sosa", "Iván", "29000003", "Docente"],
        ["Paz", "Ema", "29000004", "Preceptora", "", "", "1A"],
      ],
      STAFF_COLUMNS,
    );
    const { staff, errors } = parseStaffRecords(records);
    expect(staff.map((s) => s.dni)).toEqual(["29000003"]);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 5, 6]);
    expect(errors[1].messages[0]).toContain("Sólo se asignan cursos a preceptores");
    expect(errors[2].messages[0]).toContain("ya aparece");
    expect(errors[3].messages[0]).toContain("ya tiene preceptor");
  });
});
