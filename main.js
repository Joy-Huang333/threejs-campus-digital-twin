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

let selectedObject = null;
let autoRotate = false;
let glbModel = null;

let ambientLight, dirLight, hemiLight;

const viewPositions = {
    perspective: { pos: new THREE.Vector3(50, 40, 50), target: new THREE.Vector3(0, 0, 0) },
    top: { pos: new THREE.Vector3(0, 100, 0), target: new THREE.Vector3(0, 0, 0) },
    side: { pos: new THREE.Vector3(80, 15, 0), target: new THREE.Vector3(0, 5, 0) }
};

const keys = { w: false, a: false, s: false, d: false };
const moveSpeed = 5;

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

    rainMaterial = new THREE.LineBasicMaterial({
        color: 0xaabbdd,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending
    });

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
            const loader = new RGBELoader();
            loader.load(file, (texture) => {
                texture.mapping = THREE.EquirectangularReflectionMapping;
                hdrTextures[key] = texture;
                console.log(`${file} 加载成功`);
                resolve();
            }, undefined, (error) => {
                console.warn(`${file} 加载失败:`, error);
                resolve();
            });
        });
    });
    return Promise.allSettled(promises);
}

const weatherConfig = {
    sunny: {
        ambientIntensity: 0.7,
        dirIntensity: 1.2,
        dirColor: 0xfff5e6,
        hemiIntensity: 0.4,
        fogColor: 0x87ceeb,
        fogNear: 100,
        fogFar: 500,
        rainVisible: false
    },
    rainy: {
        ambientIntensity: 0.25,
        dirIntensity: 0.25,
        dirColor: 0x667788,
        hemiIntensity: 0.08,
        fogColor: 0x2a2a3a,
        fogNear: 15,
        fogFar: 120,
        rainVisible: true
    },
    cloudy: {
        ambientIntensity: 0.5,
        dirIntensity: 0.6,
        dirColor: 0xddeeff,
        hemiIntensity: 0.25,
        fogColor: 0x9a9aaa,
        fogNear: 80,
        fogFar: 350,
        rainVisible: false
    }
};

function setWeather(weather) {
    currentWeather = weather;
    const config = weatherConfig[weather];

    ambientLight.intensity = config.ambientIntensity;
    dirLight.intensity = config.dirIntensity;
    dirLight.color.setHex(config.dirColor);
    hemiLight.intensity = config.hemiIntensity;

    scene.fog.color.setHex(config.fogColor);
    scene.fog.near = config.fogNear;
    scene.fog.far = config.fogFar;

    if (hdrTextures[weather]) {
        scene.background = hdrTextures[weather];
        scene.environment = hdrTextures[weather];
    }

    if (rainSystem) {
        rainSystem.visible = config.rainVisible;
    }

    document.querySelectorAll('[data-weather]').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`${weather}Btn`);
    if (activeBtn) activeBtn.classList.add('active');
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
    const name = (child.name || '').toLowerCase();

    if (name.includes('building') || name.includes('建筑') || name.includes('楼') || name.includes('馆')) {
        return 'building';
    }
    if (name.includes('road') || name.includes('道路') || name.includes('路') || name.includes('street')) {
        return 'road';
    }
    if (name.includes('tree') || name.includes('树') || name.includes('plant') || name.includes('植被') || name.includes('grass') || name.includes('草')) {
        return 'vegetation';
    }

    if (child.isMesh && child.geometry) {
        const box = new THREE.Box3().setFromObject(child);
        const height = box.max.y - box.min.y;
        if (height > 5) return 'building';
        if (height < 1) return 'road';
        return 'vegetation';
    }

    return 'building';
}

