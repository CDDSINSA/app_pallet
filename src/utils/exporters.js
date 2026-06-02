import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { buildSummaryWorkbook } from "./excelFiles.js";
import { capturePalletImage } from "./threeScene.js";
import { formatNumber, resultToSummaryRow } from "./palletLogic.js";

function sanitizeFilename(value) {
  return String(value || "SKU")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

function padIndex(value) {
  return String(value).padStart(3, "0");
}

function getZipBatchName(batchIndex, batchResults, totalResults, chunkSize) {
  if (totalResults <= chunkSize) return "acomodo_skus.zip";

  const start = batchIndex * chunkSize + 1;
  const end = start + batchResults.length - 1;
  return `acomodo_skus_${padIndex(start)}-${padIndex(end)}.zip`;
}

function addTextLine(doc, label, value, x, y) {
  doc.setFont("helvetica", "bold");
  doc.text(label, x, y);
  doc.setFont("helvetica", "normal");
  doc.text(String(value), x + 170, y);
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
      return;
    }
    setTimeout(resolve, 0);
  });
}

async function emitProgress(onProgress, progress) {
  if (typeof onProgress === "function") onProgress(progress);
  await yieldToBrowser();
}

function drawDimensionPage(doc, result) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 46;
  const item = result.item;
  const length = result.type === "cilindro" ? item.ancho : item.largo;
  const width = result.type === "cilindro" ? item.ancho : item.ancho;
  const height = item.alto;
  const lengthLabel = result.type === "cilindro" ? "Diametro" : "Largo";
  const widthLabel = result.type === "cilindro" ? "Diametro" : "Ancho";

  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor("#1f2937");
  doc.text(`${result.sku} - Medidas del producto`, margin, 58);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#64748b");
  doc.text("Representacion dimensional de la unidad simulada", margin, 78);

  function drawFace(points, fillColor) {
    doc.setFillColor(...fillColor);
    doc.triangle(points[0].x, points[0].y, points[1].x, points[1].y, points[2].x, points[2].y, "F");
    doc.triangle(points[0].x, points[0].y, points[2].x, points[2].y, points[3].x, points[3].y, "F");
    doc.setDrawColor("#3f4b5f");
    doc.setLineWidth(1);
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      doc.line(current.x, current.y, next.x, next.y);
    }
  }

  function drawArrow(x1, y1, x2, y2) {
    const size = 7;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    doc.setDrawColor("#1f2937");
    doc.setLineWidth(1.2);
    doc.line(x1, y1, x2, y2);

    [
      [x1, y1, angle + Math.PI],
      [x2, y2, angle],
    ].forEach(([x, y, arrowAngle]) => {
      doc.line(x, y, x - size * Math.cos(arrowAngle - Math.PI / 6), y - size * Math.sin(arrowAngle - Math.PI / 6));
      doc.line(x, y, x - size * Math.cos(arrowAngle + Math.PI / 6), y - size * Math.sin(arrowAngle + Math.PI / 6));
    });
  }

  function drawGuide(x1, y1, x2, y2) {
    doc.setDrawColor("#94a3b8");
    doc.setLineWidth(0.7);
    doc.line(x1, y1, x2, y2);
  }

  function drawLabel(text, x, y, color, align = "center") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    const labelWidth = Math.min(doc.getTextWidth(text) + 18, 150);
    const labelHeight = 22;
    const rawX = align === "left" ? x : x - labelWidth / 2;
    const safeX = Math.min(Math.max(rawX, margin), pageWidth - margin - labelWidth);

    doc.setFillColor(...color);
    doc.roundedRect(safeX, y - labelHeight + 4, labelWidth, labelHeight, 4, 4, "F");
    doc.setTextColor("#ffffff");
    doc.text(text, safeX + labelWidth / 2, y - 2, { align: "center" });
  }

  const frontX = 150;
  const frontY = 220;
  const boxW = 250;
  const boxH = 170;
  const depthX = 82;
  const depthY = -50;
  const a = { x: frontX, y: frontY };
  const b = { x: frontX + boxW, y: frontY };
  const c = { x: frontX + boxW, y: frontY + boxH };
  const d = { x: frontX, y: frontY + boxH };
  const a2 = { x: a.x + depthX, y: a.y + depthY };
  const b2 = { x: b.x + depthX, y: b.y + depthY };
  const c2 = { x: c.x + depthX, y: c.y + depthY };

  doc.setFillColor(232, 237, 243);
  doc.ellipse(frontX + boxW / 2 + 48, frontY + boxH + 40, 190, 24, "F");

  drawFace([a, b, c, d], [219, 145, 82]);
  drawFace([a, a2, b2, b], [244, 190, 139]);
  drawFace([b, b2, c2, c], [181, 104, 58]);

  const lengthY = d.y + 34;
  drawGuide(d.x, d.y, d.x, lengthY - 7);
  drawGuide(c.x, c.y, c.x, lengthY - 7);
  drawArrow(d.x, lengthY, c.x, lengthY);
  drawLabel(`${lengthLabel}: ${formatNumber(length)} cm`, (d.x + c.x) / 2, lengthY + 28, [86, 185, 72]);

  const widthStart = { x: b.x + 22, y: b.y - 8 };
  const widthEnd = { x: b2.x + 22, y: b2.y - 8 };
  drawGuide(b.x, b.y, widthStart.x - 6, widthStart.y + 3);
  drawGuide(b2.x, b2.y, widthEnd.x - 6, widthEnd.y + 3);
  drawArrow(widthStart.x, widthStart.y, widthEnd.x, widthEnd.y);
  drawLabel(`${widthLabel}: ${formatNumber(width)} cm`, (widthStart.x + widthEnd.x) / 2, widthEnd.y - 12, [247, 148, 29]);

  const heightX = c2.x + 32;
  drawGuide(b2.x, b2.y, heightX - 8, b2.y);
  drawGuide(c2.x, c2.y, heightX - 8, c2.y);
  drawArrow(heightX, b2.y, heightX, c2.y);
  drawLabel(`Alto: ${formatNumber(height)} cm`, heightX + 12, (b2.y + c2.y) / 2 + 8, [43, 68, 92], "left");

  const cardY = 500;
  const gap = 12;
  const cardW = (pageWidth - margin * 2 - gap * 2) / 3;
  const cards = [
    [lengthLabel, `${formatNumber(length)} cm`, [86, 185, 72]],
    [widthLabel, `${formatNumber(width)} cm`, [247, 148, 29]],
    ["Alto", `${formatNumber(height)} cm`, [43, 68, 92]],
  ];

  cards.forEach(([label, value, color], index) => {
    const x = margin + index * (cardW + gap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor("#d8dee8");
    doc.roundedRect(x, cardY, cardW, 58, 5, 5, "FD");
    doc.setFillColor(...color);
    doc.rect(x, cardY, cardW, 5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor("#475569");
    doc.text(label, x + 12, cardY + 24);
    doc.setFontSize(14);
    doc.setTextColor("#172033");
    doc.text(value, x + 12, cardY + 44);
  });

  doc.setTextColor("#374151");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Unidades reportadas: ${Number.isFinite(item.unidades) ? formatNumber(item.unidades, 0) : "0"}`, margin, 594);
}

async function createSkuPdf(result, config) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 42;
  const summary = resultToSummaryRow(result);

  doc.setFillColor("#56B948");
  doc.rect(0, 0, pageWidth, 20, "F");
  doc.setFillColor("#F7941D");
  doc.rect(0, 20, pageWidth, 8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor("#1f2937");
  doc.text(`${result.sku} - ${result.typeLabel}`, margin, 58);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#475569");
  doc.text(`Orientacion: ${result.orientation} | Desborde: ${result.layout.usedOverhang ? "Si" : "No"}`, margin, 78);

  const image = await capturePalletImage(result, config, {
    width: 1100,
    height: 760,
    mimeType: "image/png",
    distanceScale: 1.1,
    showProductEdges: true,
    showSlats: true,
    cylinderSegments: 48,
  });
  doc.addImage(image, "PNG", margin, 98, pageWidth - margin * 2, 292);

  doc.setFontSize(10);
  doc.setTextColor("#111827");
  const left = margin;
  const right = pageWidth / 2 + 14;
  let y = 430;

  addTextLine(doc, "Medida final", `${summary["Largo final del acomodo (cm)"]} x ${summary["Ancho final del acomodo (cm)"]} x ${summary["Alto final del acomodo (cm)"]} cm`, left, y);
  y += 24;
  addTextLine(doc, "Cajas por cama", summary["Cajas por cama"], left, y);
  y += 24;
  addTextLine(doc, "Camas completas", summary["Camas completas"], left, y);
  y += 24;
  addTextLine(doc, "Ultima cama", summary["Cajas en ultima cama (incompleta)"], left, y);

  y = 430;
  addTextLine(doc, "Total por pallet", summary["Total cajas por pallet"], right, y);
  y += 24;
  addTextLine(doc, "Peso total", `${summary["Peso total (kg)"]} kg (${summary["% peso ocupado"]})`, right, y);
  y += 24;
  addTextLine(doc, "Volumen", `${summary["Volumen ocupado (cm3)"]} cm3 (${summary["% volumen ocupado"]})`, right, y);

  if (result.warnings.length) {
    doc.setTextColor("#92400e");
    doc.setFont("helvetica", "bold");
    doc.text("Alertas:", margin, 548);
    doc.setFont("helvetica", "normal");
    doc.text(result.warnings.join(" "), margin + 48, 548, { maxWidth: pageWidth - margin * 2 - 48 });
  }

  drawDimensionPage(doc, result);
  return doc.output("arraybuffer");
}

export async function createResultsZip(results, errors, config, options = {}) {
  const onProgress = options.onProgress;
  const zip = new JSZip();

  await emitProgress(onProgress, {
    phase: "Preparando resumen",
    current: 0,
    total: results.length,
    percent: 0,
    label: "Creando resumen consolidado",
  });

  const workbookBuffer = await buildSummaryWorkbook(results, errors);
  zip.file("resumen_consolidado.xlsx", workbookBuffer);
  await emitProgress(onProgress, {
    phase: "Generando PDFs",
    current: 0,
    total: results.length,
    percent: 5,
    label: "Resumen listo",
  });

  for (const [index, result] of results.entries()) {
    await emitProgress(onProgress, {
      phase: "Generando PDFs",
      current: index,
      total: results.length,
      percent: Math.round((index / Math.max(results.length, 1)) * 90) + 5,
      label: `PDF ${index + 1} de ${results.length}: ${result.sku}`,
    });
    const pdfBuffer = await createSkuPdf(result, config);
    zip.file(`${sanitizeFilename(result.sku)}.pdf`, pdfBuffer);
    await yieldToBrowser();
  }

  await emitProgress(onProgress, {
    phase: "Comprimiendo ZIP",
    current: results.length,
    total: results.length,
    percent: 95,
    label: "Empaquetando archivos",
  });

  const blob = await zip.generateAsync({ type: "blob" }, (metadata) => {
    if (typeof onProgress === "function") {
      onProgress({
        phase: "Comprimiendo ZIP",
        current: results.length,
        total: results.length,
        percent: 95 + Math.round((metadata.percent / 100) * 5),
        label: `Empaquetando ${metadata.currentFile || "archivos"}`,
      });
    }
  });

  await emitProgress(onProgress, {
    phase: "Listo",
    current: results.length,
    total: results.length,
    percent: 100,
    label: "Descarga preparada",
  });

  return blob;
}

export async function createResultsZipChunks(results, errors, config, options = {}) {
  const chunkSize = Math.max(1, options.chunkSize ?? 20);
  const onProgress = options.onProgress;
  const onChunkReady = options.onChunkReady;
  const totalBatches = Math.ceil(results.length / chunkSize);
  const totalResults = results.length;

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
    const start = batchIndex * chunkSize;
    const batchResults = results.slice(start, start + chunkSize);
    const filename = getZipBatchName(batchIndex, batchResults, totalResults, chunkSize);
    const batchErrors = batchIndex === 0 ? errors : [];

    await emitProgress(onProgress, {
      phase: `Lote ${batchIndex + 1} de ${totalBatches}`,
      current: start,
      total: totalResults,
      percent: Math.round((start / Math.max(totalResults, 1)) * 100),
      label: `Preparando ${filename}`,
    });

    const blob = await createResultsZip(batchResults, batchErrors, config, {
      onProgress: (batchProgress) => {
        if (typeof onProgress !== "function") return;
        const completedBeforeBatch = start / Math.max(totalResults, 1);
        const currentBatchWeight = batchResults.length / Math.max(totalResults, 1);
        const batchPercent = (batchProgress.percent ?? 0) / 100;
        const percent = Math.round((completedBeforeBatch + currentBatchWeight * batchPercent) * 100);

        onProgress({
          ...batchProgress,
          phase: `Lote ${batchIndex + 1} de ${totalBatches}`,
          current: Math.min(start + (batchProgress.current ?? 0), totalResults),
          total: totalResults,
          percent,
          label: `${filename} - ${batchProgress.label}`,
        });
      },
    });

    if (typeof onChunkReady === "function") {
      onChunkReady({ blob, filename, batchIndex, totalBatches });
    }

    await emitProgress(onProgress, {
      phase: `Lote ${batchIndex + 1} de ${totalBatches}`,
      current: Math.min(start + batchResults.length, totalResults),
      total: totalResults,
      percent: Math.round(((start + batchResults.length) / Math.max(totalResults, 1)) * 100),
      label: `${filename} descargado`,
    });

    await yieldToBrowser();
  }

  await emitProgress(onProgress, {
    phase: "Listo",
    current: totalResults,
    total: totalResults,
    percent: 100,
    label: totalBatches > 1 ? `${totalBatches} ZIPs generados` : "ZIP generado",
  });

  return { totalBatches };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
