import { gridPlan, mixedPlans, choosePlan, materializePlan, hexagonalCylinderPlans } from "./packing.js";
import { packMultiSku } from "./multiSkuPacking.js";

const PI = Math.PI;
export const ALGORITHM_VERSION = "2.1.0";
export const MAX_POSITIONS_PER_SKU = 200_000;
export const MAX_POSITIONS_PER_BATCH = 500_000;

export const DEFAULT_CONFIG = {
  palletLength: 120,
  palletWidth: 100,
  palletMaxHeight: 130,
  palletBaseHeight: 14.5,
  palletMaxWeight: 1250,
  maxOverhang: 15,
  allowOverhang: true,
  interlockLayers: false,
};

const COLUMN_ALIASES = {
  sku: ["sku", "codigo", "codigo sku", "producto", "nombre", "item"],
  tipo: ["tipo", "type", "clase"],
  largo: ["largo", "longitud", "length"],
  ancho: ["ancho", "diametro", "diametro cm", "width"],
  alto: ["alto", "altura", "height"],
  peso: ["peso", "peso kg", "weight"],
  unidades: ["unidades", "unidad", "units", "cantidad"],
  maxCamas: ["maxcamas", "max camas", "1camamax", "camamax", "camas max", "camas_max", "estiba max", "estiba maxima", "limite camas", "max layers"],
  fragil: ["fragil", "es fragil", "fragile"],
  orientacion: ["orientacion", "orientation"],
};

export function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function validateImportHeaders(headers) {
  const normalized = headers.filter(Boolean).map(normalizeHeader);
  if (new Set(normalized).size !== normalized.length) throw new Error("El archivo contiene encabezados duplicados.");
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const count = normalized.filter((header) => aliases.includes(header)).length;
    if (count > 1) throw new Error(`Hay varias columnas para ${field}. Deje una sola.`);
    if (!count && ["tipo", "ancho", "alto", "peso"].includes(field)) throw new Error(`Falta la columna obligatoria: ${field}.`);
  }
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function safeText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value.text) return String(value.text).trim();
  return String(value).trim();
}

export function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (value === null || value === undefined) return NaN;

  const raw = safeText(value);
  if (!raw) return NaN;

  const cleaned = normalizeNumericText(raw);

  if (!cleaned || cleaned === "." || cleaned === "-" || cleaned === "+") return NaN;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeNumericText(value) {
  const numeric = String(value).trim();
  // A single separator is always decimal. Grouping is accepted only with
  // an explicit decimal separator, so a value is never guessed by its length.
  if (/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(numeric)) {
    return numeric.replace(",", ".");
  }
  if (/^[+-]?\d{1,3}(?:,\d{3})+\.\d+$/.test(numeric)) return numeric.replace(/,/g, "");
  if (/^[+-]?\d{1,3}(?:\.\d{3})+,\d+$/.test(numeric)) return numeric.replace(/\./g, "").replace(",", ".");
  return "";
}

function isPositive(value) {
  return Number.isFinite(value) && value > 0;
}

function pickColumn(row, aliases) {
  const valuesByHeader = new Map(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
  );

  for (const alias of aliases) {
    const normalized = normalizeHeader(alias);
    if (valuesByHeader.has(normalized)) return valuesByHeader.get(normalized);
  }

  return undefined;
}

function resolveType(value) {
  const normalized = normalizeText(value);
  if (!normalized) return { type: "", label: "", warning: "" };
  if (["caja", "cajas", "box", "boxes"].includes(normalized)) {
    return { type: "caja", label: "Caja", warning: "" };
  }

  const knownCylinder = ["cilindro", "cilindros", "cylinder", "tambor", "tambores", "barril", "bidon", "rollo", "roll", "cubeta", "tanque"].includes(normalized);

  return {
    type: knownCylinder ? "cilindro" : "",
    label: knownCylinder ? "Cilindro" : "",
    warning: "",
  };
}

