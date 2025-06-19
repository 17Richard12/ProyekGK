// main.js - Versi Lebih Rapi dan Terstruktur

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import TWEEN from '@tweenjs/tween.js';

// =================================================================
// BAGIAN 1: INISIALISASI DASAR
// =================================================================

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

const container = document.getElementById('container');
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
});
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
let currentIncomeRate = 10;
const incomeRatesByLevel = [10, 25, 75, 200];
const uncollectedMoneyDisplay = document.getElementById('uncollectedMoneyDisplay');
const collectedMoneyDisplay = document.getElementById('collectedMoneyDisplay');
const incomeRateDisplay = document.getElementById('incomeRateDisplay');
const leverMessage = document.getElementById('leverMessage');

// Aset & Interaksi
let knife;
let mouseTime = 0;
let isSpinning = false;
const spinDuration = 500;

// Sistem Bangunan & Interaksi (Struktur Baru)
let buildingLevel = 0;
const buildingTierCosts = [100, 500, 1500];
const buildingTierModels = [
    '/Building/building1.glb',
    '/Building/building2.glb',
    '/Building/house_valo.glb'
];
let buildings = [];

// Objek interaktif akan dikelola di sini
let interactiveObjects = [];
let activeInteraction = null;
let animalMixers = [];

// =================================================================
// BAGIAN 3: PEMUATAN ASET
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

// Tuas Pengumpul Uang
loader.load('/Lever/lever.glb', function (gltf) {
    const collectLever = gltf.scene;
    collectLever.scale.set(1, 1, 1);
    collectLever.rotation.set(0, Math.PI / 2, 0);
    collectLever.position.set(15, 0.7, -3);
    scene.add(collectLever);
    // Tambahkan ke sistem interaksi
    interactiveObjects.push({
        model: collectLever,
        action: collectMoney,
        getDetails: () => ({
            canInteract: uncollectedMoney > 0,
            message: 'Tekan F untuk mengambil uang',
            highlightColor: '#00ff00'
        })
    });
});

// Tuas Pembangunan
loader.load('/Lever/lever.glb', function (gltf) {
    const buildLever = gltf.scene;
    buildLever.scale.set(1, 1, 1);
    buildLever.rotation.set(0, Math.PI / 2, 0);
    buildLever.position.set(15, 0.7, -7);
    scene.add(buildLever);
    // Tambahkan ke sistem interaksi
    interactiveObjects.push({
        model: buildLever,
        action: buildBuilding,
        getDetails: () => {
            if (buildingLevel >= buildingTierCosts.length) {
                return { canInteract: false, message: 'Level Maksimal', highlightColor: '#ffff00' };
            }
            const currentCost = buildingTierCosts[buildingLevel];
            const hasEnoughMoney = playerMoney >= currentCost;
            return {
                canInteract: hasEnoughMoney,
                message: hasEnoughMoney ? `Upgrade ke Lv. ${buildingLevel + 1} (Biaya: ${currentCost})` : `Uang tidak cukup (Butuh: ${currentCost})`,
                highlightColor: hasEnoughMoney ? '#00ff00' : '#ff0000'
            };
        }
    });
});

// Panggil fungsi baru untuk menempatkan semua kandang
loadAndPlaceInstances('/Building/jail_cage.glb', cagePositions, new THREE.Vector3(1.5, 1.5, 1.5));
// --- Data Kandang ---
const cagePositions = [
    new THREE.Vector3(5, 0, 15), new THREE.Vector3(10, 0, 15), new THREE.Vector3(15, 0, 15),
    new THREE.Vector3(5, 0, 10), new THREE.Vector3(10, 0, 10), new THREE.Vector3(15, 0, 10),
    new THREE.Vector3(5, 0, 5),  new THREE.Vector3(10, 0, 5),  new THREE.Vector3(15, 0, 5)
];

