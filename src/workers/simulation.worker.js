import { processRows, processMultiSku } from "../utils/palletLogic.js";

self.onmessage = ({ data }) => {
  const id = data?.id;
  try {
    if (data?.mode === "multiSku") {
      const processed = processMultiSku(data.rows, data.config);
      self.postMessage({ id, mode: "multiSku", processed });
    } else {
      const processed = processRows(data.rows, data.config);
      self.postMessage({ id, mode: "singleSku", processed });
    }
  } catch (error) {
    self.postMessage({ id, error: error.message || "No se pudo completar la simulacion." });
  }
};

