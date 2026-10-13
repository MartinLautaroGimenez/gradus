import "server-only";
import ExcelJS from "exceljs";
import Papa from "papaparse";

export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Lee un .xlsx o .csv y devuelve las celdas como texto. La primera hoja del Excel. */
export async function readSpreadsheet(file: File): Promise<string[][]> {
  if (file.size > MAX_FILE_BYTES) throw new Error("El archivo supera los 2 MB");
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    // Se saca el BOM que agrega Excel al principio del archivo.
    const text = (await file.text()).replace(/^\uFEFF/, "");
    // Excel en español guarda los CSV con ";" — Papa detecta el separador solo.
    const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
    return result.data.map((row) => row.map((cell) => String(cell ?? "")));
  }

  if (name.endsWith(".xlsx")) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells: string[] = [];
      for (let col = 1; col <= sheet.columnCount; col++) cells.push(cellToText(row.getCell(col).value));
      rows[rowNumber - 1] = cells;
    });
    return Array.from(rows, (row) => row ?? []);
  }

  throw new Error("Formato no soportado: subí un archivo .xlsx o .csv");
}

function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    // Excel guarda las fechas sin zona horaria; ExcelJS las devuelve en UTC.
    return `${value.getUTCDate()}/${value.getUTCMonth() + 1}/${value.getUTCFullYear()}`;
  }
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text; // hipervínculo
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return cellToText(value.result as ExcelJS.CellValue); // fórmula
    return "";
  }
  return String(value);
}
