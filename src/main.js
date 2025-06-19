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
let currentIncomeRate = 10;
const incomeRatePerBuilding = [10, 25, 75, 200];
const incomePerPen = 5; // Setiap kandang yang dibeli menambah +5 income
const incomePerAnimal = 10; // Setiap hewan yang dibeli menambah +10 income
const PEN_COST = 50; // Menetapkan harga per kandang
const ANIMAL_COST = 75; // Menetapkan harga per hewan
const TREES_COST = 1000;
let areTreesPurchased = false;

const uncollectedMoneyDisplay = document.getElementById('uncollectedMoneyDisplay');
const collectedMoneyDisplay = document.getElementById('collectedMoneyDisplay');
const incomeRateDisplay = document.getElementById('incomeRateDisplay');
const leverMessage = document.getElementById('leverMessage');


// Sistem Bangunan & Interaksi
let buildingLevel = 0;
const buildingTierCosts = [100, 500, 1500];
const buildingTierModels = [
    '/Building/building1.glb',
    '/Building/building2.glb',
    '/Building/house_valo.glb'
];
let buildings = [];
let buildLeverModel = null;

// Logika manajemen kandang & hewan
let pensPurchasedCount = 0;
const TOTAL_PENS = 9;
let penObjects = []; // Menyimpan grup 3D untuk setiap kandang

let animalsPurchasedCount = 0;
const TOTAL_ANIMALS = 9; // Total hewan yang bisa dibeli (satu per kandang)
let animalObjects = []; // Menyimpan model 3D untuk setiap hewan

// Objek interaktif
let interactiveObjects = [];
let activeInteraction = null;

// =================================================================
// BAGIAN 3: PEMUATAN ASET
// =================================================================

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
    buildLeverModel = buildLever;

    buildLever.scale.set(1, 1, 1);
    buildLever.rotation.set(0, Math.PI / 2, 0);
    buildLever.position.set(15, 0.7, -7);
    scene.add(buildLever);

    interactiveObjects.push({
        model: buildLever,
        action: buildBuilding,
        getDetails: () => {
            if (buildingLevel >= 1) {
                return { canInteract: false, message: 'Bangunan sudah dibeli', highlightColor: '#ffff00' };
            }
            const currentCost = buildingTierCosts[0];
            const hasEnoughMoney = playerMoney >= currentCost;
            return {
                canInteract: hasEnoughMoney,
                message: hasEnoughMoney ? `Beli Bangunan (Biaya: ${currentCost})` : `Uang tidak cukup (Butuh: ${currentCost})`,
                highlightColor: hasEnoughMoney ? '#00ff00' : '#ff0000'
            };
        }
    });
});

// Tuas Pintar untuk Kandang, Pohon, & Hewan
loader.load('/Lever/lever.glb', function (gltf) {
    const penAnimalLever = gltf.scene;
    penAnimalLever.scale.set(1, 1, 1);
    penAnimalLever.rotation.set(0, Math.PI / 2, 0);
    penAnimalLever.position.set(15, 0.7, -5);
    scene.add(penAnimalLever);

    interactiveObjects.push({
        model: penAnimalLever,
        action: handlePenAnimalLeverAction,
        getDetails: () => {
            if (areTreesPurchased) {
                return { canInteract: false, message: 'Pengembangan Area Selesai', highlightColor: '#00ffaa' };
            }

            if (pensPurchasedCount >= TOTAL_PENS && animalsPurchasedCount >= TOTAL_ANIMALS) {
                const hasEnoughMoney = playerMoney >= TREES_COST;
                return {
                    canInteract: hasEnoughMoney,
                    message: hasEnoughMoney ? `Beli Semua Pohon (Biaya: ${TREES_COST})` : `Uang tidak cukup (Butuh: ${TREES_COST})`,
                    highlightColor: hasEnoughMoney ? '#00ff00' : '#ff0000'
                };
            }

            if (pensPurchasedCount >= TOTAL_PENS && animalsPurchasedCount < TOTAL_ANIMALS) {
                const hasEnoughMoney = playerMoney >= ANIMAL_COST;
                return {
                    canInteract: hasEnoughMoney,
                    message: hasEnoughMoney ? `Beli Hewan (${animalsPurchasedCount + 1}/${TOTAL_ANIMALS}) (Biaya: ${ANIMAL_COST})` : `Uang tidak cukup (Butuh: ${ANIMAL_COST})`,
                    highlightColor: hasEnoughMoney ? '#00ff00' : '#ff0000'
                };
            }

            const hasEnoughMoney = playerMoney >= PEN_COST;
            return {
                canInteract: hasEnoughMoney,
                message: hasEnoughMoney ? `Beli Kandang (${pensPurchasedCount + 1}/${TOTAL_PENS}) (Biaya: ${PEN_COST})` : `Uang tidak cukup (Butuh: ${PEN_COST})`,
                highlightColor: hasEnoughMoney ? '#00ff00' : '#ff0000'
            };
        }
    });
});

