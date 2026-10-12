import * as THREE from "three";
import { getBounds } from "./palletLogic.js";

const BOX_COLORS = ["#6bb8e8", "#8bd17c", "#f2bf5e", "#ef826d", "#9f91e8", "#5ec1ad"];

function addEdges(mesh, color = "#1f2937") {
  const edges = new THREE.EdgesGeometry(mesh.geometry, 20);
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.62 }),
  );
  line.position.copy(mesh.position);
  line.rotation.copy(mesh.rotation);
  line.scale.copy(mesh.scale);
  mesh.parent.add(line);
  return line;
}

function addOutlineBox(scene, bounds, color = "#1f2937") {
  const width = Math.max(0.01, bounds.maxX - bounds.minX);
  const height = Math.max(0.01, bounds.maxY - bounds.minY);
  const depth = Math.max(0.01, bounds.maxZ - bounds.minZ);
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const edges = new THREE.EdgesGeometry(geometry, 20);
  geometry.dispose();

  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.72 }),
  );
  line.position.set(
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    (bounds.minZ + bounds.maxZ) / 2,
  );
  scene.add(line);
}

export function disposeObject(object) {
  const geometries = new Set();
  const materials = new Set();
  object.traverse((child) => {
    if (child.isInstancedMesh) child.dispose();
    if (child.geometry) geometries.add(child.geometry);
    if (child.material) {
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function getLayerBounds(positions, config) {
  const baseHeight = config.palletBaseHeight;
  const layers = new Map();

  positions.forEach((position) => {
    const key = `${position.layer}|${position.z}|${position.alto}`;
    const minX = position.x - config.palletLength / 2;
    const maxX = position.x + position.largo - config.palletLength / 2;
    const minZ = position.y - config.palletWidth / 2;
    const maxZ = position.y + position.ancho - config.palletWidth / 2;
    const minY = baseHeight + position.z;
    const maxY = baseHeight + position.z + position.alto;

    if (!layers.has(key)) {
      layers.set(key, { minX, maxX, minY, maxY, minZ, maxZ });
      return;
    }

    const bounds = layers.get(key);
    bounds.minX = Math.min(bounds.minX, minX);
    bounds.maxX = Math.max(bounds.maxX, maxX);
    bounds.minY = Math.min(bounds.minY, minY);
    bounds.maxY = Math.max(bounds.maxY, maxY);
    bounds.minZ = Math.min(bounds.minZ, minZ);
    bounds.maxZ = Math.max(bounds.maxZ, maxZ);
  });

  return Array.from(layers.values());
}

export function getSceneBounds(result, config) {
  const positions = result?.positions ?? [];
  const bounds = result?.bounds ?? getBounds(positions, config);
  const minX = bounds.minX - config.palletLength / 2;
  const maxX = bounds.maxX - config.palletLength / 2;
  const minZ = bounds.minY - config.palletWidth / 2;
  const maxZ = bounds.maxY - config.palletWidth / 2;
  const top = Math.max(config.palletMaxHeight, result?.metrics?.finalHeight ?? config.palletMaxHeight);

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    widthX: maxX - minX,
    widthZ: maxZ - minZ,
    height: top,
    center: new THREE.Vector3((minX + maxX) / 2, top / 2, (minZ + maxZ) / 2),
  };
}

function addPalletBase(scene, config, options = {}) {
  const baseHeight = config.palletBaseHeight;
  if (baseHeight === 0) return;
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: "#9a6a3a",
    roughness: 0.72,
    metalness: 0.03,
  });
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(config.palletLength, baseHeight, config.palletWidth),
    baseMaterial,
  );
  base.position.set(0, baseHeight / 2, 0);
  scene.add(base);
  if (options.showEdges !== false) addEdges(base, "#4d3420");

  if (options.showSlats === false) return;
  const slatMaterial = new THREE.MeshStandardMaterial({ color: "#b98347", roughness: 0.68 });
  const slatCount = 5;
  const slatWidth = config.palletWidth / (slatCount * 1.8);
  for (let index = 0; index < slatCount; index += 1) {
    const z = -config.palletWidth / 2 + ((index + 0.5) * config.palletWidth) / slatCount;
    const slat = new THREE.Mesh(
      new THREE.BoxGeometry(config.palletLength, baseHeight * 0.12, slatWidth),
      slatMaterial,
    );
    slat.position.set(0, baseHeight - baseHeight * 0.06, z);
    scene.add(slat);
    if (options.showEdges !== false) addEdges(slat, "#5c3b22");
  }
}

