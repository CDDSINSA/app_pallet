export const MULTI_SKU_PALETTE = [
  "#2563eb", // Azul real
  "#16a34a", // Verde esmeralda
  "#ea580c", // Naranja intenso
  "#9333ea", // Purpura
  "#0891b2", // Cian / Turquesa
  "#e11d48", // Rosa intenso / Rojo carmin
  "#ca8a04", // Amarillo mostaza
  "#4f46e5", // Indigo
  "#059669", // Verde menta oscuro
  "#db2777", // Rosa fucsia
  "#0284c7", // Azul cielo
  "#7c3aed", // Violeta
  "#65a30d", // Verde lima
  "#d97706", // Ambar
  "#475569", // Pizarra
];

function round(val, dec = 2) {
  return Number(Math.round(Number(val + "e" + dec)) + "e-" + dec);
}

/**
 * Checks if box A and box B overlap in 3D space with a small tolerance.
 */
function boxesOverlap(a, b, epsilon = 1e-4) {
  const overlapX = a.x + a.largo > b.x + epsilon && a.x < b.x + b.largo - epsilon;
  const overlapY = a.y + a.ancho > b.y + epsilon && a.y < b.y + b.ancho - epsilon;
  const overlapZ = a.z + a.alto > b.z + epsilon && a.z < b.z + b.alto - epsilon;
  return overlapX && overlapY && overlapZ;
}

/**
 * Calculate 2D overlap area between two horizontal rectangles
 */
function intersectionArea2D(x1, y1, w1, h1, x2, y2, w2, h2) {
  const interX = Math.max(0, Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2));
  const interY = Math.max(0, Math.min(y1 + h1, y2 + h2) - Math.max(y1, y2));
  return interX * interY;
}

/**
 * Validates physical support for a candidate box:
 * 1. At z = 0: Must rest firmly on the wooden pallet deck [0, palletLength] x [0, palletWidth].
 *    Cannot float in the air. Overhang is strictly controlled.
 * 2. At z > 0: Must be supported underneath by previously placed boxes (min 60% contact area).
 *    Cannot be placed on top of fragile boxes.
 */
function evaluateSupport(candidate, placedBoxes, config, strictBaseFloor = false) {
  const candidateArea = candidate.largo * candidate.ancho;

  // Deck floor support check at z = 0
  if (candidate.z <= 1e-5) {
    const deckLength = config.palletLength;
    const deckWidth = config.palletWidth;

    // Contact area with the wooden pallet deck [0, deckLength] x [0, deckWidth]
    const contactWithDeck = intersectionArea2D(
      candidate.x, candidate.y, candidate.largo, candidate.ancho,
      0, 0, deckLength, deckWidth
    );

    const deckRatio = contactWithDeck / candidateArea;

    if (strictBaseFloor) {
      // In strict base mode, boxes at z=0 must be 100% inside the pallet deck
      if (candidate.x < -1e-4 || candidate.y < -1e-4 ||
          candidate.x + candidate.largo > deckLength + 1e-4 ||
          candidate.y + candidate.ancho > deckWidth + 1e-4) {
        return { supported: false, reason: "Base estricta: la caja debe quedar 100% sobre la madera del pallet" };
      }
      return { supported: true, ratio: 1.0 };
    }

    // Standard overhang mode: At least 75% of the box must sit on the wooden deck
    // and individual side overhang cannot exceed policy limit
    const maxOverhangL = config.allowOverhang && candidate.largo >= 20 ? Math.min(0.2 * candidate.largo, config.maxOverhang) : 0;
    const maxOverhangW = config.allowOverhang && candidate.ancho >= 40 ? Math.min(0.2 * candidate.ancho, config.maxOverhang) : 0;

    if (candidate.x < -maxOverhangL - 1e-4 || candidate.x + candidate.largo > deckLength + maxOverhangL + 1e-4 ||
        candidate.y < -maxOverhangW - 1e-4 || candidate.y + candidate.ancho > deckWidth + maxOverhangW + 1e-4) {
      return { supported: false, reason: "Desborde excede el límite permitido para este bulto" };
    }

    if (deckRatio < 0.75) {
      return { supported: false, reason: "Soporte insuficiente en la base del pallet de madera" };
    }

    return { supported: true, ratio: deckRatio };
  }

  // Upper layer support check at z > 0
  let supportedArea = 0;

  for (const box of placedBoxes) {
    if (Math.abs(box.z + box.alto - candidate.z) < 1e-4) {
      // Never allow placing any weight on top of fragile items
      if (box.fragil) {
        return { supported: false, reason: "No se puede estibar sobre producto frágil" };
      }

      const area = intersectionArea2D(
        candidate.x, candidate.y, candidate.largo, candidate.ancho,
        box.x, box.y, box.largo, box.ancho
      );
      supportedArea += area;
    }
  }

  const ratio = supportedArea / candidateArea;
  if (ratio >= 0.60) {
    return { supported: true, ratio };
  }

  return { supported: false, reason: "Soporte inferior insuficiente en capas previas" };
}

