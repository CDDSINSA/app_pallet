import ExcelJS from "exceljs";
import { resultToSummaryRow, validateImportHeaders } from "./palletLogic.js";

export const MAX_EXCEL_BYTES = 20 * 1024 * 1024;
export const MAX_EXCEL_ROWS = 10_000;

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
  if (file.size > MAX_EXCEL_BYTES) throw new Error("El archivo supera el limite de 20 MB.");
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > MAX_EXCEL_BYTES) throw new Error("El archivo supera el limite de 20 MB.");
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error("El archivo no contiene hojas.");
  }
  if (worksheet.rowCount > MAX_EXCEL_ROWS + 1) throw new Error("La primera hoja supera el limite de 10.000 filas. Divida el archivo.");

  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    headers[columnNumber - 1] = String(cellToValue(cell.value)).trim();
  });

  if (!headers.some(Boolean)) {
    throw new Error("La primera fila debe contener los encabezados.");
  }
  validateImportHeaders(headers);

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const record = Object.create(null);
    let hasValue = false;

    headers.forEach((header, index) => {
      if (!header) return;
      const value = cellToValue(row.getCell(index + 1).value);
      if (value !== "" && value !== null && value !== undefined) hasValue = true;
      record[header] = value;
    });

    if (hasValue) {
      record.__source = { rowNumber, sheet: worksheet.name, file: file.name ?? "" };
      rows.push(record);
    }
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
          Hoja: error.source?.sheet ?? "",
          Archivo: error.source?.file ?? "",
          SKU: error.sku,
          Tipo: error.type,
          Motivo: error.reason,
        }))
      : [{ "Sin datos": "No se encontraron errores" }],
  );

  if (results.length) {
    addRowsSheet(workbook, "Configuracion", results.map((result) => ({
      SKU: result.sku,
      Fila: result.rowNumber,
      Algoritmo: result.algorithmVersion,
      ...result.config,
    })));
  }

  return workbook.xlsx.writeBuffer();
}

export async function generateTemplateWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Acomodo de Pallets SINSA";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Productos");
  worksheet.columns = [
    { header: "SKU", key: "sku", width: 18 },
    { header: "Tipo", key: "tipo", width: 14 },
    { header: "Largo", key: "largo", width: 12 },
    { header: "Ancho", key: "ancho", width: 12 },
    { header: "Alto", key: "alto", width: 12 },
    { header: "Peso", key: "peso", width: 12 },
    { header: "Unidades", key: "unidades", width: 14 },
    { header: "Fragil", key: "fragil", width: 12 },
    { header: "1CamaMax", key: "maxCamas", width: 14 },
    { header: "Orientacion", key: "orientacion", width: 16 },
  ];

  worksheet.addRow({
    sku: "EJEMPLO-CAJA-01",
    tipo: "Caja",
    largo: 40,
    ancho: 30,
    alto: 25,
    peso: 12,
    unidades: 120,
    fragil: "No",
    maxCamas: "",
    orientacion: "Cualquiera",
  });
  worksheet.addRow({
    sku: "EJEMPLO-CILINDRO-02",
    tipo: "Cilindro",
    largo: 30,
    ancho: 30,
    alto: 55,
    peso: 18,
    unidades: 48,
    fragil: "No",
    maxCamas: 2,
    orientacion: "Vertical",
  });
  worksheet.addRow({
    sku: "EJEMPLO-FRAGIL-03",
    tipo: "Caja",
    largo: 50,
    ancho: 40,
    alto: 30,
    peso: 8,
    unidades: 20,
    fragil: "Si",
    maxCamas: 1,
    orientacion: "Cualquiera",
  });

  applyHeaderStyle(worksheet);
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  const infoSheet = workbook.addWorksheet("Instrucciones");
  infoSheet.columns = [
    { header: "Columna", key: "campo", width: 16 },
    { header: "Obligatorio", key: "req", width: 14 },
    { header: "Descripcion y Reglas", key: "desc", width: 50 },
    { header: "Ejemplo", key: "ejemplo", width: 22 },
  ];
  infoSheet.addRow({ campo: "SKU", req: "Opcional", desc: "Codigo o nombre del producto.", ejemplo: "PROD-10293" });
  infoSheet.addRow({ campo: "Tipo", req: "Si", desc: "Tipo de bulto: 'Caja' o 'Cilindro' (tambor, cubeta, etc.).", ejemplo: "Caja" });
  infoSheet.addRow({ campo: "Largo", req: "Si (Caja)", desc: "Largo de la caja en centimetros (cm). Solo numeros.", ejemplo: "40" });
  infoSheet.addRow({ campo: "Ancho", req: "Si", desc: "Ancho en cm. Para Cilindros es el diametro.", ejemplo: "30" });
  infoSheet.addRow({ campo: "Alto", req: "Si", desc: "Altura de la unidad en centimetros (cm).", ejemplo: "25" });
  infoSheet.addRow({ campo: "Peso", req: "Si", desc: "Peso unitario en kilogramos (kg).", ejemplo: "12.5" });
  infoSheet.addRow({ campo: "Unidades", req: "Opcional", desc: "Informativo: cantidad pedida (entero).", ejemplo: "120" });
  infoSheet.addRow({ campo: "Fragil", req: "Opcional", desc: "Si/No. Si es 'Si', limita la estiba por fragilidad.", ejemplo: "Si" });
  infoSheet.addRow({ campo: "1CamaMax", req: "Opcional", desc: "Numero maximo de camas/capas permitidas por resistencia.", ejemplo: "1 o 2" });
  infoSheet.addRow({ campo: "Orientacion", req: "Opcional", desc: "Campo informativo de orientacion de producto.", ejemplo: "Vertical" });

  applyHeaderStyle(infoSheet);
  infoSheet.views = [{ state: "frozen", ySplit: 1 }];

  return workbook.xlsx.writeBuffer();
}

