/*
  Curl-turbulence instanced particle demo
  — WebGL 2, three.js, lil-gui
*/

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/+esm";
import GUI from "https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm";
import SimplexNoise from "https://unpkg.com/simplex-noise@4.0.1/dist/esm/simplex-noise.js";

/* ---------- CONSTANTS ---------- */
const RADIUS = 50; // sphere volume radius (diameter 100)
const COLOR_CENTER = new THREE.Color(0xffffff);
const COLOR_EDGE = new THREE.Color(0xff0000);

const epsilon = 0.0001; // finite-difference step for curl

/* ---------- PARAMS (exposed in GUI) ---------- */
const params = {
  count: 10000,
  size: 0.5,
  windScale: 0.04, // spatial scale of noise → bigger = smoother
  speed: 4.0, // overall velocity multiplier
  boundary: 4.0, // strength pushing particles back in
  reset: initParticles,
};

/* ---------- THREE BASICS ---------- */
const canvas = document.createElement("canvas");
const context = canvas.getContext("webgl2");
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas, context });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(canvas);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  15, // «длиннофокусный» небольшой FOV
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 200);
camera.lookAt(0, 0, 0);

/* ---------- GUI ---------- */
const gui = new GUI({ container: document.getElementById("gui") });
gui.add(params, "count", 1000, 20000, 1000).name("Instances").onFinishChange(params.reset);
gui.add(params, "size", 0.1, 2, 0.1).name("Sphere Size").onFinishChange(params.reset);
gui.add(params, "windScale", 0.005, 0.1, 0.001).name("Noise Scale");
gui.add(params, "speed", 0.1, 10, 0.1).name("Speed");
gui.add(params, "boundary", 1, 10, 0.1).name("Boundary");
gui.add(params, "reset").name("Reset Particles");

/* ---------- GEOMETRY / MATERIAL ---------- */
let sphereGeom;
let instancedMesh; // (re-created on reset)

/* storage for per-particle data */
let positions = []; // THREE.Vector3[]
let dummy = new THREE.Object3D();

/* noise instance */
const simplex = new SimplexNoise();

/* ---------- CURL NOISE FUNCTION ---------- */
function curlNoise(x, y, z) {
  // sample scalar noise
  const n = (xi, yi, zi) => simplex.noise3D(xi * params.windScale, yi * params.windScale, zi * params.windScale);

  const dx = (n(x + epsilon, y, z) - n(x - epsilon, y, z)) / (2 * epsilon);
  const dy = (n(x, y + epsilon, z) - n(x, y - epsilon, z)) / (2 * epsilon);
  const dz = (n(x, y, z + epsilon) - n(x, y, z - epsilon)) / (2 * epsilon);

  // divergence-free curl field
  return new THREE.Vector3(dy - dz, dz - dx, dx - dy).normalize();
}

/* ---------- INIT / RESET ---------- */
function initParticles() {
  /* dispose old mesh (if any) */
  if (instancedMesh) {
    instancedMesh.geometry.dispose();
    instancedMesh.material.dispose();
    scene.remove(instancedMesh);
  }

  positions = [];

  sphereGeom = new THREE.SphereGeometry(params.size * 0.5, 12, 12);
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  instancedMesh = new THREE.InstancedMesh(sphereGeom, material, params.count);
  instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const color = new THREE.Color();
  for (let i = 0; i < params.count; i++) {
    // random point in sphere
    let p;
    do {
      p = new THREE.Vector3(
        (Math.random() * 2 - 1) * RADIUS,
        (Math.random() * 2 - 1) * RADIUS,
        (Math.random() * 2 - 1) * RADIUS
      );
    } while (p.length() > RADIUS);

    positions.push(p);

    dummy.position.copy(p);
    dummy.scale.setScalar(params.size);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);

    /* colour = white→red based on radius + small jitter */
    const t = p.length() / RADIUS;
    color.copy(COLOR_CENTER).lerp(COLOR_EDGE, t);
    // subtle random variation
    color.r += (Math.random() - 0.5) * 0.1;
    color.g += (Math.random() - 0.5) * 0.1;
    color.b += (Math.random() - 0.5) * 0.1;
    color.clampScalar(0, 1);

    instancedMesh.setColorAt(i, color);
  }
  instancedMesh.instanceColor.needsUpdate = true;
  scene.add(instancedMesh);
}

initParticles();

/* ---------- ANIMATION LOOP ---------- */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];

    /* velocity from curl field, magnitude varies with noise value */
    const noiseAmp = simplex.noise3D(
      p.x * params.windScale,
      p.y * params.windScale,
      p.z * params.windScale
    ) * 0.5 + 0.5;
    const v = curlNoise(p.x, p.y, p.z).multiplyScalar(params.speed * noiseAmp);

    p.addScaledVector(v, dt);

    /* boundary force: push back inside if outside radius */
    const len = p.length();
    if (len > RADIUS) {
      const push = (len - RADIUS) * params.boundary;
      p.addScaledVector(p.clone().normalize(), -push * dt);
      if (p.length() > RADIUS) p.setLength(RADIUS - 0.001);
    }

    dummy.position.copy(p);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
  }
  instancedMesh.instanceMatrix.needsUpdate = true;

  renderer.render(scene, camera);
}

animate();

/* ---------- HANDLE RESIZE ---------- */
window.addEventListener("resize", () => {
  const { innerWidth: w, innerHeight: h } = window;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});
