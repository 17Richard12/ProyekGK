// main.js - Versi Bersih dan Terstruktur

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import TWEEN from '@tweenjs/tween.js';

// =================================================================
// BAGIAN 1: INISIALISASI DASAR (SCENE, CAMERA, RENDERER)
// =================================================================

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

const container = document.getElementById('container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const loader = new GLTFLoader();

// =================================================================
// BAGIAN 2: VARIABEL GLOBAL & STATE
// =================================================================

// Fisika & Player
const GRAVITY = 30;
const STEPS_PER_FRAME = 2;
const worldOctree = new Octree();
const playerCollider = new Capsule(new THREE.Vector3(-9, 0.8, 5), new THREE.Vector3(-9, 1.2, 5), 0.8);
const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();
let playerOnFloor = false;
const keyStates = {};

// Tycoon & Uang
let playerMoney = 0;
let uncollectedMoney = 0;
const uncollectedMoneyDisplay = document.getElementById('uncollectedMoneyDisplay');
const collectedMoneyDisplay = document.getElementById('collectedMoneyDisplay');
const leverMessage = document.getElementById('leverMessage');

// Interaksi & Aset
let knife;
let lever;
let isLeverHighlighted = false;
let mouseTime = 0;
let isSpinning = false;
const spinDuration = 500;

// =================================================================
// BAGIAN 3: PEMUATAN ASET (MODEL 3D, TEKSTUR)
// =================================================================

// --- Senjata Pemain ---
loader.load('/Knife/karambit.glb', (gltf) => {
    knife = gltf.scene;
    knife.scale.set(0.1, 0.1, 0.1);
    knife.position.set(0.5, -0.5, -1);
    knife.rotation.set(4.5, Math.PI, -21);
    knife.userData.initialPosition = knife.position.clone();
    knife.userData.initialRotation = knife.rotation.clone();
    knife.traverse((node) => {
        if (node.isMesh) {
            node.renderOrder = 9999;
            node.material.depthTest = false;
        }
    });
    camera.add(knife);
    scene.add(camera);
}, undefined, (error) => console.error('Error loading knife:', error));

// --- Meja & Tuas ---
loader.load('/Lever/table.glb', function (gltf) {
    const table = gltf.scene;
    table.scale.set(0.02, 0.02, 0.02);
    table.rotation.set(0, Math.PI / 2, 0);
    table.position.set(15, -0.845, -5);
    scene.add(table);
    worldOctree.fromGraphNode(table);
});

loader.load('/Lever/lever.glb', function (gltf) {
    lever = gltf.scene;
    lever.scale.set(1, 1, 1);
    lever.rotation.set(0, Math.PI / 2, 0);
    lever.position.set(15, 0.7, -5);
    scene.add(lever);
});

// --- Dinding Pembatas ---
function loadWall(position, rotationY = 0) {
    loader.load('/Wall/longwall.glb', function (gltf) {
        const wall = gltf.scene;
        wall.scale.set(2, 2, 2);
        wall.rotation.y = rotationY;
        wall.position.copy(position);
        scene.add(wall);
        worldOctree.fromGraphNode(wall);
    });
}
// Posisi-posisi dinding
const wallPositions = [
    { pos: new THREE.Vector3(-10, 0, -24.7) }, { pos: new THREE.Vector3(-10, 3.5, -24.7) },
    { pos: new THREE.Vector3(-24.5, 0, -6), rot: Math.PI / 2 }, { pos: new THREE.Vector3(-24.5, 3.5, -6), rot: Math.PI / 2 },
    { pos: new THREE.Vector3(-24.3, 0, 6.3), rot: Math.PI / 2 }, { pos: new THREE.Vector3(-24.3, 3.5, 6.3), rot: Math.PI / 2 },
    { pos: new THREE.Vector3(-10, 0, 25) }, { pos: new THREE.Vector3(-10, 3.5, 25) },
    { pos: new THREE.Vector3(24.5, 0, -6), rot: Math.PI / 2 }, { pos: new THREE.Vector3(24.5, 3.5, -6), rot: Math.PI / 2 },
    { pos: new THREE.Vector3(24.7, 0, 6.3), rot: Math.PI / 2 }, { pos: new THREE.Vector3(24.7, 3.5, 6.3), rot: Math.PI / 2 },
    { pos: new THREE.Vector3(8, 0, -24.7) }, { pos: new THREE.Vector3(8, 3.5, -24.7) },
    { pos: new THREE.Vector3(8, 0, 25) }, { pos: new THREE.Vector3(8, 3.5, 25) }
];
wallPositions.forEach(w => loadWall(w.pos, w.rot));

// --- Lantai & Latar Belakang ---
const floorGeometry = new THREE.PlaneGeometry(50, 50);
const floorTexture = new THREE.TextureLoader().load('/Floor/tile.jpg', (texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(5, 5);
});
const floorMaterial = new THREE.MeshPhongMaterial({ map: floorTexture });
const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.receiveShadow = true;
scene.add(floorMesh);
worldOctree.fromGraphNode(floorMesh);

const backgroundTexture = new THREE.TextureLoader().load('/Background/ascentmap.jpg', (texture) => {
    texture.encoding = THREE.sRGBEncoding;
});
scene.background = backgroundTexture;

// --- Pencahayaan ---
scene.add(new THREE.AmbientLight(0x404040, 1.5));
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7.5);
directionalLight.castShadow = true;
scene.add(directionalLight);

