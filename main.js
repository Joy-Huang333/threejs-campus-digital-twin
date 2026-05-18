import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x87ceeb, 100, 500);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('container').appendChild(renderer.domElement);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.08;
orbitControls.maxPolarAngle = Math.PI / 1.95;
orbitControls.minDistance = 0;
orbitControls.maxDistance = Infinity;

const modelLayers = { buildings: [], roads: [], vegetation: [] };
const interactiveObjects = [];
const buildingInfoMap = new Map();

// ===================== 完整名称映射 =====================
const nameToLabel = {
  // mesh 系列
  'mesh0001': '教学楼',
  'mesh0002': '中心花坛',
  'mesh0003': '艺术大楼',
  'mesh0004': '行政大楼',
  'mesh0005': '主门',
  'mesh0007': '体育馆',
  'mesh0008': '绿植',
  'mesh0009': '绿植',
  'mesh0010': '图书馆',
  'mesh0011': '学生公寓',
  'mesh0012': '绿植',
  'mesh0013': '实验楼',
  'mesh0014': '篮球场',
  'mesh0015': '绿化带',
  'mesh0016': '绿植',
  'mesh0017': '社团中心',
  'mesh0018': '学生公寓',
  'mesh0019': '留学服务中心',
  'mesh0020': '操场',
  'mesh0021': '绿化带',
  'mesh0022': '绿化带',
  'mesh0023': '绿化带',
  'mesh0024': '绿化带',
  'mesh0025': '绿化带',
  'mesh0026': '绿化带',
  'mesh0027': '绿化带',
  'mesh0028': '绿化带',
  'mesh0029': '绿化带',
  'mesh0030': '绿化带',
  'mesh0031': '绿化带',
  'mesh0032': '绿化带',
  'mesh0033': '绿植',
  'mesh0034': '绿植',
  'mesh0035': '绿植',
  'mesh0037': '绿化带',
  'mesh0038': '学生公寓',
  'mesh0039': '学生公寓',
  'mesh0040': '绿化带',
  'mesh0041': '绿化带',
  'mesh0042': '绿化带',
  'mesh0': '绿化带',

  // node 系列
  'node_0': '观景台',
  'node0001': '花坛',
  'node0002': '道路',
  'node0003': '副门',
  'node0004': '花坛',
  'node0005': '花坛',
  'node0006': '绿植',
  'node0007': '绿化带',
  'node0009': '绿化带',
  'node0010': '绿植',
  'node0011': '绿化带',
  'node_0.001': '花坛',
  'node_0.003': '副门',
  'node_0.004': '花坛',
  'node_0.005': '花坛',
  'node_0.006': '小绿植',
  'node_0.007': '平台',
  'node_0.009': '小绿植',
  'node_0.010': '小绿植',
};

function lookup(name) {
  const clean = name.trim().replace(/\s/g, '');
  if (nameToLabel[clean]) return nameToLabel[clean];

  const simple = clean
    .replace(/^mesh_?/i, 'mesh')
    .replace(/^node_?/i, 'node')
    .replace(/\./g, '')
    .toLowerCase();
  
  for (const key in nameToLabel) {
    if (key.toLowerCase() === simple) {
      return nameToLabel[key];
    }
  }
  return null;
}

