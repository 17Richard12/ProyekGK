import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import TWEEN from '@tweenjs/tween.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// INIT===============================================

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

const container = document.getElementById('container');
const uncollectedMoneyDisplay = document.getElementById('uncollectedMoneyDisplay');
const collectedMoneyDisplay = document.getElementById('collectedMoneyDisplay');
const collectButton = document.getElementById('collectButton');
const leverMessage = document.getElementById('leverMessage');
const affordMessage = document.getElementById('affordMessage'); // Get the afford message element

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0px';
labelRenderer.domElement.style.pointerEvents = 'none'; // Allow clicks to pass through
document.body.appendChild(labelRenderer.domElement);


window.addEventListener('resize', onWindowResize);

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
}

// TYCOON MONEY SYSTEM ===============================================
let playerMoney = 0;
let uncollectedMoney = 0;
const purchasedRevenueSources = {}; // Ini masih digunakan untuk menghitung pendapatan hewan

function updateCollectedMoneyDisplay() {
    if (collectedMoneyDisplay) {
        collectedMoneyDisplay.innerText = `💵 ${playerMoney}`;
    }
}

function updateUncollectedMoneyDisplay() {
    if (uncollectedMoneyDisplay) {
        // Tampilkan playerMoney di collectedMoneyDisplay, dan uncollected di uncollectedMoneyDisplay
        collectedMoneyDisplay.innerText = `💵 ${playerMoney}`; 
        uncollectedMoneyDisplay.innerText = `💰 ${Math.floor(uncollectedMoney)}`;
    }
}

// Fungsi pendapatan dari lever
const LEVER_INCOME_PER_PULL = 50; // Uang yang didapat setiap kali tuas ditarik
let isLeverPulling = false; // Mencegah tuas ditarik berulang kali saat animasi

function pullLever() {
    if (isLeverPulling) return;

    isLeverPulling = true;
    uncollectedMoney += LEVER_INCOME_PER_PULL;
    updateUncollectedMoneyDisplay();
    console.log(`Lever pulled! Uncollected Money: ${uncollectedMoney}`);

    // Animate the lever pull
    // Pastikan `lever` sudah dimuat sebelum dianimasikan
    if (lever) {
        const initialRotation = lever.rotation.clone();
        const targetRotation = lever.rotation.clone();
        targetRotation.x += Math.PI / 4; // Rotate the lever forward (adjust value if needed)

        new TWEEN.Tween(lever.rotation)
            .to({ x: targetRotation.x }, 200) // Pull forward
            .easing(TWEEN.Easing.Quadratic.Out)
            .onComplete(() => {
                new TWEEN.Tween(lever.rotation)
                    .to({ x: initialRotation.x }, 200) // Return to original position
                    .easing(TWEEN.Easing.Quadratic.In)
                    .onComplete(() => {
                        isLeverPulling = false;
                    })
                    .start();
            })
            .start();
    } else {
        isLeverPulling = false; // Reset if lever not loaded
        console.warn("Lever model not loaded yet, cannot pull.");
    }
}


function collectMoney() {
    if (uncollectedMoney > 0) {
        playerMoney += Math.floor(uncollectedMoney);
        uncollectedMoney = 0;
        updateCollectedMoneyDisplay();
        updateUncollectedMoneyDisplay();
        console.log(`Collected! Player Money: ${playerMoney}`);
        updateBuildZoneButtons(); // Update buttons after collecting money
    }
}

if (collectButton) {
    collectButton.addEventListener('click', collectMoney);
}

// UI Message Function
let affordMessageTimeout;
function showAffordMessage() {
    if (affordMessage) {
        // Reset animation by re-adding class
        affordMessage.classList.remove('fadeOut');
        void affordMessage.offsetWidth; // Trigger reflow to restart animation
        affordMessage.classList.add('fadeOut');

        affordMessage.style.display = 'block';
        clearTimeout(affordMessageTimeout);
        affordMessageTimeout = setTimeout(() => {
            affordMessage.style.display = 'none';
        }, 3000); // Hide after 3 seconds (matches animation duration)
    }
}


// PLAYER CONTROLS & PHYSICS =========================================
const clock = new THREE.Clock();
const GRAVITY = 30;
const STEPS_PER_FRAME = 2;

const worldOctree = new Octree();

