import ExcelJS from "exceljs";
import { resultToSummaryRow } from "./palletLogic.js";

function cellToValue(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;
  if (value.text !== undefined) return value.text;
  if (value.result !== undefined) return value.result;
  if (value.richText) return value.richText.map((part) => part.text ?? "").join("");
  if (value.hyperlink && value.text) return value.text;
  return String(value);
}

export async function readExcelFile(file) {
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error("El archivo no contiene hojas.");
  }

  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    headers[columnNumber - 1] = String(cellToValue(cell.value)).trim();
  });

  if (!headers.some(Boolean)) {
    throw new Error("La primera fila debe contener los encabezados.");
  }

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const record = {};
    let hasValue = false;

    headers.forEach((header, index) => {
      if (!header) return;
      const value = cellToValue(row.getCell(index + 1).value);
      if (value !== "" && value !== null && value !== undefined) hasValue = true;
      record[header] = value;
    });

    if (hasValue) rows.push(record);
  });

  return rows;
}

function applyHeaderStyle(worksheet) {
  const header = worksheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF56B948" },
  };
  header.alignment = { vertical: "middle", horizontal: "center" };
}

function fitColumns(worksheet) {
  worksheet.columns.forEach((column) => {
    let width = 12;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const length = String(cell.value ?? "").length;
      width = Math.max(width, Math.min(length + 2, 42));
    });
    column.width = width;
  });
}

function addRowsSheet(workbook, name, rows) {
  const worksheet = workbook.addWorksheet(name);
  const keys = rows.length ? Object.keys(rows[0]) : ["Sin datos"];
  worksheet.columns = keys.map((key) => ({ header: key, key }));
  rows.forEach((row) => worksheet.addRow(row));
  applyHeaderStyle(worksheet);
  fitColumns(worksheet);
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  return worksheet;
}

export async function buildSummaryWorkbook(results, errors) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Acomodo de Pallets React";
  workbook.created = new Date();

  addRowsSheet(
    workbook,
    "Resumen",
    results.length ? results.map(resultToSummaryRow) : [{ "Sin datos": "No hay SKUs validos" }],
  );

  addRowsSheet(
    workbook,
    "Errores",
    errors.length
      ? errors.map((error) => ({
          Fila: error.rowNumber,
          SKU: error.sku,
          Tipo: error.type,
          Motivo: error.reason,
        }))
      : [{ "Sin datos": "No se encontraron errores" }],
  );

  return workbook.xlsx.writeBuffer();
}
