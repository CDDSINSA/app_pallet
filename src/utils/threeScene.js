import * as THREE from "three";

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

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
}

export function getSceneBounds(result, config) {
  const positions = result?.positions ?? [];
  const minX = Math.min(-config.palletLength / 2, ...positions.map((p) => p.x - config.palletLength / 2));
  const maxX = Math.max(
    config.palletLength / 2,
    ...positions.map((p) => p.x + p.largo - config.palletLength / 2),
  );
  const minZ = Math.min(-config.palletWidth / 2, ...positions.map((p) => p.y - config.palletWidth / 2));
  const maxZ = Math.max(
    config.palletWidth / 2,
    ...positions.map((p) => p.y + p.ancho - config.palletWidth / 2),
  );
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
  const baseHeight = Math.max(3, config.palletBaseHeight);
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
      new THREE.BoxGeometry(config.palletLength, Math.max(1.5, baseHeight * 0.12), slatWidth),
      slatMaterial,
    );
    slat.position.set(0, baseHeight + Math.max(0.8, baseHeight * 0.06), z);
    scene.add(slat);
    if (options.showEdges !== false) addEdges(slat, "#5c3b22");
  }
}

function addOverhangArea(scene, result, config) {
  if (!result?.layout?.usedOverhang) return;

  const width = Math.max(config.palletLength, result.layout.cols * result.layout.itemLength);
  const depth = Math.max(config.palletWidth, result.layout.rows * result.layout.itemWidth);
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
  const baseHeight = Math.max(3, config.palletBaseHeight);
  const showEdges = options.showProductEdges !== false;
  const cylinderSegments = options.cylinderSegments ?? 48;
  const useInstancing = options.useInstancing !== false && !showEdges;

  if (useInstancing) {
    const groups = new Map();

    result.positions.forEach((position) => {
      const color = position.isCylinder ? "#ef705d" : BOX_COLORS[position.layer % BOX_COLORS.length];
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
    return;
  }

  result.positions.forEach((position) => {
    const color = position.isCylinder ? "#ef705d" : BOX_COLORS[position.layer % BOX_COLORS.length];
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
  const span = Math.max(bounds.widthX, bounds.widthZ, bounds.height, 120);
  const distanceScale = options.distanceScale ?? 1;
  camera.position.set(
    bounds.center.x + span * 0.95 * distanceScale,
    bounds.center.y + span * 0.78 * distanceScale,
    bounds.center.z + span * 1.2 * distanceScale,
  );
  camera.near = 0.1;
  camera.far = span * 12;
  camera.updateProjectionMatrix();
  camera.lookAt(bounds.center);
}

export async function capturePalletImage(result, config, options = {}) {
  const width = options.width ?? 960;
  const height = options.height ?? 660;
  const mimeType = options.mimeType ?? "image/jpeg";
  const quality = options.quality ?? 0.86;
  const renderer = new THREE.WebGLRenderer({
    antialias: options.antialias ?? true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);

  const { scene, bounds } = createPalletScene(result, config, {
    background: "#ffffff",
    showProductEdges: options.showProductEdges ?? false,
    showEdges: options.showEdges ?? true,
    showSlats: options.showSlats ?? false,
    showGrid: options.showGrid ?? true,
    showHeightGuide: options.showHeightGuide ?? true,
    cylinderSegments: options.cylinderSegments ?? 24,
  });
  const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 10000);
  configureCamera(camera, bounds, { distanceScale: options.distanceScale ?? 1.1 });
  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL(mimeType, quality);

  disposeObject(scene);
  renderer.dispose();
  renderer.forceContextLoss();

  return dataUrl;
}
