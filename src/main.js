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
// shopPanel dan shopItemsContainer tidak lagi digunakan karena UI toko kini berbasis 3D tombol
// const shopPanel = document.getElementById('shopPanel');
// const shopItemsContainer = document.getElementById('shopItems');

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
const purchasedRevenueSources = {};

function updateCollectedMoneyDisplay() {
    if (collectedMoneyDisplay) {
        collectedMoneyDisplay.innerText = `💵 ${playerMoney}`;
    }
}

function updateUncollectedMoneyDisplay() {
    if (uncollectedMoneyDisplay) {
        uncollectedMoneyDisplay.innerText = `💰 ${Math.floor(uncollectedMoney)}`;
    }
}

function generateMoneyFromRevenueSources() {
    let totalIncome = 0;
    for (const animalType in purchasedRevenueSources) {
        const data = purchasedRevenueSources[animalType];
        const count = data.count;
        const baseIncome = data.baseIncome;
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
        updateBuildZoneButtons();
    }
}

if (collectButton) {
    collectButton.addEventListener('click', collectMoney);
}


// PLAYER CONTROLS & PHYSICS =========================================
const clock = new THREE.Clock();
const GRAVITY = 30;
const STEPS_PER_FRAME = 2;

const worldOctree = new Octree();

// Player spawn point
const playerCollider = new Capsule(new THREE.Vector3(0, 0.8, 0), new THREE.Vector3(0, 1.2, 0), 0.8);

const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();

let playerOnFloor = false;
const keyStates = {};

// Gate variables (Zoo gate is removed from rendering, but variables remain for conceptual if needed later)
let zooGate = null; // Set to null as it's removed
let isGateOpen = false; // Not used without a gate
let isGateAnimating = false; // Not used without a gate

document.addEventListener('keydown', (event) => {
    keyStates[event.code] = true;

    // Tombol 'P' untuk gerbang tidak lagi berfungsi
    // if (event.code === 'KeyP' && zooGate && !isGateAnimating) {
    //     toggleGate();
    // }
    if (event.code === 'KeyC') {
        collectMoney();
    }
    // Tombol 'B' untuk shop panel tidak lagi digunakan
    // if (event.code === 'KeyB') {
    //     toggleShop();
    // }
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
    // Tidak ada lagi panel shop yang perlu menonaktifkan kontrol
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
        }, undefined, (error) => {
            console.error(`Error loading GLB model ${path}:`, error);
            reject(error);
        });
    });
}

// Helper to create wooden fences around a given central point for a cage
async function createWoodenFenceAroundArea(centerX, centerZ, cageWidth, cageDepth, woodFenceScale) {
    const WOOD_FENCE_MODEL_LENGTH = 10; // This is the approximate length of your fence_wood.glb model
    const halfCageWidth = cageWidth / 2;
    const halfCageDepth = cageDepth / 2;
    const fenceOffset = 0.5; // Small offset to prevent z-fighting with the main cage model or floor

    const placeFenceSegment = async (x, z, rotationY) => {
        await loadAndPlaceModel('/Wall/fence_wood.glb', woodFenceScale, new THREE.Vector3(x, 0, z), rotationY);
    };
    
    // Calculate the number of segments needed
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
            name: 'Buffalo Cage',
            baseCost: 200,
            animalPath: '/Animal/african_buffalo.glb',
            mainCagePath: '/Building/jail_cage.glb',
            animalScale: new THREE.Vector3(0.5, 0.5, 0.5),
            mainCageScale: new THREE.Vector3(1.5, 1.5, 1.5),
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
            mainCageScale: new THREE.Vector3(2.5, 2.5, 2.5),
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
        position: new THREE.Vector3(10, 0, -30), // New zone position
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
        position: new THREE.Vector3(-30, 0, 10), // Another new zone
        status: 'empty',
        currentPriceMultiplier: 0,
        button: null,
        cageData: {
            name: 'Gorilla Cage',
            baseCost: 220,
            animalPath: '/Animal/gorilla.glb',
            mainCagePath: '/Building/jail_cage.glb',
            animalScale: new THREE.Vector3(0.05, 0.05, 0.05),
            mainCageScale: new THREE.Vector3(1.2, 1.2, 1.2), // Smaller cage
            floorType: 'tile',
            woodFenceScale: new THREE.Vector3(0.5, 0.5, 0.5),
            baseIncome: 11,
            maxAnimals: 3
        }
    }
    // Tambahkan lebih banyak zona jika diinginkan
];

