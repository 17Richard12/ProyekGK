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
const affordMessage = document.getElementById('affordMessage');

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
console.log("CSS2DRenderer added. pointer-events set to 'none'.");


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
        collectedMoneyDisplay.innerText = `💵 ${playerMoney}`;
        uncollectedMoneyDisplay.innerText = `💰 ${Math.floor(uncollectedMoney)}`;
    }
}

const LEVER_INCOME_PER_PULL = 50;
let isLeverPulling = false;

function pullLever() {
    if (isLeverPulling) return;

    isLeverPulling = true;
    uncollectedMoney += LEVER_INCOME_PER_PULL;
    updateUncollectedMoneyDisplay();
    console.log(`Lever pulled! Uncollected Money: ${uncollectedMoney}`);

    if (lever) {
        const initialRotation = lever.rotation.clone();
        const targetRotation = lever.rotation.clone();
        targetRotation.x += Math.PI / 4;

        new TWEEN.Tween(lever.rotation)
            .to({ x: targetRotation.x }, 200)
            .easing(TWEEN.Easing.Quadratic.Out)
            .onComplete(() => {
                new TWEEN.Tween(lever.rotation)
                    .to({ x: initialRotation.x }, 200)
                    .easing(TWEEN.Easing.Quadratic.In)
                    .onComplete(() => {
                        isLeverPulling = false;
                    })
                    .start();
            })
            .start();
    } else {
        isLeverPulling = false;
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
        updateBuildZoneButtons();
    }
}

if (collectButton) {
    collectButton.addEventListener('click', collectMoney);
}

let affordMessageTimeout;
function showAffordMessage() {
    if (affordMessage) {
        affordMessage.classList.remove('fadeOut');
        void affordMessage.offsetWidth;
        affordMessage.classList.add('fadeOut');

        affordMessage.style.display = 'block';
        clearTimeout(affordMessageTimeout);
        affordMessageTimeout = setTimeout(() => {
            affordMessage.style.display = 'none';
        }, 3000);
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
const SPAWN_POINT_Y_CAPSULE_BOTTOM = 0.8; // Initial player height
const playerCollider = new Capsule(
    new THREE.Vector3(SPAWN_POINT_X, SPAWN_POINT_Y_CAPSULE_BOTTOM, SPAWN_POINT_Z),
    new THREE.Vector3(SPAWN_POINT_X, SPAWN_POINT_Y_CAPSULE_BOTTOM + 0.4, SPAWN_POINT_Z),
    0.8
);


const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();

let playerOnFloor = false;
const keyStates = {};

let lever;
let table;
let isLeverHighlighted = false;
const raycaster = new THREE.Raycaster();
const interactDistance = 3;

let arrowPointer;
const pointerRaycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();


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
        console.log("Pointer lock requested.");
    }
});

document.addEventListener('mousedown', onDocumentMouseDown);

function onDocumentMouseDown(event) {
    if (document.pointerLockElement === document.body) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        pointerRaycaster.setFromCamera(mouse, camera);

        if (arrowPointer && arrowPointer.visible) {
            const intersects = pointerRaycaster.intersectObject(arrowPointer, true);
            if (intersects.length > 0) {
                console.log("Arrow clicked! Teleporting...");
                teleportToBuildZone();
            }
        }
    }
}


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
        playerCollider.start.set(SPAWN_POINT_X, SPAWN_POINT_Y_CAPSULE_BOTTOM, SPAWN_POINT_Z);
        playerCollider.end.set(SPAWN_POINT_X, SPAWN_POINT_Y_CAPSULE_BOTTOM + 0.4, SPAWN_POINT_Z);
        playerCollider.radius = 0.8;
        camera.position.copy(playerCollider.end);
        camera.rotation.set(0, 0, 0);
    }
}

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

