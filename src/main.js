import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import TWEEN from '@tweenjs/tween.js';

// INIT===============================================

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

const container = document.getElementById('container');
// Pastikan elemen-elemen ini ada di index.html
const uncollectedMoneyDisplay = document.getElementById('uncollectedMoneyDisplay');
const collectedMoneyDisplay = document.getElementById('collectedMoneyDisplay');
const collectButton = document.getElementById('collectButton');
const shopPanel = document.getElementById('shopPanel');
const shopItemsContainer = document.getElementById('shopItems');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

window.addEventListener('resize', onWindowResize);

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// TYCOON MONEY SYSTEM ===============================================
let playerMoney = 0;
let uncollectedMoney = 0;
const purchasedRevenueSources = {}; // Object to store purchased animals and their count for revenue calculation

function updateCollectedMoneyDisplay() {
    if (collectedMoneyDisplay) { // Periksa keberadaan elemen
        collectedMoneyDisplay.innerText = `💵 ${playerMoney}`;
    }
}

function updateUncollectedMoneyDisplay() {
    if (uncollectedMoneyDisplay) { // Periksa keberadaan elemen
        uncollectedMoneyDisplay.innerText = `💰 ${Math.floor(uncollectedMoney)}`; // Bulatkan uncollected money
    }
}

function generateMoneyFromRevenueSources() {
    let totalIncome = 0;
    for (const animalType in purchasedRevenueSources) {
        const data = purchasedRevenueSources[animalType];
        const count = data.count;
        const baseIncome = data.baseIncome;
        // Income increases by 10% for each animal of the same type
        totalIncome += baseIncome * (1 + (count - 1) * 0.1);
    }
    uncollectedMoney += totalIncome;
    updateUncollectedMoneyDisplay();
}

function collectMoney() {
    if (uncollectedMoney > 0) {
        playerMoney += Math.floor(uncollectedMoney);
        uncollectedMoney = 0;
        updateCollectedMoneyDisplay();
        updateUncollectedMoneyDisplay();
        console.log(`Collected! Player Money: ${playerMoney}`);
        updateShopButtons();
    }
}

// Pastikan tombol collectButton sudah ada sebelum menambahkan event listener
if (collectButton) {
    collectButton.addEventListener('click', collectMoney);
}


// PLAYER CONTROLS & PHYSICS =========================================
const clock = new THREE.Clock();
const GRAVITY = 30;
const STEPS_PER_FRAME = 2;

const worldOctree = new Octree();

// Initial player spawn point inside the zoo, near the center path
// So player can immediately see paths and external fence, and open shop.
const playerCollider = new Capsule(new THREE.Vector3(0, 0.8, 0), new THREE.Vector3(0, 1.2, 0), 0.8);

const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();

let playerOnFloor = false;
const keyStates = {};

// Gate variables
let zooGate;
let isGateOpen = false;
let isGateAnimating = false;
let isShopOpen = false;

document.addEventListener('keydown', (event) => {
    keyStates[event.code] = true;

    if (event.code === 'KeyP' && zooGate && !isGateAnimating) {
        toggleGate();
    }
    if (event.code === 'KeyC') {
        collectMoney();
    }
    if (event.code === 'KeyB') {
        toggleShop();
    }
});

document.addEventListener('keyup', (event) => {
    keyStates[event.code] = false;
});

container.addEventListener('click', (event) => {
    // Only request pointer lock if shop is not open
    if (!isShopOpen && document.pointerLockElement !== document.body) {
        document.body.requestPointerLock();
    }
});

document.body.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === document.body) {
        camera.rotation.y -= event.movementX / 1000;
        camera.rotation.x -= event.movementY / 1000;
    }
});

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
    if (isShopOpen) {
        // Stop player movement when shop is open
        playerVelocity.set(0, 0, 0);
        return;
    }

    const speedDelta = deltaTime * (playerOnFloor ? 25 : 8);

    if (keyStates['KeyW']) {
        playerVelocity.add(getForwardVector().multiplyScalar(speedDelta));
    }

    if (keyStates['KeyS']) {
        playerVelocity.add(getForwardVector().multiplyScalar(-speedDelta));
    }

    if (keyStates['KeyA']) {
        playerVelocity.add(getSideVector().multiplyScalar(-speedDelta));
    }

    if (keyStates['KeyD']) {
        playerVelocity.add(getSideVector().multiplyScalar(speedDelta));
    }

    if (playerOnFloor) {
        if (keyStates['Space']) {
            playerVelocity.y = 10;
        }
    }
}