// --- Spawn Point Coordinates ---
const SPAWN_POINT_X = 0;
const SPAWN_POINT_Z = 0;
const SPAWN_POINT_Y_CAPSULE_BOTTOM = 0.8; // Player's feet position
const playerCollider = new Capsule(
    new THREE.Vector3(SPAWN_POINT_X, SPAWN_POINT_Y_CAPSULE_BOTTOM, SPAWN_POINT_Z),
    new THREE.Vector3(SPAWN_POINT_X, SPAWN_POINT_Y_CAPSULE_BOTTOM + 0.4, SPAWN_POINT_Z), // Top of capsule
    0.8 // Radius
);


const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();

let playerOnFloor = false;
const keyStates = {};

// Lever variables
let lever; // Global variable for the lever model
let table; // Global variable for the table model
let isLeverHighlighted = false; // For showing the "Press F" message
const raycaster = new THREE.Raycaster();
const interactDistance = 3; // Distance to interact with lever

document.addEventListener('keydown', (event) => {
    keyStates[event.code] = true;

    if (event.code === 'KeyC') {
        collectMoney();
    }

    if (event.code === 'KeyF' && isLeverHighlighted) {
        pullLever();
    }
});

document.addEventListener('keyup', (event) => {
    keyStates[event.code] = false;
});

