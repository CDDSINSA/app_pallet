import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Box, Layers, RefreshCw, Rotate3D } from "lucide-react";
import { configureCamera, createPalletScene, disposeObject } from "../utils/threeScene.js";

export default function PalletViewer({ result, config }) {
  const containerRef = useRef(null);
  const [error, setError] = useState("");
  const [activeLayer, setActiveLayer] = useState("all");
  const [layerMode, setLayerMode] = useState("single");
  const [activeView, setActiveView] = useState("iso");

  // Keep references to camera, controls, and bounds for instant view angle updates
  const sceneContextRef = useRef(null);

  // Compute available layers
  const totalLayers = useMemo(() => {
    if (!result?.positions?.length) return 0;
    return Math.max(...result.positions.map((p) => p.layer)) + 1;
  }, [result]);

  // Reset layer selection if result changes
  useEffect(() => {
    setActiveLayer("all");
    setActiveView("iso");
  }, [result?.id]);

  // Handle camera view presets without recreating WebGL context
  const setCameraView = (viewName) => {
    setActiveView(viewName);
    const ctx = sceneContextRef.current;
    if (!ctx) return;
    const { camera, controls, bounds, requestRender } = ctx;
    configureCamera(camera, bounds, { view: viewName });
    controls.target.copy(bounds.center);
    controls.update();
    requestRender();
  };

  const handleResetCamera = () => {
    setCameraView("iso");
  };

  useEffect(() => {
    const container = containerRef.current;
    setError("");
    if (!container || !result) return undefined;
    let renderer, scene, controls, observer;
    let frameId = 0;

    const onContextLost = () => {
      cancelAnimationFrame(frameId);
      setError("Se perdio el contexto 3D. Seleccione otro SKU o recargue la pagina.");
    };

    const cleanup = () => {
      cancelAnimationFrame(frameId);
      observer?.disconnect();
      controls?.dispose();
      sceneContextRef.current = null;
      if (scene) disposeObject(scene);
      if (renderer) {
        renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      }
    };

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.domElement.className = "viewer-canvas";
      container.appendChild(renderer.domElement);

      const created = createPalletScene(result, result.config ?? config, {
        selectedLayer: activeLayer,
        layerMode,
      });
      scene = created.scene;

      const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 10000);
      configureCamera(camera, created.bounds, { view: activeView });

      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(created.bounds.center);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.maxPolarAngle = Math.PI * 0.48;
      controls.minDistance = 60;

      const requestRender = () => {
        if (!frameId) frameId = requestAnimationFrame(render);
      };

      const render = () => {
        frameId = 0;
        controls.update();
        renderer.render(scene, camera);
      };

      controls.addEventListener("change", requestRender);

      observer = new ResizeObserver(() => {
        const width = Math.max(container.clientWidth, 1);
        const height = Math.max(container.clientHeight, 1);
        renderer.setSize(width, height);
        camera.aspect = width / height;
        configureCamera(camera, created.bounds, { view: activeView });
        requestRender();
      });
      observer.observe(container);

      renderer.domElement.addEventListener("webglcontextlost", onContextLost);

      sceneContextRef.current = {
        camera,
        controls,
        bounds: created.bounds,
        requestRender,
      };

      requestRender();
    } catch {
      cleanup();
      setError("No se pudo iniciar el visualizador 3D. Los calculos y la exportacion Excel siguen disponibles.");
      return undefined;
    }

    return cleanup;
  }, [result, config, activeLayer, layerMode]);

  if (!result) return <div className="viewer-empty">Sin acomodo para visualizar</div>;

  const visibleUnitsCount = useMemo(() => {
    if (!result?.positions?.length) return 0;
    if (activeLayer === "all") return result.positions.length;
    const layerNum = Number(activeLayer);
    if (layerMode === "accumulated") {
      return result.positions.filter((p) => p.layer <= layerNum).length;
    }
    return result.positions.filter((p) => p.layer === layerNum).length;
  }, [result, activeLayer, layerMode]);

  return (
    <div className="viewer-container">
      {/* 3D Viewer Toolbar */}
      <div className="viewer-toolbar">
        <div className="toolbar-group">
          <span className="toolbar-label">
            <Rotate3D size={14} aria-hidden="true" />
            <span>Vistas:</span>
          </span>
          <div className="btn-group">
            <button
              type="button"
              className={`view-btn ${activeView === "iso" ? "active" : ""}`}
              onClick={() => setCameraView("iso")}
              title="Vista Isométrica 3D"
            >
              3D
            </button>
            <button
              type="button"
              className={`view-btn ${activeView === "top" ? "active" : ""}`}
              onClick={() => setCameraView("top")}
              title="Vista de Planta (Superior)"
            >
              Planta
            </button>
            <button
              type="button"
              className={`view-btn ${activeView === "front" ? "active" : ""}`}
              onClick={() => setCameraView("front")}
              title="Vista Frontal"
            >
              Frente
            </button>
            <button
              type="button"
              className={`view-btn ${activeView === "side" ? "active" : ""}`}
              onClick={() => setCameraView("side")}
              title="Vista Lateral"
            >
              Lado
            </button>
            <button
              type="button"
              className="view-btn icon-only"
              onClick={handleResetCamera}
              title="Reiniciar vista de cámara"
            >
              <RefreshCw size={13} aria-hidden="true" />
            </button>
          </div>
        </div>

        {totalLayers > 1 && (
          <div className="toolbar-group">
            <span className="toolbar-label">
              <Layers size={14} aria-hidden="true" />
              <span>Camas:</span>
            </span>
            <select
              className="toolbar-select"
              value={activeLayer}
              onChange={(e) => setActiveLayer(e.target.value === "all" ? "all" : Number(e.target.value))}
              aria-label="Seleccionar cama o capa"
            >
              <option value="all">Todas ({result.metrics.totalUnits} u)</option>
              {Array.from({ length: totalLayers }, (_, index) => {
                const layerCount = result.positions.filter((p) => p.layer === index).length;
                return (
                  <option key={index} value={index}>
                    Cama {index + 1} ({layerCount} u)
                  </option>
                );
              })}
            </select>

            {activeLayer !== "all" && (
              <div className="btn-group">
                <button
                  type="button"
                  className={`view-btn ${layerMode === "single" ? "active" : ""}`}
                  onClick={() => setLayerMode("single")}
                  title="Mostrar únicamente esta cama"
                >
                  Solo esta
                </button>
                <button
                  type="button"
                  className={`view-btn ${layerMode === "accumulated" ? "active" : ""}`}
                  onClick={() => setLayerMode("accumulated")}
                  title="Mostrar hasta esta cama (acumulado)"
                >
                  Hasta esta
                </button>
              </div>
            )}
          </div>
        )}

        {activeLayer !== "all" && (
          <div className="toolbar-badge">
            <Box size={13} aria-hidden="true" />
            <span>
              {visibleUnitsCount} de {result.metrics.totalUnits} u
            </span>
          </div>
        )}
      </div>

      {error ? <p role="alert" className="table-note">{error}</p> : null}
      <div ref={containerRef} className="viewer-shell" aria-label="Visualizador 3D del pallet" />
    </div>
  );
}
