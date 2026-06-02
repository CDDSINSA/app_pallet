import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { configureCamera, createPalletScene } from "../utils/threeScene.js";

export default function PalletViewer({ result, config }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !result) return undefined;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.domElement.className = "viewer-canvas";
    container.appendChild(renderer.domElement);

    const { scene, bounds } = createPalletScene(result, config);
    const camera = new THREE.PerspectiveCamera(
      36,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      10000,
    );
    configureCamera(camera, bounds);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(bounds.center);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 60;

    let frameId = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(render);
    };

    const handleResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };

    window.addEventListener("resize", handleResize);
    render();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      scene.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((material) => material.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [result, config]);

  if (!result) {
    return (
      <div className="viewer-empty">
        <span>Sin acomodo para visualizar</span>
      </div>
    );
  }

  return <div ref={containerRef} className="viewer-shell" aria-label="Visualizador 3D del pallet" />;
}
