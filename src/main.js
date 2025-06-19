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
const PEN_COST = 10;
const TREES_COST = 1000;
let areTreesPurchased = false;

const uncollectedMoneyDisplay = document.getElementById('uncollectedMoneyDisplay');
const collectedMoneyDisplay = document.getElementById('collectedMoneyDisplay');
const incomeRateDisplay = document.getElementById('incomeRateDisplay');
const leverMessage = document.getElementById('leverMessage');

const GORILLA_SETTINGS = {
    offsetX: -4.5,
    offsetY: 0,
    offsetZ: 21.5,
    scale: 250
};

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

// Manajemen kandang
let pensPurchasedCount = 0;
const TOTAL_PENS = 9;
let penObjects = [];
let gorillaMixers = [];
const GORILLA_CAGE_INDEX = 0;

let giraffeMixers = [];
const GIRAFFE_CAGE_INDEX = 1;

const GIRAFFE_SETTINGS = {
    offsetX: 9,
    offsetY: 0,
    offsetZ: -38.5,
    scale: 200
};

let zebraMixers = [];
const ZEBRA_CAGE_INDEX = 2;

const ZEBRA_SETTINGS = {
    offsetX: 0,
    offsetY: 0,
    offsetZ: -3,
    scale: 130
};

let elephantMixers = [];
const ELEPHANT_CAGE_INDEX = 3;

let lionMixers = [];
const LION_CAGE_INDEX = 4;

let hippoMixers = [];
const HIPPOPOTAMUS_CAGE_INDEX = 5;

let buffaloMixers = [];
const AFRICAN_BUFFALO_CAGE_INDEX = 6;

let polarBearMixers = [];
const POLAR_BEAR_CAGE_INDEX = 7;

let rhinoMixers = [];
const RHINOCEROS_CAGE_INDEX = 8;

const ELEPHANT_SETTINGS = {
    offsetX: 0,
    offsetY: 0,
    offsetZ: 20,
    scale: 180
};

const LION_SETTINGS = {
    offsetX: 3,
    offsetY: 0,
    offsetZ: 15,
    scale: 2
};

const HIPPOPOTAMUS_SETTINGS = {
    offsetX: -2,
    offsetY: 0,
    offsetZ: 18,
    scale: 170
};

const AFRICAN_BUFFALO_SETTINGS = {
    offsetX: 4,
    offsetY: 0,
    offsetZ: 16,
    scale: 160
};

const POLAR_BEAR_SETTINGS = {
    offsetX: -3,
    offsetY: 0,
    offsetZ: 14,
    scale: 140
};