// Function to create wooden fences around a given central point for a cage area
async function createWoodenFenceAroundArea(centerX, centerZ, areaWidth, areaDepth, woodFenceScale, isInitialFence = false) {
    const WOOD_FENCE_MODEL_LENGTH = 10; // Assuming fence_wood.glb is 10 units long
    const halfAreaWidth = areaWidth / 2;
    const halfAreaDepth = areaDepth / 2;
    const fenceOffset = 0.5; // Small offset from the main area

    const placeFenceSegment = async (x, z, rotationY) => {
        await loadAndPlaceModel('/Wall/fence_wood.glb', woodFenceScale, new THREE.Vector3(x, 0, z), rotationY);
    };
    
    // Calculate how many segments needed to cover the side
    // Adjust for slight overlap to prevent gaps
    const segmentsX = Math.max(1, Math.ceil(areaWidth / WOOD_FENCE_MODEL_LENGTH));
    const segmentsZ = Math.max(1, Math.ceil(areaDepth / WOOD_FENCE_MODEL_LENGTH));

    const segmentOffset = WOOD_FENCE_MODEL_LENGTH / 2; // Offset for center of segment

    // North side (along Z positive)
    for (let i = 0; i < segmentsX; i++) {
        const xPos = centerX - halfAreaWidth + segmentOffset + (i * WOOD_FENCE_MODEL_LENGTH);
        await placeFenceSegment(xPos, centerZ + halfAreaDepth + fenceOffset, 0);
    }
    // South side (along Z negative)
    for (let i = 0; i < segmentsX; i++) {
        const xPos = centerX - halfAreaWidth + segmentOffset + (i * WOOD_FENCE_MODEL_LENGTH);
        await placeFenceSegment(xPos, centerZ - halfAreaDepth - fenceOffset, 0);
    }
    // East side (along X positive)
    for (let i = 0; i < segmentsZ; i++) {
        const zPos = centerZ - halfAreaDepth + segmentOffset + (i * WOOD_FENCE_MODEL_LENGTH);
        await placeFenceSegment(centerX + halfAreaWidth + fenceOffset, zPos, Math.PI / 2);
    }
    // West side (along X negative)
    for (let i = 0; i < segmentsZ; i++) {
        const zPos = centerZ - halfAreaDepth + segmentOffset + (i * WOOD_FENCE_MODEL_LENGTH);
        await placeFenceSegment(centerX - halfAreaWidth - fenceOffset, zPos, -Math.PI / 2);
    }

    if (isInitialFence) {
        // Rebuild octree after all initial fences for ALL zones are loaded
        // This is called from initializeBuildZones, which then calls worldOctree.fromGraphNode(scene) once.
    }
}


// TYCOON BUILD ZONE MANAGEMENT ========================================