function teleportPlayerIfOob() {
    // If player falls below the world, reset to a safe position inside the zoo
    if (camera.position.y <= -25) {
        playerCollider.start.set(0, 0.8, 0); // Reset to center of zoo
        playerCollider.end.set(0, 1.2, 0);
        playerCollider.radius = 0.8;
        camera.position.copy(playerCollider.end);
        camera.rotation.set(0, 0, 0);
    }
}

const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const animalMixers = [];

// ZOO ASSET LOADING & TYCOON OBJECT MANAGEMENT ========================

function createTexturedPlane(width, depth, texturePath, repeatX, repeatY, position, rotationY = 0) {
    const geometry = new THREE.PlaneGeometry(width, depth);
    const texture = textureLoader.load(texturePath,
        () => {}, // On load
        undefined, // On progress
        (error) => { console.error(`Error loading texture ${texturePath}:`, error); }
    );
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    const material = new THREE.MeshPhongMaterial({ map: texture, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(geometry, material);
    plane.rotation.x = -Math.PI / 2;
    plane.rotation.y = rotationY;
    plane.position.set(position.x, position.y, position.z);
    plane.receiveShadow = true;
    plane.castShadow = true;
    scene.add(plane);
    worldOctree.fromGraphNode(plane);
    return plane;
}

function loadAndPlaceModel(path, scale, position, rotationY = 0) {
    return new Promise((resolve, reject) => {
        loader.load(path, function (gltf) {
            const model = gltf.scene;
            model.scale.set(scale.x, scale.y, scale.z);
            model.position.set(position.x, position.y, position.z);
            model.rotation.y = rotationY;
            model.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });
            scene.add(model);
            worldOctree.fromGraphNode(model);
            resolve(model);
        }, undefined, (error) => { // Error callback for GLTF loader
            console.error(`Error loading GLB model ${path}:`, error);
            reject(error);
        });
    });
}