// --- Data Hewan ---
const animalData = [
    { path: '/Animals/african_buffalo.glb', position: new THREE.Vector3(0, 0, 0) },
    // { path: '/Animals/elephantff.glb', position: new THREE.Vector3(5, 0, 2) },
    // { path: '/Animals/giraffe.glb', position: new THREE.Vector3(-5, 0, -2) },
    // { path: '/Animals/gorilla.glb', position: new THREE.Vector3(8, 0, 8) },
    // { path: '/Animals/hippopotamus.glb', position: new THREE.Vector3(-8, 0, -8) },
    // { path: '/Animals/lion_lowpoly1.glb', position: new THREE.Vector3(3, 0, -10) },
    // { path: '/Animals/polar_bear.glb', position: new THREE.Vector3(-3, 0, 10) },
    // { path: '/Animals/rhinoceros.glb', position: new THREE.Vector3(12, 0, -12) },
    // { path: '/Animals/zebra.glb', position: new THREE.Vector3(-12, 0, 12) },
];

animalData.forEach(data => {
    loadAndAnimateAnimal(data.path, data.position);
});

// --- Dinding, Lantai, Latar Belakang & Cahaya ---
(function setupWorld() {
    // Definisikan posisi dinding
    const wallPositions = [
        // Dinding belakang
        new THREE.Vector3(-15, 0, -24.7), new THREE.Vector3(0, 0, -24.7), new THREE.Vector3(15, 0, -24.7),
        // Dinding depan
        new THREE.Vector3(-15, 0, 24.7), new THREE.Vector3(0, 0, 24.7), new THREE.Vector3(15, 0, 24.7),
        // Dinding kiri
        new THREE.Vector3(-24.7, 0, -15), new THREE.Vector3(-24.7, 0, 0), new THREE.Vector3(-24.7, 0, 15),
        // Dinding kanan
        new THREE.Vector3(24.7, 0, -15), new THREE.Vector3(24.7, 0, 0), new THREE.Vector3(24.7, 0, 15)
    ];

    // Panggil fungsi instancing untuk dinding
    loadAndPlaceInstances('/Wall/longwall.glb', wallPositions, new THREE.Vector3(2, 2, 2));

    const floorGeometry = new THREE.PlaneGeometry(50, 50);
    const floorTexture = new THREE.TextureLoader().load('/Floor/grass.jpg', (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5); });
    const floorMaterial = new THREE.MeshPhongMaterial({ map: floorTexture });
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    floorMesh.castShadow = false;
    scene.add(floorMesh);
    worldOctree.fromGraphNode(floorMesh);

    scene.background = new THREE.TextureLoader().load('/Background/langit.jpg', (t) => { t.encoding = THREE.sRGBEncoding; });
    scene.add(new THREE.AmbientLight(0x404040, 1.5));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
})();


// =================================================================
// BAGIAN 4: FUNGSI-FUNGSI UTAMA (LOGIKA GAME)
// =================================================================

// --- Fungsi Player ---
function updatePlayer(deltaTime) {
    let damping = Math.exp(-4 * deltaTime) - 1;
    if (!playerOnFloor) {
        playerVelocity.y -= GRAVITY * deltaTime;
        damping *= 0.1;
    }
    playerVelocity.addScaledVector(playerVelocity, damping);
    const deltaPosition = playerVelocity.clone().multiplyScalar(deltaTime);
    playerCollider.translate(deltaPosition);
    const result = worldOctree.capsuleIntersect(playerCollider);
    playerOnFloor = false;
    if (result) {
        playerOnFloor = result.normal.y > 0;
        if (!playerOnFloor) playerVelocity.addScaledVector(result.normal, -result.normal.dot(playerVelocity));
        playerCollider.translate(result.normal.multiplyScalar(result.depth));
    }
    camera.position.copy(playerCollider.end);
    camera.position.y += 0.6;
}

function getPlayerVector(type) {
    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();
    if (type === 'side') playerDirection.cross(camera.up);
    return playerDirection;
}