const BUILD_ZONES = [
    {
        id: 'zone1', position: new THREE.Vector3(-25, 0, -20), status: 'empty', currentPriceMultiplier: 0, button: null,
        cageData: {
            name: 'Buffalo Cage', baseCost: 200, animalPath: '/Animal/african_buffalo.glb', mainCagePath: '/Building/jail_cage.glb',
            animalScale: new THREE.Vector3(0.5, 0.5, 0.5), mainCageScale: new THREE.Vector3(1.5, 1.5, 1.5), // 15x15 area
            floorType: 'grass', woodFenceScale: new THREE.Vector3(0.5, 0.5, 0.5), baseIncome: 10, maxAnimals: 3
        }, initialFenceLoaded: false
    },
    {
        id: 'zone2', position: new THREE.Vector3(25, 0, -20), status: 'empty', currentPriceMultiplier: 0, button: null,
        cageData: {
            name: 'Elephant Cage', baseCost: 300, animalPath: '/Animal/elephant.glb', mainCagePath: '/Building/jail_cage.glb',
            animalScale: new THREE.Vector3(0.08, 0.08, 0.08), mainCageScale: new THREE.Vector3(2.5, 2.5, 2.5), // 25x25 area
            floorType: 'sand', woodFenceScale: new THREE.Vector3(0.5, 0.5, 0.5), baseIncome: 15, maxAnimals: 2
        }, initialFenceLoaded: false
    },
    {
        id: 'zone3', position: new THREE.Vector3(-25, 0, 20), status: 'empty', currentPriceMultiplier: 0, button: null,
        cageData: {
            name: 'Giraffe Cage', baseCost: 250, animalPath: '/Animal/giraffe.glb', mainCagePath: '/Building/jail_cage.glb',
            animalScale: new THREE.Vector3(0.02, 0.02, 0.02), mainCageScale: new THREE.Vector3(1.5, 1.5, 1.5),
            floorType: 'grass', woodFenceScale: new THREE.Vector3(0.5, 0.5, 0.5), baseIncome: 12, maxAnimals: 3
        }, initialFenceLoaded: false
    },
    {
        id: 'zone4', position: new THREE.Vector3(25, 0, 20), status: 'empty', currentPriceMultiplier: 0, button: null,
        cageData: {
            name: 'Lion Cage', baseCost: 280, animalPath: '/Animal/lion_lowpoly1.glb', mainCagePath: '/Building/jail_cage.glb',
            animalScale: new THREE.Vector3(0.05, 0.05, 0.05), mainCageScale: new THREE.Vector3(1.5, 1.5, 1.5),
            floorType: 'sand', woodFenceScale: new THREE.Vector3(0.5, 0.5, 0.5), baseIncome: 13, maxAnimals: 2
        }, initialFenceLoaded: false
    },
    {
        id: 'zone5', position: new THREE.Vector3(0, 0, -45), status: 'empty', currentPriceMultiplier: 0, button: null, // New position for more cages
        cageData: {
            name: 'Gorilla Cage', baseCost: 220, animalPath: '/Animal/gorilla.glb', mainCagePath: '/Building/jail_cage.glb',
            animalScale: new THREE.Vector3(0.05, 0.05, 0.05), mainCageScale: new THREE.Vector3(1.2, 1.2, 1.2),
            floorType: 'tile', woodFenceScale: new THREE.Vector3(0.5, 0.5, 0.5), baseIncome: 11, maxAnimals: 3
        }, initialFenceLoaded: false
    },
    {
        id: 'zone6', position: new THREE.Vector3(0, 0, 45), status: 'empty', currentPriceMultiplier: 0, button: null, // Another new position
        cageData: {
            name: 'Rhino Cage', baseCost: 270, animalPath: '/Animal/rhinoceros.glb', mainCagePath: '/Building/jail_cage.glb',
            animalScale: new THREE.Vector3(0.05, 0.05, 0.05), mainCageScale: new THREE.Vector3(2.0, 2.0, 2.0),
            floorType: 'sand', woodFenceScale: new THREE.Vector3(0.5, 0.5, 0.5), baseIncome: 14, maxAnimals: 1
        }, initialFenceLoaded: false
    }
];

const WOOD_FENCE_UNIT_SCALE_MULTIPLIER = 10; // Assuming jail_cage.glb scale X * this multiplier = real world width

// Initialize build zone buttons AND initial fences
async function initializeBuildZones() {
    for (const zone of BUILD_ZONES) {
        const buttonDiv = document.createElement('div');
        buttonDiv.className = 'build-button hidden';
        buttonDiv.style.pointerEvents = 'auto'; // Make button clickable
        
        const buttonObject = new CSS2DObject(buttonDiv);
        buttonObject.position.set(zone.position.x, zone.position.y + 1, zone.position.z);
        scene.add(buttonObject);
        zone.button = buttonObject;

        buttonDiv.addEventListener('click', () => {
            handleBuildZoneClick(zone.id);
        });
        
        zone.currentCost = zone.cageData.baseCost;

        // Create initial wooden fence around the zone area
        if (!zone.initialFenceLoaded) {
            const cageWidth = zone.cageData.mainCageScale.x * WOOD_FENCE_UNIT_SCALE_MULTIPLIER;
            const cageDepth = zone.cageData.mainCageScale.z * WOOD_FENCE_UNIT_SCALE_MULTIPLIER;
            console.log(`Loading initial fence for ${zone.id} at ${zone.position.x}, ${zone.position.z} with size ${cageWidth}x${cageDepth}`);
            await createWoodenFenceAroundArea(zone.position.x, zone.position.z, cageWidth, cageDepth, zone.cageData.woodFenceScale, true);
            zone.initialFenceLoaded = true;
        }
    }
    worldOctree.fromGraphNode(scene); // Rebuild octree once after all initial fences are loaded
    console.log("All initial fences loaded and octree rebuilt.");
}

function findFirstAffordableEmptyZone() {
    for (const zone of BUILD_ZONES) {
        if (zone.status === 'empty' && playerMoney >= (zone.cageData.baseCost * (2 ** zone.currentPriceMultiplier))) {
            return zone;
        }
    }
    return null;
}

