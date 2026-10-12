import React, { useState, useMemo, Suspense, lazy } from "react";
import {
  Box,
  Layers,
  Weight,
  Ruler,
  AlertTriangle,
  FileSpreadsheet,
  CheckCircle,
  Truck,
  Rotate3D,
  Sparkles,
} from "lucide-react";
import { formatNumber } from "../utils/palletLogic.js";
import { downloadBlob } from "../utils/downloads.js";

const PalletViewer = lazy(() => import("./PalletViewer.jsx"));

export default function MultiSkuView({
  multiSkuData,
  config,
  rawRows,
  onExportExcel,
  exporting = false,
}) {
  const [selectedPalletIndex, setSelectedPalletIndex] = useState(0);
  const [selectedStrategyId, setSelectedStrategyId] = useState("auto");

  const strategies = multiSkuData?.strategies ?? [];

  const activeStrategy = useMemo(() => {
    if (selectedStrategyId === "auto") {
      return {
        id: "auto",
        label: `Automático (Más óptima: ${multiSkuData?.bestStrategyLabel ?? "Recomendada"})`,
        pallets: multiSkuData?.pallets ?? [],
        unplaced: multiSkuData?.unplaced ?? [],
      };
    }
    const found = strategies.find((s) => s.id === selectedStrategyId);
    return found || {
      id: "auto",
      label: "Automático",
      pallets: multiSkuData?.pallets ?? [],
      unplaced: multiSkuData?.unplaced ?? [],
    };
  }, [selectedStrategyId, multiSkuData, strategies]);

  const pallets = activeStrategy.pallets;
  const currentPallet = pallets[selectedPalletIndex] ?? pallets[0] ?? null;

  const totalPallets = pallets.length;
  const totalUnitsPlaced = pallets.reduce((sum, p) => sum + (p.metrics.totalUnits || 0), 0);
  const totalUnitsRequested = multiSkuData?.totalRequested ?? 0;
  const totalWeight = pallets.reduce((sum, p) => sum + (p.metrics.totalWeight || 0), 0);
  const unplacedUnits = activeStrategy.unplaced ?? [];
  const errors = multiSkuData?.errors ?? [];

  async function handleDownloadMultiSkuExcel() {
    if (!pallets.length || exporting) return;
    try {
      const { buildMultiSkuWorkbook } = await import("../utils/excelFiles.js");
      const buffer = await buildMultiSkuWorkbook({ ...multiSkuData, pallets, unplaced: unplacedUnits }, config);
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      downloadBlob(blob, "resumen_pallets_multi_sku.xlsx");
    } catch (err) {
      console.error("Error al exportar Excel multi-SKU:", err);
    }
  }

  if (!rawRows || rawRows.length === 0) {
    return (
      <div className="empty-panel" style={{ textAlign: "center", padding: "4rem 2rem" }}>
        <Truck size={48} style={{ color: "#94a3b8", marginBottom: "1rem" }} />
        <h3>Sin datos para pallet Multi-SKU</h3>
        <p style={{ color: "#64748b", maxWidth: "480px", margin: "0 auto" }}>
          Cargue un archivo Excel o use el botón "Ejemplo" en el panel lateral. Las cantidades
          especificadas en la columna <strong>Unidades</strong> / <strong>Cantidad</strong> definirán el pedido a
          distribuir en el pallet mixto.
        </p>
      </div>
    );
  }

  if (pallets.length === 0) {
    return (
      <div className="empty-panel" style={{ textAlign: "center", padding: "3rem 2rem" }}>
        <AlertTriangle size={48} style={{ color: "#f59e0b", marginBottom: "1rem" }} />
        <h3>No se pudo generar el acomodo Multi-SKU</h3>
        <p style={{ color: "#64748b", maxWidth: "520px", margin: "0 auto 1.5rem" }}>
          Revise que los productos tengan un valor numérico mayor que 0 en la columna <strong>Unidades</strong> y que sus dimensiones quepan en el pallet configurado.
        </p>
        {errors.length > 0 && (
          <div style={{ maxWidth: "600px", margin: "0 auto", textAlign: "left" }} className="alert-box">
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <strong>Observaciones encontradas:</strong>
              {errors.slice(0, 6).map((e, idx) => (
                <p key={idx}>
                  <strong>{e.sku}:</strong> {e.reason}
                </p>
              ))}
              {errors.length > 6 && <p>... y {errors.length - 6} observaciones más.</p>}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="multi-sku-container">
      {/* KPI Cards Header */}
      <section className="metrics-grid" style={{ marginBottom: "1.25rem" }}>
        <article className="metric-card">
          <div className="metric-icon" style={{ background: "#eff6ff", color: "#2563eb" }}>
            <Truck size={19} aria-hidden="true" />
          </div>
          <div>
            <span>Pallets requeridos</span>
            <strong>{totalPallets}</strong>
            <small>{totalPallets === 1 ? "1 pallet completo" : `${totalPallets} pallets en total`}</small>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-icon" style={{ background: "#ecfdf5", color: "#16a34a" }}>
            <Box size={19} aria-hidden="true" />
          </div>
          <div>
            <span>Unidades colocadas</span>
            <strong>{formatNumber(totalUnitsPlaced, 0)}</strong>
            <small>de {formatNumber(totalUnitsRequested, 0)} solicitadas</small>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-icon" style={{ background: "#fef3c7", color: "#d97706" }}>
            <Weight size={19} aria-hidden="true" />
          </div>
          <div>
            <span>Peso total pedido</span>
            <strong>{formatNumber(totalWeight, 1)} kg</strong>
            <small>entre {totalPallets} pallet(s)</small>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-icon" style={{ background: "#f3e8ff", color: "#9333ea" }}>
            <CheckCircle size={19} aria-hidden="true" />
          </div>
          <div>
            <span>Eficiencia de entrega</span>
            <strong>
              {totalUnitsRequested > 0 ? `${round((totalUnitsPlaced / totalUnitsRequested) * 100, 1)}%` : "100%"}
            </strong>
            <small>{unplacedUnits.length === 0 ? "100% unidades colocadas" : `${unplacedUnits.length} sobrantes`}</small>
          </div>
        </article>
      </section>

      {/* Warnings & Unplaced alerts */}
      {unplacedUnits.length > 0 && (
        <div className="alert-box" style={{ marginBottom: "1rem" }}>
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>Unidades que no cupieron ({unplacedUnits.length} u):</strong>
            <p>
              El pedido superó la capacidad máxima o límite de altura/peso de los pallets. Se ubicaron {totalUnitsPlaced} unidades con éxito.
            </p>
          </div>
        </div>
      )}

      {/* Main Work Area */}
      <section className="work-grid">
        {/* 3D Visualizer Panel */}
        <div className="viewer-panel">
          <div className="panel-header" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <h2>Visualizador 3D Multi-SKU</h2>
              <p>
                {currentPallet ? `${currentPallet.sku} · ${currentPallet.metrics.totalUnits} cajas de ${currentPallet.skuBreakdown?.length} SKUs` : "Pallet mixto"}
              </p>
            </div>

            {/* Pallet Selector Tabs (if multiple pallets) */}
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              {pallets.length > 1 && (
                <div className="btn-group" style={{ marginRight: "8px" }}>
                  {pallets.map((pallet, idx) => (
                    <button
                      key={pallet.id}
                      type="button"
                      className={`view-btn ${selectedPalletIndex === idx ? "active" : ""}`}
                      onClick={() => setSelectedPalletIndex(idx)}
                      title={`Ver ${pallet.sku}`}
                    >
                      Pallet {idx + 1} ({pallet.metrics.totalUnits} u)
                    </button>
                  ))}
                </div>
              )}

              <button
                className="secondary-button"
                type="button"
                onClick={handleDownloadMultiSkuExcel}
                disabled={exporting}
                style={{ marginTop: 0, padding: "6px 12px", fontSize: "0.85rem" }}
                title="Descargar reporte consolidado en Excel"
              >
                <FileSpreadsheet size={15} aria-hidden="true" />
                <span>Exportar Excel</span>
              </button>
            </div>
          </div>

          {/* Strategy Alternative Selector Bar */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 15px", background: "#f8fafc", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", gap: "5px" }}>
              <Sparkles size={15} style={{ color: "#d97706" }} /> Estrategia de Acomodo:
            </span>
            <select
              value={selectedStrategyId}
              onChange={(e) => {
                setSelectedStrategyId(e.target.value);
                setSelectedPalletIndex(0);
              }}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "0.85rem",
                fontWeight: 600,
                color: "#1e293b",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              <option value="auto">
                ⭐ Automático (Más óptima: {multiSkuData?.bestStrategyLabel || "Recomendada"})
              </option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({s.palletsCount} pallet{s.palletsCount > 1 ? "s" : ""} · {s.volumePercent}% vol)
                </option>
              ))}
            </select>
            {selectedStrategyId === "auto" && (
              <span className="badge badge-primary" style={{ fontSize: "0.75rem" }}>
                Seleccionada por mejor balance de soporte físico, estabilidad y volumen
              </span>
            )}
          </div>

          {currentPallet ? (
            <Suspense fallback={<div className="viewer-empty">Cargando visualizador 3D...</div>}>
              <PalletViewer result={currentPallet} config={currentPallet.config} />
            </Suspense>
          ) : (
            <div className="viewer-empty">Sin pallet seleccionado</div>
          )}

          {currentPallet && (
            <div className="viewer-stats">
              <span>
                <Ruler size={15} aria-hidden="true" />
                {formatNumber(currentPallet.metrics.finalLength)} x {formatNumber(currentPallet.metrics.finalWidth)} x{" "}
                {formatNumber(currentPallet.metrics.finalHeight)} cm
              </span>
              <span>
                <Weight size={15} aria-hidden="true" />
                {formatNumber(currentPallet.metrics.totalWeight, 1)} kg ({formatNumber(currentPallet.metrics.weightPercent, 1)}%)
              </span>
              <span>
                <Layers size={15} aria-hidden="true" />
                {currentPallet.metrics.fullLayers} niveles Z
              </span>
              <span>
                <Rotate3D size={15} aria-hidden="true" />
                {currentPallet.metrics.volumePercent}% volumen
              </span>
            </div>
          )}
        </div>

        {/* SKU Breakdown & Manifest Table */}
        <div className="tables-panel">
          <section>
            <div className="panel-header compact">
              <div>
                <h2>Desglose por SKU en este Pallet</h2>
                <p>
                  {currentPallet ? `${currentPallet.skuBreakdown?.length ?? 0} tipos de producto en ${currentPallet.sku}` : "Sin desglose"}
                </p>
              </div>
            </div>

            <div className="datatable-wrap" style={{ maxHeight: "380px", overflowY: "auto" }}>
              <table className="datatable">
                <thead>
                  <tr>
                    <th style={{ width: "42px" }}>Color</th>
                    <th>SKU</th>
                    <th>Tipo</th>
                    <th style={{ textAlign: "right" }}>Cantidad</th>
                    <th style={{ textAlign: "right" }}>Peso Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(currentPallet?.skuBreakdown ?? []).map((item) => (
                    <tr key={item.sku}>
                      <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                        <span
                          style={{
                            display: "inline-block",
                            width: "16px",
                            height: "16px",
                            borderRadius: "4px",
                            backgroundColor: item.color,
                            border: "1px solid rgba(0,0,0,0.15)",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                          }}
                          title={`Color en 3D: ${item.color}`}
                        />
                      </td>
                      <td>
                        <strong>{item.sku}</strong>
                      </td>
                      <td>{item.typeLabel || "Caja"}</td>
                      <td style={{ textAlign: "right" }}>
                        <span className="badge badge-primary">{item.count} u</span>
                      </td>
                      <td style={{ textAlign: "right" }}>{formatNumber(item.weight, 1)} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Comparison of evaluated strategies */}
            {strategies.length > 1 && (
              <div style={{ marginTop: "1.5rem" }}>
                <div className="panel-header compact">
                  <div>
                    <h3>Alternativas Evaluadas por el Motor ({strategies.length})</h3>
                  </div>
                </div>
                <div className="datatable-wrap">
                  <table className="datatable">
                    <thead>
                      <tr>
                        <th>Estrategia</th>
                        <th>Pallets</th>
                        <th>Ubicadas</th>
                        <th>% Ocupación</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {strategies.map((s) => {
                        const isChosen = s.id === (selectedStrategyId === "auto" ? multiSkuData?.bestStrategyId : selectedStrategyId);
                        return (
                          <tr
                            key={s.id}
                            className={isChosen ? "selected-row" : ""}
                            onClick={() => {
                              setSelectedStrategyId(s.id);
                              setSelectedPalletIndex(0);
                            }}
                            style={{ cursor: "pointer" }}
                          >
                            <td>
                              <strong>{s.label}</strong>
                              {s.id === multiSkuData?.bestStrategyId && (
                                <span style={{ marginLeft: "6px", color: "#d97706", fontWeight: "bold" }}>⭐ Óptima</span>
                              )}
                            </td>
                            <td>{s.palletsCount} pallet(s)</td>
                            <td>{s.unitsPlaced} u</td>
                            <td>{s.volumePercent}%</td>
                            <td>
                              <button
                                type="button"
                                className="row-action-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedStrategyId(s.id);
                                  setSelectedPalletIndex(0);
                                }}
                                title="Ver este resultado en 3D"
                              >
                                {isChosen ? "Activa" : "Probar"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function round(val, dec = 2) {
  return Number(Math.round(Number(val + "e" + dec)) + "e-" + dec);
}
