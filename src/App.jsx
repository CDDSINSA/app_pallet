import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Box,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  FileSpreadsheet,
  Layers,
  PackageCheck,
  Play,
  Rotate3D,
  Ruler,
  Upload,
  Weight,
} from "lucide-react";
import PalletViewer from "./components/PalletViewer.jsx";
import {
  buildExampleRows,
  coerceConfig,
  DEFAULT_CONFIG,
  formatNumber,
  processRows,
  resultToSummaryRow,
  validateConfig,
} from "./utils/palletLogic.js";

const EMPTY_MANUAL_FORM = {
  sku: "",
  tipo: "Caja",
  largo: "",
  ancho: "",
  alto: "",
  peso: "",
  unidades: "",
};

function NumberField({ label, value, suffix, min = 0, step = "0.01", onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-wrap">
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))}
        />
        {suffix ? <em>{suffix}</em> : null}
      </div>
    </label>
  );
}

function TextField({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-wrap">
        <input type="text" value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
    </label>
  );
}

function ToggleField({ checked, onChange }) {
  return (
    <label className="toggle-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>Permitir desborde controlado</span>
    </label>
  );
}

function MetricCard({ icon: Icon, label, value, detail }) {
  return (
    <article className="metric-card">
      <div className="metric-icon">
        <Icon size={19} aria-hidden="true" />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
    </article>
  );
}

function ManualSkuPanel({ form, result, errors, exporting, onChange, onSimulate, onExport }) {
  return (
    <section className="manual-panel">
      <div className="manual-panel-head">
        <div>
          <h2>SKU manual</h2>
          <p>{result ? `${result.sku} listo para visualizar y exportar` : "Captura individual"}</p>
        </div>
        {result ? (
          <div className="manual-mini-stats">
            <span>{formatNumber(result.metrics.totalUnits, 0)} unidades</span>
            <span>{formatNumber(result.metrics.finalHeight)} cm alto</span>
            <span>{formatNumber(result.metrics.weightPercent, 1)}% peso</span>
          </div>
        ) : null}
      </div>

      <div className="manual-grid">
        <TextField label="SKU" value={form.sku} onChange={(value) => onChange("sku", value)} />
        <label className="field">
          <span>Tipo</span>
          <select className="select-input" value={form.tipo} onChange={(event) => onChange("tipo", event.target.value)}>
            <option value="Caja">Caja</option>
            <option value="Cilindro">Cilindro</option>
          </select>
        </label>
        <NumberField label="Largo" value={form.largo} suffix="cm" onChange={(value) => onChange("largo", value)} />
        <NumberField
          label={form.tipo === "Cilindro" ? "Diametro" : "Ancho"}
          value={form.ancho}
          suffix="cm"
          onChange={(value) => onChange("ancho", value)}
        />
        <NumberField label="Alto" value={form.alto} suffix="cm" onChange={(value) => onChange("alto", value)} />
        <NumberField label="Peso" value={form.peso} suffix="kg" onChange={(value) => onChange("peso", value)} />
        <NumberField label="Unidades" value={form.unidades} suffix="u" step="1" onChange={(value) => onChange("unidades", value)} />

        <div className="manual-actions">
          <button className="secondary-button" type="button" onClick={onSimulate} disabled={exporting}>
            <Play size={17} aria-hidden="true" />
            <span>Simular</span>
          </button>
          <button className="primary-button" type="button" onClick={onExport} disabled={!result || exporting}>
            <FileText size={17} aria-hidden="true" />
            <span>Exportar PDF</span>
          </button>
        </div>
      </div>

      {errors.length ? (
        <div className="manual-error">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{errors.join(" ")}</span>
        </div>
      ) : null}
    </section>
  );
}