// --- Dinding, Lantai, Latar Belakang & Cahaya ---
(function setupWorld() {
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

    function loadFence(position, rotationY = 0, parentGroup) {
        loader.load('/Wall/low_poly_wood_fence_with_snow.glb', function (gltf) {
            const fence = gltf.scene;
            fence.scale.set(1.5, 1.5, 1.5);
            fence.rotation.y = rotationY;
            fence.position.copy(position);
            parentGroup.add(fence);
            worldOctree.fromGraphNode(fence);
        });
    }

    // Fungsi untuk memuat model hewan (jerapah)
    function loadAnimalModel(position, rotationY = 0, parentGroup, animalIndex) {
        loader.load('/Animal/giraffe.glb', function (gltf) {
            const animal = gltf.scene;
            animal.scale.set(0.5, 0.5, 0.5); // Ukuran jerapah
            animal.rotation.y = rotationY;
            animal.position.copy(position);
            parentGroup.add(animal); // Tambahkan jerapah ke dalam grup kandang
            worldOctree.fromGraphNode(animal); // Tambahkan ke octree untuk collision
            animalObjects[animalIndex] = animal; // Simpan referensi model
        }, undefined, function (error) {
            console.error('An error occurred while loading the giraffe model:', error);
            // Tambahkan pesan visual ke UI jika terjadi error loading
            leverMessage.innerText = 'Gagal memuat model jerapah. Cek konsol.';
            leverMessage.style.display = 'block';
        });
    }

    function createBuyablePen(centerPosition, penIndex) {
        const penGroup = new THREE.Group();
        penGroup.userData.isPen = true;
        penGroup.userData.penIndex = penIndex;
        penGroup.visible = false;
        scene.add(penGroup);
        penObjects[penIndex] = penGroup;

        const fenceLength = 2.05;
        const fencesPerSide = 2;
        const sideLength = fencesPerSide * fenceLength;
        const halfSideLength = sideLength / 2;
        const cY = centerPosition.y;
        const relativeCenter = new THREE.Vector3(0, 0, 0);

        loadFence(new THREE.Vector3(relativeCenter.x - halfSideLength + (fenceLength / 2), cY, relativeCenter.z - halfSideLength), Math.PI / 2, penGroup);
        loadFence(new THREE.Vector3(relativeCenter.x - halfSideLength + (fenceLength * 1.5), cY, relativeCenter.z - halfSideLength), (3 * Math.PI) / 2, penGroup);
        loadFence(new THREE.Vector3(relativeCenter.x - halfSideLength + (fenceLength / 2), cY, relativeCenter.z + halfSideLength), Math.PI / 2, penGroup);
        loadFence(new THREE.Vector3(relativeCenter.x - halfSideLength + (fenceLength * 1.5), cY, relativeCenter.z + halfSideLength), (3 * Math.PI) / 2, penGroup);
        loadFence(new THREE.Vector3(relativeCenter.x - halfSideLength, cY, relativeCenter.z - halfSideLength + (fenceLength / 2)), 2 * Math.PI, penGroup);
        loadFence(new THREE.Vector3(relativeCenter.x - halfSideLength, cY, relativeCenter.z - halfSideLength + (fenceLength * 1.5)), Math.PI, penGroup);
        loadFence(new THREE.Vector3(relativeCenter.x + halfSideLength, cY, relativeCenter.z - halfSideLength + (fenceLength / 2)), 2 * Math.PI, penGroup);
        loadFence(new THREE.Vector3(relativeCenter.x + halfSideLength, cY, relativeCenter.z - halfSideLength + (fenceLength * 1.5)), Math.PI, penGroup);

        penGroup.position.copy(centerPosition);
    }

    const wallPositions = [ { pos: new THREE.Vector3(-10, 0, -24.7) }, { pos: new THREE.Vector3(-24.5, 0, -6), rot: Math.PI / 2 }, { pos: new THREE.Vector3(-24.3, 0, 6.3), rot: Math.PI / 2 }, { pos: new THREE.Vector3(-10, 0, 25) }, { pos: new THREE.Vector3(24.5, 0, -6), rot: Math.PI / 2 }, { pos: new THREE.Vector3(24.7, 0, 6.3), rot: Math.PI / 2 }, { pos: new THREE.Vector3(8, 0, -24.7) }, { pos: new THREE.Vector3(8, 0, 25) }];
    wallPositions.forEach(w => loadWall(w.pos, w.rot));

    const gridRows = 3;
    const gridCols = 3;
    const gridSpacing = 8;
    let penCounter = 0;

    for (let i = 0; i < gridRows; i++) {
        for (let j = 0; j < gridCols; j++) {
            const x = (i - 1) * gridSpacing;
            const z = (j - 1) * gridSpacing;
            createBuyablePen(new THREE.Vector3(x, 0, z), penCounter);
            penCounter++;
        }
    }

    const floorGeometry = new THREE.PlaneGeometry(50, 50);
    const floorTexture = new THREE.TextureLoader().load('/Floor/grass.jpg', (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5); });
    const floorMaterial = new THREE.MeshPhongMaterial({ map: floorTexture });
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
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

    let closestInteractiveObject = null;
    let closestDistance = Infinity;

    const nearbyObjects = [];
    for (const obj of interactiveObjects) {
        if (!obj.model || !obj.model.parent) continue;

        const objPosition = new THREE.Vector3();
        obj.model.getWorldPosition(objPosition);
        const distance = playerPosition.distanceTo(objPosition);

        const interactionRadius = obj.interactionRadius || 3;

        if (distance < interactionRadius) {
            nearbyObjects.push({ object: obj, distance: distance });
        }
    }

    if (nearbyObjects.length > 0) {
        nearbyObjects.sort((a, b) => a.distance - b.distance);
        closestInteractiveObject = nearbyObjects[0].object;
    }

    activeInteraction = null;
    let somethingIsHighlighted = false;
    for (const obj of interactiveObjects) {
        if (obj === closestInteractiveObject) {
            const details = obj.getDetails();
            highlightObject(obj.model, true, details.highlightColor);

            if (details.canInteract) {
                activeInteraction = obj;
            }

            leverMessage.innerText = details.message;
            leverMessage.style.display = 'block';
            somethingIsHighlighted = true;
        } else {
            highlightObject(obj.model, false);
        }
    }

    if (!somethingIsHighlighted) {
        leverMessage.style.display = 'none';
    }
}