container.addEventListener('click', (event) => {
    if (document.pointerLockElement !== document.body) {
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
    camera.position.y += 0.6; // Adjust camera height for player view
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
    if (camera.position.y <= -25) {
        // Reset to spawn point
        playerCollider.start.set(SPAWN_POINT_X, SPAWN_POINT_Y_CAPSULE_BOTTOM, SPAWN_POINT_Z);
        playerCollider.end.set(SPAWN_POINT_X, SPAWN_POINT_Y_CAPSULE_BOTTOM + 0.4, SPAWN_POINT_Z);
        playerCollider.radius = 0.8;
        camera.position.copy(playerCollider.end);
        camera.rotation.set(0, 0, 0);
    }
}

// ====================================================================
// LEVER INTERACTION LOGIC
// ====================================================================
function checkLeverInteraction() {
    if (!lever) return;

    const playerWorldPos = new THREE.Vector3();
    playerCollider.getCenter(playerWorldPos);

    const leverWorldPos = new THREE.Vector3();
    lever.getWorldPosition(leverWorldPos);

    const distance = playerWorldPos.distanceTo(leverWorldPos);

    raycaster.setFromCamera(new THREE.Vector2(0,0), camera);

    const intersects = raycaster.intersectObject(lever, true);

    if (distance < interactDistance && intersects.length > 0) {
        if (!isLeverHighlighted) {
            highlightLever(true);
            if (leverMessage) leverMessage.style.display = 'block';
            isLeverHighlighted = true;
        }
    } else {
        if (isLeverHighlighted) {
            highlightLever(false);
            if (leverMessage) leverMessage.style.display = 'none';
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


const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const animalMixers = [];

// ZOO ASSET LOADING & TYCOON OBJECT MANAGEMENT ========================

function createTexturedPlane(width, depth, texturePath, repeatX, repeatY, position, rotationY = 0) {
    const geometry = new THREE.PlaneGeometry(width, depth);
    const texture = textureLoader.load(texturePath,
        () => {},
        undefined,
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
        }, undefined, (error) => {
            console.error(`Error loading GLB model ${path}:`, error);
            reject(error);
        });
    });
}

async function createWoodenFenceAroundArea(centerX, centerZ, cageWidth, cageDepth, woodFenceScale) {
    const WOOD_FENCE_MODEL_LENGTH = 10;
    const halfCageWidth = cageWidth / 2;
    const halfCageDepth = cageDepth / 2;
    const fenceOffset = 0.5;

    const placeFenceSegment = async (x, z, rotationY) => {
        await loadAndPlaceModel('/Wall/fence_wood.glb', woodFenceScale, new THREE.Vector3(x, 0, z), rotationY);
    };
    
    const numSegmentsX = Math.ceil(cageWidth / WOOD_FENCE_MODEL_LENGTH);
    const numSegmentsZ = Math.ceil(cageDepth / WOOD_FENCE_MODEL_LENGTH);

    // North side (along Z positive)
    for (let i = 0; i < numSegmentsX; i++) {
        const xPos = centerX - halfCageWidth + (i * WOOD_FENCE_MODEL_LENGTH) + WOOD_FENCE_MODEL_LENGTH / 2;
        await placeFenceSegment(xPos, centerZ + halfCageDepth + fenceOffset, 0);
    }
    // South side (along Z negative)
    for (let i = 0; i < numSegmentsX; i++) {
        const xPos = centerX - halfCageWidth + (i * WOOD_FENCE_MODEL_LENGTH) + WOOD_FENCE_MODEL_LENGTH / 2;
        await placeFenceSegment(xPos, centerZ - halfCageDepth - fenceOffset, 0);
    }
    // East side (along X positive)
    for (let i = 0; i < numSegmentsZ; i++) {
        const zPos = centerZ - halfCageDepth + (i * WOOD_FENCE_MODEL_LENGTH) + WOOD_FENCE_MODEL_LENGTH / 2;
        await placeFenceSegment(centerX + halfCageWidth + fenceOffset, zPos, Math.PI / 2);
    }
    // West side (along X negative)
    for (let i = 0; i < numSegmentsZ; i++) {
        const zPos = centerZ - halfCageDepth + (i * WOOD_FENCE_MODEL_LENGTH) + WOOD_FENCE_MODEL_LENGTH / 2;
        await placeFenceSegment(centerX - halfCageWidth - fenceOffset, zPos, -Math.PI / 2);
    }
}


// TYCOON BUILD ZONE MANAGEMENT ========================================

const BUILD_ZONES = [
    {
        id: 'zone1',
        position: new THREE.Vector3(-30, 0, -10),
        status: 'empty', // 'empty', 'cage_purchased', 'animal_purchased'
        currentPriceMultiplier: 0, // 2^0 = 1 (base price), 2^1 = 2 (double price), etc.
        button: null, // CSS2DObject for the button
        cageData: {
            name: 'Buffalo Cage', // Used for display and income key
            baseCost: 200,
            animalPath: '/Animal/african_buffalo.glb',
            mainCagePath: '/Building/jail_cage.glb',
            animalScale: new THREE.Vector3(0.5, 0.5, 0.5),
            mainCageScale: new THREE.Vector3(1.5, 1.5, 1.5), // This implies a 15x15 unit cage area (1.5 * 10)
            floorType: 'grass',
            woodFenceScale: new THREE.Vector3(0.5, 0.5, 0.5),
            baseIncome: 10, // Base income per animal
            maxAnimals: 3 // Max animals for this cage
        }
    },
    {
        id: 'zone2',
        position: new THREE.Vector3(30, 0, -10),
        status: 'empty',
        currentPriceMultiplier: 0,
        button: null,
        cageData: {
            name: 'Elephant Cage',
            baseCost: 300,
            animalPath: '/Animal/elephant.glb',
            mainCagePath: '/Building/jail_cage.glb',
            animalScale: new THREE.Vector3(0.08, 0.08, 0.08),
            mainCageScale: new THREE.Vector3(2.5, 2.5, 2.5), // This implies a 25x25 unit cage area (2.5 * 10)
            floorType: 'sand',
            woodFenceScale: new THREE.Vector3(0.5, 0.5, 0.5),
            baseIncome: 15,
            maxAnimals: 2 // Elephants might take more space
        }
    },
    {
        id: 'zone3',
        position: new THREE.Vector3(-10, 0, -30),
        status: 'empty',
        currentPriceMultiplier: 0,
        button: null,
        cageData: {
            name: 'Giraffe Cage',
            baseCost: 250,
            animalPath: '/Animal/giraffe.glb',
            mainCagePath: '/Building/jail_cage.glb',
            animalScale: new THREE.Vector3(0.02, 0.02, 0.02),
            mainCageScale: new THREE.Vector3(1.5, 1.5, 1.5),
            floorType: 'grass',
            woodFenceScale: new THREE.Vector3(0.5, 0.5, 0.5),
            baseIncome: 12,
            maxAnimals: 3
        }
    },
    {
        id: 'zone4',
        position: new THREE.Vector3(10, 0, -30),
        status: 'empty',
        currentPriceMultiplier: 0,
        button: null,
        cageData: {
            name: 'Lion Cage',
            baseCost: 280,
            animalPath: '/Animal/lion_lowpoly1.glb',
            mainCagePath: '/Building/jail_cage.glb',
            animalScale: new THREE.Vector3(0.05, 0.05, 0.05),
            mainCageScale: new THREE.Vector3(1.5, 1.5, 1.5),
            floorType: 'sand',
            woodFenceScale: new THREE.Vector3(0.5, 0.5, 0.5),
            baseIncome: 13,
            maxAnimals: 2
        }
    },
    {
        id: 'zone5',
        position: new THREE.Vector3(-30, 0, 10),
        status: 'empty',
        currentPriceMultiplier: 0,
        button: null,
        cageData: {
            name: 'Gorilla Cage',
            baseCost: 220,
            animalPath: '/Animal/gorilla.glb',
            mainCagePath: '/Building/jail_cage.glb',
            animalScale: new THREE.Vector3(0.05, 0.05, 0.05),
            mainCageScale: new THREE.Vector3(1.2, 1.2, 1.2),
            floorType: 'tile',
            woodFenceScale: new THREE.Vector3(0.5, 0.5, 0.5),
            baseIncome: 11,
            maxAnimals: 3
        }
    }
];

const WOOD_FENCE_UNIT_SCALE_MULTIPLIER = 10;

// Initialize build zone buttons
function initializeBuildZones() {
    BUILD_ZONES.forEach(zone => {
        const buttonDiv = document.createElement('div');
        buttonDiv.className = 'build-button hidden';
        buttonDiv.style.pointerEvents = 'auto';
        
        const buttonObject = new CSS2DObject(buttonDiv);
        buttonObject.position.set(zone.position.x, zone.position.y + 1, zone.position.z);
        scene.add(buttonObject);
        zone.button = buttonObject;

        buttonDiv.addEventListener('click', () => {
            handleBuildZoneClick(zone.id);
        });
        
        // Atur harga awal untuk pembelian pertama
        zone.currentCost = zone.cageData.baseCost; 
    });
}

function updateBuildZoneButtons() {
    BUILD_ZONES.forEach(zone => {
        const buttonDiv = zone.button.element;
        let buttonText = '';
        let isDisabled = false;
        let costToDisplay = 0;

        if (zone.status === 'empty') {
            costToDisplay = zone.cageData.baseCost * (2 ** zone.currentPriceMultiplier);
            buttonText = `Buy ${zone.cageData.name} (💵${costToDisplay})`;
            isDisabled = playerMoney < costToDisplay;
            zone.currentCost = costToDisplay;
        } else { // cage_purchased or animal_purchased (for buying animals)
            const animalName = zone.cageData.name.replace(' Cage', '');
            const animalCount = (purchasedRevenueSources[animalName] ? purchasedRevenueSources[animalName].count : 0);

            if (animalCount < zone.cageData.maxAnimals) {
                costToDisplay = zone.cageData.baseCost * (2 ** animalCount);
                buttonText = `Add ${animalName} (💵${costToDisplay})`;
                isDisabled = playerMoney < costToDisplay;
                zone.currentCost = costToDisplay;
            } else {
                buttonText = `${animalName} MAXED!`;
                isDisabled = true;
                zone.currentCost = Infinity;
            }
        }

        buttonDiv.innerText = buttonText;
        buttonDiv.disabled = isDisabled;

        const distanceToPlayer = camera.position.distanceTo(zone.position);
        if (distanceToPlayer < 15 && !isDisabled) {
             buttonDiv.classList.remove('hidden');
             buttonDiv.style.pointerEvents = 'auto';
        } else {
             buttonDiv.classList.add('hidden');
             buttonDiv.style.pointerEvents = 'none';
        }
    });
}

async function handleBuildZoneClick(zoneId) {
    const zone = BUILD_ZONES.find(z => z.id === zoneId);
    if (!zone || zone.button.element.disabled) return;

    const cost = zone.currentCost;

    if (playerMoney < cost) {
        showAffordMessage(); // Tampilkan pesan tidak cukup uang
        console.warn(`You can't afford this! Need 💵${cost - playerMoney} more.`);
        return;
    }

    playerMoney -= cost;
    updateCollectedMoneyDisplay();

    if (zone.status === 'empty') {
        // Buy Cage
        await loadAndPlaceModel(
            zone.cageData.mainCagePath,
            zone.cageData.mainCageScale,
            zone.position
        );
        await createWoodenFenceAroundArea(
            zone.position.x, zone.position.z,
            zone.cageData.mainCageScale.x * WOOD_FENCE_UNIT_SCALE_MULTIPLIER,
            zone.cageData.mainCageScale.z * WOOD_FENCE_UNIT_SCALE_MULTIPLIER,
            zone.cageData.woodFenceScale
        );
        createTexturedPlane(
            zone.cageData.mainCageScale.x * WOOD_FENCE_UNIT_SCALE_MULTIPLIER,
            zone.cageData.mainCageScale.z * WOOD_FENCE_UNIT_SCALE_MULTIPLIER,
            `/Floor/${zone.cageData.floorType}.jpg`,
            zone.cageData.mainCageScale.x * 0.5,
            zone.cageData.mainCageScale.z * 0.5,
            new THREE.Vector3(zone.position.x, -0.01, zone.position.z)
        );
        zone.status = 'cage_purchased';
        zone.currentPriceMultiplier++; // Increment multiplier for next purchase (animal)
        console.log(`${zone.cageData.name} purchased and placed!`);

    } else if (zone.status === 'cage_purchased' || zone.status === 'animal_purchased') {
        // Buy Animal
        const animalName = zone.cageData.name.replace(' Cage', '');
        await loadAndPlaceModel(
            zone.cageData.animalPath,
            zone.cageData.animalScale,
            zone.position // Place animal at cage center
        );
        
        // Add animal to revenue sources
        if (!purchasedRevenueSources[animalName]) {
            purchasedRevenueSources[animalName] = {
                count: 0,
                baseIncome: zone.cageData.baseIncome
            };
        }
        purchasedRevenueSources[animalName].count++;
        // Update the price multiplier for the next animal purchase in this zone
        zone.currentPriceMultiplier++; // Increment multiplier for next animal (if any)

        if (purchasedRevenueSources[animalName].count >= zone.cageData.maxAnimals) {
            zone.status = 'animal_purchased'; // All animals for this cage are purchased
            console.log(`${animalName} MAXED OUT in ${zone.cageData.name}!`);
        } else {
            zone.status = 'cage_purchased';
        }
        console.log(`${animalName} purchased and placed in ${zone.cageData.name}!`);
    }
    
    worldOctree.fromGraphNode(scene);
    updateBuildZoneButtons();
}

// ZOO LAYOUT: Initial static elements
const ZOO_BOUNDS_X = 40;
const ZOO_BOUNDS_Z = 40;

// --- SPAWN POINT AREA ---
const SPAWN_AREA_WIDTH = 20; // Lebar area ubin spawn
const SPAWN_AREA_DEPTH = 20; // Kedalaman area ubin spawn
const SPAWN_FLOOR_Y = -0.01; // Sedikit di bawah objek agar tidak z-fighting

// Lantai ubin untuk spawn point
createTexturedPlane(
    SPAWN_AREA_WIDTH, SPAWN_AREA_DEPTH,
    '/Floor/tile.jpg',
    SPAWN_AREA_WIDTH / 5, SPAWN_AREA_DEPTH / 5,
    new THREE.Vector3(SPAWN_POINT_X, SPAWN_FLOOR_Y, SPAWN_POINT_Z)
);

// Load Table and Lever at Spawn Point
const TABLE_POS_X = SPAWN_POINT_X;
const TABLE_POS_Z = SPAWN_POINT_Z;
const TABLE_SCALE = new THREE.Vector3(0.02, 0.02, 0.02);
const LEVER_POS_Y_ON_TABLE = 0.7; // Posisi Y tuas relatif terhadap lantai

loader.load('/Lever/table.glb', function (gltf) {
    table = gltf.scene;
    table.scale.copy(TABLE_SCALE);
    table.rotation.set(0, Math.PI / 2, 0);
    table.position.set(TABLE_POS_X, 0, TABLE_POS_Z); // Meja di tengah area spawn
    scene.add(table);
    worldOctree.fromGraphNode(table);
}, undefined, (error) => { console.error('Error loading Table model:', error); });

loader.load('/Lever/lever.glb', function (gltf) {
    lever = gltf.scene;
    lever.scale.set(1, 1, 1); // Skala tuas
    lever.rotation.set(0, Math.PI / 2, 0);
    lever.position.set(TABLE_POS_X, LEVER_POS_Y_ON_TABLE, TABLE_POS_Z); // Tuas di atas meja
    scene.add(lever);
    worldOctree.fromGraphNode(lever);
}, undefined, (error) => { console.error('Error loading Lever model:', error); });


// --- ZOO GROUND AND PATHS ---
// Posisi pusat zoo relatif terhadap spawn point
const ZOO_CENTER_X = 0;
const ZOO_CENTER_Z = 0; // Spawn point juga di (0,0,0)

const floorSize = ZOO_BOUNDS_X * 2 + 20;
const pathWidth = 8;

// Main Grass Area (melingkupi seluruh area kebun binatang, tidak termasuk spawn area)
// Kita akan membuat area rumput besar di sekitar spawn point
createTexturedPlane(
    floorSize, floorSize,
    '/Floor/grass.jpg',
    floorSize / 5, floorSize / 5,
    new THREE.Vector3(ZOO_CENTER_X, -0.01, ZOO_CENTER_Z) // Posisi tengah kebun binatang
);

// Jalan utama N-S dan E-W
// Posisi jalan disesuaikan agar tidak tumpang tindih dengan spawn area (atau lewatinya)
createTexturedPlane(
    pathWidth, floorSize, // N-S path
    '/Floor/road.jpg',
    1, floorSize / 10,
    new THREE.Vector3(ZOO_CENTER_X, 0, ZOO_CENTER_Z)
);
createTexturedPlane(
    floorSize, pathWidth, // E-W path
    '/Floor/road.jpg',
    floorSize / 10, 1,
    new THREE.Vector3(ZOO_CENTER_X, 0, ZOO_CENTER_Z)
);

// --- Menempatkan Pohon-pohon di area kebun binatang ---
// Kita akan menempatkan pohon di area rumput, bukan di jalan atau spawn area
// Posisi acak di luar area spawn dan di dalam batas zoo
function placeRandomTree(treePath, scale) {
    const maxAttempt = 50; // Max attempts to find a good spot
    for(let i = 0; i < maxAttempt; i++) {
        const randomX = (Math.random() * (ZOO_BOUNDS_X * 2 - 20)) - (ZOO_BOUNDS_X - 10);
        const randomZ = (Math.random() * (ZOO_BOUNDS_Z * 2 - 20)) - (ZOO_BOUNDS_Z - 10);
        const testPos = new THREE.Vector3(randomX, 0, randomZ);

        // Avoid placing trees directly on the main paths or spawn area
        const isInSpawnArea = (randomX > SPAWN_POINT_X - SPAWN_AREA_WIDTH/2 && randomX < SPAWN_POINT_X + SPAWN_AREA_WIDTH/2 &&
                              randomZ > SPAWN_POINT_Z - SPAWN_AREA_DEPTH/2 && randomZ < SPAWN_POINT_Z + SPAWN_AREA_DEPTH/2);
        
        const isInMainPathX = (randomX > ZOO_CENTER_X - pathWidth/2 && randomX < ZOO_CENTER_X + pathWidth/2);
        const isInMainPathZ = (randomZ > ZOO_CENTER_Z - pathWidth/2 && randomZ < ZOO_CENTER_Z + pathWidth/2);

        if (!isInSpawnArea && !(isInMainPathX || isInMainPathZ)) {
            loadAndPlaceModel(treePath, scale, testPos, Math.random() * Math.PI * 2)
                .catch(e => console.error(`Error loading tree ${treePath}: ${e.message}`));
            return; // Placed one tree, exit
        }
    }
    console.warn(`Could not find a suitable spot for a tree of type ${treePath}.`);
}

// Place multiple trees
for(let i = 0; i < 15; i++) placeRandomTree('/Building/pine_tree.glb', new THREE.Vector3(0.05, 0.05, 0.05));
for(let i = 0; i < 10; i++) placeRandomTree('/Building/oak_trees.glb', new THREE.Vector3(0.01, 0.01, 0.01));
for(let i = 0; i < 8; i++) placeRandomTree('/Building/stylized_tree.glb', new THREE.Vector3(0.005, 0.005, 0.005));


// --- MAP BOARD (Loaded at startup) ---
// Posisi relatif terhadap pusat kebun binatang
loadAndPlaceModel('/Wall/note_board_-mb.glb', new THREE.Vector3(0.1, 0.1, 0.1), new THREE.Vector3(10, 2, ZOO_BOUNDS_Z - 10), Math.PI / 4)
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

    checkLeverInteraction(); // Check for lever interaction every frame
    updateBuildZoneButtons(); // Update button visibility/state every frame

    TWEEN.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera); // Render CSS2D elements
}

// Initial setup for the tycoon game
playerMoney = 0; // Mulai dengan uang 0
uncollectedMoney = 0; // Uang dari lever dimulai dari 0
updateCollectedMoneyDisplay();
updateUncollectedMoneyDisplay();
// Tidak ada lagi setInterval untuk generateMoneyFromRevenueSources, income hanya dari lever
initializeBuildZones();

animate();