// ===================== 图层分类 =====================
const categoryInfo = {
  // 建筑层
  '教学楼': { layer: 'building', desc: '学生日常上课学习的主要教学场所' },
  '艺术大楼': { layer: 'building', desc: '艺术教育、创作与展示的专业大楼' },
  '行政大楼': { layer: 'building', desc: '学校行政管理与办公核心区域' },
  '主门': { layer: 'building', desc: '校园正门，主要出入口' },
  '副门': { layer: 'building', desc: '校园侧门，辅助通行出入口' },
  '体育馆': { layer: 'building', desc: '综合性室内体育活动场馆' },
  '图书馆': { layer: 'building', desc: '藏书、自习、学术阅览中心' },
  '学生公寓': { layer: 'building', desc: '学生住宿生活区域' },
  '实验楼': { layer: 'building', desc: '教学科研实验专用场所' },
  '篮球场': { layer: 'building', desc: '标准篮球运动场地' },
  '社团中心': { layer: 'building', desc: '学生社团活动与交流中心' },
  '留学服务中心': { layer: 'building', desc: '留学生服务与国际交流办公区' },
  '操场': { layer: 'building', desc: '标准田径运动场，含跑道与足球场地' },

  // 道路层
  '道路': { layer: 'road', desc: '校园通行道路，连接各个区域' },

  // 植被层
  '观景台': { layer: 'vegetation', desc: '校园观景平台，可俯瞰全景' },
  '平台': { layer: 'vegetation', desc: '休闲观景、交流平台' },
  '中心花坛': { layer: 'vegetation', desc: '校园中心景观花坛' },
  '绿植': { layer: 'vegetation', desc: '校园绿化植物' },
  '绿化带': { layer: 'vegetation', desc: '道路与建筑周边绿化隔离带' },
  '花坛': { layer: 'vegetation', desc: '花卉种植景观区' },
  '小绿植': { layer: 'vegetation', desc: '小型景观绿植' },
};

let selectedObject = null;
let autoRotate = false;
let glbModel = null;

let ambientLight, dirLight, hemiLight;

const viewPositions = {
    perspective: { pos: new THREE.Vector3(50, 40, 50), target: new THREE.Vector3(0, 0, 0) },
    top: { pos: new THREE.Vector3(0, 100, 0), target: new THREE.Vector3(0, 0, 0) },
    side: { pos: new THREE.Vector3(80, 15, 0), target: new THREE.Vector3(0, 5, 0) }
};

const layerStates = { building: true, road: true, vegetation: true };

// ===================== 图层显示隐藏（正确逻辑：按钮蓝=显示） =====================
function setLayerVisibility(type, visible) {
    layerStates[type] = visible;
    if (type === 'building') {
        modelLayers.buildings.forEach(obj => obj.visible = visible);
    } else if (type === 'road') {
        modelLayers.roads.forEach(obj => obj.visible = visible);
    } else if (type === 'vegetation') {
        modelLayers.vegetation.forEach(obj => obj.visible = visible);
    }
}

const keys = { w: false, a: false, s: false, d: false };
const moveSpeed = 5;

let musicEnabled = true;
let bgmQt, bgmYt, bgmDy;

const bgmMap = { sunny: null, rainy: null, cloudy: null };
let hdrTextures = { sunny: null, rainy: null, cloudy: null };
let currentWeather = 'sunny';

let rainSystem = null;
let rainGeometry, rainMaterial;

const weatherFiles = {
    sunny: 'qingtian.hdr',
    rainy: 'yutian.hdr',
    cloudy: 'duoyun.hdr'
};

function createRain() {
    const rainCount = 25000;
    rainGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(rainCount * 6);
    const velocities = new Float32Array(rainCount);

    for (let i = 0; i < rainCount; i++) {
        const x = (Math.random() - 0.5) * 400;
        const y = Math.random() * 200;
        const z = (Math.random() - 0.5) * 400;
        positions[i * 6] = x;
        positions[i * 6 + 1] = y;
        positions[i * 6 + 2] = z;
        positions[i * 6 + 3] = x;
        positions[i * 6 + 4] = y - 2.5;
        positions[i * 6 + 5] = z;
        velocities[i] = 3 + Math.random() * 4;
    }
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    rainGeometry.userData.velocities = velocities;
    rainMaterial = new THREE.LineBasicMaterial({ color: 0xaabbdd, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending });
    rainSystem = new THREE.LineSegments(rainGeometry, rainMaterial);
    rainSystem.visible = false;
    scene.add(rainSystem);
}