function controls(deltaTime) {
    const speed = playerOnFloor ? 25 : 8;
    const speedDelta = deltaTime * speed;
    if (keyStates['KeyW']) playerVelocity.add(getPlayerVector('forward').multiplyScalar(speedDelta));
    if (keyStates['KeyS']) playerVelocity.add(getPlayerVector('forward').multiplyScalar(-speedDelta));
    if (keyStates['KeyA']) playerVelocity.add(getPlayerVector('side').multiplyScalar(-speedDelta));
    if (keyStates['KeyD']) playerVelocity.add(getPlayerVector('side').multiplyScalar(speedDelta));
    if (playerOnFloor && keyStates['Space']) playerVelocity.y = 10;
}

function teleportPlayerIfOob() {
    if (camera.position.y <= -25) {
        playerCollider.start.set(-9, 0.8, 5);
        playerCollider.end.set(-9, 1.2, 5);
        camera.position.copy(playerCollider.end);
        camera.rotation.set(0, 0, 0);
    }
}

// --- Fungsi UI & Uang ---
function updateCollectedMoneyDisplay() {
    if (collectedMoneyDisplay) collectedMoneyDisplay.innerText = `💵 ${playerMoney}`;
}
function updateUncollectedMoneyDisplay() {
    if (uncollectedMoneyDisplay) uncollectedMoneyDisplay.innerText = `💰 ${uncollectedMoney}`;
}
function updateIncomeRateDisplay() {
    if (incomeRateDisplay) incomeRateDisplay.innerText = `+${currentIncomeRate} / detik`;
}
function generateMoney() {
    uncollectedMoney += currentIncomeRate;
    updateUncollectedMoneyDisplay();
}
function collectMoney() {
    if (uncollectedMoney > 0) {
        animateLeverPull(interactiveObjects.find(o => o.action === collectMoney)?.model);
        playerMoney += uncollectedMoney;
        uncollectedMoney = 0;
        updateCollectedMoneyDisplay();
        updateUncollectedMoneyDisplay();
    }
}

// --- Fungsi Interaksi & Aksi ---
function highlightObject(object, highlight, color = 0x000000) {
    if (!object) return;
    object.traverse((node) => {
        if (node.isMesh) {
            node.material.emissive = new THREE.Color(highlight ? color : 0x000000);
            node.material.emissiveIntensity = highlight ? 0.5 : 0;
        }
    });
}

function updateInteractions() {
    const playerPosition = new THREE.Vector3();
    playerCollider.getCenter(playerPosition);
    let closestObject = null;
    let minDistance = 3; // Jarak interaksi maksimal

    // Temukan objek interaktif terdekat
    for (const obj of interactiveObjects) {
        if (!obj.model) continue;
        const objPosition = new THREE.Vector3();
        obj.model.getWorldPosition(objPosition);
        const distance = playerPosition.distanceTo(objPosition);
        if (distance < minDistance) {
            minDistance = distance;
            closestObject = obj;
        }
    }

    // Proses interaksi untuk objek terdekat, nonaktifkan yang lain
    activeInteraction = null;
    for (const obj of interactiveObjects) {
        if (obj === closestObject) {
            const details = obj.getDetails();
            if (details.canInteract) {
                activeInteraction = obj;
                highlightObject(obj.model, true, details.highlightColor);
            } else {
                 highlightObject(obj.model, true, details.highlightColor); // Tetap highlight tapi tidak bisa di-klik
            }
            leverMessage.innerText = details.message;
            leverMessage.style.display = 'block';
        } else {
            highlightObject(obj.model, false);
        }
    }
    
    if (!closestObject) {
        leverMessage.style.display = 'none';
    }
}