function updateArrowPointer() {
    const targetZone = findFirstAffordableEmptyZone();

    if (targetZone && arrowPointer) {
        arrowPointer.visible = true;
        // Position arrow slightly in front of player
        const playerForward = new THREE.Vector3();
        camera.getWorldDirection(playerForward);
        playerForward.y = 0;
        playerForward.normalize().multiplyScalar(5);

        arrowPointer.position.copy(camera.position).add(playerForward);
        arrowPointer.position.y = 1 + Math.sin(performance.now() * 0.005) * 0.2; // Floating effect

        // Make arrow point to the target zone
        arrowPointer.lookAt(targetZone.position.x, targetZone.position.y + 1, targetZone.position.z);

    } else if (arrowPointer) {
        arrowPointer.visible = false;
    }
}

function teleportToBuildZone() {
    const targetZone = findFirstAffordableEmptyZone();
    if (targetZone) {
        const teleportPosition = targetZone.position.clone();
        // Teleport player slightly away from the zone, facing it
        teleportPosition.x += 0;
        teleportPosition.z += 10; // Place player in front of the zone
        
        playerCollider.start.set(teleportPosition.x, SPAWN_POINT_Y_CAPSULE_BOTTOM, teleportPosition.z);
        playerCollider.end.set(teleportPosition.x, SPAWN_POINT_Y_CAPSULE_BOTTOM + 0.4, teleportPosition.z);
        playerCollider.radius = 0.8;
        camera.position.copy(playerCollider.end);

        camera.lookAt(targetZone.position.x, targetZone.position.y + 1, targetZone.position.z);
        console.log(`Teleporting to zone ${targetZone.id}`);
    }
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
        } else {
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
             buttonDiv.style.pointerEvents = 'auto'; // Enable pointer events for click
        } else {
             buttonDiv.classList.add('hidden');
             buttonDiv.style.pointerEvents = 'none'; // Disable pointer events when hidden
        }
    });
}

async function handleBuildZoneClick(zoneId) {
    const zone = BUILD_ZONES.find(z => z.id === zoneId);
    if (!zone || zone.button.element.disabled) {
        console.log(`Button for ${zoneId} is disabled or zone not found.`);
        return;
    }

    const cost = zone.currentCost;

    if (playerMoney < cost) {
        showAffordMessage();
        console.warn(`You can't afford this! Need 💵${cost - playerMoney} more.`);
        return;
    }

    playerMoney -= cost;
    updateCollectedMoneyDisplay();

    if (zone.status === 'empty') {
        await loadAndPlaceModel(
            zone.cageData.mainCagePath,
            zone.cageData.mainCageScale,
            zone.position
        );
        // Do NOT re-create fences here. They are already placed as initial fences.
        // We only place the main cage model and its floor.
        createTexturedPlane(
            zone.cageData.mainCageScale.x * WOOD_FENCE_UNIT_SCALE_MULTIPLIER,
            zone.cageData.mainCageScale.z * WOOD_FENCE_UNIT_SCALE_MULTIPLIER,
            `/Floor/${zone.cageData.floorType}.jpg`,
            zone.cageData.mainCageScale.x * 0.5,
            zone.cageData.mainCageScale.z * 0.5,
            new THREE.Vector3(zone.position.x, -0.01, zone.position.z)
        );
        zone.status = 'cage_purchased';
        zone.currentPriceMultiplier++;
        console.log(`${zone.cageData.name} purchased and placed!`);

    } else if (zone.status === 'cage_purchased' || zone.status === 'animal_purchased') {
        const animalName = zone.cageData.name.replace(' Cage', '');
        await loadAndPlaceModel(
            zone.cageData.animalPath,
            zone.cageData.animalScale,
            zone.position
        );
        
        if (!purchasedRevenueSources[animalName]) {
            purchasedRevenueSources[animalName] = {
                count: 0,
                baseIncome: zone.cageData.baseIncome
            };
        }
        purchasedRevenueSources[animalName].count++;
        zone.currentPriceMultiplier++;

        if (purchasedRevenueSources[animalName].count >= zone.cageData.maxAnimals) {
            zone.status = 'animal_purchased';
            console.log(`${animalName} MAXED OUT in ${zone.cageData.name}!`);
        } else {
            zone.status = 'cage_purchased';
        }
        console.log(`${animalName} purchased and placed in ${zone.cageData.name}!`);
    }
    
    worldOctree.fromGraphNode(scene); // Rebuild octree after adding new objects
    updateBuildZoneButtons();
}