async function placeAnimalEnclosure(
    type,
    animalPath,
    mainCagePath,
    animalScale,
    mainCageScale,
    animalPos,
    mainCagePos,
    floorType,
    woodFenceScale
) {
    try {
        const mainCage = await loadAndPlaceModel(mainCagePath, mainCageScale, mainCagePos);
        const animal = await loadAndPlaceModel(animalPath, animalScale, animalPos);

        // Add animal to revenue sources
        if (!purchasedRevenueSources[type]) {
            purchasedRevenueSources[type] = {
                count: 0,
                baseIncome: 10 // Base income per animal per interval
            };
        }
        purchasedRevenueSources[type].count++;


        let cageFloorTexturePath;
        let repeatFactor = 1;
        switch (floorType) {
            case 'grass': cageFloorTexturePath = '/Floor/grass.jpg'; repeatFactor = 0.5; break;
            case 'sand': cageFloorTexturePath = '/Floor/sand.jpg'; repeatFactor = 0.8; break;
            case 'tile': cageFloorTexturePath = '/Floor/tile.jpg'; repeatFactor = 0.5; break;
            default: cageFloorTexturePath = '/Floor/grass.jpg'; repeatFactor = 0.5;
        }
        const floorWidth = mainCageScale.x * 10;
        const floorDepth = mainCageScale.z * 10;
        createTexturedPlane(
            floorWidth, floorDepth,
            cageFloorTexturePath,
            floorWidth * repeatFactor, floorDepth * repeatFactor,
            new THREE.Vector3(mainCagePos.x, -0.01, mainCagePos.z)
        );

        // Create wooden fences around the cage
        const WOOD_FENCE_MODEL_LENGTH = 10; // This is the actual length of your fence_wood.glb model
        const halfCageWidth = (mainCageScale.x * WOOD_FENCE_MODEL_LENGTH) / 2;
        const halfCageDepth = (mainCageScale.z * WOOD_FENCE_MODEL_LENGTH) / 2;

        const fenceOffset = 0.5; // Small offset to prevent z-fighting with the main cage model

        // Helper to place single fence segment and handle collision
        const placeFenceSegment = async (x, z, rotationY) => {
            const fence = await loadAndPlaceModel('/Wall/fence_wood.glb', woodFenceScale, new THREE.Vector3(x, 0, z), rotationY);
            // Optionally, update collision for individual fences
            // For simplicity, worldOctree.fromGraphNode(scene) will update all at once
        };
        
        // Calculate the number of segments needed
        const numSegmentsX = Math.ceil(halfCageWidth * 2 / WOOD_FENCE_MODEL_LENGTH);
        const numSegmentsZ = Math.ceil(halfCageDepth * 2 / WOOD_FENCE_MODEL_LENGTH);

        // North side (along Z positive)
        for (let i = 0; i < numSegmentsX; i++) {
            const xPos = mainCagePos.x - halfCageWidth + (i * WOOD_FENCE_MODEL_LENGTH) + WOOD_FENCE_MODEL_LENGTH / 2;
            await placeFenceSegment(xPos, mainCagePos.z + halfCageDepth + fenceOffset, 0);
        }
        // South side (along Z negative)
        for (let i = 0; i < numSegmentsX; i++) {
            const xPos = mainCagePos.x - halfCageWidth + (i * WOOD_FENCE_MODEL_LENGTH) + WOOD_FENCE_MODEL_LENGTH / 2;
            await placeFenceSegment(xPos, mainCagePos.z - halfCageDepth - fenceOffset, 0);
        }
        // East side (along X positive)
        for (let i = 0; i < numSegmentsZ; i++) {
            const zPos = mainCagePos.z - halfCageDepth + (i * WOOD_FENCE_MODEL_LENGTH) + WOOD_FENCE_MODEL_LENGTH / 2;
            await placeFenceSegment(mainCagePos.x + halfCageWidth + fenceOffset, zPos, Math.PI / 2);
        }
        // West side (along X negative)
        for (let i = 0; i < numSegmentsZ; i++) {
            const zPos = mainCagePos.z - halfCageDepth + (i * WOOD_FENCE_MODEL_LENGTH) + WOOD_FENCE_MODEL_LENGTH / 2;
            await placeFenceSegment(mainCagePos.x - halfCageWidth - fenceOffset, zPos, -Math.PI / 2);
        }

        // If animal has animations
        if (animal.animations && animal.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(animal);
            const action = mixer.clipAction(animal.animations[0]);
            action.play();
            animalMixers.push(mixer);
        }

        // Rebuild octree after adding new objects
        worldOctree.fromGraphNode(scene);
        console.log(`${type} enclosure placed!`);

    } catch (error) {
        console.error(`Error placing ${type} enclosure:`, error);
    }
}


// TYCOON SHOP DEFINITION =============================================
const SHOP_ITEMS = [
    {
        id: 'buffalo_enclosure',
        name: 'Buffalo Enclosure',
        baseCost: 200,
        currentCost: 200, // Dynamic current cost
        purchasedCount: 0,
        type: 'animal_enclosure',
        placement: {
            animalPath: '/Animal/african_buffalo.glb',
            mainCagePath: '/Building/jail_cage.glb',
            animalScale: new THREE.Vector3(0.5, 0.5, 0.5),
            mainCageScale: new THREE.Vector3(1.5, 1.5, 1.5),
            floorType: 'grass',
            woodFenceScale: new THREE.Vector3(0.5, 0.5, 0.5),
        },
        nextPosition: new THREE.Vector3(-30, 0, -10), // Starting position for first buffalo cage
        positionOffset: new THREE.Vector3(0, 0, 25), // Move next cage 25 units on Z for new row
        maxItems: 5 // Example limit
    },
    {
        id: 'elephant_enclosure',
        name: 'Elephant Enclosure',
        baseCost: 300,
        currentCost: 300,
        purchasedCount: 0,
        type: 'animal_enclosure',
        placement: {
            animalPath: '/Animal/elephant.glb',
            mainCagePath: '/Building/jail_cage.glb',
            animalScale: new THREE.Vector3(0.08, 0.08, 0.08),
            mainCageScale: new THREE.Vector3(2.5, 2.5, 2.5),
            floorType: 'sand',
            woodFenceScale: new THREE.Vector3(0.5, 0.5, 0.5),
        },
        nextPosition: new THREE.Vector3(30, 0, -10),
        positionOffset: new THREE.Vector3(0, 0, 25),
        maxItems: 5
    },
    {
        id: 'giraffe_enclosure',
        name: 'Giraffe Enclosure',
        baseCost: 250,
        currentCost: 250,
        purchasedCount: 0,
        type: 'animal_enclosure',
        placement: {
            animalPath: '/Animal/giraffe.glb',
            mainCagePath: '/Building/jail_cage.glb',
            animalScale: new THREE.Vector3(0.02, 0.02, 0.02),
            mainCageScale: new THREE.Vector3(1.5, 1.5, 1.5),
            floorType: 'grass',
            woodFenceScale: new THREE.Vector3(0.5, 0.5, 0.5),
        },
        nextPosition: new THREE.Vector3(-10, 0, -30),
        positionOffset: new THREE.Vector3(25, 0, 0), // Move next on X
        maxItems: 5
    },
    {
        id: 'lion_enclosure',
        name: 'Lion Enclosure',
        baseCost: 280,
        currentCost: 280,
        purchasedCount: 0,
        type: 'animal_enclosure',
        placement: {
            animalPath: '/Animal/lion_lowpoly1.glb',
            mainCagePath: '/Building/jail_cage.glb',
            animalScale: new THREE.Vector3(0.05, 0.05, 0.05),
            mainCageScale: new THREE.Vector3(1.5, 1.5, 1.5),
            floorType: 'sand',
            woodFenceScale: new THREE.Vector3(0.5, 0.5, 0.5),
        },
        nextPosition: new THREE.Vector3(10, 0, -30),
        positionOffset: new THREE.Vector3(25, 0, 0),
        maxItems: 5
    },
    {
        id: 'pine_tree',
        name: 'Pine Tree',
        baseCost: 50,
        currentCost: 50,
        purchasedCount: 0,
        type: 'decoration',
        placement: {
            path: '/Building/pine_tree.glb',
            scale: new THREE.Vector3(0.05, 0.05, 0.05),
        },
        // For decorations, nextPosition is just a conceptual starting point, actual placement is randomized
        nextPosition: new THREE.Vector3(0, 0, 0),
        positionOffset: new THREE.Vector3(0, 0, 0),
        maxItems: 20
    }
    // Tambahkan hewan lain di sini jika diperlukan, dengan baseCost dan currentCost
];