function animateLeverPull(leverToAnimate) {
    if (!leverToAnimate || TWEEN.getAll().length > 0) return;
    const startRotation = { x: leverToAnimate.rotation.x };
    const endRotation = { x: leverToAnimate.rotation.x + Math.PI / 4 };
    new TWEEN.Tween(startRotation)
        .to(endRotation, 200)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(() => { leverToAnimate.rotation.x = startRotation.x; })
        .yoyo(true)
        .repeat(1)
        .start();
}

function buildBuilding() {
    const cost = buildingTierCosts[buildingLevel];
    if (buildingLevel < buildingTierCosts.length && playerMoney >= cost) {
        playerMoney -= cost;
        updateCollectedMoneyDisplay();
        if (buildingLevel > 0 && buildings[buildingLevel - 1]) buildings[buildingLevel - 1].visible = false;
        loader.load(buildingTierModels[buildingLevel], (gltf) => {
            const newBuilding = gltf.scene;
            newBuilding.position.set(-5, 0, 5);
            newBuilding.scale.set(2, 2, 2);
            scene.add(newBuilding);
            worldOctree.fromGraphNode(newBuilding);
            buildings[buildingLevel] = newBuilding;
        });
        buildingLevel++;
        currentIncomeRate = incomeRatesByLevel[buildingLevel] || incomeRatesByLevel[incomeRatesByLevel.length - 1];
        updateIncomeRateDisplay();
    }
}

// Fungsi baru untuk memuat 1 model dan menempatkannya di banyak posisi
function loadAndPlaceInstances(modelPath, positions, scale = new THREE.Vector3(1, 1, 1)) {
    loader.load(modelPath, (gltf) => {
        const sourceObject = gltf.scene.children[0];
        
        // Pastikan kita mendapatkan Mesh, bukan Object3D kosong
        if (sourceObject && sourceObject.isMesh) {
            const geometry = sourceObject.geometry;
            const material = sourceObject.material;

            positions.forEach(pos => {
                const instance = new THREE.Mesh(geometry, material);
                instance.scale.copy(scale);
                instance.position.copy(pos);

                // --- OPTIMISASI BAYANGAN (dibahas di Bagian B) ---
                instance.castShadow = true;
                instance.receiveShadow = true;

                scene.add(instance);
                worldOctree.fromGraphNode(instance);
            });
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

// Di dalam BAGIAN 4

function loadAndAnimateAnimal(path, position) {
    loader.load(path, (gltf) => {
        const animal = gltf.scene;
        animal.position.copy(position);
        
        // Sesuaikan skala jika perlu, misalnya:
        // animal.scale.set(0.5, 0.5, 0.5);
        
        scene.add(animal);

        // Cek apakah model punya animasi
        if (gltf.animations && gltf.animations.length) {
            // Buat AnimationMixer untuk hewan ini
            const mixer = new THREE.AnimationMixer(animal);
            
            // Ambil animasi pertama (biasanya idle animation)
            const action = mixer.clipAction(gltf.animations[0]);
            action.play();
            
            // Simpan mixer ke dalam array agar bisa di-update di loop utama
            animalMixers.push(mixer);
        }
    }, undefined, (error) => console.error(`Error loading animal: ${path}`, error));
}

// =================================================================
// BAGIAN 5: EVENT LISTENERS
// =================================================================

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('keydown', (event) => {
    keyStates[event.code] = true;
    if (event.code === 'KeyF' && activeInteraction) {
        activeInteraction.action();
    }
});

document.addEventListener('keyup', (event) => {
    keyStates[event.code] = false;
});

container.addEventListener('click', () => {
    document.body.requestPointerLock();
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
    updateInteractions(); 
    
    for (const mixer of animalMixers) {
        mixer.update(deltaTime);
    }
    
    // Satu fungsi untuk semua interaksi
    TWEEN.update();
    renderer.render(scene, camera);
}

// Inisialisasi Tampilan Uang & Generator
updateCollectedMoneyDisplay();
updateUncollectedMoneyDisplay();
updateIncomeRateDisplay();
setInterval(generateMoney, 1000);

// Mulai Loop Animasi
animate();