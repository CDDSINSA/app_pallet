const PI = Math.PI;

export const DEFAULT_CONFIG = {
  palletLength: 120,
  palletWidth: 100,
  palletMaxHeight: 130,
  palletBaseHeight: 14.5,
  palletMaxWeight: 1250,
  maxOverhang: 15,
  allowOverhang: true,
};

const COLUMN_ALIASES = {
  sku: ["sku", "codigo", "codigo sku", "producto", "nombre", "item"],
  tipo: ["tipo", "type", "clase"],
  largo: ["largo", "longitud", "length"],
  ancho: ["ancho", "diametro", "diametro cm", "width"],
  alto: ["alto", "altura", "height"],
  peso: ["peso", "peso kg", "weight"],
  unidades: ["unidades", "unidad", "units", "cantidad"],
};

export function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
  const numeric = String(value)
    .replace(/\s+/g, "")
    .replace(/[^0-9,.-]/g, "");
  if (!numeric) return "";

  const lastComma = numeric.lastIndexOf(",");
  const lastDot = numeric.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      return numeric.replace(/\./g, "").replace(",", ".");
    }
    return numeric.replace(/,/g, "");
  }

  if (lastComma >= 0) {
    const parts = numeric.split(",");
    if (parts.length === 2 && parts[1].length <= 2) return numeric.replace(",", ".");
    return numeric.replace(/,/g, "");
  }

  const dotParts = numeric.split(".");
  if (dotParts.length > 2) {
    const last = dotParts.at(-1);
    if (last.length <= 2) {
      return `${dotParts.slice(0, -1).join("")}.${last}`;
    }
    return dotParts.join("");
  }

  return numeric;
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
  if (normalized.includes("caja") || normalized.includes("box")) {
    return { type: "caja", label: "Caja", warning: "" };
  }

  const knownCylinder =
    normalized.includes("cil") ||
    normalized.includes("tambor") ||
    normalized.includes("barril") ||
    normalized.includes("bidon") ||
    normalized.includes("rollo") ||
    normalized.includes("roll") ||
    normalized.includes("cubeta") ||
    normalized.includes("tanque");

  return {
    type: "cilindro",
    label: knownCylinder ? "Cilindro" : "Cilindro",
    warning: knownCylinder
      ? ""
      : "Tipo distinto de caja; se simulo como cilindro, igual que la app original.",
  };
}

export function normalizeSkuRow(rawRow, index) {
  const rawType = pickColumn(rawRow, COLUMN_ALIASES.tipo);
  const resolvedType = resolveType(rawType);
  const sku = safeText(pickColumn(rawRow, COLUMN_ALIASES.sku)) || `SKU_${index + 1}`;
  const ancho = toNumber(pickColumn(rawRow, COLUMN_ALIASES.ancho));
  const largo = toNumber(pickColumn(rawRow, COLUMN_ALIASES.largo));

  return {
    rowNumber: index + 2,
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
    maxOverhang: Math.max(0, toNumber(config.maxOverhang) || 0),
    allowOverhang: Boolean(config.allowOverhang),
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

  return errors;
}

function getEffectiveHeight(config) {
  return Math.max(0, config.palletMaxHeight - config.palletBaseHeight);
}

function getFitLimit(config) {
  const overhang = config.allowOverhang ? config.maxOverhang * 2 : 0;
  return {
    length: config.palletLength + overhang,
    width: config.palletWidth + overhang,
  };
}

export function validateSku(item, config) {
  const errors = [];
  const effectiveHeight = getEffectiveHeight(config);
  const fitLimit = getFitLimit(config);

  if (!item.rawType) errors.push("Falta Tipo.");
  if (!item.type) errors.push("Tipo no valido.");
  if (!isPositive(item.alto)) errors.push("Alto debe ser numerico y mayor que cero.");
  if (!isPositive(item.peso)) errors.push("Peso debe ser numerico y mayor que cero.");

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
    const fitsOriginal = item.largo <= fitLimit.length && item.ancho <= fitLimit.width;
    const fitsRotated = item.ancho <= fitLimit.length && item.largo <= fitLimit.width;
    if (!fitsOriginal && !fitsRotated) {
      errors.push(
        `Las medidas no caben dentro del pallet con el desborde permitido (${formatNumber(config.maxOverhang)} cm por lado).`,
      );
    }
  }

  if (item.type === "cilindro") {
    const diameter = item.ancho;
    if (diameter > fitLimit.length || diameter > fitLimit.width) {
      errors.push(
        `El diametro no cabe dentro del pallet con el desborde permitido (${formatNumber(config.maxOverhang)} cm por lado).`,
      );
    }
  }

  return errors;
}

function calculateGrid(itemLength, itemWidth, overhangL, overhangW, config) {
  const usableLength = config.palletLength + 2 * overhangL;
  const usableWidth = config.palletWidth + 2 * overhangW;
  const cols = Math.max(0, Math.floor(usableLength / itemLength));
  const rows = Math.max(0, Math.floor(usableWidth / itemWidth));

  return {
    cols,
    rows,
    total: cols * rows,
    overhangL,
    overhangW,
    usableLength,
    usableWidth,
  };
}