export async function buildMultiSkuWorkbook(multiSkuData, config) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Acomodo de Pallets Multi-SKU";
  workbook.created = new Date();

  // Sheet 1: Resumen de Pallets
  const palletSummaryRows = (multiSkuData.pallets ?? []).map((pallet) => ({
    "Pallet": pallet.palletNumber,
    "Nombre": pallet.sku,
    "Total Unidades": pallet.metrics.totalUnits,
    "Peso Total (kg)": pallet.metrics.totalWeight,
    "% Capacidad Peso": `${pallet.metrics.weightPercent}%`,
    "Alto Final (cm)": pallet.metrics.finalHeight,
    "Camadas de Apilado": pallet.metrics.fullLayers,
    "% Volumen Ocupado": `${pallet.metrics.volumePercent}%`,
    "Centro de Gravedad": `${pallet.metrics.centerOfGravity.x}, ${pallet.metrics.centerOfGravity.y}, ${pallet.metrics.centerOfGravity.z}`,
    "Advertencias": (pallet.warnings || []).join(" "),
  }));
  addRowsSheet(workbook, "Resumen Pallets", palletSummaryRows.length ? palletSummaryRows : [{ "Sin datos": "No se generaron pallets" }]);

  // Sheet 2: Desglose por SKU y Pallet
  const breakdownRows = [];
  (multiSkuData.pallets ?? []).forEach((pallet) => {
    (pallet.skuBreakdown ?? []).forEach((item) => {
      breakdownRows.push({
        "Pallet": pallet.palletNumber,
        "SKU": item.sku,
        "Tipo": item.typeLabel,
        "Cantidad en Pallet": item.count,
        "Peso Total en Pallet (kg)": item.weight,
      });
    });
  });
  addRowsSheet(workbook, "Desglose por SKU", breakdownRows.length ? breakdownRows : [{ "Sin datos": "Sin desglose" }]);

  // Sheet 3: Unidades No Colocadas (if any)
  if (multiSkuData.unplaced?.length) {
    const unplacedCountMap = new Map();
    multiSkuData.unplaced.forEach((u) => {
      unplacedCountMap.set(u.sku, (unplacedCountMap.get(u.sku) || 0) + 1);
    });
    const unplacedRows = Array.from(unplacedCountMap.entries()).map(([sku, count]) => ({
      "SKU": sku,
      "Cantidad No Colocada": count,
      "Motivo": "Excede capacidad volumetrica o de peso de los pallets configurados",
    }));
    addRowsSheet(workbook, "No Colocadas", unplacedRows);
  }

  // Sheet 4: Errores / Avisos
  if (multiSkuData.errors?.length) {
    addRowsSheet(workbook, "Errores Fila", multiSkuData.errors.map((e) => ({
      Fila: e.rowNumber,
      SKU: e.sku,
      Motivo: e.reason,
    })));
  }

  return workbook.xlsx.writeBuffer();
}