function loadGLBModel() {
    return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        loader.load('school.glb', (gltf) => {
            glbModel = gltf.scene;

            glbModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    const type = classifyObject(child);

                    if (type === 'building') {
                        modelLayers.buildings.push(child);
                    } else if (type === 'road') {
                        modelLayers.roads.push(child);
                    } else {
                        modelLayers.vegetation.push(child);
                    }

                    interactiveObjects.push(child);

                    const defaultInfo = {
                        building: { name: '校园建筑', desc: '这是校园内的一座建筑，承载着教学、科研、办公等重要功能。' },
                        road: { name: '校园道路', desc: '校园内的道路系统，连接各个功能区域，方便师生通行。' },
                        vegetation: { name: '绿化植被', desc: '校园绿化景观，美化环境，净化空气，为师生提供舒适的校园环境。' }
                    };

                    const info = child.name ? { name: child.name, desc: defaultInfo[type].desc } : defaultInfo[type];
                    buildingInfoMap.set(child.uuid, info);
                    child.userData = { type, ...info };
                }
            });

            scene.add(glbModel);

            const box = new THREE.Box3().setFromObject(glbModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            console.log('GLB模型加载成功');
            console.log('模型原始尺寸:', size);

            glbModel.scale.setScalar(3);

            const scaledBox = new THREE.Box3().setFromObject(glbModel);
            const scaledSize = scaledBox.getSize(new THREE.Vector3());

            glbModel.position.set(-center.x, -box.min.y, -center.z);

            console.log('模型放大后尺寸:', scaledSize);
            console.log('建筑:', modelLayers.buildings.length, '道路:', modelLayers.roads.length, '植被:', modelLayers.vegetation.length);

            const maxDim = Math.max(scaledSize.x, scaledSize.y, scaledSize.z);
            if (maxDim > 0) {
                viewPositions.perspective.pos.set(maxDim * 0.27, maxDim * 0.2, maxDim * 0.27);
                viewPositions.perspective.target.set(0, scaledSize.y * 0.3, 0);
                viewPositions.top.pos.set(0, maxDim * 0.4, 0);
                viewPositions.top.target.set(0, 0, 0);
                viewPositions.side.pos.set(maxDim * 0.4, maxDim * 0.07, 0);
                viewPositions.side.target.set(0, scaledSize.y * 0.3, 0);
            }

            camera.position.copy(viewPositions.perspective.pos);
            orbitControls.target.copy(viewPositions.perspective.target);
            orbitControls.update();

            resolve(glbModel);
        }, undefined, (error) => {
            console.error('GLB模型加载失败:', error);
            reject(error);
        });
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

        if (t < 1) {
            requestAnimationFrame(update);
        }
    }
    update();
}

function switchView(viewName) {
    const view = viewPositions[viewName];
    if (!view) return;

    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(viewName === 'perspective' ? 'perspectiveBtn' : viewName === 'top' ? 'topViewBtn' : 'sideViewBtn').classList.add('active');

    animateCamera(view.pos, view.target);
}

function showInfoPanel(name, desc) {
    document.getElementById('infoTitle').textContent = name;
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
            showInfoPanel(info.name, info.desc);

            if (selectedObject && selectedObject.material) {
                selectedObject.material.emissive?.setHex(0x000000);
            }

            if (obj.material && obj.material.emissive) {
                obj.material.emissive.setHex(0x333333);
            }
            selectedObject = obj;
        }
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
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('perspectiveBtn').classList.add('active');
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

    const right = new THREE.Vector3();
    right.crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();

    const moveVector = new THREE.Vector3();
    let isMoving = false;

    if (keys.w) {
        moveVector.add(direction.clone().multiplyScalar(moveSpeed * delta));
        isMoving = true;
    }
    if (keys.s) {
        moveVector.add(direction.clone().multiplyScalar(-moveSpeed * delta));
        isMoving = true;
    }
    if (keys.a) {
        moveVector.add(right.clone().multiplyScalar(-moveSpeed * delta));
        isMoving = true;
    }
    if (keys.d) {
        moveVector.add(right.clone().multiplyScalar(moveSpeed * delta));
        isMoving = true;
    }

    if (isMoving) {
        camera.position.add(moveVector);
        orbitControls.target.add(moveVector);
    }
}

function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW': keys.w = true; break;
        case 'KeyA': keys.a = true; break;
        case 'KeyS': keys.s = true; break;
        case 'KeyD': keys.d = true; break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': keys.w = false; break;
        case 'KeyA': keys.a = false; break;
        case 'KeyS': keys.s = false; break;
        case 'KeyD': keys.d = false; break;
    }
}

function setupEventListeners() {
    document.getElementById('perspectiveBtn').addEventListener('click', () => switchView('perspective'));
    document.getElementById('topViewBtn').addEventListener('click', () => switchView('top'));
    document.getElementById('sideViewBtn').addEventListener('click', () => switchView('side'));

    document.getElementById('sunnyBtn').addEventListener('click', () => setWeather('sunny'));
    document.getElementById('rainyBtn').addEventListener('click', () => setWeather('rainy'));
    document.getElementById('cloudyBtn').addEventListener('click', () => setWeather('cloudy'));

    document.getElementById('closeInfo').addEventListener('click', hideInfoPanel);
    document.getElementById('introBtn').addEventListener('click', () => {
        document.getElementById('introModal').classList.remove('hidden');
    });
    document.getElementById('closeIntro').addEventListener('click', () => {
        document.getElementById('introModal').classList.add('hidden');
    });
    document.getElementById('introModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('introModal')) {
            document.getElementById('introModal').classList.add('hidden');
        }
    });
    document.getElementById('resetBtn').addEventListener('click', resetScene);
    document.getElementById('autoRotateBtn').addEventListener('click', toggleAutoRotate);
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

    await loadAllSkyboxes();
    setWeather('sunny');

    try {
        await loadGLBModel();
        console.log('数字孪生校园系统初始化完成');
    } catch (error) {
        console.error('场景初始化失败:', error);
        alert('模型加载失败，请确保使用本地服务器运行');
    }

    const loadingEl = document.getElementById('loading');
    loadingEl.classList.add('hidden');
    setTimeout(() => loadingEl.remove(), 500);

    animate();
}

init();