function updateRain() {
    if (!rainSystem || !rainSystem.visible) return;
    const positions = rainGeometry.attributes.position.array;
    const velocities = rainGeometry.userData.velocities;
    for (let i = 0; i < velocities.length; i++) {
        positions[i * 6 + 1] -= velocities[i];
        positions[i * 6 + 4] -= velocities[i];
        if (positions[i * 6 + 1] < 0) {
            const x = (Math.random() - 0.5) * 400;
            const z = (Math.random() - 0.5) * 400;
            positions[i * 6 + 1] = 200;
            positions[i * 6 + 4] = 197.5;
            positions[i * 6] = x;
            positions[i * 6 + 2] = z;
            positions[i * 6 + 3] = x;
            positions[i * 6 + 5] = z;
        }
    }
    rainGeometry.attributes.position.needsUpdate = true;
}

function loadAllSkyboxes() {
    const promises = Object.entries(weatherFiles).map(([key, file]) => {
        return new Promise((resolve) => {
            new RGBELoader().load(file, (texture) => {
                texture.mapping = THREE.EquirectangularReflectionMapping;
                hdrTextures[key] = texture;
                resolve();
            }, undefined, () => resolve());
        });
    });
    return Promise.allSettled(promises);
}

const weatherConfig = {
    sunny: { ambientIntensity: 0.7, dirIntensity: 1.2, dirColor: 0xfff5e6, hemiIntensity: 0.4, fogColor: 0x87ceeb, fogNear: 100, fogFar: 500, rainVisible: false },
    rainy: { ambientIntensity: 0.25, dirIntensity: 0.25, dirColor: 0x667788, hemiIntensity: 0.08, fogColor: 0x2a2a3a, fogNear: 15, fogFar: 120, rainVisible: true },
    cloudy: { ambientIntensity: 0.5, dirIntensity: 0.6, dirColor: 0xddeeff, hemiIntensity: 0.25, fogColor: 0x9a9aaa, fogNear: 80, fogFar: 350, rainVisible: false }
};

function switchBGM(weather) {
    Object.values(bgmMap).forEach(bgm => { if (bgm) { bgm.pause(); bgm.currentTime = 0; } });
    const target = bgmMap[weather];
    if (target && musicEnabled) target.play().catch(() => {});
}

function toggleMusic() {
    musicEnabled = !musicEnabled;
    const btn = document.getElementById('musicToggleBtn');
    if (musicEnabled) { btn.textContent = '🔊 开启'; if (bgmMap[currentWeather]) bgmMap[currentWeather].play().catch(() => {}); }
    else { btn.textContent = '🔇 关闭'; Object.values(bgmMap).forEach(bgm => { if (bgm) bgm.pause(); }); }
}

function setWeather(weather) {
    currentWeather = weather;
    const c = weatherConfig[weather];
    ambientLight.intensity = c.ambientIntensity;
    dirLight.intensity = c.dirIntensity;
    dirLight.color.setHex(c.dirColor);
    hemiLight.intensity = c.hemiIntensity;
    scene.fog.color.setHex(c.fogColor);
    scene.fog.near = c.fogNear;
    scene.fog.far = c.fogFar;
    if (hdrTextures[weather]) { scene.background = hdrTextures[weather]; scene.environment = hdrTextures[weather]; }
    if (rainSystem) rainSystem.visible = c.rainVisible;
    switchBGM(weather);
    document.querySelectorAll('[data-weather]').forEach(b => b.classList.remove('active'));
    const active = document.getElementById(`${weather}Btn`);
    if (active) active.classList.add('active');
}

function setupLighting() {
    ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(50, 80, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 500;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    scene.add(dirLight);
    hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x3a7d44, 0.3);
    scene.add(hemiLight);
}

function classifyObject(child) {
    const name = child.name || '';
    const label = lookup(name);
    if (label && categoryInfo[label]) {
        const cfg = categoryInfo[label];
        child.userData = { label, layer: cfg.layer, desc: cfg.desc };
        return cfg.layer;
    }

    const lower = name.toLowerCase();
    if (lower.includes('道路') || lower.includes('road') || label === '道路') {
        child.userData = { label: label || '道路', layer: 'road', desc: '校园道路' };
        return 'road';
    }
    if (lower.includes('绿植') || lower.includes('花坛') || lower.includes('绿化') || lower.includes('tree') || lower.includes('plant')) {
        child.userData = { label: label || '植被', layer: 'vegetation', desc: '绿化景观' };
        return 'vegetation';
    }
    child.userData = { label: label || '建筑', layer: 'building', desc: '校园建筑' };
    return 'building';
}