function DataTable({ rows, emptyText, limit = 8 }) {
  if (!rows.length) {
    return <div className="empty-table">{emptyText}</div>;
  }

  const columns = Object.keys(rows[0]);
  const visibleRows = rows.slice(0, limit);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${row.SKU ?? row.sku ?? row.Fila ?? rowIndex}`}>
              {columns.map((column) => (
                <td key={column}>{String(row[column] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > limit ? <p className="table-note">Mostrando {limit} de {rows.length} filas.</p> : null}
    </div>
  );
}

function AlertList({ title, items }) {
  if (!items.length) return null;
  return (
    <div className="alert-box">
      <AlertTriangle size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {items.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
    </div>
  );
}

function ExportProgress({ progress }) {
  if (!progress) return null;

  return (
    <div className="export-progress" role="status" aria-live="polite">
      <div>
        <strong>{progress.phase}</strong>
        <span>{progress.label}</span>
      </div>
      <div className="progress-track" aria-hidden="true">
        <div style={{ width: `${Math.min(Math.max(progress.percent ?? 0, 0), 100)}%` }} />
      </div>
      <small>{Math.min(Math.max(progress.percent ?? 0, 0), 100)}%</small>
    </div>
  );
}

function buildManualRow(form) {
  return {
    SKU: form.sku || "SKU_MANUAL",
    Tipo: form.tipo,
    Largo: form.largo,
    Ancho: form.ancho,
    Alto: form.alto,
    Peso: form.peso,
    Unidades: form.unidades,
  };
}

function safePdfFilename(value) {
  return `${String(value || "SKU")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80)}.pdf`;
}

export default function App() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [rawRows, setRawRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL_FORM);
  const [manualRow, setManualRow] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [manualExporting, setManualExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportProgress, setExportProgress] = useState(null);

  const processed = useMemo(() => {
    if (!rawRows.length) {
      return { results: [], errors: [], configErrors: validateConfig(config) };
    }
    return processRows(rawRows, config);
  }, [rawRows, config]);

  const manualProcessed = useMemo(() => {
    if (!manualRow) {
      return { results: [], errors: [], configErrors: [] };
    }
    return processRows([manualRow], config);
  }, [manualRow, config]);

  const safeConfig = useMemo(() => coerceConfig(config), [config]);
  const results = processed.results;
  const errors = processed.errors;
  const manualResult = manualProcessed.results[0] ?? null;
  const manualErrors = useMemo(() => {
    if (!manualRow) return [];
    return [
      ...(manualProcessed.configErrors ?? []),
      ...manualProcessed.errors.map((error) => error.reason),
    ];
  }, [manualProcessed, manualRow]);
  const viewerResults = useMemo(() => (manualResult ? [manualResult, ...results] : results), [manualResult, results]);
  const selectedResult = viewerResults[selectedIndex] ?? null;
  const summaryRows = useMemo(() => results.map(resultToSummaryRow), [results]);
  const errorRows = useMemo(
    () =>
      errors.map((error) => ({
        Fila: error.rowNumber,
        SKU: error.sku,
        Tipo: error.type,
        Motivo: error.reason,
      })),
    [errors],
  );

  const totals = useMemo(() => {
    const units = results.reduce((sum, result) => sum + result.metrics.totalUnits, 0);
    const maxUnits = results.reduce((max, result) => Math.max(max, result.metrics.totalUnits), 0);
    const averageWeight = results.length
      ? results.reduce((sum, result) => sum + result.metrics.weightPercent, 0) / results.length
      : 0;
    return { units, maxUnits, averageWeight };
  }, [results]);
  const exportBusy = exporting || manualExporting;

  useEffect(() => {
    if (selectedIndex > viewerResults.length - 1) setSelectedIndex(Math.max(0, viewerResults.length - 1));
  }, [viewerResults.length, selectedIndex]);

  function updateConfig(key, value) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function updateManualForm(key, value) {
    setManualForm((current) => ({ ...current, [key]: value }));
    setManualRow(null);
  }

  function handleManualSimulate() {
    setManualRow(buildManualRow(manualForm));
    setSelectedIndex(0);
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError("");
    setFileName(file.name);

    try {
      const { readExcelFile } = await import("./utils/excelFiles.js");
      const rows = await readExcelFile(file);
      setRawRows(rows);
      setSelectedIndex(0);
    } catch (error) {
      setRawRows([]);
      setUploadError(error.message || "No se pudo leer el archivo.");
    } finally {
      event.target.value = "";
    }
  }

  function loadExampleRows() {
    setUploadError("");
    setFileName("Datos de ejemplo");
    setRawRows(buildExampleRows());
    setSelectedIndex(0);
  }

  async function handleDownloadZip() {
    if (!results.length || exportBusy) return;
    setExporting(true);
    setExportError("");
    setExportProgress({
      phase: "Preparando",
      current: 0,
      total: results.length,
      percent: 0,
      label: "Iniciando exportacion",
    });
    try {
      const { createResultsZipChunks, downloadBlob } = await import("./utils/exporters.js");
      const { totalBatches } = await createResultsZipChunks(results, errors, safeConfig, {
        chunkSize: 20,
        onProgress: setExportProgress,
        onChunkReady: ({ blob, filename }) => downloadBlob(blob, filename),
      });
      setExportProgress({
        phase: "Listo",
        current: results.length,
        total: results.length,
        percent: 100,
        label: totalBatches > 1 ? `${totalBatches} ZIPs descargados` : "ZIP descargado",
      });
      window.setTimeout(() => setExportProgress(null), 1800);
    } catch (error) {
      setExportError(error.message || "No se pudo generar el ZIP.");
      setExportProgress(null);
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadExcel() {
    if (!results.length || exportBusy) return;
    setExporting(true);
    setExportError("");
    setExportProgress({
      phase: "Preparando",
      current: 0,
      total: results.length,
      percent: 0,
      label: "Generando consolidado",
    });
    try {
      const { buildSummaryWorkbook } = await import("./utils/excelFiles.js");
      const { downloadBlob } = await import("./utils/exporters.js");
      const buffer = await buildSummaryWorkbook(results, errors);
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      downloadBlob(blob, "resumen_consolidado.xlsx");
      setExportProgress({
        phase: "Listo",
        current: results.length,
        total: results.length,
        percent: 100,
        label: "Excel descargado",
      });
      window.setTimeout(() => setExportProgress(null), 1800);
    } catch (error) {
      setExportError(error.message || "No se pudo generar el Excel.");
      setExportProgress(null);
    } finally {
      setExporting(false);
    }
  }

  async function handleManualExportPdf() {
    if (!manualResult || exportBusy) return;
    setManualExporting(true);
    setExportError("");
    setExportProgress({
      phase: "Preparando PDF",
      current: 0,
      total: 1,
      percent: 0,
      label: `Generando ${manualResult.sku}`,
    });

    try {
      const { createSkuPdf, downloadBlob } = await import("./utils/exporters.js");
      const buffer = await createSkuPdf(manualResult, safeConfig);
      const blob = new Blob([buffer], { type: "application/pdf" });
      downloadBlob(blob, safePdfFilename(manualResult.sku));
      setExportProgress({
        phase: "Listo",
        current: 1,
        total: 1,
        percent: 100,
        label: "PDF descargado",
      });
      window.setTimeout(() => setExportProgress(null), 1800);
    } catch (error) {
      setExportError(error.message || "No se pudo generar el PDF.");
      setExportProgress(null);
    } finally {
      setManualExporting(false);
    }
  }

  function goToPrevious() {
    if (!viewerResults.length) return;
    setSelectedIndex((current) => (current - 1 + viewerResults.length) % viewerResults.length);
  }

  function goToNext() {
    if (!viewerResults.length) return;
    setSelectedIndex((current) => (current + 1) % viewerResults.length);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/images.png" alt="SINSA" />
          <div>
            <strong>Acomodo de Pallets</strong>
            <span>Configuracion</span>
          </div>
        </div>

        <section className="control-panel">
          <h2>Configuracion del pallet</h2>
          <NumberField
            label="Largo del pallet"
            value={config.palletLength}
            suffix="cm"
            onChange={(value) => updateConfig("palletLength", value)}
          />
          <NumberField
            label="Ancho del pallet"
            value={config.palletWidth}
            suffix="cm"
            onChange={(value) => updateConfig("palletWidth", value)}
          />
          <NumberField
            label="Altura maxima"
            value={config.palletMaxHeight}
            suffix="cm"
            onChange={(value) => updateConfig("palletMaxHeight", value)}
          />
          <NumberField
            label="Altura del polin"
            value={config.palletBaseHeight}
            suffix="cm"
            onChange={(value) => updateConfig("palletBaseHeight", value)}
          />
          <NumberField
            label="Peso maximo"
            value={config.palletMaxWeight}
            suffix="kg"
            onChange={(value) => updateConfig("palletMaxWeight", value)}
          />
          <NumberField
            label="Desborde maximo"
            value={config.maxOverhang}
            suffix="cm"
            onChange={(value) => updateConfig("maxOverhang", value)}
          />
          <ToggleField checked={config.allowOverhang} onChange={(value) => updateConfig("allowOverhang", value)} />
        </section>

        <section className="control-panel">
          <h2>Archivo de productos</h2>
          <label className="file-button">
            <Upload size={17} aria-hidden="true" />
            <span>Seleccionar Excel</span>
            <input type="file" accept=".xlsx" onChange={handleFileChange} />
          </label>
          <button className="secondary-button" type="button" onClick={loadExampleRows}>
            <FileSpreadsheet size={17} aria-hidden="true" />
            <span>Cargar ejemplo</span>
          </button>
          <div className="file-name">{fileName || "Sin archivo seleccionado"}</div>
        </section>
      </aside>

      <main className="main-content">
        <header className="app-header">
          <div className="title-block">
            <img src="/paleta.png" alt="" />
            <div>
              <h1>Acomodo de multiples SKUs en pallets</h1>
              <p>Simulacion, validacion y salida consolidada</p>
            </div>
          </div>
          <div className="header-actions" style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              className="secondary-button"
              type="button"
              onClick={handleDownloadExcel}
              disabled={!results.length || exportBusy}
              title="Descargar solo Excel"
            >
              <FileSpreadsheet size={18} aria-hidden="true" />
              <span>{exporting ? "Generando Excel" : "Descargar Excel"}</span>
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={handleDownloadZip}
              disabled={!results.length || exportBusy}
              title="Descargar resultados"
            >
              <Download size={18} aria-hidden="true" />
              <span>{exporting ? "Generando ZIP" : "Descargar ZIP"}</span>
            </button>
          </div>
        </header>

        <AlertList title="Revise la configuracion" items={processed.configErrors ?? []} />
        <AlertList title="No se pudo leer el archivo" items={uploadError ? [uploadError] : []} />
        <AlertList title="No se pudo generar el ZIP" items={exportError ? [exportError] : []} />
        <ExportProgress progress={exportProgress} />

        <section className="metrics-grid">
          <MetricCard icon={PackageCheck} label="SKUs validos" value={results.length} detail={`${errors.length} con error`} />
          <MetricCard icon={Box} label="Total por simulacion" value={formatNumber(totals.units, 0)} detail="unidades acomodadas" />
          <MetricCard icon={Layers} label="Mayor acomodo" value={formatNumber(totals.maxUnits, 0)} detail="unidades por pallet" />
          <MetricCard icon={Weight} label="Peso promedio" value={`${formatNumber(totals.averageWeight, 1)}%`} detail="ocupacion del limite" />
        </section>

        <ManualSkuPanel
          form={manualForm}
          result={manualResult}
          errors={manualErrors}
          exporting={exportBusy}
          onChange={updateManualForm}
          onSimulate={handleManualSimulate}
          onExport={handleManualExportPdf}
        />

        <section className="work-grid">
          <div className="viewer-panel">
            <div className="panel-header">
              <div>
                <h2>Visualizador 3D</h2>
                <p>{selectedResult ? `${selectedResult.sku} - ${selectedResult.typeLabel}` : "Sin SKU seleccionado"}</p>
              </div>
              <div className="viewer-actions">
                <button className="icon-button" type="button" onClick={goToPrevious} disabled={!viewerResults.length} title="Anterior">
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <select
                  value={selectedIndex}
                  onChange={(event) => setSelectedIndex(Number(event.target.value))}
                  disabled={!viewerResults.length}
                  aria-label="Seleccionar SKU"
                >
                  {viewerResults.length ? (
                    viewerResults.map((result, index) => (
                      <option value={index} key={`${result.id}-${index}`}>
                        {index === 0 && manualResult ? `${result.sku} (manual)` : result.sku}
                      </option>
                    ))
                  ) : (
                    <option value={0}>Sin resultados</option>
                  )}
                </select>
                <button className="icon-button" type="button" onClick={goToNext} disabled={!viewerResults.length} title="Siguiente">
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>
            </div>

            <PalletViewer result={selectedResult} config={safeConfig} />

            {selectedResult ? (
              <div className="viewer-stats">
                <span>
                  <Ruler size={15} aria-hidden="true" />
                  {formatNumber(selectedResult.metrics.finalLength)} x {formatNumber(selectedResult.metrics.finalWidth)} x{" "}
                  {formatNumber(selectedResult.metrics.finalHeight)} cm
                </span>
                <span>
                  <Layers size={15} aria-hidden="true" />
                  {selectedResult.metrics.fullLayers} camas completas
                </span>
                <span>
                  <Rotate3D size={15} aria-hidden="true" />
                  {selectedResult.orientation}
                </span>
              </div>
            ) : null}
          </div>

          <div className="tables-panel">
            <section>
              <div className="panel-header compact">
                <div>
                  <h2>Resultados por SKU</h2>
                  <p>{summaryRows.length ? `${summaryRows.length} filas calculadas` : "Sin resultados"}</p>
                </div>
              </div>
              <DataTable rows={summaryRows} emptyText="Cargue un archivo Excel para ver resultados." limit={8} />
            </section>

            <section>
              <div className="panel-header compact">
                <div>
                  <h2>Errores controlados</h2>
                  <p>{errorRows.length ? `${errorRows.length} filas omitidas` : "Sin errores"}</p>
                </div>
              </div>
              <DataTable rows={errorRows} emptyText="No hay errores de medidas o columnas." limit={6} />
            </section>
          </div>
        </section>

        <section className="input-panel">
          <div className="panel-header compact">
            <div>
              <h2>Tabla de entrada</h2>
              <p>{rawRows.length ? `${rawRows.length} filas leidas` : "Sin datos cargados"}</p>
            </div>
          </div>
          <DataTable rows={rawRows} emptyText="El archivo debe incluir Tipo, Largo, Ancho, Alto y Peso." limit={8} />
        </section>
      </main>
    </div>
  );
}
