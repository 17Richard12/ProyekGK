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
let penObjects = [];

// Logika untuk manajemen hewan
let animalsPurchasedCount = 0;
const ANIMAL_COST = 200;

// Data hewan yang tersedia (sesuai dengan file Anda)
const animalData = [
    { name: 'African Buffalo', model: '/Animal/african_buffalo.glb', scale: 0.005, offsetY: 0 },
    { name: 'Elephant', model: '/Animal/elephantff.glb', scale: 0.005, offsetY: 0 },
    { name: 'Giraffe', model: '/Animal/giraffe.glb', scale: 0.005, offsetY: 0 },
    { name: 'Gorilla', model: '/Animal/gorilla.glb', scale: 0.005, offsetY: 0 },
    { name: 'Hippopotamus', model: '/Animal/hippopotamus.glb', scale: 0.005, offsetY: 0 },
    { name: 'Lion', model: '/Animal/lion_lowpoly1.glb', scale: 0.005, offsetY: 0 },
    { name: 'Polar Bear', model: '/Animal/polar_bear.glb', scale: 0.005, offsetY: 0 },
    { name: 'Rhinoceros', model: '/Animal/rhinoceros.glb', scale: 0.005, offsetY: 0 },
    { name: 'Zebra', model: '/Animal/zebra.glb', scale: 0.005, offsetY: 0 },
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
});

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

    function createBuyablePen(centerPosition, penIndex) {
        const penGroup = new THREE.Group();
        penGroup.userData.isPen = true;
        penGroup.userData.penIndex = penIndex;
        penGroup.userData.hasAnimal = false;
        penGroup.userData.animalModel = null;

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

    // --- MEMUAT DINDING (UBAH POSISI UNTUK MENYESUAIKAN UKURAN DUNIA) ---
    // Ukuran dunia 50x50, jadi batasnya -25 sampai 25
    const worldSize = 50;
    const halfWorldSize = worldSize / 2;
    const wallThickness = 0.5; // Ketebalan dinding
    const wallHeightOffset = 0; // Sesuaikan jika wall model memiliki origin di bawah tanah

    const wallPositions = [
        // Dinding belakang (Z negatif)
        { pos: new THREE.Vector3(0, wallHeightOffset, -halfWorldSize + wallThickness), rot: 0 },
        // Dinding depan (Z positif)
        { pos: new THREE.Vector3(0, wallHeightOffset, halfWorldSize - wallThickness), rot: Math.PI },
        // Dinding kiri (X negatif)
        { pos: new THREE.Vector3(-halfWorldSize + wallThickness, wallHeightOffset, 0), rot: Math.PI / 2 },
        // Dinding kanan (X positif)
        { pos: new THREE.Vector3(halfWorldSize - wallThickness, wallHeightOffset, 0), rot: -Math.PI / 2 },
    ];

    // Karena model longwall.glb memiliki panjang yang signifikan,
    // kita perlu menempatkannya beberapa kali untuk menutupi seluruh sisi 50 unit.
    // Misalnya, jika panjang wall.glb adalah 15-20 unit (setelah scaling 2x),
    // kita butuh 2-3 buah per sisi.
    const wallModelLength = 20; // Perkiraan panjang model longwall.glb setelah scale 2x
    const numWallsPerSide = Math.ceil(worldSize / wallModelLength); // Hitung berapa banyak dinding yang dibutuhkan

    for (let i = 0; i < numWallsPerSide; i++) {
        const offset = i * wallModelLength - (worldSize / 2) + (wallModelLength / 2); // Hitung offset untuk menempatkan dinding
        
        loadWall(new THREE.Vector3(offset, wallHeightOffset, -halfWorldSize + wallThickness), 0); // Dinding belakang
        loadWall(new THREE.Vector3(offset, wallHeightOffset, halfWorldSize - wallThickness), Math.PI); // Dinding depan
        
        loadWall(new THREE.Vector3(-halfWorldSize + wallThickness, wallHeightOffset, offset), Math.PI / 2); // Dinding kiri
        loadWall(new THREE.Vector3(halfWorldSize - wallThickness, wallHeightOffset, offset), -Math.PI / 2); // Dinding kanan
    }


    // --- MEMUAT LANTAI, BACKGROUND, DAN CAHAYA ---
    const floorGeometry = new THREE.PlaneGeometry(worldSize, worldSize); // Ukuran lantai sesuai dunia
    const floorTexture = new THREE.TextureLoader().load('/Floor/grass.jpg', (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(worldSize / 5, worldSize / 5); }); // Sesuaikan repeat untuk lantai
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
    updateIncomeRateDisplay();
}

// BARU: Fungsi untuk membeli hewan
function buyAnimal() {
    if (animalsPurchasedCount >= pensPurchasedCount || animalsPurchasedCount >= TOTAL_PENS || playerMoney < ANIMAL_COST) {
        return;
    }

    const animalToBuy = animalData[currentAnimalIndexToBuy];
    if (!animalToBuy) {
        console.warn("No more animals to buy!");
        return;
    }

    const targetPen = penObjects.find(pen => pen && pen.visible && !pen.userData.hasAnimal);

    if (targetPen) {
        playerMoney -= ANIMAL_COST;
        updateCollectedMoneyDisplay();
        animateLeverPull(interactiveObjects.find(o => o.action === handlePenAnimalLeverAction)?.model);

        loader.load(animalToBuy.model, (gltf) => {
            const animal = gltf.scene;

            // Pastikan animal model memiliki bayangan
            animal.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            // Posisi hewan relatif terhadap kandang
            // Sesuaikan posisi Y berdasarkan offsetY dari animalData
            animal.position.set(0, animalToBuy.offsetY || 0, 0);
            animal.scale.set(animalToBuy.scale, animalToBuy.scale, animalToBuy.scale);
            animal.rotation.y = Math.random() * Math.PI * 2;
            targetPen.add(animal);

            worldOctree.fromGraphNode(animal); // Penting: Tambahkan hewan ke Octree untuk collision

            targetPen.userData.hasAnimal = true;
            targetPen.userData.animalModel = animal;

            animalsPurchasedCount++;
            currentAnimalIndexToBuy = (currentAnimalIndexToBuy + 1) % animalData.length;
            updateIncomeRateDisplay();
        },
        // Progress callback
        (xhr) => {
            console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded ' + animalToBuy.name );
        },
        // Error callback
        (error) => {
            console.error('Error loading animal model:', animalToBuy.model, error);
        });
    }
}

function handlePenAnimalLeverAction() {
    if (pensPurchasedCount === TOTAL_PENS && animalsPurchasedCount < TOTAL_PENS) {
        buyAnimal();
    }
    else if (pensPurchasedCount >= TOTAL_PENS) {
        buyAllTrees();
    } else {
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