// =================================================================
// BAGIAN 4: FUNGSI-FUNGSI UTAMA (LOGIKA GAME)
// =================================================================

// --- Fungsi untuk Player ---
function updatePlayer(deltaTime) {
    let damping = Math.exp(-4 * deltaTime) - 1;
    if (!playerOnFloor) {
        playerVelocity.y -= GRAVITY * deltaTime;
        damping *= 0.1;
    }
    playerVelocity.addScaledVector(playerVelocity, damping);
    const deltaPosition = playerVelocity.clone().multiplyScalar(deltaTime);
    playerCollider.translate(deltaPosition);
    playerCollisions();
    camera.position.copy(playerCollider.end);
    camera.position.y += 0.6;
}

function playerCollisions() {
    const result = worldOctree.capsuleIntersect(playerCollider);
    playerOnFloor = false;
    if (result) {
        playerOnFloor = result.normal.y > 0;
        if (!playerOnFloor) {
            playerVelocity.addScaledVector(result.normal, -result.normal.dot(playerVelocity));
        }
        playerCollider.translate(result.normal.multiplyScalar(result.depth));
    }
}

function getForwardVector() {
    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();
    return playerDirection;
}

function getSideVector() {
    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();
    playerDirection.cross(camera.up);
    return playerDirection;
}

function controls(deltaTime) {
    const speedDelta = deltaTime * (playerOnFloor ? 25 : 8);
    if (keyStates['KeyW']) playerVelocity.add(getForwardVector().multiplyScalar(speedDelta));
    if (keyStates['KeyS']) playerVelocity.add(getForwardVector().multiplyScalar(-speedDelta));
    if (keyStates['KeyA']) playerVelocity.add(getSideVector().multiplyScalar(-speedDelta));
    if (keyStates['KeyD']) playerVelocity.add(getSideVector().multiplyScalar(speedDelta));
    if (playerOnFloor && keyStates['Space']) playerVelocity.y = 10;
}

function teleportPlayerIfOob() {
    if (camera.position.y <= -25) {
        playerCollider.start.set(-9, 0.8, 5);
        playerCollider.end.set(-9, 1.2, 5);
        playerCollider.radius = 0.8;
        camera.position.copy(playerCollider.end);
        camera.rotation.set(0, 0, 0);
    }
}

// --- Fungsi untuk Tycoon & Uang ---
function updateCollectedMoneyDisplay() {
    if (collectedMoneyDisplay) collectedMoneyDisplay.innerText = `💵 ${playerMoney}`;
}