export function generateAccommodation(itemLength, itemWidth, itemHeight, itemWeight, config, isCylinder = false) {
  const effectiveHeight = getEffectiveHeight(config);
  const baseGrid = calculateGrid(itemLength, itemWidth, 0, 0, config);
  const overhangL =
    config.allowOverhang && itemLength >= 20 ? Math.min(0.2 * itemLength, config.maxOverhang) : 0;
  const overhangW =
    config.allowOverhang && itemWidth >= 40 ? Math.min(0.2 * itemWidth, config.maxOverhang) : 0;
  const overhangGrid = calculateGrid(itemLength, itemWidth, overhangL, overhangW, config);
  const selectedGrid = overhangGrid.total > baseGrid.total ? overhangGrid : baseGrid;
  const maxLayers = Math.max(0, Math.floor(effectiveHeight / itemHeight));
  const positions = [];
  let totalWeight = 0;

  const offsetX = (config.palletLength - selectedGrid.cols * itemLength) / 2;
  const offsetY = (config.palletWidth - selectedGrid.rows * itemWidth) / 2;

  let stopByWeight = false;
  for (let layer = 0; layer < maxLayers && !stopByWeight; layer += 1) {
    for (let row = 0; row < selectedGrid.rows && !stopByWeight; row += 1) {
      for (let col = 0; col < selectedGrid.cols; col += 1) {
        if (totalWeight + itemWeight > config.palletMaxWeight) {
          stopByWeight = true;
          break;
        }

        const z = layer * itemHeight;
        if (z + itemHeight <= effectiveHeight) {
          positions.push({
            x: col * itemLength + offsetX,
            y: row * itemWidth + offsetY,
            z,
            largo: itemLength,
            ancho: itemWidth,
            alto: itemHeight,
            layer,
            row,
            col,
            isCylinder,
          });
          totalWeight += itemWeight;
        }
      }
    }
  }

  return {
    positions,
    totalWeight,
    layout: {
      cols: selectedGrid.cols,
      rows: selectedGrid.rows,
      boxesPerLayer: selectedGrid.cols * selectedGrid.rows,
      maxLayers,
      usedOverhang: selectedGrid !== baseGrid,
      overhangL: selectedGrid.overhangL,
      overhangW: selectedGrid.overhangW,
      usableLength: selectedGrid.usableLength,
      usableWidth: selectedGrid.usableWidth,
      itemLength,
      itemWidth,
      itemHeight,
      stoppedByWeight: stopByWeight,
    },
  };
}

function getBounds(positions, config) {
  const minX = Math.min(0, ...positions.map((p) => p.x));
  const maxX = Math.max(config.palletLength, ...positions.map((p) => p.x + p.largo));
  const minY = Math.min(0, ...positions.map((p) => p.y));
  const maxY = Math.max(config.palletWidth, ...positions.map((p) => p.y + p.ancho));
  const maxZ = Math.max(0, ...positions.map((p) => p.z + p.alto));

  return { minX, maxX, minY, maxY, maxZ };
}

function summarizeResult(item, config, accommodation, orientation) {
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

  return {
    id: `${item.sku}-${item.rowNumber}`,
    sku: item.sku,
    rowNumber: item.rowNumber,
    type: item.type,
    typeLabel: item.typeLabel,
    item,
    positions,
    bounds,
    layout: accommodation.layout,
    orientation,
    warnings: [item.typeWarning, accommodation.layout.stoppedByWeight ? "Cantidad limitada por peso maximo." : ""].filter(Boolean),
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
    },
  };
}

function selectBestAccommodation(original, rotated) {
  if (original.positions.length >= rotated.positions.length) {
    return { accommodation: original, orientation: "Original" };
  }
  return { accommodation: rotated, orientation: "Rotada" };
}

export function simulateSku(item, configInput) {
  const config = coerceConfig(configInput);
  const validationErrors = validateSku(item, config);
  if (validationErrors.length) {
    return { error: validationErrors.join(" ") };
  }

  if (item.type === "caja") {
    const original = generateAccommodation(item.largo, item.ancho, item.alto, item.peso, config, false);
    const rotated = generateAccommodation(item.ancho, item.largo, item.alto, item.peso, config, false);
    const selected = selectBestAccommodation(original, rotated);
    return summarizeResult(item, config, selected.accommodation, selected.orientation);
  }

  const diameter = item.ancho;
  const cylinderItem = {
    ...item,
    largo: isPositive(item.largo) ? item.largo : diameter,
  };
  const accommodation = generateAccommodation(diameter, diameter, item.alto, item.peso, config, true);
  return summarizeResult(cylinderItem, config, accommodation, "Diametro");
}

export function processRows(rows, configInput) {
  const config = coerceConfig(configInput);
  const configErrors = validateConfig(config);
  const results = [];
  const errors = [];

  if (configErrors.length) {
    return { results, errors, configErrors };
  }

  rows.forEach((rawRow, index) => {
    const item = normalizeSkuRow(rawRow, index);
    const simulated = simulateSku(item, config);

    if (simulated.error) {
      errors.push({
        sku: item.sku,
        rowNumber: item.rowNumber,
        type: item.rawType || "-",
        reason: simulated.error,
        raw: rawRow,
      });
      return;
    }

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
    "Peso total (kg)": round(result.metrics.totalWeight, 2),
    "% peso ocupado": `${round(result.metrics.weightPercent, 1)}%`,
    "Volumen ocupado (cm3)": Math.round(result.metrics.totalVolume),
    "% volumen ocupado": `${round(result.metrics.volumePercent, 1)}%`,
    "Largo final del acomodo (cm)": round(result.metrics.finalLength, 2),
    "Ancho final del acomodo (cm)": round(result.metrics.finalWidth, 2),
    "Alto final del acomodo (cm)": round(result.metrics.finalHeight, 2),
    "Desborde usado": result.layout.usedOverhang ? "Si" : "No",
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