export function normalizeSkuRow(rawRow, index) {
  const rawType = pickColumn(rawRow, COLUMN_ALIASES.tipo);
  const resolvedType = resolveType(rawType);
  const sku = safeText(pickColumn(rawRow, COLUMN_ALIASES.sku)) || `SKU_${index + 1}`;
  const ancho = toNumber(pickColumn(rawRow, COLUMN_ALIASES.ancho));
  const largo = toNumber(pickColumn(rawRow, COLUMN_ALIASES.largo));
  const rawMaxCamas = toNumber(pickColumn(rawRow, COLUMN_ALIASES.maxCamas));
  const rawFragil = safeText(pickColumn(rawRow, COLUMN_ALIASES.fragil)).toLowerCase();
  const isFragile = ["si", "yes", "true", "1", "s", "fragil"].includes(rawFragil);
  const orientacionTarget = safeText(pickColumn(rawRow, COLUMN_ALIASES.orientacion));

  let maxCamas = null;
  if (Number.isFinite(rawMaxCamas) && rawMaxCamas > 0) {
    maxCamas = Math.floor(rawMaxCamas);
  } else if (isFragile) {
    maxCamas = 1;
  }

  return {
    rowNumber: rawRow.__source?.rowNumber ?? index + 2,
    source: rawRow.__source ?? { rowNumber: index + 2, sheet: "", file: "" },
    sku,
    rawType: safeText(rawType),
    type: resolvedType.type,
    typeLabel: resolvedType.label,
    typeWarning: resolvedType.warning,
    largo,
    ancho,
    alto: toNumber(pickColumn(rawRow, COLUMN_ALIASES.alto)),
    peso: toNumber(pickColumn(rawRow, COLUMN_ALIASES.peso)),
    unidades: toNumber(pickColumn(rawRow, COLUMN_ALIASES.unidades)),
    hasUnits: safeText(pickColumn(rawRow, COLUMN_ALIASES.unidades)) !== "",
    maxCamas,
    fragil: isFragile,
    hasMaxCamas: Number.isFinite(rawMaxCamas) || isFragile,
    orientacionTarget,
    raw: rawRow,
  };
}

export function coerceConfig(config) {
  return {
    palletLength: toNumber(config.palletLength),
    palletWidth: toNumber(config.palletWidth),
    palletMaxHeight: toNumber(config.palletMaxHeight),
    palletBaseHeight: toNumber(config.palletBaseHeight),
    palletMaxWeight: toNumber(config.palletMaxWeight),
    maxOverhang: toNumber(config.maxOverhang),
    allowOverhang: Boolean(config.allowOverhang),
    interlockLayers: Boolean(config.interlockLayers),
  };
}

export function validateConfig(configInput) {
  const config = coerceConfig(configInput);
  const errors = [];

  if (!isPositive(config.palletLength)) errors.push("El largo del pallet debe ser mayor que cero.");
  if (!isPositive(config.palletWidth)) errors.push("El ancho del pallet debe ser mayor que cero.");
  if (!isPositive(config.palletMaxHeight)) errors.push("La altura maxima debe ser mayor que cero.");
  if (!Number.isFinite(config.palletBaseHeight) || config.palletBaseHeight < 0) {
    errors.push("La altura del polin no puede ser negativa.");
  }
  if (config.palletBaseHeight >= config.palletMaxHeight) {
    errors.push("La altura del polin debe ser menor que la altura maxima.");
  }
  if (!isPositive(config.palletMaxWeight)) errors.push("El peso maximo debe ser mayor que cero.");
  if (!Number.isFinite(config.maxOverhang) || config.maxOverhang < 0) errors.push("El desborde maximo debe ser numerico y no negativo.");

  return errors;
}

function getEffectiveHeight(config) {
  return Math.max(0, config.palletMaxHeight - config.palletBaseHeight);
}

export function getFitLimit(config, itemLength, itemWidth) {
  // Preserve the original controlled-overhang policy in both validation and packing.
  const overhangL = config.allowOverhang && itemLength >= 20 ? Math.min(0.2 * itemLength, config.maxOverhang) : 0;
  const overhangW = config.allowOverhang && itemWidth >= 40 ? Math.min(0.2 * itemWidth, config.maxOverhang) : 0;
  return {
    length: config.palletLength + 2 * overhangL,
    width: config.palletWidth + 2 * overhangW,
    overhangL,
    overhangW,
  };
}

