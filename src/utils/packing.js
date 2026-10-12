// All dimensions are centimetres; weight is kilograms. Correct only rounding
// noise near integers, without admitting a material excess of weight or size.
export function floorRatio(limit, unit) {
  const ratio = limit / unit;
  return Math.max(0, Math.floor(ratio + 8 * Number.EPSILON * Math.max(1, Math.abs(ratio))));
}

export function gridPlan(length, width, config, allowance, orientation) {
  const cols = floorRatio(allowance.length, length);
  const rows = floorRatio(allowance.width, width);
  return {
    orientation,
    groups: [{ x: 0, y: 0, cols, rows, largo: length, ancho: width }],
    count: cols * rows,
    length: cols * length,
    width: rows * width,
  };
}

// Two bands of perpendicular boxes, contained entirely within the pallet.
// This is a bounded heuristic, not an exhaustive rectangle-packing solver.
export function mixedPlans(length, width, config) {
  const plans = [];
  if (length === width) return plans;
  for (const transpose of [false, true]) {
    const availableL = transpose ? config.palletWidth : config.palletLength;
    const availableW = transpose ? config.palletLength : config.palletWidth;
    const l = transpose ? width : length;
    const w = transpose ? length : width;
    const colsA = floorRatio(availableL, l);
    const colsB = floorRatio(availableL, w);
    if (!colsA || !colsB) continue;
    const maxRows = floorRatio(availableW, w);
    // Bound search cost for very small products; uniform plans remain available.
    for (let rowsA = 1; rowsA <= Math.min(maxRows, 2048); rowsA += 1) {
      const rowsB = floorRatio(Math.max(0, availableW - rowsA * w), l);
      if (!rowsB) continue;
      let groups = [
        { x: 0, y: 0, cols: colsA, rows: rowsA, largo: l, ancho: w },
        { x: 0, y: rowsA * w, cols: colsB, rows: rowsB, largo: w, ancho: l },
      ];
      if (transpose) groups = groups.map((g) => ({ x: g.y, y: g.x, cols: g.rows, rows: g.cols, largo: g.ancho, ancho: g.largo }));
      plans.push({
        orientation: "Mixta",
        groups,
        count: colsA * rowsA + colsB * rowsB,
        length: Math.max(...groups.map((g) => g.x + g.cols * g.largo)),
        width: Math.max(...groups.map((g) => g.y + g.rows * g.ancho)),
      });
    }
  }
  return plans;
}

export function hexagonalCylinderPlans(diameter, config, allowance) {
  const plans = [];
  if (diameter <= 0) return plans;

  const dy = (diameter * Math.sqrt(3)) / 2;
  const radius = diameter / 2;

  for (const transpose of [false, true]) {
    const availL = transpose ? allowance.width : allowance.length;
    const availW = transpose ? allowance.length : allowance.width;

    if (availW < diameter || availL < diameter) continue;

    const maxRows = 1 + floorRatio(availW - diameter, dy);
    if (maxRows <= 0) continue;

    for (const offsetFirst of [false, true]) {
      const items = [];
      for (let r = 0; r < maxRows; r += 1) {
        const y = r * dy;
        const isOffset = (r % 2 === 1) ? !offsetFirst : offsetFirst;
        const startX = isOffset ? radius : 0;
        const remainingL = availL - startX;
        const countInRow = floorRatio(remainingL, diameter);

        for (let c = 0; c < countInRow; c += 1) {
          const x = startX + c * diameter;
          const pos = transpose
            ? { x: y, y: x, row: c, col: r, largo: diameter, ancho: diameter }
            : { x, y, row: r, col: c, largo: diameter, ancho: diameter };
          items.push(pos);
        }
      }

      if (items.length > 0) {
        const len = Math.max(...items.map((i) => i.x + i.largo));
        const wid = Math.max(...items.map((i) => i.y + i.ancho));
        plans.push({
          orientation: "Tresbolillo",
          explicitItems: items,
          count: items.length,
          length: len,
          width: wid,
        });
      }
    }
  }

  return plans;
}

export function choosePlan(plans, height, weight, config, maxCamas = null) {
  let maxLayers = floorRatio(config.palletMaxHeight - config.palletBaseHeight, height);
  if (Number.isSafeInteger(maxCamas) && maxCamas > 0) {
    maxLayers = Math.min(maxLayers, maxCamas);
  }
  const weightLimit = floorRatio(config.palletMaxWeight, weight);
  const candidates = plans.filter((plan) => plan.count > 0).map((plan) => {
    const total = Math.min(plan.count * maxLayers, weightLimit);
    const overhangL = Math.max(0, (plan.length - config.palletLength) / 2);
    const overhangW = Math.max(0, (plan.width - config.palletWidth) / 2);
    return { ...plan, total, maxLayers, overhangL, overhangW, usedLayers: Math.ceil(total / plan.count) };
  });
  candidates.sort((a, b) => b.total - a.total
    || (a.overhangL + a.overhangW) - (b.overhangL + b.overhangW)
    || a.usedLayers - b.usedLayers
    || b.count - a.count);
  const best = candidates[0];
  if (!best) return undefined;

  if (Boolean(config.interlockLayers)) {
    if (best.orientation === "Original" || best.orientation === "Rotada") {
      const targetOrientation = best.orientation === "Original" ? "Rotada" : "Original";
      const maxOverhang = config.allowOverhang ? config.maxOverhang : 0;
      const alt = candidates.find(
        (c) => c.orientation === targetOrientation &&
               c.count === best.count &&
               c.overhangL <= maxOverhang &&
               c.overhangW <= maxOverhang,
      );
      if (alt) {
        best.alternatePlan = alt;
      }
    }
  }

  return best;
}

