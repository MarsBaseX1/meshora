import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

export class Viewport {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0c0f);
    this.scene.fog = new THREE.Fog(0x0b0c0f, 12, 48);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
    this.camera.position.set(2.4, 1.6, 2.8);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 1.4;
    this.controls.target.set(0, 0.4, 0);
    this.controls.update();

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this._setupLights();
    this._setupGrid();

    this.wireframe = false;
    this.showGrid = true;
    this._raf = 0;
    this._disposed = false;
    this._boundLoop = () => this._loop();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
    this._loop();
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0xe8a56a, 0x1a1410, 0.55);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffe0c4, 1.35);
    key.position.set(4, 6, 3);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x8aa0c8, 0.35);
    fill.position.set(-5, 2, -2);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xc9784a, 0.55);
    rim.position.set(-2, 3, 5);
    this.scene.add(rim);

    const amb = new THREE.AmbientLight(0x2a2622, 0.35);
    this.scene.add(amb);
  }

  _setupGrid() {
    this.grid = new THREE.GridHelper(8, 16, 0xc9784a, 0x1c1e24);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.35;
    this.scene.add(this.grid);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 72),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.28,
        depthWrite: false
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.001;
    this.scene.add(ground);
  }

  resize() {
    const parent = this.canvas.parentElement || this.canvas;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _loop() {
    if (this._disposed) return;
    this._raf = requestAnimationFrame(this._boundLoop);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  setGrid(on) {
    this.showGrid = on;
    this.grid.visible = on;
  }

  setWireframe(on) {
    this.wireframe = on;
    this.root.traverse((obj) => {
      if (obj.isMesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m) m.wireframe = on;
        }
      }
    });
  }

  setAutoRotate(on) {
    this.controls.autoRotate = on;
  }

  fit(object = this.root) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const dist = maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5));
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (!Number.isFinite(dir.lengthSq()) || dir.lengthSq() === 0) dir.set(1, 0.6, 1).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(dir.multiplyScalar(dist * 1.55));
    this.camera.near = maxDim / 100;
    this.camera.far = maxDim * 100;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.scene.fog.near = dist * 0.9;
    this.scene.fog.far = dist * 6;
    const gridScale = Math.max(0.5, maxDim * 1.2);
    this.grid.scale.setScalar(gridScale / 8);
    this.grid.position.y = box.min.y;
  }

  clear() {
    const toRemove = [...this.root.children];
    for (const child of toRemove) {
      this.root.remove(child);
      child.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if (m.map) m.map.dispose();
            m.dispose();
          }
        }
      });
    }
  }

  async loadGlb(bytes) {
    const loader = new GLTFLoader();
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await new Promise((resolve, reject) => {
      loader.parse(buffer, '', resolve, reject);
    });
    this.clear();
    this.root.add(gltf.scene);
    this._applyMeshDefaults(gltf.scene);
    this.setWireframe(this.wireframe);
    this.fit(this.root);
    return this.meshStats(gltf.scene);
  }

  async loadFallback(bytes, ext) {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    let object;
    if (ext === 'stl') {
      const geom = new STLLoader().parse(buffer);
      geom.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        color: 0xc9784a,
        metalness: 0.35,
        roughness: 0.45
      });
      object = new THREE.Mesh(geom, mat);
    } else if (ext === 'obj') {
      const text = new TextDecoder().decode(bytes);
      object = new OBJLoader().parse(text);
    } else if (ext === 'ply') {
      const geom = new PLYLoader().parse(buffer);
      geom.computeVertexNormals();
      object = new THREE.Mesh(
        geom,
        new THREE.MeshStandardMaterial({ color: 0xc9784a, metalness: 0.3, roughness: 0.5, vertexColors: !!geom.attributes.color })
      );
    } else {
      throw new Error('没有可用的预览加载器');
    }
    this.clear();
    this.root.add(object);
    this._applyMeshDefaults(object);
    this.setWireframe(this.wireframe);
    this.fit(this.root);
    return this.meshStats(object);
  }

  _applyMeshDefaults(root) {
    root.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (!m) continue;
          if (m.side === undefined) m.side = THREE.FrontSide;
          if ('metalness' in m && m.metalness === 0 && m.roughness === 1) {
            m.metalness = 0.18;
            m.roughness = 0.52;
          }
        }
      }
    });
  }

  meshStats(root) {
    let vertices = 0;
    let faces = 0;
    let meshes = 0;
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      meshes += 1;
      const g = obj.geometry;
      const pos = g.getAttribute('position');
      if (pos) vertices += pos.count;
      if (g.index) faces += g.index.count / 3;
      else if (pos) faces += pos.count / 3;
    });
    return { vertices: Math.round(vertices), faces: Math.round(faces), meshes };
  }

  dispose() {
    this._disposed = true;
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.clear();
    this.renderer.dispose();
    this.controls.dispose();
  }
}