const WOOD_FENCE_UNIT_SCALE_MULTIPLIER = 10; // Assuming 1 unit of cage scale relates to 10 units of world space for fence placement

// Initialize build zone buttons
function initializeBuildZones() {
    BUILD_ZONES.forEach(zone => {
        const buttonDiv = document.createElement('div');
        buttonDiv.className = 'build-button hidden'; // Hidden by default
        buttonDiv.style.pointerEvents = 'auto'; // Make button clickable
        
        const buttonObject = new CSS2DObject(buttonDiv);
        buttonObject.position.set(zone.position.x, zone.position.y + 1, zone.position.z); // Position above the ground
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
            zone.currentCost = costToDisplay; // Update currentCost in zone object
        } else if (zone.status === 'cage_purchased') {
            const animalCount = purchasedRevenueSources[zone.cageData.name.replace(' Cage', '')]?.count || 0;
            if (animalCount < zone.cageData.maxAnimals) {
                costToDisplay = zone.cageData.baseCost * (2 ** animalCount);
                buttonText = `Add ${zone.cageData.name.replace(' Cage', '')} (💵${costToDisplay})`;
                isDisabled = playerMoney < costToDisplay;
                zone.currentCost = costToDisplay; // Update currentCost in zone object
            } else {
                buttonText = `${zone.cageData.name.replace(' Cage', '')} MAXED!`;
                isDisabled = true;
                zone.currentCost = Infinity; // Cannot buy more
            }
        } else if (zone.status === 'animal_purchased') { // If it's already maxed out
            buttonText = `${zone.cageData.name.replace(' Cage', '')} MAXED!`;
            isDisabled = true;
            zone.currentCost = Infinity;
        }

        buttonDiv.innerText = buttonText;
        buttonDiv.disabled = isDisabled;

        // Hide/show button based on proximity and purchase availability
        const distanceToPlayer = camera.position.distanceTo(zone.position);
        if (distanceToPlayer < 15 && !isDisabled) { // Show if close enough and affordable
             buttonDiv.classList.remove('hidden');
             buttonDiv.style.pointerEvents = 'auto'; // Enable pointer events for click
        } else {
             buttonDiv.classList.add('hidden');
             buttonDiv.style.pointerEvents = 'none'; // Disable pointer events when hidden
        }
    });
}

async function handleBuildZoneClick(zoneId) {
    const zone = BUILD_ZONES.find(z => z.id === zoneId);
    if (!zone || zone.button.element.disabled) return;

    const cost = zone.currentCost; // Use the currently displayed cost

    if (playerMoney < cost) {
        console.warn(`Not enough money for ${zone.status === 'empty' ? 'cage' : 'animal'}: ${zone.cageData.name}`);
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
        // Create wooden fences around the newly placed cage
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
            // Still more animals can be added to this cage
            zone.status = 'cage_purchased';
        }
        console.log(`${animalName} purchased and placed in ${zone.cageData.name}!`);
    }
    
    worldOctree.fromGraphNode(scene); // Rebuild octree after adding new objects
    updateBuildZoneButtons(); // Update buttons state
}

// ZOO LAYOUT: Initial static elements (only ground, paths, and map board)
const ZOO_BOUNDS_X = 40;
const ZOO_BOUNDS_Z = 40;
const FENCE_SEGMENT_LENGTH = 10; // Keep for reference, but not used for external fence now

// --- EXTERNAL ZOO FENCE AND GATE (REMOVED) ---
// zooGate is also implicitly removed from this section

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

// Main Entry Path (center of the zoo)
createTexturedPlane(
    pathWidth, floorSize, // Path extends full length
    '/Floor/road.jpg',
    1, floorSize / 10,
    new THREE.Vector3(0, 0, 0)
);

// Central East-West Path (inside the zoo)
createTexturedPlane(
    floorSize, pathWidth, // Extends full width
    '/Floor/road.jpg',
    floorSize / 10, 1,
    new THREE.Vector3(0, 0, 0)
);

// --- MAP BOARD (Loaded at startup) ---
// Positioned relative to the core zoo area
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

    TWEEN.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera); // Penting: render CSS2D elements setiap frame
    // updateBuildZoneButtons(); // Dipindahkan ke dalam `animate` untuk update real-time
}

// Initial setup for the tycoon game
playerMoney = 500; // Starting money
updateCollectedMoneyDisplay();
updateUncollectedMoneyDisplay();
setInterval(generateMoneyFromRevenueSources, 1000); // Generate income every second
initializeBuildZones(); // Setup initial build zone buttons

animate();