function animateLeverPull(leverToAnimate) {
    if (!leverToAnimate || TWEEN.getAll().length > 0) return;
    const startRotation = { y: leverToAnimate.rotation.y };
    const endRotation = { y: leverToAnimate.rotation.y + Math.PI / 4 };
    new TWEEN.Tween(startRotation)
        .to(endRotation, 200)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(() => { leverToAnimate.rotation.y = startRotation.y; })
        .yoyo(true)
        .repeat(1)
        .start();
}

function loadPineTree(position) {
    loader.load('/Building/pine_tree.glb', function (gltf) {
        const tree = gltf.scene;
        tree.scale.set(0.02, 0.02, 0.02);
        tree.position.copy(position);
        tree.rotation.y = Math.random() * Math.PI * 2;
        scene.add(tree);
        worldOctree.fromGraphNode(tree);
    });
}

function placeTreesProcedurally(count) {
    const noGoZones = [
        { x: 0, z: 0, width: 26, depth: 26 },
        { x: -10, z: 10, width: 12, depth: 12 },
        { x: 15, z: -5, width: 8, depth: 10 },
    ];

    const worldBounds = 24;
    let placedCount = 0;
    let maxAttempts = count * 20;

    for (let i = 0; i < maxAttempts && placedCount < count; i++) {
        const randomX = Math.random() * (worldBounds * 2) - worldBounds;
        const randomZ = Math.random() * (worldBounds * 2) - worldBounds;

        let isSafe = true;
        for (const zone of noGoZones) {
            const halfW = zone.width / 2;
            const halfD = zone.depth / 2;
            if (randomX > zone.x - halfW && randomX < zone.x + halfW &&
                randomZ > zone.z - halfD && randomZ < zone.z + halfD) {
                isSafe = false;
                break;
            }
        }

        if (isSafe) {
            loadPineTree(new THREE.Vector3(randomX, 0, randomZ));
            placedCount++;
        }
    }

    if (placedCount < count) {
        console.warn(`Hanya berhasil menanam ${placedCount} dari ${count} pohon.`);
    }
}