const RHINOCEROS_SETTINGS = {
    offsetX: 2,
    offsetY: 0,
    offsetZ: 19,
    scale: 190
};

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
    buildLeverModel = gltf.scene;
    buildLeverModel.scale.set(1, 1, 1);
    buildLeverModel.rotation.set(0, Math.PI / 2, 0);
    buildLeverModel.position.set(15, 0.7, -7);
    scene.add(buildLeverModel);

    interactiveObjects.push({
        model: buildLeverModel,
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

// TUAS PINTAR UNTUK KANDANG & POHON
loader.load('/Lever/lever.glb', function (gltf) {
    const penLever = gltf.scene;
    penLever.scale.set(1, 1, 1);
    penLever.rotation.set(0, Math.PI / 2, 0);
    penLever.position.set(15, 0.7, -5);
    scene.add(penLever);

    interactiveObjects.push({
        model: penLever,
        action: handlePenLeverAction,
        getDetails: () => {
            if (areTreesPurchased) {
                return { canInteract: false, message: 'Pengembangan Area Selesai', highlightColor: '#00ffaa' };
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
        { x: -10, z: 10, width: 18, depth: 18 }, 
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

// --- Fungsi Pemuatan Hewan ---
function loadAnimal(path, settings, mixers, position, name) {
    loader.load(path, (gltf) => {
        const animal = gltf.scene;
        const scale = settings.scale;
        animal.scale.set(scale, scale, scale);

        const finalPosition = position.clone().add(new THREE.Vector3(
            settings.offsetX,
            settings.offsetY,
            settings.offsetZ
        ));
        animal.position.copy(finalPosition);
        
        scene.add(animal);
        worldOctree.fromGraphNode(animal);

        const mixer = new THREE.AnimationMixer(animal);
        if (gltf.animations.length > 0) {
            const action = mixer.clipAction(gltf.animations[0]);
            action.play();
        }
        mixers.push(mixer);

    }, undefined, (error) => console.error(`Gagal memuat ${name}:`, error));
}

function loadGorilla(position) {
    loadAnimal('/Animal/gorilla.glb', GORILLA_SETTINGS, gorillaMixers, position, 'gorila');
}
function loadGiraffe(position) {
    loadAnimal('/Animal/giraffe.glb', GIRAFFE_SETTINGS, giraffeMixers, position, 'jerapah');
}
function loadZebra(position) {
    loadAnimal('/Animal/zebra.glb', ZEBRA_SETTINGS, zebraMixers, position, 'zebra');
}
function loadLion(position) {
    loadAnimal('/Animal/lion_lowpoly1.glb', LION_SETTINGS, lionMixers, position, 'singa');
}
function loadElephant(position) {
    loadAnimal('/Animal/elephant.glb', ELEPHANT_SETTINGS, elephantMixers, position, 'gajah');
}
function loadHippo(position) {
    loadAnimal('/Animal/hippopotamus.glb', HIPPOPOTAMUS_SETTINGS, hippoMixers, position, 'kuda nil');
}
function loadBuffalo(position) {
    loadAnimal('/Animal/african_buffalo.glb', AFRICAN_BUFFALO_SETTINGS, buffaloMixers, position, 'kerbau afrika');
}
function loadPolarBear(position) {
    loadAnimal('/Animal/polar_bear.glb', POLAR_BEAR_SETTINGS, polarBearMixers, position, 'beruang kutub');
}
function loadRhino(position) {
    loadAnimal('/Animal/rhinoceros.glb', RHINOCEROS_SETTINGS, rhinoMixers, position, 'badak');
}

function buyAllTrees() {
    if (areTreesPurchased || playerMoney < TREES_COST) {
        return;
    }
    playerMoney -= TREES_COST;
    updateCollectedMoneyDisplay();
    areTreesPurchased = true;
    animateLeverPull(interactiveObjects.find(o => o.action === handlePenLeverAction)?.model);
    placeTreesProcedurally(50);
    currentIncomeRate += 100;
    updateIncomeRateDisplay();
    saveGame();
}

function handlePenLeverAction() {
    if (pensPurchasedCount >= TOTAL_PENS) {
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
    animateLeverPull(interactiveObjects.find(o => o.action === handlePenLeverAction)?.model);

    const nextPen = penObjects[pensPurchasedCount];
    if (nextPen) {
        nextPen.visible = true;
        switch (pensPurchasedCount) {
            case GORILLA_CAGE_INDEX: loadGorilla(nextPen.position); break;
            case GIRAFFE_CAGE_INDEX: loadGiraffe(nextPen.position); break;
            case ZEBRA_CAGE_INDEX: loadZebra(nextPen.position); break;
            case ELEPHANT_CAGE_INDEX: loadElephant(nextPen.position); break;
            case LION_CAGE_INDEX: loadLion(nextPen.position); break;
            case HIPPOPOTAMUS_CAGE_INDEX: loadHippo(nextPen.position); break;
            case AFRICAN_BUFFALO_CAGE_INDEX: loadBuffalo(nextPen.position); break;
            case POLAR_BEAR_CAGE_INDEX: loadPolarBear(nextPen.position); break; // <-- PERBAIKAN DI SINI
            case RHINOCEROS_CAGE_INDEX: loadRhino(nextPen.position); break;
        }
    }
    pensPurchasedCount++;
    currentIncomeRate += incomePerPen;
    updateIncomeRateDisplay();
    saveGame();
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
        currentIncomeRate = baseIncome + penIncome;
        updateIncomeRateDisplay();
        
        buildingLevel++;

        if (buildLeverModel) {
            buildLeverModel.visible = false;
        }
        interactiveObjects = interactiveObjects.filter(obj => obj.action !== buildBuilding);
        activeInteraction = null;
        leverMessage.style.display = 'none';
        saveGame();
    }
}

function saveGame() {
    const saveData = {
        money: playerMoney,
        uncollected: uncollectedMoney,
        income: currentIncomeRate,
        buildingLvl: buildingLevel,
        pensBought: pensPurchasedCount,
        treesBought: areTreesPurchased
    };
    localStorage.setItem('tycoonGameSave', JSON.stringify(saveData));
    console.log('Game Saved!');
}

function loadGame() {
    const savedDataString = localStorage.getItem('tycoonGameSave');
    if (!savedDataString) {
        console.log('No save data found. Starting a new game.');
        return;
    }
    const savedData = JSON.parse(savedDataString);
    playerMoney = savedData.money;
    uncollectedMoney = savedData.uncollected;
    currentIncomeRate = savedData.income;
    buildingLevel = savedData.buildingLvl;
    pensPurchasedCount = savedData.pensBought;
    areTreesPurchased = savedData.treesBought;
    console.log('Game Loaded!');

    updateCollectedMoneyDisplay();
    updateUncollectedMoneyDisplay();
    updateIncomeRateDisplay();

    for (let i = 0; i < pensPurchasedCount; i++) {
        const penModel = penObjects[i];
        if (penModel) {
            penModel.visible = true;
            switch (i) {
                case GORILLA_CAGE_INDEX: loadGorilla(penModel.position); break;
                case GIRAFFE_CAGE_INDEX: loadGiraffe(penModel.position); break;
                case ZEBRA_CAGE_INDEX: loadZebra(penModel.position); break;
                case ELEPHANT_CAGE_INDEX: loadElephant(penModel.position); break;
                case LION_CAGE_INDEX: loadLion(penModel.position); break;
                case HIPPOPOTAMUS_CAGE_INDEX: loadHippo(penModel.position); break;
                case AFRICAN_BUFFALO_CAGE_INDEX: loadBuffalo(penModel.position); break;
                case POLAR_BEAR_CAGE_INDEX: loadPolarBear(penModel.position); break; // <-- PERBAIKAN DI SINI
                case RHINOCEROS_CAGE_INDEX: loadRhino(penModel.position); break;
            }
        }
    }
    if (buildingLevel >= 1) {
        if (buildLeverModel) {
            buildLeverModel.visible = false;
        }
        interactiveObjects = interactiveObjects.filter(obj => obj.action !== buildBuilding);
        loader.load(buildingTierModels[0], (gltf) => {
            const newBuilding = gltf.scene;
            newBuilding.position.set(-10, 0, 10);
            newBuilding.scale.set(2, 2, 2);
            scene.add(newBuilding);
            worldOctree.fromGraphNode(newBuilding);
            buildings[0] = newBuilding;
        });
    }
    if (areTreesPurchased) {
        placeTreesProcedurally(50);
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

    const delta = clock.getDelta(); // Ambil delta sekali saja untuk performa
    gorillaMixers.forEach(mixer => mixer.update(delta));
    elephantMixers.forEach(mixer => mixer.update(delta));
    lionMixers.forEach(mixer => mixer.update(delta));
    hippoMixers.forEach(mixer => mixer.update(delta));
    buffaloMixers.forEach(mixer => mixer.update(delta));
    polarBearMixers.forEach(mixer => mixer.update(delta)); // <-- PERBAIKAN DI SINI
    rhinoMixers.forEach(mixer => mixer.update(delta));
    giraffeMixers.forEach(mixer => mixer.update(delta));
    zebraMixers.forEach(mixer => mixer.update(delta));

    updateInteractions();
    TWEEN.update();
    renderer.render(scene, camera);
}

// Inisialisasi Tampilan Uang & Generator
updateCollectedMoneyDisplay();
updateUncollectedMoneyDisplay();
updateIncomeRateDisplay();
setInterval(generateMoney, 1000);

// Untuk memulai, Anda bisa uncomment loadGame() jika ingin memuat progres,
// atau biarkan untuk memulai game baru.
// loadGame();

// Panggil `loadGame` setelah objek kandang dibuat untuk memastikan `penObjects` sudah terisi
// Namun, karena `createBuyablePen` dipanggil secara sinkron, pemanggilan di sini aman.
loadGame();


// Mulai Loop Animasi
animate();