function generateShopItems() {
    // Pastikan shopItemsContainer ada
    if (!shopItemsContainer) {
        console.error("Shop items container not found!");
        return;
    }
    shopItemsContainer.innerHTML = ''; // Clear previous items
    SHOP_ITEMS.forEach(item => {
        const displayCost = item.purchasedCount === 0 ? item.baseCost : item.currentCost;
        const disabled = playerMoney < displayCost || (item.maxItems && item.purchasedCount >= item.maxItems);

        const itemElement = document.createElement('div');
        itemElement.classList.add('shop-item');
        
        itemElement.innerHTML = `
            <span>${item.name} (Cost: 💵${displayCost}) (Owned: ${item.purchasedCount}${item.maxItems ? `/${item.maxItems}` : ''})</span>
            <button id="buy-${item.id}" ${disabled ? 'disabled' : ''}>Buy</button>
        `;
        shopItemsContainer.appendChild(itemElement);

        const buyButton = itemElement.querySelector(`#buy-${item.id}`);
        if (buyButton) { // Pastikan tombol ada sebelum menambahkan event listener
            buyButton.addEventListener('click', () => buyItem(item.id));
        }
    });
    updateShopButtons(); // Initial update
}

function updateShopButtons() {
    SHOP_ITEMS.forEach(item => {
        const button = document.getElementById(`buy-${item.id}`);
        if (button) {
            const displayCost = item.purchasedCount === 0 ? item.baseCost : item.currentCost;
            const disabled = playerMoney < displayCost || (item.maxItems && item.purchasedCount >= item.maxItems);
            button.disabled = disabled;
            button.parentElement.querySelector('span').innerText = `
                ${item.name} (Cost: 💵${displayCost}) (Owned: ${item.purchasedCount}${item.maxItems ? `/${item.maxItems}` : ''})
            `;
        }
    });
}