function buyAllTrees() {
    if (areTreesPurchased || playerMoney < TREES_COST) {
        return;
    }

    playerMoney -= TREES_COST;
    updateCollectedMoneyDisplay();
    areTreesPurchased = true;

    animateLeverPull(interactiveObjects.find(o => o.action === handlePenAnimalLeverAction)?.model);

    placeTreesProcedurally(50);
    currentIncomeRate += 100;
    updateIncomeRateDisplay();
}

function buyAnimal() {
    // Memastikan semua kandang sudah dibeli dan belum semua hewan dibeli
    if (pensPurchasedCount < TOTAL_PENS || animalsPurchasedCount >= TOTAL_ANIMALS || playerMoney < ANIMAL_COST) {
        return;
    }

    playerMoney -= ANIMAL_COST;
    updateCollectedMoneyDisplay();

    animateLeverPull(interactiveObjects.find(o => o.action === handlePenAnimalLeverAction)?.model);

    // Tentukan kandang mana yang akan ditempati hewan
    // Hewan ke-0 akan masuk kandang ke-0, hewan ke-1 masuk kandang ke-1, dst.
    const targetPenIndex = animalsPurchasedCount;
    const targetPenGroup = penObjects[targetPenIndex];

    if (targetPenGroup) {
        // Posisi hewan di tengah kandang, sedikit di atas lantai
        // Rotasi acak agar tidak seragam
        loadAnimalModel(new THREE.Vector3(0, 0.5, 0), Math.random() * Math.PI * 2, targetPenGroup, animalsPurchasedCount);
    } else {
        console.warn(`Kandang dengan indeks ${targetPenIndex} tidak ditemukan untuk menempatkan hewan.`);
        // Opsional: kembalikan uang jika kandang tidak ada
        // playerMoney += ANIMAL_COST;
        // updateCollectedMoneyDisplay();
    }

    animalsPurchasedCount++;
    currentIncomeRate += incomePerAnimal;
    updateIncomeRateDisplay();
}

function handlePenAnimalLeverAction() {
    // Prioritas:
    // 1. Beli Hewan: Jika semua kandang sudah dibeli TAPI belum semua hewan dibeli.
    if (pensPurchasedCount >= TOTAL_PENS && animalsPurchasedCount < TOTAL_ANIMALS) {
        buyAnimal();
    }
    // 2. Beli Pohon: Jika semua kandang DAN semua hewan sudah dibeli.
    else if (pensPurchasedCount >= TOTAL_PENS && animalsPurchasedCount >= TOTAL_ANIMALS) {
        buyAllTrees();
    }
    // 3. Beli Kandang: Default, jika kondisi di atas tidak terpenuhi.
    else {
        buyNextPen();
    }
}

function buyNextPen() {
    if (pensPurchasedCount >= TOTAL_PENS || playerMoney < PEN_COST) {
        return;
    }

    playerMoney -= PEN_COST;
    updateCollectedMoneyDisplay();

    animateLeverPull(interactiveObjects.find(o => o.action === handlePenAnimalLeverAction)?.model);

    const nextPen = penObjects[pensPurchasedCount];
    if (nextPen) {
        nextPen.visible = true;
    }

    pensPurchasedCount++;
    currentIncomeRate += incomePerPen;
    updateIncomeRateDisplay();
}

function buildBuilding() {
    if (buildingLevel >= 1) return;

    const cost = buildingTierCosts[buildingLevel];
    if (playerMoney >= cost) {
        playerMoney -= cost;
        updateCollectedMoneyDisplay();
        animateLeverPull(buildLeverModel);

        loader.load(buildingTierModels[buildingLevel], (gltf) => {
            const newBuilding = gltf.scene;
            newBuilding.position.set(-10, 0, 10);
            newBuilding.scale.set(2, 2, 2);
            scene.add(newBuilding);
            worldOctree.fromGraphNode(newBuilding);
            buildings[buildingLevel] = newBuilding;
        });

        const baseIncome = incomeRatePerBuilding[buildingLevel + 1] || incomeRatePerBuilding[incomeRatePerBuilding.length - 1];
        const penIncome = pensPurchasedCount * incomePerPen;
        const animalIncome = animalsPurchasedCount * incomePerAnimal;
        currentIncomeRate = baseIncome + penIncome + animalIncome;
        updateIncomeRateDisplay();

        buildingLevel++;

        if (buildLeverModel) {
            buildLeverModel.visible = false;
        }

        interactiveObjects = interactiveObjects.filter(obj => obj.action !== buildBuilding);

        activeInteraction = null;
        leverMessage.style.display = 'none';
    }
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

document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === document.body) {
        // Logika tambahan jika diperlukan setelah pointer lock
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
    };
    updateInteractions();
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