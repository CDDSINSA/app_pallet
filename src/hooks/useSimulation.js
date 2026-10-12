import { useEffect, useMemo, useRef, useState } from "react";
import { validateConfig } from "../utils/palletLogic.js";

export function useSimulation(rows, config, mode = "singleSku") {
  const [completed, setCompleted] = useState(null);
  const empty = useMemo(() => {
    if (mode === "multiSku") {
      return {
        pallets: [],
        unplaced: [],
        totalUnits: 0,
        totalWeight: 0,
        totalRequested: 0,
        skuColors: [],
        errors: [],
        configErrors: validateConfig(config),
      };
    }
    return { results: [], errors: [], configErrors: validateConfig(config) };
  }, [config, mode]);
  const enabled = rows.length > 0 && !empty.configErrors.length;
  const current = completed?.rows === rows && completed?.config === config && completed?.mode === mode;

  const workerRef = useRef(null);
  const nextRequestIdRef = useRef(0);
  const activeRequestIdRef = useRef(0);
  const lastRowsRef = useRef(rows);
  const lastConfigRef = useRef(config);
  const lastModeRef = useRef(mode);

  // Terminate worker on hook unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const getWorker = () => {
    if (!workerRef.current) {
      const worker = new Worker(new URL("../workers/simulation.worker.js", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }) => {
        if (data?.id !== undefined && data.id !== activeRequestIdRef.current) {
          return; // Ignore superseded calculation responses
        }
        if (data?.error) {
          setCompleted({
            rows: lastRowsRef.current,
            config: lastConfigRef.current,
            mode: lastModeRef.current,
            processed: {
              ...(lastModeRef.current === "multiSku" ? { pallets: [], unplaced: [] } : { results: [] }),
              errors: [],
              configErrors: [data.error],
            },
          });
        } else {
          setCompleted({
            rows: lastRowsRef.current,
            config: lastConfigRef.current,
            mode: lastModeRef.current,
            processed: data.processed,
          });
        }
      };
      worker.onerror = () => {
        setCompleted({
          rows: lastRowsRef.current,
          config: lastConfigRef.current,
          mode: lastModeRef.current,
          processed: {
            ...(lastModeRef.current === "multiSku" ? { pallets: [], unplaced: [] } : { results: [] }),
            errors: [],
            configErrors: ["No se pudo ejecutar el calculo."],
          },
        });
      };
      workerRef.current = worker;
    }
    return workerRef.current;
  };

  useEffect(() => {
    if (!enabled) return undefined;

    const requestId = ++nextRequestIdRef.current;
    activeRequestIdRef.current = requestId;
    lastRowsRef.current = rows;
    lastConfigRef.current = config;
    lastModeRef.current = mode;

    // Debounce to coalesce keystrokes without worker recreation cost
    const timer = setTimeout(() => {
      try {
        const worker = getWorker();
        worker.postMessage({ id: requestId, rows, config, mode });
      } catch (error) {
        setCompleted({
          rows,
          config,
          mode,
          processed: { ...empty, configErrors: [error.message || "No se pudo iniciar el calculo."] },
        });
      }
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [rows, config, enabled, empty, mode]);

  return { processed: enabled && current ? completed.processed : empty, processing: enabled && !current };
}