function addOverhangArea(scene, result, config) {
  if (!result?.layout?.usedOverhang) return;

  const width = Math.max(config.palletLength, result.metrics.finalLength);
  const depth = Math.max(config.palletWidth, result.metrics.finalWidth);
  const geometry = new THREE.PlaneGeometry(width, depth);
  const material = new THREE.MeshBasicMaterial({
    color: "#9ca3af",
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
  });
  const plane = new THREE.Mesh(geometry, material);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = config.palletBaseHeight + 0.25;
  scene.add(plane);
}

function addProducts(scene, result, config, options = {}) {
  const baseHeight = config.palletBaseHeight;
  const showEdges = options.showProductEdges !== false;
  const cylinderSegments = options.cylinderSegments ?? 48;
  let positions = result.positions ?? [];

  if (options.selectedLayer !== undefined && options.selectedLayer !== null && options.selectedLayer !== "all") {
    const layerNum = Number(options.selectedLayer);
    if (options.layerMode === "accumulated") {
      positions = positions.filter((p) => p.layer <= layerNum);
    } else {
      positions = positions.filter((p) => p.layer === layerNum);
    }
  }

  const edgeInstanceLimit = options.edgeInstanceLimit ?? 900;
  const useInstancing =
    options.useInstancing === true || (options.useInstancing !== false && (!showEdges || positions.length > edgeInstanceLimit));

  if (useInstancing) {
    const groups = new Map();

    positions.forEach((position) => {
      const color = position.color || (position.isCylinder ? "#ef705d" : BOX_COLORS[position.layer % BOX_COLORS.length]);
      const key = [
        position.isCylinder ? "cylinder" : "box",
        color,
        position.largo,
        position.ancho,
        position.alto,
      ].join("|");

      if (!groups.has(key)) {
        groups.set(key, { color, positions: [], sample: position });
      }
      groups.get(key).positions.push(position);
    });

    groups.forEach((group) => {
      const sample = group.sample;
      const material = new THREE.MeshStandardMaterial({
        color: group.color,
        roughness: 0.48,
        metalness: 0.04,
        transparent: true,
        opacity: sample.isCylinder ? 0.88 : 0.9,
      });
      const geometry = sample.isCylinder
        ? new THREE.CylinderGeometry(sample.largo / 2, sample.largo / 2, sample.alto, cylinderSegments, 1, false)
        : new THREE.BoxGeometry(sample.largo, sample.alto, sample.ancho);
      const mesh = new THREE.InstancedMesh(geometry, material, group.positions.length);
      const matrix = new THREE.Matrix4();

      group.positions.forEach((position, index) => {
        const centerX = position.x + position.largo / 2 - config.palletLength / 2;
        const centerY = baseHeight + position.z + position.alto / 2;
        const centerZ = position.y + position.ancho / 2 - config.palletWidth / 2;
        matrix.makeTranslation(centerX, centerY, centerZ);
        mesh.setMatrixAt(index, matrix);
      });

      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
    });

    if (showEdges) {
      getLayerBounds(positions, config).forEach((bounds) => addOutlineBox(scene, bounds));
    }
    return;
  }

  positions.forEach((position) => {
    const color = position.color || (position.isCylinder ? "#ef705d" : BOX_COLORS[position.layer % BOX_COLORS.length]);
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.48,
      metalness: 0.04,
      transparent: true,
      opacity: position.isCylinder ? 0.88 : 0.9,
    });

    const centerX = position.x + position.largo / 2 - config.palletLength / 2;
    const centerY = baseHeight + position.z + position.alto / 2;
    const centerZ = position.y + position.ancho / 2 - config.palletWidth / 2;

    const geometry = position.isCylinder
      ? new THREE.CylinderGeometry(position.largo / 2, position.largo / 2, position.alto, cylinderSegments, 1, false)
      : new THREE.BoxGeometry(position.largo, position.alto, position.ancho);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(centerX, centerY, centerZ);
    scene.add(mesh);
    if (showEdges) addEdges(mesh, position.isCylinder ? "#7f2d22" : "#1f2937");
  });
}