export function validateSku(item, config) {
  const errors = [];
  const effectiveHeight = getEffectiveHeight(config);

  if (!item.rawType) errors.push("Falta Tipo.");
  if (!["caja", "cilindro"].includes(item.type)) errors.push("Tipo no reconocido. Use Caja o Cilindro (tambor, barril, bidon, rollo, cubeta o tanque).");
  if (!isPositive(item.alto)) errors.push("Alto debe ser numerico y mayor que cero.");
  if (!isPositive(item.peso)) errors.push("Peso debe ser numerico y mayor que cero.");
  if (item.hasUnits && (!Number.isSafeInteger(item.unidades) || item.unidades < 0)) errors.push("Unidades debe ser un entero no negativo o quedar vacio.");
  if (item.hasMaxCamas && (!Number.isSafeInteger(item.maxCamas) || item.maxCamas <= 0)) errors.push("Max Camas debe ser un entero positivo mayor que cero.");

  if (item.type === "caja") {
    if (!isPositive(item.largo)) errors.push("Largo debe ser numerico y mayor que cero.");
    if (!isPositive(item.ancho)) errors.push("Ancho debe ser numerico y mayor que cero.");
  }

  if (item.type === "cilindro") {
    if (!isPositive(item.ancho)) {
      errors.push("Ancho debe contener el diametro del cilindro y ser mayor que cero.");
    }
  }

  if (errors.length) return errors;

  if (item.alto > effectiveHeight) {
    errors.push(
      `El alto (${formatNumber(item.alto)} cm) supera la altura util (${formatNumber(effectiveHeight)} cm).`,
    );
  }

  if (item.peso > config.palletMaxWeight) {
    errors.push(
      `El peso unitario (${formatNumber(item.peso)} kg) supera el peso maximo del pallet (${formatNumber(config.palletMaxWeight)} kg).`,
    );
  }

  if (item.type === "caja") {
    const fitLimit = getFitLimit(config, item.largo, item.ancho);
    const rotatedLimit = getFitLimit(config, item.ancho, item.largo);
    const fitsOriginal = item.largo <= fitLimit.length && item.ancho <= fitLimit.width;
    const fitsRotated = item.ancho <= rotatedLimit.length && item.largo <= rotatedLimit.width;
    if (!fitsOriginal && !fitsRotated) {
      errors.push(
        "Las medidas no caben con la politica de desborde controlado configurada.",
      );
    }
  }

  if (item.type === "cilindro") {
    const diameter = item.ancho;
    const fitLimit = getFitLimit(config, diameter, diameter);
    if (diameter > fitLimit.length || diameter > fitLimit.width) {
      errors.push(
        "El diametro no cabe con la politica de desborde controlado configurada.",
      );
    }
  }

  return errors;
}

function uniformPlans(length, width, config, orientation) {
  return [
    gridPlan(length, width, config, { length: config.palletLength, width: config.palletWidth }, orientation),
    gridPlan(length, width, config, getFitLimit(config, length, width), orientation),
  ];
}

export function generateAccommodation(itemLength, itemWidth, itemHeight, itemWeight, config, isCylinder = false) {
  if (validateConfig(config).length || ![itemLength, itemWidth, itemHeight, itemWeight].every(isPositive)) {
    return { error: "Dimensiones, peso o configuracion invalidos." };
  }
  const plans = uniformPlans(itemLength, itemWidth, config, isCylinder ? "Diametro" : "Original");
  if (!isCylinder) {
    plans.push(...uniformPlans(itemWidth, itemLength, config, "Rotada"));
    plans.push(...mixedPlans(itemLength, itemWidth, config));
  }
  const plan = choosePlan(plans, itemHeight, itemWeight, config);
  return materializePlan(plan, itemHeight, itemWeight, config, isCylinder, MAX_POSITIONS_PER_SKU);
}

export function getBounds(positions, config) {
  const bounds = { minX: 0, maxX: config.palletLength, minY: 0, maxY: config.palletWidth, maxZ: 0 };
  for (const p of positions) {
    bounds.minX = Math.min(bounds.minX, p.x);
    bounds.maxX = Math.max(bounds.maxX, p.x + p.largo);
    bounds.minY = Math.min(bounds.minY, p.y);
    bounds.maxY = Math.max(bounds.maxY, p.y + p.ancho);
    bounds.maxZ = Math.max(bounds.maxZ, p.z + p.alto);
  }
  return bounds;
}