function loadGLBModel() {
    return new Promise((resolve, reject) => {
        new GLTFLoader().load('school.glb', (gltf) => {
            glbModel = gltf.scene;
            glbModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    const layer = classifyObject(child);
                    if (layer === 'building') modelLayers.buildings.push(child);
                    else if (layer === 'road') modelLayers.roads.push(child);
                    else if (layer === 'vegetation') modelLayers.vegetation.push(child);
                    interactiveObjects.push(child);
                    const info = { name: child.userData.label, type: layer, desc: child.userData.desc };
                    buildingInfoMap.set(child.uuid, info);
                }
            });
            glbModel.scale.setScalar(0.9);
            scene.add(glbModel);
            const box = new THREE.Box3().setFromObject(glbModel);
            const center = box.getCenter(new THREE.Vector3());
            glbModel.position.set(-center.x, -box.min.y, -center.z);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
                viewPositions.perspective.pos.set(maxDim * 0.27, maxDim * 0.2, maxDim * 0.27);
                viewPositions.perspective.target.set(0, size.y * 0.3, 0);
                viewPositions.top.pos.set(0, maxDim * 0.4, 0);
                viewPositions.top.target.set(0, 0, 0);
                viewPositions.side.pos.set(maxDim * 0.4, maxDim * 0.07, 0);
                viewPositions.side.target.set(0, size.y * 0.3, 0);
            }
            camera.position.copy(viewPositions.perspective.pos);
            orbitControls.target.copy(viewPositions.perspective.target);
            orbitControls.update();
            resolve(glbModel);
        }, undefined, reject);
    });
}

function animateCamera(targetPos, targetLookAt, duration = 1500) {
    const startPos = camera.position.clone();
    const startTarget = orbitControls.target.clone();
    const startTime = Date.now();
    function update() {
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        camera.position.lerpVectors(startPos, targetPos, ease);
        orbitControls.target.lerpVectors(startTarget, targetLookAt, ease);
        orbitControls.update();
        if (t < 1) requestAnimationFrame(update);
    }
    update();
}

function switchView(viewName) {
    const view = viewPositions[viewName];
    if (!view) return;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(viewName === 'perspective' ? 'perspectiveBtn' : viewName === 'top' ? 'topViewBtn' : 'sideViewBtn').classList.add('active');
    animateCamera(view.pos, view.target);
}

function showInfoPanel(name, desc, type) {
    document.getElementById('infoTitle').textContent = `${name} (${type === 'building' ? '建筑' : type === 'road' ? '道路' : '植被'})`;
    document.getElementById('infoDesc').textContent = desc;
    document.getElementById('infoPanel').classList.remove('hidden');
}

