// js/scene.js
// Vanilla three.js scene: renders one planet at a time (Mercury..Saturn,
// matching the 6 phases in plan-data.js). Textures are generated
// procedurally on a <canvas> at runtime -- swap in real photographic
// textures under /public/textures/planets/{name}.jpg later without
// changing any of the calling code (see loadPlanetTexture below).
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const PLANET_COLORS = {
  mercury: { base: "#8a6b4f", shadow: "#3c2c1e", highlight: "#d8b98a" },
  venus: { base: "#d98a3d", shadow: "#7a3f14", highlight: "#ffce8a" },
  earth: { base: "#2f6fb0", shadow: "#0d2440", highlight: "#bfe6ff" },
  mars: { base: "#a6432c", shadow: "#3a140c", highlight: "#e0a98a" },
  jupiter: { base: "#c9975b", shadow: "#7a4f24", highlight: "#f3e2c0" },
  saturn: { base: "#d8c58e", shadow: "#8a7745", highlight: "#fff3d6" },
  uranus: { base: "#7de8e8", shadow: "#2a8a8a", highlight: "#c8ffff" },
  neptune: { base: "#3b5bd9", shadow: "#0d1f7a", highlight: "#8ab4ff" },
};

// Radii based on actual relative sizes (km), scaled so Jupiter ~5 units.
// Real diameters: Mercury 4879, Venus 12104, Earth 12756, Mars 6792,
//                 Jupiter 142984, Saturn 120536, Uranus 51118, Neptune 49528
// We use a log-ish compression so inner planets aren't invisibly small.
const PLANET_RADIUS = {
  mercury: 1.0,
  venus:   1.6,
  earth:   1.7,
  mars:    1.2,
  jupiter: 5.0,
  saturn:  4.2,
  uranus:  2.8,
  neptune: 2.7,
};