function summarizeResult(item, config, accommodation, orientation) {
  if (accommodation.error) return { error: accommodation.error };
  const positions = accommodation.positions;
  if (!positions.length) {
    return {
      error: "No se pudo colocar ninguna unidad: revise peso, alto o dimensiones.",
    };
  }

  const bounds = getBounds(positions, config);
  const totalUnits = positions.length;
  const boxesPerLayer = Math.max(accommodation.layout.boxesPerLayer, 1);
  const fullLayers = Math.floor(totalUnits / boxesPerLayer);
  const incompleteLayerUnits = totalUnits % boxesPerLayer;
  const finalLength = Math.max(bounds.maxX - bounds.minX, config.palletLength);
  const finalWidth = Math.max(bounds.maxY - bounds.minY, config.palletWidth);
  const finalHeight = bounds.maxZ + config.palletBaseHeight;
  const diameter = item.ancho;
  const unitVolume =
    item.type === "caja"
      ? item.largo * item.ancho * item.alto
      : PI * (diameter / 2) ** 2 * item.alto;
  const totalVolume = unitVolume * totalUnits;
  const maxVolume = config.palletLength * config.palletWidth * config.palletMaxHeight;
  const totalWeight = totalUnits * item.peso;

  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  for (const p of positions) {
    sumX += p.x + p.largo / 2;
    sumY += p.y + p.ancho / 2;
    sumZ += config.palletBaseHeight + p.z + p.alto / 2;
  }
  const cgX = round(sumX / totalUnits, 2);
  const cgY = round(sumY / totalUnits, 2);
  const cgZ = round(sumZ / totalUnits, 2);

  const targetX = config.palletLength / 2;
  const targetY = config.palletWidth / 2;
  const devX = Math.abs(cgX - targetX);
  const devY = Math.abs(cgY - targetY);
  const devPercentX = targetX > 0 ? (devX / targetX) * 100 : 0;
  const devPercentY = targetY > 0 ? (devY / targetY) * 100 : 0;
  const isOffBalance = devPercentX > 6 || devPercentY > 6;

  const warnings = [
    item.typeWarning,
    accommodation.layout.stoppedByWeight ? "Cantidad limitada por peso maximo." : "",
    item.maxCamas && accommodation.layout.maxLayers <= item.maxCamas
      ? `Estiba limitada a ${item.maxCamas} cama(s) por fragilidad/resistencia.`
      : "",
    isOffBalance ? "Advertencia de estabilidad: centro de gravedad desplazado del centro del pallet." : "",
  ].filter(Boolean);

  return {
    id: `${item.source.file}:${item.source.sheet}:${item.sku}:${item.rowNumber}`,
    algorithmVersion: ALGORITHM_VERSION,
    config: { ...config },
    source: { ...item.source },
    sku: item.sku,
    rowNumber: item.rowNumber,
    type: item.type,
    typeLabel: item.typeLabel,
    item,
    positions,
    bounds,
    layout: accommodation.layout,
    orientation,
    warnings,
    metrics: {
      boxesPerLayer,
      fullLayers,
      incompleteLayerUnits,
      totalUnits,
      totalWeight,
      weightPercent: (totalWeight / config.palletMaxWeight) * 100,
      unitVolume,
      totalVolume,
      volumePercent: maxVolume > 0 ? (totalVolume / maxVolume) * 100 : 0,
      finalLength,
      finalWidth,
      finalHeight,
      centerOfGravity: {
        x: cgX,
        y: cgY,
        z: cgZ,
        devPercentX: round(devPercentX, 1),
        devPercentY: round(devPercentY, 1),
      },
    },
  };
}

export function simulateSku(item, configInput, positionLimit = MAX_POSITIONS_PER_SKU) {
  const config = coerceConfig(configInput);
  const configErrors = validateConfig(config);
  if (configErrors.length) return { error: configErrors.join(" ") };
  const validationErrors = validateSku(item, config);
  if (validationErrors.length) return { error: validationErrors.join(" ") };
  const cylinder = item.type === "cilindro";
  const length = cylinder ? item.ancho : item.largo;
  const plans = uniformPlans(length, item.ancho, config, cylinder ? "Diametro" : "Original");
  if (cylinder) {
    plans.push(...hexagonalCylinderPlans(item.ancho, config, { length: config.palletLength, width: config.palletWidth }));
    if (config.allowOverhang) {
      plans.push(...hexagonalCylinderPlans(item.ancho, config, getFitLimit(config, item.ancho, item.ancho)));
    }
  } else {
    plans.push(...uniformPlans(item.ancho, item.largo, config, "Rotada"));
    plans.push(...mixedPlans(item.largo, item.ancho, config));
  }
  const plan = choosePlan(plans, item.alto, item.peso, config, item.maxCamas);
  const accommodation = materializePlan(plan, item.alto, item.peso, config, cylinder, Math.min(positionLimit, MAX_POSITIONS_PER_SKU));
  return summarizeResult(item, config, accommodation, plan?.orientation);
}

export function processRows(rows, configInput) {
  const config = coerceConfig(configInput);
  const configErrors = validateConfig(config);
  const results = [];
  const errors = [];

  if (configErrors.length) {
    return { results, errors, configErrors };
  }

  let remainingPositions = MAX_POSITIONS_PER_BATCH;
  rows.forEach((rawRow, index) => {
    const item = normalizeSkuRow(rawRow, index);
    const simulated = simulateSku(item, config, remainingPositions);

    if (simulated.error) {
      errors.push({
        sku: item.sku,
        rowNumber: item.rowNumber,
        source: item.source,
        type: item.rawType || "-",
        reason: simulated.error,
        raw: rawRow,
      });
      return;
    }

    remainingPositions -= simulated.positions.length;
    results.push(simulated);
  });

  return { results, errors, configErrors: [] };
}