export function materializePlan(plan, height, weight, config, isCylinder, limit) {
  if (!plan || !plan.total) return { error: "No se pudo colocar ninguna unidad: revise peso, alto o dimensiones." };
  if (!Number.isSafeInteger(plan.count) || !Number.isSafeInteger(plan.total) || plan.total > limit) {
    return { error: `La simulacion supera el limite disponible de ${limit} posiciones. Revise las medidas o procese un archivo mas pequeno.` };
  }
  const positions = [];
  const interlock = Boolean(config.interlockLayers) && !isCylinder;

  const maxLimitL = config.palletLength + 2 * (config.allowOverhang ? config.maxOverhang : 0);
  const maxLimitW = config.palletWidth + 2 * (config.allowOverhang ? config.maxOverhang : 0);
  const canRotate90 = interlock && (plan.width <= maxLimitL + 1e-6) && (plan.length <= maxLimitW + 1e-6);

  for (let layer = 0; layer < plan.usedLayers; layer += 1) {
    const isOdd = layer % 2 === 1;

    if (interlock && isOdd && plan.alternatePlan) {
      const altPlan = plan.alternatePlan;
      const offsetX = (config.palletLength - altPlan.length) / 2;
      const offsetY = (config.palletWidth - altPlan.width) / 2;
      for (const group of altPlan.groups) {
        for (let row = 0; row < group.rows && positions.length < plan.total; row += 1) {
          for (let col = 0; col < group.cols && positions.length < plan.total; col += 1) {
            positions.push({
              x: offsetX + group.x + col * group.largo,
              y: offsetY + group.y + row * group.ancho,
              z: layer * height,
              largo: group.largo,
              ancho: group.ancho,
              alto: height,
              layer,
              row,
              col,
              isCylinder,
            });
          }
        }
      }
      continue;
    }

    if (interlock && isOdd && canRotate90) {
      const rotOffsetX = (config.palletLength - plan.width) / 2;
      const rotOffsetY = (config.palletWidth - plan.length) / 2;

      if (plan.explicitItems) {
        for (const item of plan.explicitItems) {
          if (positions.length >= plan.total) break;
          const xRel = item.y;
          const yRel = plan.length - (item.x + item.largo);
          positions.push({
            x: rotOffsetX + xRel,
            y: rotOffsetY + yRel,
            z: layer * height,
            largo: item.ancho,
            ancho: item.largo,
            alto: height,
            layer,
            row: item.col,
            col: item.row,
            isCylinder,
          });
        }
      } else {
        for (const group of plan.groups) {
          for (let row = 0; row < group.rows && positions.length < plan.total; row += 1) {
            for (let col = 0; col < group.cols && positions.length < plan.total; col += 1) {
              const origX = group.x + col * group.largo;
              const origY = group.y + row * group.ancho;
              const xRel = origY;
              const yRel = plan.length - (origX + group.largo);
              positions.push({
                x: rotOffsetX + xRel,
                y: rotOffsetY + yRel,
                z: layer * height,
                largo: group.ancho,
                ancho: group.largo,
                alto: height,
                layer,
                row: col,
                col: row,
                isCylinder,
              });
            }
          }
        }
      }
    } else {
      const offsetX = (config.palletLength - plan.length) / 2;
      const offsetY = (config.palletWidth - plan.width) / 2;

      if (plan.explicitItems) {
        for (const item of plan.explicitItems) {
          if (positions.length >= plan.total) break;
          let x = item.x;
          let y = item.y;
          if (interlock && isOdd) {
            x = plan.length - (item.x + item.largo);
            y = plan.width - (item.y + item.ancho);
          }
          positions.push({
            x: offsetX + x,
            y: offsetY + y,
            z: layer * height,
            largo: item.largo,
            ancho: item.ancho,
            alto: height,
            layer,
            row: item.row,
            col: item.col,
            isCylinder,
          });
        }
      } else {
        for (const group of plan.groups) {
          for (let row = 0; row < group.rows && positions.length < plan.total; row += 1) {
            for (let col = 0; col < group.cols && positions.length < plan.total; col += 1) {
              let itemX = group.x + col * group.largo;
              let itemY = group.y + row * group.ancho;
              if (interlock && isOdd) {
                itemX = plan.length - (itemX + group.largo);
                itemY = plan.width - (itemY + group.ancho);
              }
              positions.push({
                x: offsetX + itemX,
                y: offsetY + itemY,
                z: layer * height,
                largo: group.largo,
                ancho: group.ancho,
                alto: height,
                layer,
                row,
                col,
                isCylinder,
              });
            }
          }
        }
      }
    }
  }

  const sampleLargo = plan.explicitItems ? plan.explicitItems[0].largo : plan.groups[0].largo;
  const sampleAncho = plan.explicitItems ? plan.explicitItems[0].ancho : plan.groups[0].ancho;

  return {
    positions,
    totalWeight: positions.length * weight,
    layout: {
      cols: plan.groups ? plan.groups[0].cols : plan.count,
      rows: plan.groups ? plan.groups[0].rows : 1,
      boxesPerLayer: plan.count, maxLayers: plan.maxLayers,
      usedOverhang: plan.overhangL > 0 || plan.overhangW > 0,
      overhangL: plan.overhangL, overhangW: plan.overhangW,
      usableLength: Math.max(config.palletLength, plan.length),
      usableWidth: Math.max(config.palletWidth, plan.width),
      itemLength: sampleLargo, itemWidth: sampleAncho, itemHeight: height,
      stoppedByWeight: plan.total < plan.count * plan.maxLayers,
    },
  };
}
