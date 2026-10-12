import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
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
  Search,
  Truck,
  Upload,
  Weight,
} from "lucide-react";
import { useSimulation } from "./hooks/useSimulation.js";
import { downloadBlob, pdfFilename } from "./utils/downloads.js";
const PalletViewer = lazy(() => import("./components/PalletViewer.jsx"));
const MultiSkuView = lazy(() => import("./components/MultiSkuView.jsx"));
import {
  buildExampleRows,
  coerceConfig,
  DEFAULT_CONFIG,
  formatNumber,
  resultToSummaryRow,
} from "./utils/palletLogic.js";

const EMPTY_MANUAL_FORM = {
  sku: "",
  tipo: "Caja",
  largo: "",
  ancho: "",
  alto: "",
  peso: "",
  unidades: "",
  maxCamas: "",
  fragil: false,
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

function ToggleField({ label = "Permitir desborde controlado", checked, onChange }) {
  return (
    <label className="toggle-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
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
        <NumberField label="Unidades informativas" value={form.unidades} suffix="u" step="1" onChange={(value) => onChange("unidades", value)} />
        <NumberField label="Camas máx" value={form.maxCamas} suffix="camas" step="1" onChange={(value) => onChange("maxCamas", value)} />
        <label className="toggle-row" style={{ marginTop: "28px" }}>
          <input
            type="checkbox"
            checked={Boolean(form.fragil)}
            onChange={(event) => onChange("fragil", event.target.checked)}
          />
          <span>Frágil (1 cama)</span>
        </label>

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

      <p className="table-note">Unidades es informativo: no limita la capacidad calculada ni distribuye pedidos entre pallets.</p>
      {errors.length ? (
        <div className="manual-error">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{errors.join(" ")}</span>
        </div>
      ) : null}
    </section>
  );
}

function DataTable({
  rows,
  emptyText,
  limit = 8,
  searchable = true,
  onRowSelect = null,
  selectedRowKey = null,
  renderRowAction = null,
}) {
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(limit);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [rows.length, query]);

  if (!rows.length) {
    return <div className="empty-table">{emptyText}</div>;
  }

  const columns = Object.keys(rows[0]).filter((key) => key !== "__source" && key !== "__result");

  const filteredRows = query.trim()
    ? rows.filter((row) =>
        columns.some((col) =>
          String(row[col] ?? "")
            .toLowerCase()
            .includes(query.toLowerCase().trim()),
        ),
      )
    : rows;

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageIndex = Math.min(Math.max(currentPage, 1), totalPages);
  const startIndex = (pageIndex - 1) * pageSize;
  const visibleRows = filteredRows.slice(startIndex, startIndex + pageSize);

  return (
    <div className="datatable-container">
      {searchable && rows.length > 3 && (
        <div className="datatable-toolbar">
          <div className="search-wrap">
            <Search size={14} aria-hidden="true" />
            <input
              type="text"
              placeholder="Buscar..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="search-input"
            />
            {query && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setQuery("")}
                title="Limpiar búsqueda"
              >
                ×
              </button>
            )}
          </div>
          <span className="search-count">
            {filteredRows.length} {filteredRows.length === 1 ? "registro" : "registros"}
          </span>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {renderRowAction && <th style={{ width: "64px", textAlign: "center" }}>Acción</th>}
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, idx) => {
              const rowKey = row.SKU ?? row.sku ?? row.Fila ?? `${startIndex + idx}`;
              const isSelected = selectedRowKey !== null && selectedRowKey === rowKey;
              return (
                <tr
                  key={`${startIndex + idx}-${rowKey}`}
                  className={`${onRowSelect ? "clickable-row" : ""} ${isSelected ? "selected-row" : ""}`}
                  onClick={() => onRowSelect?.(row, startIndex + idx)}
                  title={onRowSelect ? "Haga clic para ver este SKU en el visualizador 3D" : undefined}
                >
                  {renderRowAction && (
                    <td
                      style={{ textAlign: "center", verticalAlign: "middle" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {renderRowAction(row, startIndex + idx)}
                    </td>
                  )}
                  {columns.map((column) => (
                    <td key={column}>{String(row[column] ?? "")}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="datatable-footer">
        <div className="page-size-selector">
          <span>Mostrar</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={5}>5</option>
            <option value={8}>8</option>
            <option value={15}>15</option>
            <option value={30}>30</option>
          </select>
          <span>por página</span>
        </div>

        {totalPages > 1 && (
          <div className="pagination-controls">
            <button
              type="button"
              className="page-btn"
              disabled={pageIndex <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              title="Página anterior"
            >
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
            <span className="page-indicator">
              Página <strong>{pageIndex}</strong> de {totalPages}
            </span>
            <button
              type="button"
              className="page-btn"
              disabled={pageIndex >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              title="Página siguiente"
            >
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
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
    "1camamax": form.maxCamas,
    Fragil: form.fragil ? "Si" : "No",
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState("single");
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
  const [importing, setImporting] = useState(false);
  const importVersion = useRef(0);
  useEffect(() => () => { importVersion.current += 1; }, []);

  const { processed, processing } = useSimulation(rawRows, config);
  const manualRows = useMemo(() => manualRow ? [manualRow] : [], [manualRow]);
  const { processed: manualProcessed, processing: manualProcessing } = useSimulation(manualRows, config);
  const { processed: multiSkuProcessed, processing: multiSkuProcessing } = useSimulation(rawRows, config, "multiSku");

  const safeConfig = useMemo(() => coerceConfig(config), [config]);
  const results = processed.results;
  const errors = processed.errors;
  const manualResult = manualProcessed.results[0] ?? null;
  const manualErrorObjects = useMemo(() => {
    if (!manualRow) return [];
    return [
      ...(manualProcessed.configErrors ?? []).map((reason) => ({
        rowNumber: "Manual",
        sku: manualRow.SKU || "SKU_MANUAL",
        type: manualRow.Tipo || "-",
        reason,
      })),
      ...manualProcessed.errors.map((error) => ({
        ...error,
        rowNumber: "Manual",
      })),
    ];
  }, [manualProcessed, manualRow]);
  const manualErrors = useMemo(() => manualErrorObjects.map((error) => error.reason), [manualErrorObjects]);
  const activeResults = useMemo(() => (manualResult ? [manualResult, ...results] : results), [manualResult, results]);
  const activeErrors = useMemo(() => [...manualErrorObjects, ...errors], [manualErrorObjects, errors]);
  const viewerResults = activeResults;
  const selectedResult = viewerResults[selectedIndex] ?? null;
  const summaryRows = useMemo(() => activeResults.map((result) => {
    const summary = resultToSummaryRow(result);
    delete summary["Version del algoritmo"];
    summary.__result = result;
    return summary;
  }), [activeResults]);
  const errorRows = useMemo(
    () =>
      activeErrors.map((error) => ({
        Fila: error.rowNumber,
        SKU: error.sku,
        Tipo: error.type,
        Motivo: error.reason,
      })),
    [activeErrors],
  );

  const totals = useMemo(() => {
    const units = activeResults.reduce((sum, result) => sum + result.metrics.totalUnits, 0);
    const maxUnits = activeResults.reduce((max, result) => Math.max(max, result.metrics.totalUnits), 0);
    const averageWeight = activeResults.length
      ? activeResults.reduce((sum, result) => sum + result.metrics.weightPercent, 0) / activeResults.length
      : 0;
    return { units, maxUnits, averageWeight };
  }, [activeResults]);
  const exportBusy = exporting || manualExporting || importing || processing || manualProcessing;

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
    setManualRow({ ...buildManualRow(manualForm), __source: { rowNumber: "Manual", sheet: "Captura manual", file: "" } });
    setSelectedIndex(0);
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const requestVersion = ++importVersion.current;
    event.target.value = "";
    setImporting(true);
    setRawRows([]);
    setUploadError("");
    setFileName(file.name);

    try {
      const { readExcelFile } = await import("./utils/excelFiles.js");
      const rows = await readExcelFile(file);
      if (requestVersion !== importVersion.current) return;
      setRawRows(rows);
      setSelectedIndex(0);
    } catch (error) {
      if (requestVersion !== importVersion.current) return;
      setRawRows([]);
      setUploadError(error.message || "No se pudo leer el archivo.");
    } finally {
      if (requestVersion === importVersion.current) setImporting(false);
    }
  }

  function loadExampleRows() {
    importVersion.current += 1;
    setImporting(false);
    setUploadError("");
    setFileName("Datos de ejemplo");
    setRawRows(buildExampleRows());
    setSelectedIndex(0);
  }

  async function handleDownloadZip() {
    if (!activeResults.length || exportBusy) return;
    setExporting(true);
    setExportError("");
    setExportProgress({
      phase: "Preparando",
      current: 0,
      total: activeResults.length,
      percent: 0,
      label: "Iniciando exportacion",
    });
    try {
      const { createResultsZipChunks } = await import("./utils/exporters.js");
      const { totalBatches } = await createResultsZipChunks(activeResults, activeErrors, safeConfig, {
        chunkSize: 20,
        onProgress: setExportProgress,
        onChunkReady: ({ blob, filename }) => downloadBlob(blob, filename),
      });
      setExportProgress({
        phase: "Listo",
        current: activeResults.length,
        total: activeResults.length,
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
    if (!activeResults.length || exportBusy) return;
    setExporting(true);
    setExportError("");
    setExportProgress({
      phase: "Preparando",
      current: 0,
      total: activeResults.length,
      percent: 0,
      label: "Generando consolidado",
    });
    try {
      const { buildSummaryWorkbook } = await import("./utils/excelFiles.js");
      const buffer = await buildSummaryWorkbook(activeResults, activeErrors);
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      downloadBlob(blob, "resumen_consolidado.xlsx");
      setExportProgress({
        phase: "Listo",
        current: activeResults.length,
        total: activeResults.length,
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
      const { createSkuPdf } = await import("./utils/exporters.js");
      const buffer = await createSkuPdf(manualResult, safeConfig);
      const blob = new Blob([buffer], { type: "application/pdf" });
      downloadBlob(blob, pdfFilename(manualResult.sku, 0));
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

  async function handleExportSinglePdf(targetResult) {
    if (!targetResult || exportBusy) return;
    setExporting(true);
    setExportError("");
    setExportProgress({
      phase: "Preparando PDF",
      current: 0,
      total: 1,
      percent: 0,
      label: `Generando PDF: ${targetResult.sku}`,
    });

    try {
      const { createSkuPdf } = await import("./utils/exporters.js");
      const buffer = await createSkuPdf(targetResult, safeConfig);
      const blob = new Blob([buffer], { type: "application/pdf" });
      downloadBlob(blob, pdfFilename(targetResult.sku, 0));
      setExportProgress({
        phase: "Listo",
        current: 1,
        total: 1,
        percent: 100,
        label: `PDF de ${targetResult.sku} descargado`,
      });
      window.setTimeout(() => setExportProgress(null), 1800);
    } catch (error) {
      setExportError(error.message || "No se pudo generar el PDF.");
      setExportProgress(null);
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadTemplate() {
    try {
      const { generateTemplateWorkbook } = await import("./utils/excelFiles.js");
      const buffer = await generateTemplateWorkbook();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      downloadBlob(blob, "plantilla_productos_pallet.xlsx");
    } catch (error) {
      setUploadError("No se pudo generar la plantilla: " + (error.message || ""));
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
          <img src={`${import.meta.env.BASE_URL}images.png`} alt="SINSA" />
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
          <p className="table-note">Desborde por lado: hasta el 20 % de la medida y el maximo indicado. Se habilita desde 20 cm en largo y 40 cm en ancho, segun la orientacion.</p>
          <ToggleField label="Permitir desborde controlado" checked={config.allowOverhang} onChange={(value) => updateConfig("allowOverhang", value)} />
          <ToggleField label="Traba de carga (capas alternadas)" checked={config.interlockLayers} onChange={(value) => updateConfig("interlockLayers", value)} />
        </section>

        <section className="control-panel">
          <h2>Archivo de productos</h2>
          <label className="file-button">
            <Upload size={17} aria-hidden="true" />
            <span>Seleccionar Excel</span>
            <input type="file" accept=".xlsx" onChange={handleFileChange} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "8px" }}>
            <button className="secondary-button" type="button" onClick={loadExampleRows} style={{ marginTop: 0 }}>
              <FileSpreadsheet size={16} aria-hidden="true" />
              <span>Ejemplo</span>
            </button>
            <button className="secondary-button" type="button" onClick={handleDownloadTemplate} style={{ marginTop: 0 }} title="Descargar plantilla Excel limpia con formato y columnas requeridas">
              <Download size={16} aria-hidden="true" />
              <span>Plantilla</span>
            </button>
          </div>
          <p className="table-note">Primera hoja, hasta 10.000 filas y 20 MB. Use celdas numericas; en texto, coma o punto unico significa decimal (0,125 = 0.125). No incluya unidades en la celda.</p>
          <div className="file-name">{fileName || "Sin archivo seleccionado"}</div>
        </section>
      </aside>

      <main className="main-content">
        <header className="app-header">
          <div className="title-block">
            <img src={`${import.meta.env.BASE_URL}paleta.png`} alt="" />
            <div>
              <h1>Capacidad de pallets por SKU</h1>
              <p>Un SKU por pallet · Simulacion y salida consolidada</p>
            </div>
          </div>
          <div className="header-actions" style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              className="secondary-button"
              type="button"
              onClick={handleDownloadExcel}
              disabled={!activeResults.length || exportBusy}
              title="Descargar solo Excel"
            >
              <FileSpreadsheet size={18} aria-hidden="true" />
              <span>{exporting ? "Generando Excel" : "Descargar Excel"}</span>
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={handleDownloadZip}
              disabled={!activeResults.length || exportBusy}
              title="Descargar resultados"
            >
              <Download size={18} aria-hidden="true" />
              <span>{exporting ? "Generando ZIP" : "Descargar ZIP"}</span>
            </button>
          </div>
        </header>

        <AlertList title="Revise la configuracion" items={processed.configErrors ?? []} />
        <AlertList title="No se pudo leer el archivo" items={uploadError ? [uploadError] : []} />
        <AlertList title="No se pudo generar la exportacion" items={exportError ? [exportError] : []} />
        <ExportProgress progress={exportProgress} />
        {importing || processing || manualProcessing ? <p role="status" aria-live="polite">{importing ? "Leyendo archivo..." : "Calculando acomodos..."}</p> : null}

        <nav className="mode-tabs" aria-label="Modo de paletizado">
          <button
            type="button"
            className={`mode-tab ${activeTab === "single" ? "active" : ""}`}
            onClick={() => setActiveTab("single")}
          >
            <Box size={18} aria-hidden="true" />
            <span>Monoproducto (1 SKU por pallet)</span>
          </button>
          <button
            type="button"
            className={`mode-tab ${activeTab === "multi" ? "active" : ""}`}
            onClick={() => setActiveTab("multi")}
          >
            <Truck size={18} aria-hidden="true" />
            <span>Multi-SKU (Pallet mixto)</span>
            {rawRows.length > 0 && (multiSkuProcessed.pallets?.length ?? 0) > 0 && (
              <span className="mode-tab-badge">{multiSkuProcessed.pallets.length} pallet(s)</span>
            )}
          </button>
        </nav>

        {activeTab === "single" ? (
          <>
            <section className="metrics-grid">
              <MetricCard icon={PackageCheck} label="SKUs validos" value={activeResults.length} detail={`${activeErrors.length} con error`} />
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

            {selectedResult ? (
              <Suspense fallback={<div className="viewer-empty">Cargando visualizador...</div>}>
                <PalletViewer result={selectedResult} config={safeConfig} />
              </Suspense>
            ) : <div className="viewer-empty">Sin acomodo para visualizar</div>}
            <AlertList title="Advertencias del acomodo" items={selectedResult?.warnings ?? []} />

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
              <DataTable
                rows={summaryRows}
                emptyText="Cargue un archivo Excel para ver resultados."
                limit={8}
                searchable={true}
                selectedRowKey={selectedResult?.sku}
                onRowSelect={(row) => {
                  const targetSku = row.SKU;
                  const idx = viewerResults.findIndex((r) => r.sku === targetSku);
                  if (idx !== -1) setSelectedIndex(idx);
                }}
                renderRowAction={(row) => (
                  <button
                    type="button"
                    className="row-action-btn"
                    title={`Descargar PDF de ${row.SKU}`}
                    disabled={exportBusy}
                    onClick={() => handleExportSinglePdf(row.__result)}
                  >
                    <FileText size={14} aria-hidden="true" />
                  </button>
                )}
              />
            </section>

            <section>
              <div className="panel-header compact">
                <div>
                  <h2>Errores controlados</h2>
                  <p>{errorRows.length ? `${errorRows.length} filas omitidas` : "Sin errores"}</p>
                </div>
              </div>
              <DataTable rows={errorRows} emptyText="No hay errores de medidas o columnas." limit={6} searchable={true} />
            </section>
          </div>
        </section>
      </>
    ) : (
      <Suspense fallback={<div className="viewer-empty">Cargando módulo Multi-SKU...</div>}>
        <MultiSkuView
          multiSkuData={multiSkuProcessed}
          config={safeConfig}
          rawRows={rawRows}
          exporting={exportBusy}
        />
      </Suspense>
    )}

    <section className="input-panel">
          <div className="panel-header compact">
            <div>
              <h2>Tabla de entrada</h2>
              <p>{rawRows.length ? `${rawRows.length} filas leidas` : "Sin datos cargados"}</p>
            </div>
          </div>
          <DataTable rows={rawRows} emptyText="El archivo debe incluir Tipo, Largo, Ancho, Alto y Peso." limit={8} searchable={true} />
        </section>
      </main>
    </div>
  );
}
