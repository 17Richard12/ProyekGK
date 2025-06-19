// main.js - Versi Final dengan Debugging dan Penyesuaian

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
const incomePerPen = 5;
const PEN_COST = 50;
const TREES_COST = 1000;
let areTreesPurchased = false;
const INCOME_PER_ANIMAL = 50;

const uncollectedMoneyDisplay = document.getElementById('uncollectedMoneyDisplay');
const collectedMoneyDisplay = document.getElementById('collectedMoneyDisplay');
const incomeRateDisplay = document.getElementById('incomeRateDisplay');
const leverMessage = document.getElementById('leverMessage');

// Aset & Interaksi
let knife;
let mouseTime = 0;
let isSpinning = false;
let spinStartTime;
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
let buildLeverModel = null;

// Logika baru untuk manajemen kandang
let pensPurchasedCount = 0;
const TOTAL_PENS = 9;
let penObjects = []; // Array untuk menyimpan grup kandang (termasuk pagarnya)

// Logika untuk manajemen hewan
let animalsPurchasedCount = 0;
const ANIMAL_COST = 200;

// Data hewan yang tersedia (sesuai dengan file Anda)
// PENTING: Sesuaikan nilai 'scale' dan 'offsetY' ini agar hewan terlihat proporsional
// Saya telah meningkatkan skalanya sebagai tebakan awal.
const animalData = [
    { name: 'African Buffalo', model: '/Animal/african_buffalo.glb', scale: 0.02, offsetY: 0.5 },
    { name: 'Elephant', model: '/Animal/elephantff.glb', scale: 0.025, offsetY: 0.5 },
    { name: 'Giraffe', model: '/Animal/giraffe.glb', scale: 0.02, offsetY: 0.5 },
    { name: 'Gorilla', model: '/Animal/gorilla.glb', scale: 0.02, offsetY: 0.5 },
    { name: 'Hippopotamus', model: '/Animal/hippopotamus.glb', scale: 0.02, offsetY: 0.5 },
    { name: 'Lion', model: '/Animal/lion_lowpoly1.glb', scale: 0.02, offsetY: 0.5 },
    { name: 'Polar Bear', model: '/Animal/polar_bear.glb', scale: 0.02, offsetY: 0.5 },
    { name: 'Rhinoceros', model: '/Animal/rhinoceros.glb', scale: 0.02, offsetY: 0.5 },
    { name: 'Zebra', model: '/Animal/zebra.glb', scale: 0.02, offsetY: 0.5 },
];
let currentAnimalIndexToBuy = 0;

let interactiveObjects = [];
let activeInteraction = null;

// =================================================================
// BAGIAN 3: PEMUATAN ASET
// =================================================================

// --- Senjata Pemain ---
loader.load('/Knife/karambit.glb', (gltf) => {
    knife = gltf.scene;
    knife.scale.set(0.1, 0.1, 0.1);
    knife.position.set(0.5, -0.5, -1);
    knife.rotation.set(4.5, Math.PI, -21);
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
}, (xhr) => console.log('Table ' + (xhr.loaded / xhr.total * 100) + '% loaded'),
   (error) => console.error('Error loading table:', error));

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
}, (xhr) => console.log('Collect Lever ' + (xhr.loaded / xhr.total * 100) + '% loaded'),
   (error) => console.error('Error loading collect lever:', error));

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
}, (xhr) => console.log('Build Lever ' + (xhr.loaded / xhr.total * 100) + '% loaded'),
   (error) => console.error('Error loading build lever:', error));

// Tuas Pintar untuk Kandang & Pohon & Hewan
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
            if (areTreesPurchased && animalsPurchasedCount >= TOTAL_PENS) {
                return { canInteract: false, message: 'Semua Pengembangan Selesai', highlightColor: '#00ffaa' };
            }

            if (pensPurchasedCount === TOTAL_PENS && animalsPurchasedCount < TOTAL_PENS) {
                const currentAnimalName = animalData[currentAnimalIndexToBuy]?.name || "Hewan";
                const hasEnoughMoney = playerMoney >= ANIMAL_COST;
                return {
                    canInteract: hasEnoughMoney,
                    message: hasEnoughMoney ? `Beli ${currentAnimalName} (${animalsPurchasedCount + 1}/${TOTAL_PENS}) (Biaya: ${ANIMAL_COST})` : `Uang tidak cukup (Butuh: ${ANIMAL_COST})`,
                    highlightColor: hasEnoughMoney ? '#00ff00' : '#ff0000'
                };
            }

            if (pensPurchasedCount >= TOTAL_PENS) {
                const hasEnoughMoney = playerMoney >= TREES_COST;
                return {
                    canInteract: hasEnoughMoney,
                    message: hasEnoughMoney ? `Beli Semua Pohon (Biaya: ${TREES_COST})` : `Uang tidak cukup (Butuh: ${TREES_COST})`,
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
}, (xhr) => console.log('Pen/Animal Lever ' + (xhr.loaded / xhr.total * 100) + '% loaded'),
   (error) => console.error('Error loading pen/animal lever:', error));