async function buyItem(itemId) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);

    if (!item) {
        console.error('Item not found:', itemId);
        return;
    }

    const currentPurchaseCost = item.purchasedCount === 0 ? item.baseCost : item.currentCost;

    if (playerMoney < currentPurchaseCost) {
        console.warn('Not enough money to buy', item.name);
        return;
    }
    if (item.maxItems && item.purchasedCount >= item.maxItems) {
        console.warn(`Max items reached for ${item.name}`);
        return;
    }

    playerMoney -= currentPurchaseCost;
    item.purchasedCount++; // Increment purchased count

    // Update current cost for next purchase
    item.currentCost = item.baseCost * (2 ** (item.purchasedCount)); // Double price for EACH purchase after base (so base * 2^0, base * 2^1, etc)

    updateCollectedMoneyDisplay();
    updateShopButtons();

    console.log(`Purchased ${item.name}! Remaining money: ${playerMoney}`);

    // Place the item in the world
    if (item.type === 'animal_enclosure') {
        const actualPosition = item.nextPosition.clone();
        await placeAnimalEnclosure(
            item.id, // type for income tracking
            item.placement.animalPath,
            item.placement.mainCagePath,
            item.placement.animalScale,
            item.placement.mainCageScale,
            actualPosition,
            actualPosition,
            item.placement.floorType,
            item.placement.woodFenceScale
        );
        // Update next position for the same item type
        item.nextPosition.add(item.positionOffset);

    } else if (item.type === 'decoration') {
        const randomX = (Math.random() * (ZOO_BOUNDS_X * 2 - 20)) - (ZOO_BOUNDS_X - 10);
        const randomZ = (Math.random() * (ZOO_BOUNDS_Z * 2 - 20)) - (ZOO_BOUNDS_Z - 10);
        const randomPosition = new THREE.Vector3(randomX, 0, randomZ);

        await loadAndPlaceModel(
            item.placement.path,
            item.placement.scale,
            randomPosition,
            Math.random() * Math.PI * 2
        );
    }
    worldOctree.fromGraphNode(scene);
}

function toggleShop() {
    isShopOpen = !isShopOpen;
    if (isShopOpen) {
        shopPanel.style.display = 'block';
        document.exitPointerLock();
    } else {
        shopPanel.style.display = 'none';
        // When closing shop, player might want to resume movement
        // We'll let the user click on the canvas to re-engage pointer lock
    }
}

// ZOO LAYOUT: Initial static elements (external fence, gate, main paths, map board)
const ZOO_BOUNDS_X = 40;
const ZOO_BOUNDS_Z = 40;
const FENCE_SEGMENT_LENGTH = 10;
const brickFenceScale = new THREE.Vector3(10, 10, 10);

// --- EXTERNAL ZOO FENCE AND GATE (Loaded at startup) ---
// North Fence (along Z positive)
for (let x = -ZOO_BOUNDS_X + FENCE_SEGMENT_LENGTH / 2; x < ZOO_BOUNDS_X; x += FENCE_SEGMENT_LENGTH) {
    if (x > -5 && x < 5) continue; // Skip area for gate
    loadAndPlaceModel('/Wall/simple_bricks_and_steel_fence.glb', brickFenceScale, new THREE.Vector3(x, 0, ZOO_BOUNDS_Z))
        .catch(e => console.error(`Error loading North Fence: ${e.message}`));
}
// South Fence
for (let x = -ZOO_BOUNDs_X + FENCE_SEGMENT_LENGTH / 2; x < ZOO_BOUNDS_X; x += FENCE_SEGMENT_LENGTH) {
    loadAndPlaceModel('/Wall/simple_bricks_and_steel_fence.glb', brickFenceScale, new THREE.Vector3(x, 0, -ZOO_BOUNDS_Z))
        .catch(e => console.error(`Error loading South Fence: ${e.message}`));
}
// East Fence
for (let z = -ZOO_BOUNDS_Z + FENCE_SEGMENT_LENGTH / 2; z < ZOO_BOUNDS_Z; z += FENCE_SEGMENT_LENGTH) {
    loadAndPlaceModel('/Wall/simple_bricks_and_steel_fence.glb', brickFenceScale, new THREE.Vector3(ZOO_BOUNDS_X, 0, z), Math.PI / 2)
        .catch(e => console.error(`Error loading East Fence: ${e.message}`));
}
// West Fence
for (let z = -ZOO_BOUNDS_Z + FENCE_SEGMENT_LENGTH / 2; z < ZOO_BOUNDS_Z; z += FENCE_SEGMENT_LENGTH) {
    loadAndPlaceModel('/Wall/simple_bricks_and_steel_fence.glb', brickFenceScale, new THREE.Vector3(-ZOO_BOUNDS_X, 0, z), -Math.PI / 2)
        .catch(e => console.error(`Error loading West Fence: ${e.message}`));
}