function noiseCanvasTexture(name) {
  const { base, shadow, highlight } = PLANET_COLORS[name] || PLANET_COLORS.mercury;
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Simple mottled/cratered look: scattered radial blobs.
  const blobCount = name === "jupiter" || name === "saturn" ? 0 : 260;
  for (let i = 0; i < blobCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 4 + Math.random() * 18;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() > 0.5;
    g.addColorStop(0, dark ? shadow : highlight);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Banded gas-giant look for Jupiter/Saturn.
  if (name === "jupiter" || name === "saturn") {
    const bands = 14;
    for (let i = 0; i < bands; i++) {
      const y = (size / bands) * i;
      const h = size / bands;
      ctx.fillStyle = i % 2 === 0 ? shadow : highlight;
      ctx.globalAlpha = 0.18 + Math.random() * 0.12;
      ctx.fillRect(0, y, size, h);
    }
    ctx.globalAlpha = 1;
  }

  // Earth gets simple blue/green continents instead of craters.
  if (name === "earth") {
    ctx.fillStyle = "#2f8f4e";
    for (let i = 0; i < 8; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.ellipse(x, y, 40 + Math.random() * 60, 25 + Math.random() * 40, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function buildRing(innerRadius, outerRadius) {
  // Use a PlaneGeometry to perfectly map the square top-down ring texture
  const planeSize = outerRadius * 2.2;
  const geometry = new THREE.PlaneGeometry(planeSize, planeSize);
  
  const ringMat = new THREE.MeshStandardMaterial({
    map: TEXTURES.saturnRing,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending, // Black background becomes perfectly transparent
    side: THREE.DoubleSide,
    roughness: 0.8,
    metalness: 0.1,
    depthWrite: false
  });
  
  const mesh = new THREE.Mesh(geometry, ringMat);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

const textureLoader = new THREE.TextureLoader();
const TEXTURES = {
  mercury: textureLoader.load("/assets/planet_texture_mercury.png"),
  venus: textureLoader.load("/assets/planet_texture_venus.png"),
  earth: textureLoader.load("/assets/planet_texture_earth.png"),
  earthNormal: textureLoader.load("https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg"),
  earthSpecular: textureLoader.load("https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg"),
  earthClouds: textureLoader.load("https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png"),
  mars: textureLoader.load("/assets/planet_texture_mars.png"),
  jupiter: textureLoader.load("/assets/planet_texture_jupiter.png"),
  saturn: textureLoader.load("/assets/planet_texture_saturn.png"),
  uranus: textureLoader.load("/assets/planet_texture_uranus_2k.jpg"),
  neptune: textureLoader.load("/assets/planet_texture_neptune_2k.jpg"),
  moon: textureLoader.load("https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg"),
  sun: textureLoader.load("/assets/sunmap.jpg"),
  asteroid: textureLoader.load("/assets/asteroid_texture.png"),
  saturnRing: textureLoader.load("/assets/saturn_ring_texture.png")
};

// Enable anisotropic filtering for better texture quality at glancing angles
Object.values(TEXTURES).forEach(tex => {
  tex.anisotropy = 16;
  tex.colorSpace = THREE.SRGBColorSpace;
});

export function createPlanetGroup(name) {
  const radius = PLANET_RADIUS[name] || 2;
  const geometry = new THREE.SphereGeometry(radius, 128, 128);
  
  let map = TEXTURES[name] || TEXTURES.moon;
  let normalMap = null;
  let bumpMap = TEXTURES.moon;
  let specularMap = null;
  let color = PLANET_COLORS[name] ? PLANET_COLORS[name].base : 0xffffff;

  if (name === "earth") {
    normalMap = TEXTURES.earthNormal;
    specularMap = TEXTURES.earthSpecular;
    bumpMap = null;
  } else if (name !== "jupiter" && name !== "saturn") {
    // Rocky planets get a small bump map based on texture
    bumpMap = map;
  } else {
    // Gas giants don't get bump maps
    bumpMap = null;
  }

  const material = new THREE.MeshStandardMaterial({
    map: map,
    color: color,
    bumpMap: bumpMap,
    bumpScale: 0.015,
    normalMap: normalMap,
    roughnessMap: specularMap,
    roughness: 0.8,
    metalness: 0.1
  });
  const mesh = new THREE.Mesh(geometry, material);
  const group = new THREE.Group();
  group.add(mesh);
  
  // Add clouds to earth
  if (name === "earth") {
    const cloudGeometry = new THREE.SphereGeometry(radius * 1.01, 128, 128);
    const cloudMaterial = new THREE.MeshStandardMaterial({
      map: TEXTURES.earthClouds,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
    group.add(cloudMesh);
  }
  
  group.userData.planet = name;
  group.userData.mesh = mesh; // Save reference to mesh for animation

  if (name === "saturn") {
    group.add(buildRing(radius * 1.4, radius * 2.3));
  }

  // Uranus has a faint ring system and its famous 98° axial tilt
  if (name === "uranus") {
    const uranusRingGeo = new THREE.RingGeometry(radius * 1.6, radius * 2.0, 128);
    const uranusRingMat = new THREE.MeshStandardMaterial({
      color: 0x88ccdd,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      roughness: 0.9,
      metalness: 0.0
    });
    const uranusRingMesh = new THREE.Mesh(uranusRingGeo, uranusRingMat);
    uranusRingMesh.rotation.x = Math.PI / 2;
    group.add(uranusRingMesh);
    // Uranus spins nearly on its side
    group.rotation.z = 98 * (Math.PI / 180);
  }

  return group;
}

function getStarTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.1, "rgba(255,255,255,0.9)");
  gradient.addColorStop(0.3, "rgba(28,219,188,0.5)"); // Sharp Aurora Teal glow
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function buildStarfield() {
  const count = 1200;
  const positions = new Float32Array(count * 3);
  const vels = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 200;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 200;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
    
    // radial outward velocities for warp effect
    const x = positions[i*3];
    const y = positions[i*3+1];
    const len = Math.sqrt(x*x + y*y) || 1;
    vels[i*3] = (x / len);
    vels[i*3+1] = (y / len);
    vels[i*3+2] = 0; 

    // subtle teal vs white color variation
    const isTeal = Math.random() > 0.7;
    colors[i*3] = isTeal ? 0.11 : 0.8;
    colors[i*3+1] = isTeal ? 0.86 : 0.9;
    colors[i*3+2] = isTeal ? 0.74 : 1.0;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("velocity", new THREE.BufferAttribute(vels, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.userData.originalPositions = positions.slice();

  const material = new THREE.PointsMaterial({ 
    size: 0.8, 
    sizeAttenuation: true,
    map: getStarTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true
  });
  const points = new THREE.Points(geometry, material);
  return points;
}

/**
 * Creates a full scene bound to one <canvas>. Returns control functions;
 * caller is responsible for calling dispose() when the canvas goes away.
 */
export function initPlanetScene(canvas, { interactive = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

  const hemiLight = new THREE.HemisphereLight(0xddffff, 0x114433, 1.2); // Nebula green ambient light
  scene.add(hemiLight);
  
  // Sunlight radiating from the center - increased intensity drastically for physically-based attenuation
  const sunLight = new THREE.PointLight(0xffffff, 1500, 2000, 1.5);
  sunLight.position.set(0, 0, 0);
  scene.add(sunLight);
  
  // Create the Sun
  const sunGeo = new THREE.SphereGeometry(6, 64, 64);
  const sunMat = new THREE.MeshBasicMaterial({ 
    map: TEXTURES.sun,
    color: 0xffffff
  });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  scene.add(sunMesh);
  
  const starfield = buildStarfield();
  scene.add(starfield);

  const planetOrder = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"];
  const planetsData = {};
  let currentPlanetName = null;
  let zoomPct = 100;
  let running = true;
  let isWarping = false;
  let warpTime = 0;
  
  // Camera tween targets
  let targetCamPos = new THREE.Vector3();
  let targetLookAt = new THREE.Vector3();
  let currentLookAt = new THREE.Vector3();

  // Create Solar System
  planetOrder.forEach((name, idx) => {
    // Distance from center (sun)
    const distance = 14 + (idx * 16); // Spacing: inner planets tight, outers spread out
    
    // Create crisp, high-resolution orbit line
    const segments = 512;
    const orbitPoints = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      orbitPoints.push(new THREE.Vector3(Math.cos(theta) * distance, 0, Math.sin(theta) * distance));
    }
    const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    const orbitMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const orbitLine = new THREE.Line(orbitGeo, orbitMat);
    scene.add(orbitLine);

    // Create a pivot for the planet's orbit
    const pivot = new THREE.Group();
    scene.add(pivot);

    // Create planet group and offset it
    const planetGroup = createPlanetGroup(name);
    // Add a slight random initial rotation along orbit so they aren't all aligned
    pivot.rotation.y = Math.random() * Math.PI * 2;
    planetGroup.position.set(distance, 0, 0);
    pivot.add(planetGroup);

    // Create a subtle point light for each planet (glow)
    const pLight = new THREE.PointLight(0x1cdbbc, 0.5, 20);
    planetGroup.add(pLight);

    planetsData[name] = {
      pivot: pivot,
      group: planetGroup,
      orbitLine: orbitLine,
      distance: distance,
      orbitSpeed: 0.002 - (idx * 0.0002) // outer planets orbit slower
    };
  });

  // --- Create True 3D Textured Asteroid Belt ---
  const beltCount = 800; // Thinned out for a cleaner look
  // Use Dodecahedron for jagged rocky space look
  const asteroidGeo = new THREE.DodecahedronGeometry(0.4, 0); 
  const asteroidMat = new THREE.MeshStandardMaterial({
    map: TEXTURES.asteroid, // Map the high-quality NASA image to the 3D rock!
    color: 0xaaaaaa, // Neutral tint so texture shows through
    roughness: 0.9,
    metalness: 0.1
  });
  const beltMesh = new THREE.InstancedMesh(asteroidGeo, asteroidMat, beltCount);
  
  const dummy = new THREE.Object3D();
  for (let i = 0; i < beltCount; i++) {
    const r = 70 + (Math.random() - 0.5) * 4; // Thin belt between Mars and Jupiter orbits
    const theta = Math.random() * Math.PI * 2;
    const x = Math.cos(theta) * r;
    const y = (Math.random() - 0.5) * 1.5; // less vertical spread
    const z = Math.sin(theta) * r;
    
    dummy.position.set(x, y, z);
    
    // Random rotation for jagged edges
    dummy.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    
    // Random scale (some large, mostly medium/small)
    const scale = 0.5 + Math.pow(Math.random(), 3) * 2.5; 
    dummy.scale.set(scale, scale, scale);
    
    dummy.updateMatrix();
    beltMesh.setMatrixAt(i, dummy.matrix);
  }
  
  const beltPivot = new THREE.Group();
  beltPivot.add(beltMesh);
  scene.add(beltPivot);

  function applyCamera() {
    // The zoom is handled during the lerp
  }

  function resize() {
    const { clientWidth, clientHeight } = canvas;
    if (clientWidth === 0 || clientHeight === 0) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  function setPlanet(name) {
    if (currentPlanetName && currentPlanetName !== name) {
      if (isWarping) return;
      isWarping = true;
      warpTime = 0;
      currentPlanetName = name;
      
      // Simple animation loop for warp through the solar system
      function animateWarp() {
        if (!isWarping) return;
        warpTime += 0.035; // speed
        
        const pos = starfield.geometry.attributes.position;
        const vel = starfield.geometry.attributes.velocity;
        const orig = starfield.geometry.userData.originalPositions;
        
        if (warpTime < 1) {
          // Star stretching effect radially away from camera
          for(let i=0; i<pos.count; i++) {
            pos.array[i*3] = orig[i*3] + vel.array[i*3] * warpTime * 40;
            pos.array[i*3+1] = orig[i*3+1] + vel.array[i*3+1] * warpTime * 40;
            pos.array[i*3+2] = orig[i*3+2] + warpTime * 100; 
          }
          pos.needsUpdate = true;
          
          // FOV warp effect tunnel
          camera.fov = 45 + warpTime * 60;
          camera.updateProjectionMatrix();
        } else if (warpTime < 2) {
          // Snap stars back
          if (warpTime < 1.05) {
            pos.array.set(orig);
            pos.needsUpdate = true;
          }
          
          const progress = Math.min(1, warpTime - 1);
          const ease = 1 - Math.pow(1 - progress, 4);
          
          // Restore FOV smoothly
          camera.fov = 105 - (ease * 60);
          camera.updateProjectionMatrix();
        } else {
          isWarping = false;
          camera.fov = 45;
          camera.updateProjectionMatrix();
        }
        
        if (isWarping) requestAnimationFrame(animateWarp);
      }
      animateWarp();
    } else {
      currentPlanetName = name;
    }
  }

  function setZoom(pct) {
    zoomPct = Math.min(400, Math.max(25, pct));
    return zoomPct;
  }

  function resetZoom() {
    return setZoom(100);
  }

  function getZoom() {
    return zoomPct;
  }

  // Initial setup for login view (Sun on left, planets stretching right)
  camera.position.set(25, 25, 80);
  currentLookAt.set(15, 0, 0);

  function animate() {
    if (!running) return;
    requestAnimationFrame(animate);
    
    // Starfield drift
    starfield.rotation.y += 0.0003;
    starfield.rotation.z += 0.0001;
    
    // Sun rotation
    sunMesh.rotation.y += 0.001;
    
    // Asteroid belt rotation
    beltPivot.rotation.y -= 0.0005;

    // Orbit all planets
    Object.values(planetsData).forEach(pData => {
      // Orbit around the sun
      pData.pivot.rotation.y += pData.orbitSpeed;
      // Planet's own rotation
      pData.group.rotation.y += 0.005;
    });

    if (currentPlanetName && planetsData[currentPlanetName]) {
      const zoomFactor = 100 / zoomPct;
      
      const pData = planetsData[currentPlanetName];
      // Get planet's absolute world position
      const worldPos = new THREE.Vector3();
      pData.group.getWorldPosition(worldPos);

      // We want to be looking at the active planet closely from an angle
      // Offset slightly to the left (-2.7), up (1.5), and front (10.5)
      targetCamPos.copy(worldPos).add(new THREE.Vector3(-4.0 * zoomFactor, 2.5 * zoomFactor, 16.0 * zoomFactor));
      targetLookAt.copy(worldPos);

      // Lerp camera position faster during warp, slower normally
      const lerpSpeed = isWarping ? 0.08 : 0.04;
      camera.position.lerp(targetCamPos, lerpSpeed);
      // Lerp lookAt target
      currentLookAt.lerp(targetLookAt, lerpSpeed);
      camera.lookAt(currentLookAt);
      
      // Highlight the active planet's orbit
      Object.keys(planetsData).forEach(name => {
        const pData = planetsData[name];
        if (name === currentPlanetName) {
          pData.orbitLine.material.opacity = 0.85;
          pData.orbitLine.material.color.setHex(0xffffff);
        } else {
          pData.orbitLine.material.opacity = 0.25;
          pData.orbitLine.material.color.setHex(0x1cdbbc);
        }
      });
    } else {
      // Login mode overview pan
      const time = Date.now() * 0.0001;
      const radius = 180; // Outside the furthest planet orbit
      targetCamPos.set(Math.cos(time) * radius, 45, Math.sin(time) * radius);
      targetLookAt.set(0, 0, 0);

      camera.position.lerp(targetCamPos, 0.02);
      currentLookAt.lerp(targetLookAt, 0.02);
      camera.lookAt(currentLookAt);

      // Make all orbits equally dim
      Object.keys(planetsData).forEach(name => {
        planetsData[name].orbitLine.material.opacity = 0.25;
        planetsData[name].orbitLine.material.color.setHex(0x1cdbbc);
      });
    }

    renderer.render(scene, camera);
  }
  animate();

  function dispose() {
    running = false;
    resizeObserver.disconnect();
    renderer.dispose();
  }

  return {
    setPlanet,
    setCameraDistance: () => {}, // unused in this architecture
    setZoom,
    resetZoom,
    getZoom,
    dispose,
  };
}