// ZOO LAYOUT: Initial static elements
const ZOO_BOUNDS_X = 40;
const ZOO_BOUNDS_Z = 40;

// Ukuran 1 "petak" di grid kita
const TILE_SIZE = 10; 

// --- SPAWN POINT AREA ---
const SPAWN_AREA_WIDTH = TILE_SIZE; // Hanya 1 tile
const SPAWN_AREA_DEPTH = TILE_SIZE; // Hanya 1 tile
const SPAWN_FLOOR_Y = 0; // Lantai spawn di Y=0
const ZOO_MAIN_FLOOR_Y = -0.05; // Lantai kebun binatang di Y=-0.05

// Lantai spawn point menggunakan sp.jpg
createTexturedPlane(
    SPAWN_AREA_WIDTH, SPAWN_AREA_DEPTH,
    '/Floor/sp.jpg',
    1, 1, // Repeat 1,1 untuk 1 tile
    new THREE.Vector3(SPAWN_POINT_X, SPAWN_FLOOR_Y, SPAWN_POINT_Z)
);

// Load Table and Lever at Spawn Point
const TABLE_POS_X = SPAWN_POINT_X;
const TABLE_POS_Z = SPAWN_POINT_Z;
const TABLE_SCALE = new THREE.Vector3(0.02, 0.02, 0.02);
const LEVER_POS_Y_ON_TABLE = 0.7;

loader.load('/Lever/table.glb', function (gltf) {
    table = gltf.scene;
    table.scale.copy(TABLE_SCALE);
    table.rotation.set(0, Math.PI / 2, 0);
    table.position.set(TABLE_POS_X, SPAWN_FLOOR_Y, TABLE_POS_Z);
    scene.add(table);
    worldOctree.fromGraphNode(table);
}, undefined, (error) => { console.error('Error loading Table model:', error); });

loader.load('/Lever/lever.glb', function (gltf) {
    lever = gltf.scene;
    lever.scale.set(1, 1, 1);
    lever.rotation.set(0, Math.PI / 2, 0);
    lever.position.set(TABLE_POS_X, SPAWN_FLOOR_Y + LEVER_POS_Y_ON_TABLE, TABLE_POS_Z);
    scene.add(lever);
    worldOctree.fromGraphNode(lever);
}, undefined, (error) => { console.error('Error loading Lever model:', error); });


// --- ZOO GROUND AND PATHS (menggunakan grid) ---
// Ukuran total area game
const GRID_SIZE_X = 11; // Contoh: 11 petak dari -5 hingga 5
const GRID_SIZE_Z = 11; // Contoh: 11 petak dari -5 hingga 5
const HALF_GRID_SIZE_X = (GRID_SIZE_X - 1) / 2; // Untuk koordinat -/+
const HALF_GRID_SIZE_Z = (GRID_SIZE_Z - 1) / 2;

// Fungsi helper untuk mendapatkan koordinat dunia dari grid index
function getGridPosition(gridX, gridZ, yOffset = 0) {
    return new THREE.Vector3(
        (gridX - HALF_GRID_SIZE_X) * TILE_SIZE,
        yOffset,
        (gridZ - HALF_GRID_SIZE_Z) * TILE_SIZE
    );
}

// "Peta" kebun binatang Anda
const zooMap = [
    // z = -5 (paling belakang)
    "T T T T T T T T T T T", // Pohon
    "T R R R P R R R P R T", // Pohon, Rumput, Jalan, Pohon, Rumput, Jalan, Pohon
    "T C C C J C C C J C T", // Kandang, Jalan, Kandang, Jalan
    "T R R R P R R R P R T",
    "T T T T T T T T T T T",
    // z = 0 (tengah)
    "J J J J J S J J J J J", // Jalan, Spawn Point, Jalan
    "T R R R P R R R P R T",
    "T C C C J C C C J C T",
    "T R R R P R R R P R T",
    "T T T T T T T T T T T" // Pohon
];

const ITEM_SPACING = TILE_SIZE; // Jarak antar item di grid