// Main Gate
loader.load('/Wall/gate.glb', function (gltf) {
    zooGate = gltf.scene;
    zooGate.scale.set(5, 5, 5); // Adjust gate scale
    zooGate.position.set(0, 0, ZOO_BOUNDS_Z); // Position at the center of the north fence
    scene.add(zooGate);
    worldOctree.fromGraphNode(zooGate);
}, undefined, (error) => { console.error('Error loading Gate model:', error); });

function toggleGate() {
    isGateAnimating = true;
    const currentPosition = zooGate.position.clone();
    const targetZ = isGateOpen ? ZOO_BOUNDS_Z : ZOO_BOUNDS_Z + 20;

    new TWEEN.Tween(currentPosition)
        .to({ z: targetZ }, 1000)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(() => {
            zooGate.position.copy(currentPosition);
        })
        .onComplete(() => {
            isGateOpen = !isGateOpen;
            isGateAnimating = false;
            worldOctree.fromGraphNode(scene); // Rebuild the entire octree
        })
        .start();
}


// --- ZOO GROUND AND PATHS (Loaded at startup) ---
const floorSize = ZOO_BOUNDS_X * 2 + 20;
const pathWidth = 8;

// Main Grass Area (background layer for the whole zoo)
createTexturedPlane(
    floorSize, floorSize,
    '/Floor/grass.jpg',
    floorSize / 5, floorSize / 5,
    new THREE.Vector3(0, -0.1, 0)
);

// Main Entry Path (from gate inwards)
createTexturedPlane(
    pathWidth, ZOO_BOUNDS_Z * 1.5,
    '/Floor/road.jpg',
    1, ZOO_BOUNDS_Z / 10,
    new THREE.Vector3(0, 0, ZOO_BOUNDS_Z / 2)
);

// Central North-South Path (inside the zoo)
createTexturedPlane(
    pathWidth, ZOO_BOUNDS_Z * 2 - pathWidth,
    '/Floor/road.jpg',
    1, (ZOO_BOUNDS_Z * 2 - pathWidth) / 10,
    new THREE.Vector3(0, 0, 0)
);

// Central East-West Path (inside the zoo)
createTexturedPlane(
    ZOO_BOUNDS_X * 2 - pathWidth, pathWidth,
    '/Floor/road.jpg',
    (ZOO_BOUNDS_X * 2 - pathWidth) / 10, 1,
    new THREE.Vector3(0, 0, 0)
);

// --- MAP BOARD (Loaded at startup) ---
loadMapBoard(new THREE.Vector3(10, 2, ZOO_BOUNDS_Z - 10), Math.PI / 4, new THREE.Vector3(0.1, 0.1, 0.1))
    .catch(e => console.error(`Error loading Map Board: ${e.message}`));


// BACKGROUND (Loaded at startup)
const backgroundGeometry = new THREE.SphereGeometry(500, 32, 32);
const backgroundTexture = textureLoader.load('/Background/langit.jpg', (texture) => {
    texture.encoding = THREE.sRGBEncoding;
}, undefined, (error) => { console.error('Error loading background texture:', error); });
const backgroundMaterial = new THREE.MeshBasicMaterial({
    map: backgroundTexture,
    side: THREE.BackSide
});
const backgroundMesh = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
backgroundMesh.position.set(0, 0, 0);
scene.add(backgroundMesh);

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
scene.background = new THREE.Color(0xa0a0a0);

// LIGHTING
const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(50, 100, 75);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 200;
directionalLight.shadow.camera.left = -50;
directionalLight.shadow.camera.right = 50;
directionalLight.shadow.camera.top = 50;
directionalLight.shadow.camera.bottom = -50;
scene.add(directionalLight);


function animate() {
    requestAnimationFrame(animate);

    const deltaTime = Math.min(0.05, clock.getDelta() * 1.15) / STEPS_PER_FRAME;

    for (let i = 0; i < STEPS_PER_FRAME; i++) {
        controls(deltaTime);
        updatePlayer(deltaTime);
        teleportPlayerIfOob();
    }

    animalMixers.forEach(mixer => mixer.update(deltaTime));

    TWEEN.update();
    renderer.render(scene, camera);
}

// Initial setup for the tycoon game
playerMoney = 500; // Starting money, adjust as needed
updateCollectedMoneyDisplay();
updateUncollectedMoneyDisplay();
setInterval(generateMoneyFromRevenueSources, 1000); // Generate income every second
generateShopItems(); // Populate the shop UI on startup

animate();