// --- Dinding, Lantai, Latar Belakang & Cahaya ---
(function setupWorld() {
    function loadWall(position, rotationY = 0) {
        loader.load('/Wall/longwall.glb', function (gltf) {
            const wall = gltf.scene;
            wall.scale.set(2, 2, 2); // Skala tetap 2,2,2
            wall.rotation.y = rotationY;
            wall.position.copy(position);
            scene.add(wall);
            worldOctree.fromGraphNode(wall);
            wall.traverse((node) => { if (node.isMesh) node.castShadow = true; }); // Pastikan dinding memancarkan bayangan
        }, (xhr) => console.log('Wall ' + (xhr.loaded / xhr.total * 100) + '% loaded'),
           (error) => console.error('Error loading wall:', error));
    }

    function loadFence(position, rotationY = 0, parentGroup, penIndex) {
        loader.load('/Wall/low_poly_wood_fence_with_snow.glb', function (gltf) {
            const fence = gltf.scene;
            fence.scale.set(1.5, 1.5, 1.5);
            fence.rotation.y = rotationY;
            fence.position.copy(position);
            
            fence.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            parentGroup.add(fence);
            worldOctree.fromGraphNode(fence); // Penting: Tambahkan ke Octree
            console.log(`Fence for pen ${penIndex} loaded.`); // Log konfirmasi pemuatan pagar
        }, (xhr) => console.log(`Fence for pen ${penIndex} ` + (xhr.loaded / xhr.total * 100) + '% loaded'),
           (error) => console.error(`Error loading fence for pen ${penIndex}:`, error));
    }

    function createBuyablePen(centerPosition, penIndex) {
        const penGroup = new THREE.Group();
        penGroup.userData.isPen = true;
        penGroup.userData.penIndex = penIndex;
        penGroup.userData.hasAnimal = false;
        penGroup.userData.animalModel = null;

        // **PERHATIAN:** Ini yang membuat kandang tidak terlihat saat startup.
        // HANYA untuk debugging, Anda bisa mengubahnya menjadi true untuk melihat semua kandang.
        // Tetapi untuk logika game yang benar, biarkan 'false'
        penGroup.visible = false;
        
        scene.add(penGroup);
        penObjects[penIndex] = penGroup;

        // Logika pembuatan pagar
        const fenceLength = 2.05; // Panjang satu segmen pagar
        const fencesPerSide = 2; // Jumlah segmen pagar per sisi kandang
        const sideLength = fencesPerSide * fenceLength; // Total panjang satu sisi kandang
        const halfSideLength = sideLength / 2;
        const cY = centerPosition.y; // Y position of the pen group itself

        // Posisi pagar relatif terhadap centerPosition (0,0,0) dari penGroup
        loadFence(new THREE.Vector3(-halfSideLength + (fenceLength / 2), cY, -halfSideLength), Math.PI / 2, penGroup, penIndex);
        loadFence(new THREE.Vector3(-halfSideLength + (fenceLength * 1.5), cY, -halfSideLength), (3 * Math.PI) / 2, penGroup, penIndex); // Perhatikan rotasi
        loadFence(new THREE.Vector3(-halfSideLength + (fenceLength / 2), cY, halfSideLength), Math.PI / 2, penGroup, penIndex);
        loadFence(new THREE.Vector3(-halfSideLength + (fenceLength * 1.5), cY, halfSideLength), (3 * Math.PI) / 2, penGroup, penIndex);

        loadFence(new THREE.Vector3(-halfSideLength, cY, -halfSideLength + (fenceLength / 2)), 0, penGroup, penIndex); // Rotasi 0 atau 2*PI
        loadFence(new THREE.Vector3(-halfSideLength, cY, -halfSideLength + (fenceLength * 1.5)), Math.PI, penGroup, penIndex); // Rotasi PI
        loadFence(new THREE.Vector3(halfSideLength, cY, -halfSideLength + (fenceLength / 2)), 0, penGroup, penIndex);
        loadFence(new THREE.Vector3(halfSideLength, cY, -halfSideLength + (fenceLength * 1.5)), Math.PI, penGroup, penIndex);
    }

    const worldSize = 50;
    const halfWorldSize = worldSize / 2;
    const wallThickness = 0.5;
    const wallHeightOffset = 0; // Sesuaikan jika wall model memiliki origin di bawah tanah

    const wallModelLength = 20; // Perkiraan panjang model longwall.glb setelah scale 2x
    const numWallsPerSide = Math.ceil(worldSize / wallModelLength);

    for (let i = 0; i < numWallsPerSide; i++) {
        const offset = i * wallModelLength - (worldSize / 2) + (wallModelLength / 2);

        loadWall(new THREE.Vector3(offset, wallHeightOffset, -halfWorldSize + wallThickness), 0);
        loadWall(new THREE.Vector3(offset, wallHeightOffset, halfWorldSize - wallThickness), Math.PI);

        loadWall(new THREE.Vector3(-halfWorldSize + wallThickness, wallHeightOffset, offset), Math.PI / 2);
        loadWall(new THREE.Vector3(halfWorldSize - wallThickness, wallHeightOffset, offset), -Math.PI / 2);
    }

    const gridRows = 3;
    const gridCols = 3;
    const gridSpacing = 8; // Jarak antar pusat kandang
    let penCounter = 0;

    for (let i = 0; i < gridRows; i++) {
        for (let j = 0; j < gridCols; j++) {
            // Sesuaikan posisi awal kandang agar tidak terlalu dekat dengan tepi atau bangunan awal
            const x = (i - 1) * gridSpacing; // Menggeser pusat grid ke (0,0)
            const z = (j - 1) * gridSpacing; // Menggeser pusat grid ke (0,0)

            // Anda bisa menyesuaikan offset ini agar seluruh grid kandang berada di area tertentu
            // Misalnya, jika Anda ingin grid dimulai dari sekitar (-15, -15)
            const globalOffsetX = -10;
            const globalOffsetZ = -10;

            createBuyablePen(new THREE.Vector3(x + globalOffsetX, 0, z + globalOffsetZ), penCounter);
            penCounter++;
        }
    }

    const floorGeometry = new THREE.PlaneGeometry(worldSize, worldSize);
    const floorTexture = new THREE.TextureLoader().load('/Floor/grass.jpg', (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(worldSize / 5, worldSize / 5); });
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
    // Sesuaikan posisi teleport awal pemain agar tidak di bawah tanah
    if (camera.position.y <= -25) { // Jika jatuh terlalu jauh
        playerCollider.start.set(0, 1, 0); // Posisi aman di tengah dunia
        playerCollider.end.set(0, 2, 0);
        camera.position.copy(playerCollider.end);
        camera.rotation.set(0, 0, 0); // Reset rotasi kamera
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
    let baseIncome = 0;
    if (buildingLevel === 0) {
        baseIncome = incomeRatePerBuilding[0];
    } else {
        baseIncome = incomeRatePerBuilding[buildingLevel];
    }
    const penIncome = pensPurchasedCount * incomePerPen;
    const animalIncome = animalsPurchasedCount * INCOME_PER_ANIMAL;
    currentIncomeRate = baseIncome + penIncome + animalIncome;
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
            // Penting: Pastikan material tidak null
            if (node.material.isMeshStandardMaterial || node.material.isMeshPhongMaterial) {
                 node.material.needsUpdate = true; // Perbarui material
            }
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
        if (!obj.model) continue;

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

function loadPineTree(position) {
    loader.load('/Building/pine_tree.glb', function (gltf) {
        const tree = gltf.scene;
        tree.scale.set(0.02, 0.02, 0.02);
        tree.position.copy(position);
        tree.rotation.y = Math.random() * Math.PI * 2;
        scene.add(tree);
        worldOctree.fromGraphNode(tree);
        tree.traverse((node) => { if (node.isMesh) node.castShadow = true; }); // Pastikan pohon memancarkan bayangan
    }, (xhr) => console.log('Pine Tree ' + (xhr.loaded / xhr.total * 100) + '% loaded'),
       (error) => console.error('Error loading pine tree:', error));
}

function placeTreesProcedurally(count) {
    const noGoZones = [
        { x: 0 + (-10), z: 0 + (-10), width: 26, depth: 26 }, // Pen grid area
        { x: -10, z: 10, width: 12, depth: 12 }, // Building area
        { x: 15, z: -5, width: 8, depth: 10 }, // Lever/table area
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
    updateIncomeRateDisplay();
}

// Fungsi untuk membeli hewan
function buyAnimal() {
    // Memastikan ada kandang yang sudah dibeli dan belum ada hewannya
    const availablePen = penObjects.find(pen => pen && pen.visible && !pen.userData.hasAnimal);

    if (!availablePen) {
        console.warn("Tidak ada kandang kosong yang tersedia untuk menempatkan hewan.");
        return;
    }

    if (animalsPurchasedCount >= TOTAL_PENS || playerMoney < ANIMAL_COST) {
        console.warn("Kondisi untuk membeli hewan tidak terpenuhi. Jumlah hewan: " + animalsPurchasedCount + ", Uang: " + playerMoney);
        return;
    }

    const animalToBuy = animalData[currentAnimalIndexToBuy];
    if (!animalToBuy) {
        console.warn("Tidak ada data hewan untuk dibeli pada indeks ini.");
        return;
    }

    playerMoney -= ANIMAL_COST;
    updateCollectedMoneyDisplay();
    animateLeverPull(interactiveObjects.find(o => o.action === handlePenAnimalLeverAction)?.model);

    loader.load(animalToBuy.model, (gltf) => {
        const animal = gltf.scene;

        animal.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
                // Perbaiki material jika diperlukan (contoh: jika model tidak muncul)
                // if (node.material.map) node.material.map.encoding = THREE.sRGBEncoding;
                // if (node.material.emissive) node.material.emissive.encoding = THREE.sRGBEncoding;
            }
        });

        // Set posisi hewan relatif terhadap kandang (grup penGroup)
        // Posisi 0,0,0 akan menempatkan hewan di tengah grup kandang
        animal.position.set(0, animalToBuy.offsetY || 0, 0); // Gunakan offsetY
        animal.scale.set(animalToBuy.scale, animalToBuy.scale, animalToBuy.scale);
        animal.rotation.y = Math.random() * Math.PI * 2;

        availablePen.add(animal); // Tambahkan hewan ke grup kandang

        // Tambahkan hewan ke worldOctree untuk kolisi
        // Penting: Lakukan ini setelah posisi dan skala hewan diatur dan ditambahkan ke scene/grup parent
        worldOctree.fromGraphNode(animal);

        availablePen.userData.hasAnimal = true;
        availablePen.userData.animalModel = animal; // Simpan referensi model hewan

        animalsPurchasedCount++;
        currentAnimalIndexToBuy = (currentAnimalIndexToBuy + 1) % animalData.length;
        console.log(`Berhasil membeli dan menempatkan ${animalToBuy.name}. Total hewan: ${animalsPurchasedCount}.`);
        updateIncomeRateDisplay();
    },
    // Progress callback
    (xhr) => {
        console.log( `Memuat ${animalToBuy.name}: ` + ( xhr.loaded / xhr.total * 100 ) + '%');
    },
    // Error callback
    (error) => {
        console.error(`Gagal memuat model hewan ${animalToBuy.model}:`, error);
        // Penting: Cek error di konsol. Ini biasanya masalah PATH.
        alert(`Gagal memuat model hewan: ${animalToBuy.model}. Cek konsol untuk detailnya.`);
    });
}

function handlePenAnimalLeverAction() {
    if (pensPurchasedCount === TOTAL_PENS && animalsPurchasedCount < TOTAL_PENS) {
        buyAnimal();
    }
    else if (pensPurchasedCount >= TOTAL_PENS && !areTreesPurchased) { // Tambahkan !areTreesPurchased
        buyAllTrees();
    } else {
        buyNextPen();
    }
}


function buyNextPen() {
    if (pensPurchasedCount >= TOTAL_PENS || playerMoney < PEN_COST) {
        console.warn("Tidak bisa membeli kandang lagi atau uang tidak cukup.");
        return;
    }

    playerMoney -= PEN_COST;
    updateCollectedMoneyDisplay();

    animateLeverPull(interactiveObjects.find(o => o.action === handlePenAnimalLeverAction)?.model);

    const nextPen = penObjects[pensPurchasedCount];
    if (nextPen) {
        nextPen.visible = true;
        console.log(`Kandang ke-${pensPurchasedCount + 1} dibeli dan terlihat.`);
    }

    pensPurchasedCount++;
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
            newBuilding.traverse((node) => { if (node.isMesh) node.castShadow = true; });
        }, (xhr) => console.log('Building ' + (xhr.loaded / xhr.total * 100) + '% loaded'),
           (error) => console.error('Error loading building:', error));

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
        document.addEventListener('mousedown', (e) => { if (e.button === 0) startSpin(); });
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