function addHeightGuide(scene, config) {
  const material = new THREE.LineBasicMaterial({ color: "#f7941d", linewidth: 2 });
  const x = config.palletLength / 2 + 8;
  const z = config.palletWidth / 2 + 8;
  const points = [new THREE.Vector3(x, 0, z), new THREE.Vector3(x, config.palletMaxHeight, z)];
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
  scene.add(line);
}

export function createPalletScene(result, config, options = {}) {
  config = result.config ?? config;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(options.background ?? "#f5f7fb");

  const ambient = new THREE.HemisphereLight("#ffffff", "#cbd5e1", 1.6);
  scene.add(ambient);

  const key = new THREE.DirectionalLight("#ffffff", 2.2);
  key.position.set(130, 180, 90);
  scene.add(key);

  const fill = new THREE.DirectionalLight("#fff4df", 0.9);
  fill.position.set(-100, 90, -120);
  scene.add(fill);

  const bounds = getSceneBounds(result, config);
  if (options.showGrid !== false) {
    const gridSize = Math.max(bounds.widthX, bounds.widthZ, 160);
    const grid = new THREE.GridHelper(gridSize, 12, "#cbd5e1", "#e2e8f0");
    grid.position.y = -0.02;
    scene.add(grid);
  }

  addOverhangArea(scene, result, config);
  addPalletBase(scene, config, options);
  addProducts(scene, result, config, options);
  if (options.showHeightGuide !== false) addHeightGuide(scene, config);

  return { scene, bounds };
}

export function configureCamera(camera, bounds, options = {}) {
  const radius = Math.max(1, Math.hypot(bounds.widthX, bounds.widthZ, bounds.height) / 2);
  const distanceScale = options.distanceScale ?? 1;
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const distance = (radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2)) * 1.05 * distanceScale;

  let dirVector;
  switch (options.view) {
    case "top":
      dirVector = new THREE.Vector3(0.0001, 1, 0.0001).normalize();
      break;
    case "front":
      dirVector = new THREE.Vector3(0, 0.15, 1).normalize();
      break;
    case "side":
      dirVector = new THREE.Vector3(1, 0.15, 0).normalize();
      break;
    case "iso":
    default:
      dirVector = new THREE.Vector3(0.95, 0.78, 1.2).normalize();
      break;
  }

  camera.position.copy(dirVector.multiplyScalar(distance).add(bounds.center));
  camera.near = 0.1;
  camera.far = distance + radius * 4;
  camera.updateProjectionMatrix();
  camera.lookAt(bounds.center);
}

export async function capturePalletImage(result, config, options = {}) {
  const width = options.width ?? 960;
  const height = options.height ?? 660;
  const mimeType = options.mimeType ?? "image/jpeg";
  const quality = options.quality ?? 0.86;
  const renderer = options.renderer ?? new THREE.WebGLRenderer({
    antialias: options.antialias ?? true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  
  if (!options.renderer) {
    renderer.setPixelRatio(1);
  }
  renderer.setSize(width, height, false);

  let scene;
  try {
    const created = createPalletScene(result, config, {
      background: "#ffffff",
      showProductEdges: options.showProductEdges ?? false,
      showEdges: options.showEdges ?? true,
      showSlats: options.showSlats ?? false,
      showGrid: options.showGrid ?? true,
      showHeightGuide: options.showHeightGuide ?? true,
      cylinderSegments: options.cylinderSegments ?? 24,
      useInstancing: options.useInstancing,
      edgeInstanceLimit: options.edgeInstanceLimit,
    });
    scene = created.scene;
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 10000);
    configureCamera(camera, created.bounds, { distanceScale: options.distanceScale ?? 1.1 });
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL(mimeType, quality);
  } finally {
    if (scene) disposeObject(scene);
    renderer.renderLists?.dispose?.();
    if (!options.renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.width = 0;
      renderer.domElement.height = 0;
    } else {
      renderer.clear();
    }
  }
}