// Loop melalui map untuk membuat lantai dan menempatkan pohon
zooMap.forEach((row, zIndex) => {
    row.split(' ').forEach((type, xIndex) => {
        const worldPos = getGridPosition(xIndex, zIndex, ZOO_MAIN_FLOOR_Y);
        worldPos.y = ZOO_MAIN_FLOOR_Y; // Pastikan Y di level lantai kebun binatang

        let floorTexture = '/Floor/grass.jpg'; // Default rumput
        let floorRepeatX = TILE_SIZE / 5;
        let floorRepeatY = TILE_SIZE / 5;

        // Atur tekstur lantai
        if (type === 'J') { // Jalan
            floorTexture = '/Floor/road.jpg';
            floorRepeatX = TILE_SIZE / 10;
            floorRepeatY = TILE_SIZE / 10;
        } else if (type === 'S') { // Spawn Point, sudah ditangani terpisah di atas
            // Jangan buat lantai di sini, sudah ada lantai sp.jpg
            return;
        } else if (type === 'C') { // Area kandang, lantai akan dibuat saat beli kandang
            floorTexture = '/Floor/grass.jpg'; // Default rumput untuk area kandang
        }

        // Buat lantai untuk petak ini
        createTexturedPlane(TILE_SIZE, TILE_SIZE, floorTexture, floorRepeatX, floorRepeatY, worldPos);

        // Tempatkan pohon jika itu petak 'T' (Tree)
        if (type === 'T') {
            loadAndPlaceModel('/Building/pine_tree.glb', new THREE.Vector3(0.05, 0.05, 0.05), worldPos, Math.random() * Math.PI * 2)
                .catch(e => console.error(`Error loading tree: ${e.message}`));
        }
    });
});


// --- Menentukan Posisi BUILD_ZONES berdasarkan grid ---
// Anda harus menyesuaikan posisi BUILD_ZONES agar sesuai dengan petak 'C' di zooMap
BUILD_ZONES[0].position = getGridPosition(2, 2); // Buffalo Cage (C)
BUILD_ZONES[1].position = getGridPosition(6, 2); // Elephant Cage (C)
BUILD_ZONES[2].position = getGridPosition(2, 6); // Giraffe Cage (C)
BUILD_ZONES[3].position = getGridPosition(6, 6); // Lion Cage (C)
BUILD_ZONES[4].position = getGridPosition(2, 8); // Gorilla Cage (C) (contoh baru)
BUILD_ZONES[5].position = getGridPosition(6, 8); // Rhino Cage (C) (contoh baru)


// --- MAP BOARD ---
loadAndPlaceModel('/Wall/note_board_-mb.glb', new THREE.Vector3(0.1, 0.1, 0.1), getGridPosition(HALF_GRID_SIZE_X + 2, HALF_GRID_SIZE_Z - 3, 2), Math.PI / 4)
    .catch(e => console.error(`Error loading Map Board: ${e.message}`));


// BACKGROUND
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


// --- Arrow Pointer Initialization ---
function createArrowPointer() {
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0xffa500 }); // Orange color
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2, 32), arrowMaterial);
    cone.position.y = 1; // Top part of arrow

    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2, 32), arrowMaterial);
    cylinder.position.y = 0; // Bottom part of arrow

    const arrowGroup = new THREE.Group();
    arrowGroup.add(cone);
    arrowGroup.add(cylinder);

    arrowGroup.rotation.x = Math.PI / 2; // Point it upwards initially
    arrowGroup.position.y = 1; // Default height
    arrowGroup.visible = false; // Hidden by default
    scene.add(arrowGroup);
    return arrowGroup;
}
arrowPointer = createArrowPointer();


function animate() {
    requestAnimationFrame(animate);

    const deltaTime = Math.min(0.05, clock.getDelta() * 1.15) / STEPS_PER_FRAME;

    for (let i = 0; i < STEPS_PER_FRAME; i++) {
        controls(deltaTime);
        updatePlayer(deltaTime);
        teleportPlayerIfOob();
    }

    animalMixers.forEach(mixer => mixer.update(deltaTime));

    checkLeverInteraction();
    updateBuildZoneButtons(); // Penting: Ini mengupdate tombol dan visibilitasnya
    updateArrowPointer();

    TWEEN.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera); // Penting: render CSS2D elements
}

playerMoney = 0; // Mulai dengan uang 0
uncollectedMoney = 0;
updateCollectedMoneyDisplay();
updateUncollectedMoneyDisplay();
initializeBuildZones(); // Ini juga memuat pagar awal

animate();