export function resultToSummaryRow(result) {
  return {
    SKU: result.sku,
    Tipo: result.typeLabel,
    Orientacion: result.orientation,
    "Cajas por cama": result.metrics.boxesPerLayer,
    "Camas completas": result.metrics.fullLayers,
    "Cajas en ultima cama (incompleta)": result.metrics.incompleteLayerUnits,
    "Total cajas por pallet": result.metrics.totalUnits,
    "Camas max": result.item.maxCamas ?? "",
    "Fragil": result.item.fragil ? "Si" : "No",
    "Peso total (kg)": round(result.metrics.totalWeight, 2),
    "% peso ocupado": `${round(result.metrics.weightPercent, 1)}%`,
    "Volumen ocupado (cm3)": Math.round(result.metrics.totalVolume),
    "% volumen ocupado": `${round(result.metrics.volumePercent, 1)}%`,
    "Largo final del acomodo (cm)": round(result.metrics.finalLength, 2),
    "Ancho final del acomodo (cm)": round(result.metrics.finalWidth, 2),
    "Alto final del acomodo (cm)": round(result.metrics.finalHeight, 2),
    "Centro de gravedad (cm)": `${result.metrics.centerOfGravity.x}, ${result.metrics.centerOfGravity.y}, ${result.metrics.centerOfGravity.z}`,
    "Desborde usado": result.layout.usedOverhang ? "Si" : "No",
    Advertencias: result.warnings.join(" "),
    "Unidades informadas (no limitan capacidad)": Number.isFinite(result.item.unidades) ? result.item.unidades : "",
    "Fila origen": result.rowNumber,
    "Hoja origen": result.source?.sheet ?? "",
    "Archivo origen": result.source?.file ?? "",
    "Version del algoritmo": result.algorithmVersion,
  };
}

export function buildExampleRows() {
  return [
    { SKU: "CAJA-40X30", Tipo: "Caja", Largo: 40, Ancho: 30, Alto: 25, Peso: 12, Unidades: 120 },
    { SKU: "CAJA-ROTADA", Tipo: "Caja", Largo: 70, Ancho: 34, Alto: 20, Peso: 16, Unidades: 80 },
    { SKU: "TAMBOR-30", Tipo: "Cilindro", Largo: 30, Ancho: 30, Alto: 55, Peso: 18, Unidades: 48 },
    { SKU: "MEDIDA-ERROR", Tipo: "Caja", Largo: "texto", Ancho: 25, Alto: 20, Peso: 10, Unidades: 1 },
  ];
}

export function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: digits,
    minimumFractionDigits: value % 1 === 0 ? 0 : Math.min(1, digits),
  }).format(value);
}

export function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function processMultiSku(rows, configInput) {
  const config = coerceConfig(configInput);
  const configErrors = validateConfig(config);
  if (configErrors.length) {
    return {
      pallets: [],
      unplaced: [],
      totalUnits: 0,
      totalWeight: 0,
      totalRequested: 0,
      skuColors: [],
      configErrors,
      errors: configErrors.map((reason) => ({ sku: "-", rowNumber: "-", type: "-", reason })),
    };
  }

  const validItems = [];
  const errors = [];

  rows.forEach((rawRow, index) => {
    const item = normalizeSkuRow(rawRow, index);
    const validationErrors = validateSku(item, config);
    if (validationErrors.length) {
      errors.push({
        rowNumber: item.rowNumber,
        sku: item.sku,
        type: item.typeLabel || "-",
        reason: validationErrors.join(" "),
      });
      return;
    }

    if (!item.hasUnits || !Number.isSafeInteger(item.unidades) || item.unidades <= 0) {
      errors.push({
        rowNumber: item.rowNumber,
        sku: item.sku,
        type: item.typeLabel || "-",
        reason: "Multi-SKU requiere cantidad en Unidades mayor a 0.",
      });
      return;
    }

    validItems.push(item);
  });

  if (validItems.length === 0) {
    return {
      pallets: [],
      unplaced: [],
      totalUnits: 0,
      totalWeight: 0,
      totalRequested: 0,
      skuColors: [],
      errors,
    };
  }

  const packingResult = packMultiSku(validItems, config);
  return {
    ...packingResult,
    errors,
  };
}
