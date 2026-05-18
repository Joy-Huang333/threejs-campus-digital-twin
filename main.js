import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 100, 500);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('container').appendChild(renderer.domElement);

let orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.05;
orbitControls.maxPolarAngle = Math.PI / 2.1;
orbitControls.minDistance = 2;
orbitControls.maxDistance = 150;

let pointerControls = null;
let isRoaming = false;

const lighting = setupLighting();
const modelLayers = { buildings: [], roads: [], vegetation: [] };
const interactiveObjects = [];
const buildingInfoMap = new Map();
let selectedObject = null;
let autoRotate = false;
let glbModel = null;

const viewPositions = {
    perspective: { pos: new THREE.Vector3(20, 15, 20), target: new THREE.Vector3(0, 5, 0) },
    top: { pos: new THREE.Vector3(0, 40, 0), target: new THREE.Vector3(0, 0, 0) },
    side: { pos: new THREE.Vector3(30, 8, 0), target: new THREE.Vector3(0, 5, 0) }
};

const keys = { w: false, a: false, s: false, d: false };
const moveSpeed = 15;

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(30, 50, 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 200;
    dirLight.shadow.camera.left = -80;
    dirLight.shadow.camera.right = 80;
    dirLight.shadow.camera.top = 80;
    dirLight.shadow.camera.bottom = -80;
    scene.add(dirLight);

    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x3a7d44, 0.4);
    scene.add(hemiLight);

    return { ambientLight, dirLight, hemiLight };
}

function classifyModelObject(child) {
    const name = child.name.toLowerCase();
    if (name.includes('building') || name.includes('建筑') || name.includes('楼') || name.includes('馆')) {
        return 'building';
    }
    if (name.includes('road') || name.includes('道路') || name.includes('路') || name.includes('street')) {
        return 'road';
    }
    if (name.includes('tree') || name.includes('树') || name.includes('plant') || name.includes('植被') || name.includes('grass') || name.includes('草')) {
        return 'vegetation';
    }

    if (child.position) {
        if (child.position.y > 2) return 'building';
        if (child.position.y < 0.5) return 'road';
    }

    if (child.geometry) {
        const box = new THREE.Box3().setFromObject(child);
        const height = box.max.y - box.min.y;
        if (height > 5) return 'building';
        if (height < 1) return 'road';
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

                    const type = classifyModelObject(child);

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

            const box = new THREE.Box3().setFromObject(glbModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            console.log('GLB模型尺寸:', size);
            console.log('GLB模型中心:', center);

            glbModel.position.set(-center.x, -box.min.y, -center.z);

            scene.add(glbModel);

            const maxDim = Math.max(size.x, size.y, size.z);
            viewPositions.perspective.pos.set(maxDim * 0.6, maxDim * 0.4, maxDim * 0.6);
            viewPositions.perspective.target.set(0, size.y * 0.4, 0);
            viewPositions.top.pos.set(0, maxDim * 1.0, 0);
            viewPositions.top.target.set(0, 0, 0);
            viewPositions.side.pos.set(maxDim * 1.0, maxDim * 0.2, 0);
            viewPositions.side.target.set(0, size.y * 0.4, 0);

            camera.position.copy(viewPositions.perspective.pos);
            orbitControls.target.copy(viewPositions.perspective.target);

            pointerControls = new PointerLockControls(camera, document.body);
            pointerControls.addEventListener('unlock', () => {
                isRoaming = false;
                orbitControls.enabled = true;
                document.getElementById('roamBtn').textContent = '第一人称漫游';
                document.getElementById('roamHint').classList.add('hidden');
            });

            console.log('GLB模型加载成功');
            console.log(`建筑: ${modelLayers.buildings.length} 个对象`);
            console.log(`道路: ${modelLayers.roads.length} 个对象`);
            console.log(`植被: ${modelLayers.vegetation.length} 个对象`);

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
    if (isRoaming) return;

    const view = viewPositions[viewName];
    if (!view) return;

    document.querySelectorAll('.view-controls button').forEach(btn => btn.classList.remove('active'));
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
    if (isRoaming) return;

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
    if (isRoaming) {
        pointerControls.unlock();
        isRoaming = false;
    }
    animateCamera(viewPositions.perspective.pos, viewPositions.perspective.target);
    hideInfoPanel();
    autoRotate = false;
    orbitControls.autoRotate = false;
    document.getElementById('autoRotateBtn').textContent = '自动旋转';
    document.querySelectorAll('.view-controls button').forEach(btn => btn.classList.remove('active'));
    document.getElementById('perspectiveBtn').classList.add('active');
}

function toggleAutoRotate() {
    autoRotate = !autoRotate;
    orbitControls.autoRotate = autoRotate;
    orbitControls.autoRotateSpeed = 2.0;
    document.getElementById('autoRotateBtn').textContent = autoRotate ? '停止旋转' : '自动旋转';
}

function toggleRoam() {
    if (isRoaming) {
        pointerControls.unlock();
    } else {
        pointerControls.lock();
        isRoaming = true;
        orbitControls.enabled = false;
        document.getElementById('roamBtn').textContent = '退出漫游';
        document.getElementById('roamHint').classList.remove('hidden');
        setTimeout(() => document.getElementById('roamHint').classList.add('hidden'), 3000);

        camera.position.y = 3;
    }
}

function handleRoamMovement(delta) {
    if (!isRoaming) return;

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();

    const moveVector = new THREE.Vector3();

    if (keys.w) moveVector.add(direction.clone().multiplyScalar(moveSpeed * delta));
    if (keys.s) moveVector.add(direction.clone().multiplyScalar(-moveSpeed * delta));
    if (keys.a) moveVector.add(right.clone().multiplyScalar(-moveSpeed * delta));
    if (keys.d) moveVector.add(right.clone().multiplyScalar(moveSpeed * delta));

    if (moveVector.length() > 0) {
        camera.position.add(moveVector);
        camera.position.y = 3;
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
    document.getElementById('roamBtn').addEventListener('click', toggleRoam);
    renderer.domElement.addEventListener('click', onClick);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
}

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (isRoaming) {
        handleRoamMovement(delta);
    } else {
        orbitControls.update();
    }

    renderer.render(scene, camera);
}

async function init() {
    setupEventListeners();

    try {
        await loadGLBModel();
        console.log('数字孪生校园系统初始化完成');
    } catch (error) {
        console.error('场景初始化失败:', error);
    }

    const loadingEl = document.getElementById('loading');
    loadingEl.classList.add('hidden');
    setTimeout(() => loadingEl.remove(), 500);

    animate();
}

init();