function hideInfoPanel() {
    document.getElementById('infoPanel').classList.add('hidden');
}

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactiveObjects, false);
    if (intersects.length > 0) {
        const obj = intersects[0].object;
        const info = buildingInfoMap.get(obj.uuid);
        if (info) {
            showInfoPanel(info.name, info.desc, info.type);
            if (selectedObject && selectedObject.material) selectedObject.material.emissive?.setHex(0x000000);
            if (obj.material && obj.material.emissive) obj.material.emissive.setHex(0x222222);
            selectedObject = obj;
        }
    } else {
        if (selectedObject && selectedObject.material) selectedObject.material.emissive?.setHex(0x000000);
        selectedObject = null;
        hideInfoPanel();
    }
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function resetScene() {
    animateCamera(viewPositions.perspective.pos, viewPositions.perspective.target);
    hideInfoPanel();
    autoRotate = false;
    orbitControls.autoRotate = false;
    document.querySelectorAll('.view-btn,.layer-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('perspectiveBtn').classList.add('active');

    // 重置全部打开，全部变蓝
    document.querySelectorAll('.layer-btn').forEach(btn => {
        btn.classList.add('active');
    });
    setLayerVisibility('building', true);
    setLayerVisibility('road', true);
    setLayerVisibility('vegetation', true);
    
    setWeather('sunny');
}

function toggleAutoRotate() {
    autoRotate = !autoRotate;
    orbitControls.autoRotate = autoRotate;
    orbitControls.autoRotateSpeed = 2.0;
    document.getElementById('autoRotateBtn').textContent = autoRotate ? '停止旋转' : '自动旋转';
}

function handleKeyboardMovement(delta) {
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();
    const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0,1,0)).normalize();
    const move = new THREE.Vector3();
    let moving = false;
    if (keys.w) { move.add(direction.clone().multiplyScalar(moveSpeed * delta)); moving = true; }
    if (keys.s) { move.add(direction.clone().multiplyScalar(-moveSpeed * delta)); moving = true; }
    if (keys.a) { move.add(right.clone().multiplyScalar(-moveSpeed * delta)); moving = true; }
    if (keys.d) { move.add(right.clone().multiplyScalar(moveSpeed * delta)); moving = true; }
    if (moving) { camera.position.add(move); orbitControls.target.add(move); }
}

function onKeyDown(e) { switch(e.code){ case 'KeyW':keys.w=true;break;case 'KeyA':keys.a=true;break;case 'KeyS':keys.s=true;break;case 'KeyD':keys.d=true;break; } }
function onKeyUp(e) { switch(e.code){ case 'KeyW':keys.w=false;break;case 'KeyA':keys.a=false;break;case 'KeyS':keys.s=false;break;case 'KeyD':keys.d=false;break; } }

// ===================== 按钮事件：正确逻辑：蓝=显示，灰=隐藏 =====================
function setupEventListeners() {
    document.getElementById('perspectiveBtn').onclick = () => switchView('perspective');
    document.getElementById('topViewBtn').onclick = () => switchView('top');
    document.getElementById('sideViewBtn').onclick = () => switchView('side');
    document.getElementById('sunnyBtn').onclick = () => setWeather('sunny');
    document.getElementById('rainyBtn').onclick = () => setWeather('rainy');
    document.getElementById('cloudyBtn').onclick = () => setWeather('cloudy');
    document.getElementById('closeInfo').onclick = hideInfoPanel;
    document.getElementById('introBtn').onclick = () => document.getElementById('introModal').classList.remove('hidden');
    document.getElementById('closeIntro').onclick = () => document.getElementById('introModal').classList.add('hidden');
    document.getElementById('resetBtn').onclick = resetScene;
    document.getElementById('autoRotateBtn').onclick = toggleAutoRotate;
    document.getElementById('musicToggleBtn').onclick = toggleMusic;

    // ✅ 正确逻辑：按钮蓝 = 显示
    document.querySelectorAll('.layer-btn').forEach(btn => {
        btn.classList.add('active');
        btn.onclick = () => {
            const type = btn.dataset.layer;
            const isActive = btn.classList.toggle('active');
            setLayerVisibility(type, isActive);
        };
    });

    renderer.domElement.addEventListener('click', onClick);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
}

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);
    handleKeyboardMovement(delta);
    updateRain();
    orbitControls.update();
    renderer.render(scene, camera);
}

async function init() {
    setupLighting();
    setupEventListeners();
    createRain();
    bgmQt = document.getElementById('bgmQt');
    bgmYt = document.getElementById('bgmYt');
    bgmDy = document.getElementById('bgmDy');
    bgmMap.sunny = bgmQt; bgmMap.rainy = bgmYt; bgmMap.cloudy = bgmDy;
    await loadAllSkyboxes();
    setWeather('sunny');
    try { await loadGLBModel(); }
    catch (e) { console.error(e); alert('模型加载失败，请使用服务器运行'); }
    document.getElementById('loading').classList.add('hidden');
    animate();
}

init();