/**
 * Runs a single packing simulation strategy given a sorted list of pending units.
 */
function runPackingStrategy(strategyDef, baseUnits, config, maxPallets = 12) {
  const { id, label, sortFn, strictBaseFloor = false } = strategyDef;

  const sortedUnits = [...baseUnits].sort(sortFn);

  const effectiveHeight = Math.max(0, config.palletMaxHeight - config.palletBaseHeight);
  const maxPalletWeight = config.palletMaxWeight;

  const allowedOverhangL = config.allowOverhang ? Math.min(config.maxOverhang, 15) : 0;
  const allowedOverhangW = config.allowOverhang ? Math.min(config.maxOverhang, 15) : 0;
  const minX = -allowedOverhangL;
  const maxX = config.palletLength + allowedOverhangL;
  const minY = -allowedOverhangW;
  const maxY = config.palletWidth + allowedOverhangW;

  const pallets = [];
  let remainingUnits = [...sortedUnits];
  let palletIndex = 0;

  while (remainingUnits.length > 0 && palletIndex < maxPallets) {
    palletIndex += 1;
    const placedBoxes = [];
    let currentWeight = 0;

    // Anchor points: start with corners of the pallet deck
    let candidatePoints = [
      { x: 0, y: 0, z: 0 },
      { x: config.palletLength / 2, y: 0, z: 0 },
      { x: 0, y: config.palletWidth / 2, z: 0 },
    ];
    const stillUnplacedForPallet = [];

    for (const unit of remainingUnits) {
      if (currentWeight + unit.peso > maxPalletWeight + 1e-4) {
        stillUnplacedForPallet.push(unit);
        continue;
      }
      if (unit.alto > effectiveHeight + 1e-4) {
        stillUnplacedForPallet.push(unit);
        continue;
      }

      let bestPlacement = null;
      let bestScore = Infinity;

      const orientations = unit.isCylinder || unit.largo === unit.ancho
        ? [{ largo: unit.largo, ancho: unit.ancho }]
        : [
            { largo: unit.largo, ancho: unit.ancho },
            { largo: unit.ancho, ancho: unit.largo },
          ];

      // Sort candidate points: lowest Z first (gravity), then lowest Y, then lowest X
      candidatePoints.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);

      for (const pt of candidatePoints) {
        if (bestPlacement && pt.z > bestPlacement.z + 1e-4) break;

        for (const ori of orientations) {
          const candidateBox = {
            ...unit,
            x: pt.x,
            y: pt.y,
            z: pt.z,
            largo: ori.largo,
            ancho: ori.ancho,
          };

          // Check boundaries
          if (candidateBox.x < minX - 1e-4 || candidateBox.x + candidateBox.largo > maxX + 1e-4) continue;
          if (candidateBox.y < minY - 1e-4 || candidateBox.y + candidateBox.ancho > maxY + 1e-4) continue;
          if (candidateBox.z + candidateBox.alto > effectiveHeight + 1e-4) continue;

          // Check collisions with previously placed boxes
          let collides = false;
          for (const placed of placedBoxes) {
            if (boxesOverlap(candidateBox, placed)) {
              collides = true;
              break;
            }
          }
          if (collides) continue;

          // Check physical deck and layer support
          const support = evaluateSupport(candidateBox, placedBoxes, config, strictBaseFloor);
          if (!support.supported) continue;

          // Multi-criteria placement score:
          // 1. Z height (gravity - lowest Z is crucial)
          // 2. Proximity to pallet center / corners
          // 3. Compactness
          const centerDist = Math.abs(candidateBox.x + candidateBox.largo / 2 - config.palletLength / 2) +
                             Math.abs(candidateBox.y + candidateBox.ancho / 2 - config.palletWidth / 2);
          const score = candidateBox.z * 100000 + candidateBox.y * 100 + candidateBox.x + centerDist * 0.1;

          if (score < bestScore) {
            bestScore = score;
            bestPlacement = candidateBox;
          }
        }
      }

      if (bestPlacement) {
        placedBoxes.push(bestPlacement);
        currentWeight += bestPlacement.peso;

        // Generate new candidate points from the placed box
        const pX = bestPlacement.x + bestPlacement.largo;
        const pY = bestPlacement.y + bestPlacement.ancho;
        const pZ = bestPlacement.z + bestPlacement.alto;

        const newPoints = [
          { x: pX, y: bestPlacement.y, z: bestPlacement.z },
          { x: bestPlacement.x, y: pY, z: bestPlacement.z },
          { x: bestPlacement.x, y: bestPlacement.y, z: pZ },
          { x: pX, y: pY, z: bestPlacement.z },
          { x: pX, y: bestPlacement.y, z: pZ },
          { x: bestPlacement.x, y: pY, z: pZ },
        ];

        for (const np of newPoints) {
          if (np.x >= minX && np.x <= maxX && np.y >= minY && np.y <= maxY && np.z <= effectiveHeight) {
            if (!candidatePoints.some((cp) => Math.abs(cp.x - np.x) < 1e-3 && Math.abs(cp.y - np.y) < 1e-3 && Math.abs(cp.z - np.z) < 1e-3)) {
              candidatePoints.push(np);
            }
          }
        }
      } else {
        stillUnplacedForPallet.push(unit);
      }
    }

    if (placedBoxes.length === 0) break;

    // Summarize this pallet
    let pMinX = Infinity, pMaxX = 0;
    let pMinY = Infinity, pMaxY = 0;
    let pMaxZ = 0;
    let sumWeightX = 0, sumWeightY = 0, sumWeightZ = 0;
    const skuCountMap = new Map();

    const distinctZ = [...new Set(placedBoxes.map((b) => b.z))].sort((a, b) => a - b);
    const zToLayer = new Map(distinctZ.map((z, idx) => [z, idx]));

    const positions = placedBoxes.map((b) => {
      pMinX = Math.min(pMinX, b.x);
      pMaxX = Math.max(pMaxX, b.x + b.largo);
      pMinY = Math.min(pMinY, b.y);
      pMaxY = Math.max(pMaxY, b.y + b.ancho);
      pMaxZ = Math.max(pMaxZ, b.z + b.alto);

      const centerX = b.x + b.largo / 2;
      const centerY = b.y + b.ancho / 2;
      const centerZ = config.palletBaseHeight + b.z + b.alto / 2;

      sumWeightX += centerX * b.peso;
      sumWeightY += centerY * b.peso;
      sumWeightZ += centerZ * b.peso;

      const layer = zToLayer.get(b.z) ?? 0;

      if (!skuCountMap.has(b.sku)) {
        skuCountMap.set(b.sku, { sku: b.sku, count: 0, weight: 0, color: b.color, typeLabel: b.typeLabel });
      }
      const entry = skuCountMap.get(b.sku);
      entry.count += 1;
      entry.weight += b.peso;

      return {
        x: b.x,
        y: b.y,
        z: b.z,
        largo: b.largo,
        ancho: b.ancho,
        alto: b.alto,
        peso: b.peso,
        sku: b.sku,
        color: b.color,
        isCylinder: b.isCylinder,
        fragil: b.fragil,
        layer,
      };
    });

    const finalLength = Math.max(pMaxX - pMinX, config.palletLength);
    const finalWidth = Math.max(pMaxY - pMinY, config.palletWidth);
    const finalHeight = pMaxZ + config.palletBaseHeight;
    const totalUnits = positions.length;

    const cgX = totalUnits > 0 && currentWeight > 0 ? round(sumWeightX / currentWeight, 2) : config.palletLength / 2;
    const cgY = totalUnits > 0 && currentWeight > 0 ? round(sumWeightY / currentWeight, 2) : config.palletWidth / 2;
    const cgZ = totalUnits > 0 && currentWeight > 0 ? round(sumWeightZ / currentWeight, 2) : 0;

    const targetX = config.palletLength / 2;
    const targetY = config.palletWidth / 2;
    const devX = Math.abs(cgX - targetX);
    const devY = Math.abs(cgY - targetY);
    const devPercentX = targetX > 0 ? (devX / targetX) * 100 : 0;
    const devPercentY = targetY > 0 ? (devY / targetY) * 100 : 0;
    const isOffBalance = devPercentX > 8 || devPercentY > 8;

    const maxVolume = config.palletLength * config.palletWidth * config.palletMaxHeight;
    const totalVolume = positions.reduce((sum, p) => sum + p.largo * p.ancho * p.alto, 0);

    const warnings = [];
    if (isOffBalance) warnings.push("Advertencia de estabilidad: Centro de gravedad desplazado respecto al centro del pallet.");
    if (currentWeight >= maxPalletWeight * 0.95) warnings.push("Carga cercana o en el límite máximo de peso del pallet.");

    pallets.push({
      id: `MULTI_PALLET_${palletIndex}`,
      sku: `Pallet ${palletIndex} (Multi-SKU)`,
      palletNumber: palletIndex,
      type: "caja",
      typeLabel: "Multi-SKU",
      config: { ...config },
      positions,
      orientation: "Mixta",
      warnings,
      layout: {
        boxesPerLayer: positions.length,
        maxLayers: distinctZ.length,
        usedOverhang: pMinX < 0 || pMaxX > config.palletLength || pMinY < 0 || pMaxY > config.palletWidth,
        itemLength: 0,
        itemWidth: 0,
        itemHeight: 0,
      },
      metrics: {
        totalUnits,
        totalWeight: round(currentWeight, 2),
        weightPercent: round((currentWeight / maxPalletWeight) * 100, 1),
        finalLength: round(finalLength, 1),
        finalWidth: round(finalWidth, 1),
        finalHeight: round(finalHeight, 1),
        fullLayers: distinctZ.length,
        totalVolume: round(totalVolume, 2),
        volumePercent: maxVolume > 0 ? round((totalVolume / maxVolume) * 100, 1) : 0,
        centerOfGravity: {
          x: cgX,
          y: cgY,
          z: cgZ,
          devPercentX: round(devPercentX, 1),
          devPercentY: round(devPercentY, 1),
        },
      },
      skuBreakdown: Array.from(skuCountMap.values()),
    });

    remainingUnits = stillUnplacedForPallet;
  }

  const totalPlacedUnits = pallets.reduce((sum, p) => sum + p.metrics.totalUnits, 0);
  const totalPlacedWeight = pallets.reduce((sum, p) => sum + p.metrics.totalWeight, 0);
  const unplacedCount = remainingUnits.length;

  // Composite Fitness Score for the Strategy:
  // Higher is better.
  // - High penalty for unplaced items (-5000 pts per unplaced box)
  // - Penalty for extra pallets (-1000 pts per pallet)
  // - Reward for volumetric density (+10 pts per % volume)
  // - Reward for weight capacity (+5 pts per % weight)
  // - Penalty for center of gravity imbalance (-15 pts per % CG deviation)
  let avgVolumePercent = 0;
  let avgWeightPercent = 0;
  let avgCgDeviation = 0;

  if (pallets.length > 0) {
    avgVolumePercent = pallets.reduce((sum, p) => sum + p.metrics.volumePercent, 0) / pallets.length;
    avgWeightPercent = pallets.reduce((sum, p) => sum + p.metrics.weightPercent, 0) / pallets.length;
    avgCgDeviation = pallets.reduce((sum, p) => sum + p.metrics.centerOfGravity.devPercentX + p.metrics.centerOfGravity.devPercentY, 0) / pallets.length;
  }

  const fitnessScore =
    (totalPlacedUnits * 100) -
    (unplacedCount * 5000) -
    (pallets.length * 1000) +
    (avgVolumePercent * 15) +
    (avgWeightPercent * 5) -
    (avgCgDeviation * 12);

  return {
    strategyId: id,
    strategyLabel: label,
    fitnessScore: round(fitnessScore, 1),
    pallets,
    unplaced: remainingUnits,
    totalUnits: totalPlacedUnits,
    totalWeight: round(totalPlacedWeight, 2),
    totalRequested: baseUnits.length,
    avgVolumePercent: round(avgVolumePercent, 1),
    avgWeightPercent: round(avgWeightPercent, 1),
  };
}