function updateUncollectedMoneyDisplay() {
    if (uncollectedMoneyDisplay) uncollectedMoneyDisplay.innerText = `💰 ${uncollectedMoney}`;
}

function generateMoney() {
    uncollectedMoney += 10;
    updateUncollectedMoneyDisplay();
}

function collectMoney() {
    if (uncollectedMoney > 0) {
        playerMoney += uncollectedMoney;
        uncollectedMoney = 0;
        updateCollectedMoneyDisplay();
        updateUncollectedMoneyDisplay();
    }
}

// --- Fungsi untuk Interaksi ---
function checkLeverProximity() {
    if (!lever) return;
    const leverPosition = new THREE.Vector3();
    lever.getWorldPosition(leverPosition);
    const playerPosition = new THREE.Vector3();
    playerCollider.getCenter(playerPosition);
    const distance = leverPosition.distanceTo(playerPosition);

    if (distance < 3) {
        if (!isLeverHighlighted) {
            highlightLever(true);
            leverMessage.style.display = 'block';
            isLeverHighlighted = true;
        }
    } else {
        if (isLeverHighlighted) {
            highlightLever(false);
            leverMessage.style.display = 'none';
            isLeverHighlighted = false;
        }
    }
}

function highlightLever(highlight) {
    if (!lever) return;
    lever.traverse((node) => {
        if (node.isMesh) {
            node.material.emissive = new THREE.Color(highlight ? 0x00ff00 : 0x000000);
            node.material.emissiveIntensity = highlight ? 0.5 : 0;
        }
    });
}

function startSpin() {
    if (!isSpinning) {
        isSpinning = true;
        spinStartTime = performance.now();
    }
}

function handleSpin() {
    if (isSpinning) {
        const elapsedTime = performance.now() - spinStartTime;
        if (elapsedTime < spinDuration) {
            const spinAngle = (elapsedTime / spinDuration) * Math.PI * 2;
            const twistAngle = Math.sin((elapsedTime / spinDuration) * Math.PI * 4) * 0.2;
            knife.rotation.y = spinAngle;
            knife.rotation.z = twistAngle;
        } else {
            isSpinning = false;
            knife.rotation.copy(knife.userData.initialRotation);
        }
    }
}

// =================================================================
// BAGIAN 5: EVENT LISTENERS
// =================================================================

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onWindowResize);

document.addEventListener('keydown', (event) => {
    keyStates[event.code] = true;
    if (event.code === 'KeyF' && isLeverHighlighted) {
        collectMoney();
    }
});

document.addEventListener('keyup', (event) => {
    keyStates[event.code] = false;
});

container.addEventListener('click', () => {
    document.body.requestPointerLock();
});

function onDocumentMouseDown(event) {
    if (event.button === 0) startSpin();
}

document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === document.body) {
        document.addEventListener('mousedown', onDocumentMouseDown);
    } else {
        document.removeEventListener('mousedown', onDocumentMouseDown);
    }
});

document.body.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === document.body) {
        camera.rotation.y -= event.movementX / 1000;
        camera.rotation.x -= event.movementY / 1000;
    }
});


// =================================================================
// BAGIAN 6: LOOP ANIMASI UTAMA & INISIALISASI AKHIR
// =================================================================

function animate() {
    requestAnimationFrame(animate);
    const deltaTime = Math.min(0.05, clock.getDelta()) / STEPS_PER_FRAME;

    for (let i = 0; i < STEPS_PER_FRAME; i++) {
        controls(deltaTime);
        updatePlayer(deltaTime);
        teleportPlayerIfOob();
    }
    
    handleSpin();
    checkLeverProximity();
    
    TWEEN.update();
    renderer.render(scene, camera);
}

// Inisialisasi Tampilan Uang & Generator
updateCollectedMoneyDisplay();
updateUncollectedMoneyDisplay();
setInterval(generateMoney, 1000);

// Mulai Loop Animasi
animate();