/**
 * High-Level Multi-Heuristic Search:
 * Generates and evaluates 5 distinct packing heuristics (Layer-First, Heaviest-First,
 * Footprint-First, Volume-First, Strict-Deck) and returns the optimal winning configuration
 * alongside the alternatives for user inspection.
 */
export function packMultiSku(normalizedItems, config, maxPallets = 12) {
  const skuColors = new Map();
  normalizedItems.forEach((item) => {
    if (!skuColors.has(item.sku)) {
      const color = MULTI_SKU_PALETTE[skuColors.size % MULTI_SKU_PALETTE.length];
      skuColors.set(item.sku, color);
    }
  });

  const baseUnits = [];
  normalizedItems.forEach((item) => {
    const qty = Number.isSafeInteger(item.unidades) && item.unidades > 0 ? item.unidades : 0;
    const color = skuColors.get(item.sku) || "#2563eb";
    const isCylinder = item.type === "cilindro";
    const largo = isCylinder ? item.ancho : item.largo;
    const ancho = item.ancho;
    const alto = item.alto;
    const peso = item.peso;
    const baseArea = largo * ancho;
    const volume = baseArea * alto;

    for (let u = 0; u < qty; u += 1) {
      baseUnits.push({
        id: `${item.sku}_${u + 1}`,
        sku: item.sku,
        type: item.type,
        typeLabel: item.typeLabel,
        isCylinder,
        largo,
        ancho,
        alto,
        peso,
        fragil: Boolean(item.fragil),
        maxCamas: item.maxCamas,
        baseArea,
        volume,
        color,
      });
    }
  });

  if (baseUnits.length === 0) {
    return {
      pallets: [],
      unplaced: [],
      totalUnits: 0,
      totalWeight: 0,
      totalRequested: 0,
      skuColors: [],
      strategies: [],
      bestStrategyId: "estabilidad",
      bestStrategyLabel: "Mayor Estabilidad",
    };
  }

  // Define 5 distinct industrial strategies:
  const strategyDefinitions = [
    {
      id: "estabilidad",
      label: "Mayor Estabilidad y Apoyo (Recomendada)",
      sortFn: (a, b) => {
        if (a.fragil !== b.fragil) return a.fragil ? 1 : -1;
        if (b.baseArea !== a.baseArea) return b.baseArea - a.baseArea;
        if (b.peso !== a.peso) return b.peso - a.peso;
        return b.alto - a.alto;
      },
      strictBaseFloor: false,
    },
    {
      id: "densidad",
      label: "Máxima Densidad Volumétrica (Best-Fit)",
      sortFn: (a, b) => {
        if (a.fragil !== b.fragil) return a.fragil ? 1 : -1;
        if (b.volume !== a.volume) return b.volume - a.volume;
        if (b.baseArea !== a.baseArea) return b.baseArea - a.baseArea;
        return b.peso - a.peso;
      },
      strictBaseFloor: false,
    },
    {
      id: "capas",
      label: "Por Capas Horizontales (Layer-Building)",
      sortFn: (a, b) => {
        if (a.fragil !== b.fragil) return a.fragil ? 1 : -1;
        // Group by height tiers
        const heightTierA = Math.round(a.alto / 5) * 5;
        const heightTierB = Math.round(b.alto / 5) * 5;
        if (heightTierB !== heightTierA) return heightTierB - heightTierA;
        if (b.baseArea !== a.baseArea) return b.baseArea - a.baseArea;
        return b.peso - a.peso;
      },
      strictBaseFloor: false,
    },
    {
      id: "paredes",
      label: "Alineación a Paredes y Esquinas",
      sortFn: (a, b) => {
        if (a.fragil !== b.fragil) return a.fragil ? 1 : -1;
        const maxDimA = Math.max(a.largo, a.ancho);
        const maxDimB = Math.max(b.largo, b.ancho);
        if (maxDimB !== maxDimA) return maxDimB - maxDimA;
        return b.volume - a.volume;
      },
      strictBaseFloor: false,
    },
    {
      id: "base_estricta",
      label: "Base Contenida (Sin Desborde en Madera)",
      sortFn: (a, b) => {
        if (a.fragil !== b.fragil) return a.fragil ? 1 : -1;
        if (b.baseArea !== a.baseArea) return b.baseArea - a.baseArea;
        return b.peso - a.peso;
      },
      strictBaseFloor: true,
    },
  ];

  // Run all strategies and score them
  const evaluatedStrategies = strategyDefinitions.map((def) =>
    runPackingStrategy(def, baseUnits, config, maxPallets)
  );

  // Pick the winning strategy with the highest fitness score
  evaluatedStrategies.sort((a, b) => b.fitnessScore - a.fitnessScore);
  const bestStrategy = evaluatedStrategies[0];

  return {
    pallets: bestStrategy.pallets,
    unplaced: bestStrategy.unplaced,
    totalUnits: bestStrategy.totalUnits,
    totalWeight: bestStrategy.totalWeight,
    totalRequested: baseUnits.length,
    skuColors: Array.from(skuColors.entries()).map(([sku, color]) => ({ sku, color })),
    bestStrategyId: bestStrategy.strategyId,
    bestStrategyLabel: bestStrategy.strategyLabel,
    strategies: evaluatedStrategies.map((s) => ({
      id: s.strategyId,
      label: s.strategyLabel,
      fitnessScore: s.fitnessScore,
      palletsCount: s.pallets.length,
      unitsPlaced: s.totalUnits,
      unplacedCount: s.unplaced.length,
      volumePercent: s.avgVolumePercent,
      pallets: s.pallets,
      unplaced: s.unplaced,
    })),
  };
}
