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

const clock = new THREE.Clock();
const GRAVITY = 30;
const STEPS_PER_FRAME = 2;

const worldOctree = new Octree();

// Initial player spawn point OUTSIDE the zoo
// Let's assume the main gate is at (0, 0, 40)
const playerCollider = new Capsule(new THREE.Vector3(0, 0.8, 50), new THREE.Vector3(0, 1.2, 50), 0.8);

const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();

let playerOnFloor = false;
const keyStates = {};

// Gate variables
let zooGate;
let isGateOpen = false;
let isGateAnimating = false;

document.addEventListener('keydown', (event) => {
    keyStates[event.code] = true;

    // Toggle gate with 'P' key
    if (event.code === 'KeyP' && zooGate && !isGateAnimating) {
        toggleGate();
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
        playerCollider.start.set(0, 0.8, 50); // Reset to original outside spawn point
        playerCollider.end.set(0, 1.2, 50);
        playerCollider.radius = 0.8;
        camera.position.copy(playerCollider.end);
        camera.rotation.set(0, 0, 0);
    }
}

const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const animalMixers = []; // Array to store mixers if animals have animations

// ====================================================================
// ZOO ASSET LOADING
// ====================================================================

// Function to create a textured plane for floors
function createTexturedPlane(width, depth, texturePath, repeatX, repeatY, position, rotationY = 0) {
    const geometry = new THREE.PlaneGeometry(width, depth);
    const texture = textureLoader.load(texturePath);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    const material = new THREE.MeshPhongMaterial({ map: texture, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(geometry, material);
    plane.rotation.x = -Math.PI / 2;
    plane.rotation.y = rotationY; // Add rotation for paths
    plane.position.set(position.x, position.y, position.z);
    plane.receiveShadow = true;
    plane.castShadow = true;
    scene.add(plane);
    worldOctree.fromGraphNode(plane);
    return plane;
}

// Load Animals and their main Cage Walls (jail_cage.glb)
function loadAnimalAndMainCage(animalPath, mainCagePath, animalScale, mainCageScale, animalPos, mainCagePos, floorType) {
    loader.load(animalPath, function (gltf) {
        const animal = gltf.scene;
        animal.scale.set(animalScale.x, animalScale.y, animalScale.z);
        animal.position.set(animalPos.x, animalPos.y, animalPos.z);
        animal.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });
        scene.add(animal);
        // Animals themselves may or may not be collision objects depending on design
        // worldOctree.fromGraphNode(animal);

        // If animal has animations:
        // if (gltf.animations && gltf.animations.length > 0) {
        //     const mixer = new THREE.AnimationMixer(animal);
        //     const action = mixer.clipAction(gltf.animations[0]);
        //     action.play();
        //     animalMixers.push(mixer);
        // }
    });

    loader.load(mainCagePath, function (gltf) {
        const mainCage = gltf.scene;
        mainCage.scale.set(mainCageScale.x, mainCageScale.y, mainCageScale.z);
        mainCage.position.set(mainCagePos.x, mainCagePos.y, mainCagePos.z);
        mainCage.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });
        scene.add(mainCage);
        worldOctree.fromGraphNode(mainCage); // Main cage walls are collision objects

        // Create specific floor for the cage
        let cageFloorTexturePath;
        let repeatFactor = 1;
        // Adjust these paths and repeat factors based on your actual textures and desired look
        switch (floorType) {
            case 'grass':
                cageFloorTexturePath = '/Floor/grass.jpg';
                repeatFactor = 0.5;
                break;
            case 'sand':
                cageFloorTexturePath = '/Floor/sand.jpg';
                repeatFactor = 0.8;
                break;
            case 'tile':
                cageFloorTexturePath = '/Floor/tile.jpg';
                repeatFactor = 0.5;
                break;
            default:
                cageFloorTexturePath = '/Floor/grass.jpg';
                repeatFactor = 0.5;
        }

        const floorWidth = mainCageScale.x * 10; // Adjust multiplier based on your cage model's dimensions
        const floorDepth = mainCageScale.z * 10;
        createTexturedPlane(
            floorWidth, floorDepth,
            cageFloorTexturePath,
            floorWidth * repeatFactor, floorDepth * repeatFactor,
            new THREE.Vector3(mainCagePos.x, -0.01, mainCagePos.z)
        );
    });
}

// Load Wooden Fence for internal enclosures
function loadWoodenFence(position, rotationY, scale) {
    loader.load('/Wall/fence_wood.glb', function (gltf) {
        const fence = gltf.scene;
        fence.scale.set(scale.x, scale.y, scale.z);
        fence.position.set(position.x, position.y, position.z);
        fence.rotation.y = rotationY;
        fence.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });
        scene.add(fence);
        worldOctree.fromGraphNode(fence);
    });
}

// Load Note Board for map
let mapBoard;
function loadMapBoard(position, rotationY, scale) {
    loader.load('/Wall/note_board_-mb.glb', function (gltf) {
        mapBoard = gltf.scene;
        mapBoard.scale.set(scale.x, scale.y, scale.z);
        mapBoard.position.set(position.x, position.y, position.z);
        mapBoard.rotation.y = rotationY;
        mapBoard.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
                // You can add a texture to the board's "screen" here
                // For example, if the board has a mesh named 'screen_mesh'
                // const mapTexture = textureLoader.load('/Map/map.jpg');
                // node.material.map = mapTexture;
                // node.material.needsUpdate = true;
            }
        });
        scene.add(mapBoard);
        worldOctree.fromGraphNode(mapBoard);
    });
}


// Load Trees (scatter them around the zoo, mostly in grass areas)
function loadTree(treePath, scale, position, rotationY = 0) {
    loader.load(treePath, function (gltf) {
        const tree = gltf.scene;
        tree.scale.set(scale.x, scale.y, scale.z);
        tree.position.set(position.x, position.y, position.z);
        tree.rotation.y = rotationY; // Allow rotating trees
        tree.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });
        scene.add(tree);
        worldOctree.fromGraphNode(tree);
    });
}

// ====================================================================
// ZOO LAYOUT: External Fence, Gate, Internal Paths, Cages, and Trees
// ====================================================================

const ZOO_BOUNDS_X = 40; // Max X distance from center for zoo
const ZOO_BOUNDS_Z = 40; // Max Z distance from center for zoo
const FENCE_SEGMENT_LENGTH = 10; // Approximate length of a single fence segment

// --- EXTERNAL ZOO FENCE AND GATE ---
// Assuming simple_bricks_and_steel_fence.glb is about 10 units long
const brickFenceScale = new THREE.Vector3(10, 10, 10); // Adjust scale as needed for overall zoo size

// North Fence (along Z positive)
for (let x = -ZOO_BOUNDS_X + FENCE_SEGMENT_LENGTH / 2; x < ZOO_BOUNDS_X; x += FENCE_SEGMENT_LENGTH) {
    if (x > -5 && x < 5) continue; // Skip area for gate
    loader.load('/Wall/simple_bricks_and_steel_fence.glb', (gltf) => {
        const fence = gltf.scene;
        fence.scale.copy(brickFenceScale);
        fence.position.set(x, 0, ZOO_BOUNDS_Z);
        scene.add(fence);
        worldOctree.fromGraphNode(fence);
    });
}

// South Fence (along Z negative)
for (let x = -ZOO_BOUNDS_X + FENCE_SEGMENT_LENGTH / 2; x < ZOO_BOUNDS_X; x += FENCE_SEGMENT_LENGTH) {
    loader.load('/Wall/simple_bricks_and_steel_fence.glb', (gltf) => {
        const fence = gltf.scene;
        fence.scale.copy(brickFenceScale);
        fence.position.set(x, 0, -ZOO_BOUNDS_Z);
        scene.add(fence);
        worldOctree.fromGraphNode(fence);
    });
}

// East Fence (along X positive)
for (let z = -ZOO_BOUNDS_Z + FENCE_SEGMENT_LENGTH / 2; z < ZOO_BOUNDS_Z; z += FENCE_SEGMENT_LENGTH) {
    loader.load('/Wall/simple_bricks_and_steel_fence.glb', (gltf) => {
        const fence = gltf.scene;
        fence.scale.copy(brickFenceScale);
        fence.rotation.y = Math.PI / 2; // Rotate 90 degrees
        fence.position.set(ZOO_BOUNDS_X, 0, z);
        scene.add(fence);
        worldOctree.fromGraphNode(fence);
    });
}

// West Fence (along X negative)
for (let z = -ZOO_BOUNDS_Z + FENCE_SEGMENT_LENGTH / 2; z < ZOO_BOUNDS_Z; z += FENCE_SEGMENT_LENGTH) {
    loader.load('/Wall/simple_bricks_and_steel_fence.glb', (gltf) => {
        const fence = gltf.scene;
        fence.scale.copy(brickFenceScale);
        fence.rotation.y = -Math.PI / 2; // Rotate -90 degrees
        fence.position.set(-ZOO_BOUNDS_X, 0, z);
        scene.add(fence);
        worldOctree.fromGraphNode(fence);
    });
}

// Main Gate
loader.load('/Wall/gate.glb', function (gltf) {
    zooGate = gltf.scene; // Assign the loaded gate to the global variable
    zooGate.scale.set(5, 5, 5); // Adjust gate scale
    zooGate.position.set(0, 0, ZOO_BOUNDS_Z); // Position at the center of the north fence
    scene.add(zooGate);
    worldOctree.fromGraphNode(zooGate); // Gate is also a collision object
});


// Function to toggle the gate open/close
function toggleGate() {
    isGateAnimating = true;
    const currentPosition = zooGate.position.clone();
    const targetZ = isGateOpen ? ZOO_BOUNDS_Z : ZOO_BOUNDS_Z + 10; // Move gate 10 units forward/backward

    new TWEEN.Tween(currentPosition)
        .to({ z: targetZ }, 1000) // Animate over 1 second
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(() => {
            zooGate.position.copy(currentPosition);
        })
        .onComplete(() => {
            isGateOpen = !isGateOpen;
            isGateAnimating = false;
            // Rebuild octree if gate is a major collision object
            worldOctree.fromGraphNode(scene); // Rebuild the entire octree for simplicity, or just update the gate's part
        })
        .start();
}


// --- ZOO GROUND AND PATHS ---
const floorSize = ZOO_BOUNDS_X * 2 + 20; // Make floor larger than fence
const pathWidth = 8;   // Width of the main paths

// Main Grass Area (background layer for the whole zoo)
createTexturedPlane(
    floorSize, floorSize,
    '/Floor/grass.jpg',
    floorSize / 5, floorSize / 5,
    new THREE.Vector3(0, -0.1, 0) // Slightly below other floors
);

// Main Entry Path (from gate inwards)
createTexturedPlane(
    pathWidth, ZOO_BOUNDS_Z * 1.5, // Path extends from outside gate into zoo
    '/Floor/road.jpg',
    1, ZOO_BOUNDS_Z / 10,
    new THREE.Vector3(0, 0, ZOO_BOUNDS_Z / 2) // Extends from gate towards center
);

// Central North-South Path (inside the zoo)
createTexturedPlane(
    pathWidth, ZOO_BOUNDS_Z * 2 - pathWidth, // Extends almost full length
    '/Floor/road.jpg',
    1, (ZOO_BOUNDS_Z * 2 - pathWidth) / 10,
    new THREE.Vector3(0, 0, 0)
);

// Central East-West Path (inside the zoo)
createTexturedPlane(
    ZOO_BOUNDS_X * 2 - pathWidth, pathWidth, // Extends almost full width
    '/Floor/road.jpg',
    (ZOO_BOUNDS_X * 2 - pathWidth) / 10, 1,
    new THREE.Vector3(0, 0, 0)
);


// --- ZOO INTERNAL CAGES (with Wooden Fences) ---
const CAGE_AREA_OFFSET_X = 20; // Distance from center for cages
const CAGE_AREA_OFFSET_Z = 20; // Distance from center for cages
const WOOD_FENCE_LENGTH = 10; // Approximate length of your fence_wood.glb model
const WOOD_FENCE_SCALE = new THREE.Vector3(0.5, 0.5, 0.5); // Adjust this if your wooden fence is too big/small

// Helper function to draw a square fence around a given position and size
function createSquareWoodenFence(centerX, centerZ, cageWidth, cageDepth) {
    const halfWidth = cageWidth / 2;
    const halfDepth = cageDepth / 2;

    // North side
    for (let x = centerX - halfWidth + WOOD_FENCE_LENGTH / 2; x < centerX + halfWidth; x += WOOD_FENCE_LENGTH) {
        loadWoodenFence(new THREE.Vector3(x, 0, centerZ + halfDepth), 0, WOOD_FENCE_SCALE);
    }
    // South side
    for (let x = centerX - halfWidth + WOOD_FENCE_LENGTH / 2; x < centerX + halfWidth; x += WOOD_FENCE_LENGTH) {
        loadWoodenFence(new THREE.Vector3(x, 0, centerZ - halfDepth), 0, WOOD_FENCE_SCALE);
    }
    // East side
    for (let z = centerZ - halfDepth + WOOD_FENCE_LENGTH / 2; z < centerZ + halfDepth; z += WOOD_FENCE_LENGTH) {
        loadWoodenFence(new THREE.Vector3(centerX + halfWidth, 0, z), Math.PI / 2, WOOD_FENCE_SCALE);
    }
    // West side
    for (let z = centerZ - halfDepth + WOOD_FENCE_LENGTH / 2; z < centerZ + halfDepth; z += WOOD_FENCE_LENGTH) {
        loadWoodenFence(new THREE.Vector3(centerX - halfWidth, 0, z), -Math.PI / 2, WOOD_FENCE_SCALE);
    }
}


// Enclosure 1: African Buffalo
const buffaloCageSize = { width: 15, depth: 15 };
loadAnimalAndMainCage(
    '/Animal/african_buffalo.glb',
    '/Building/jail_cage.glb',
    new THREE.Vector3(0.5, 0.5, 0.5),
    new THREE.Vector3(1.5, 1.5, 1.5),
    new THREE.Vector3(-CAGE_AREA_OFFSET_X, 0, -CAGE_AREA_OFFSET_Z),
    new THREE.Vector3(-CAGE_AREA_OFFSET_X, 0, -CAGE_AREA_OFFSET_Z),
    'grass'
);
createSquareWoodenFence(-CAGE_AREA_OFFSET_X, -CAGE_AREA_OFFSET_Z, buffaloCageSize.width, buffaloCageSize.depth);


// Enclosure 2: Elephant
const elephantCageSize = { width: 25, depth: 25 };
loadAnimalAndMainCage(
    '/Animal/elephant.glb',
    '/Building/jail_cage.glb',
    new THREE.Vector3(0.08, 0.08, 0.08),
    new THREE.Vector3(2.5, 2.5, 2.5),
    new THREE.Vector3(CAGE_AREA_OFFSET_X, 0, -CAGE_AREA_OFFSET_Z),
    new THREE.Vector3(CAGE_AREA_OFFSET_X, 0, -CAGE_AREA_OFFSET_Z),
    'sand'
);
createSquareWoodenFence(CAGE_AREA_OFFSET_X, -CAGE_AREA_OFFSET_Z, elephantCageSize.width, elephantCageSize.depth);


// Enclosure 3: Giraffe
const giraffeCageSize = { width: 15, depth: 15 };
loadAnimalAndMainCage(
    '/Animal/giraffe.glb',
    '/Building/jail_cage.glb',
    new THREE.Vector3(0.02, 0.02, 0.02),
    new THREE.Vector3(1.5, 1.5, 1.5),
    new THREE.Vector3(-CAGE_AREA_OFFSET_X, 0, CAGE_AREA_OFFSET_Z),
    new THREE.Vector3(-CAGE_AREA_OFFSET_X, 0, CAGE_AREA_OFFSET_Z),
    'grass'
);
createSquareWoodenFence(-CAGE_AREA_OFFSET_X, CAGE_AREA_OFFSET_Z, giraffeCageSize.width, giraffeCageSize.depth);


// Enclosure 4: Lion
const lionCageSize = { width: 15, depth: 15 };
loadAnimalAndMainCage(
    '/Animal/lion_lowpoly1.glb',
    '/Building/jail_cage.glb',
    new THREE.Vector3(0.05, 0.05, 0.05),
    new THREE.Vector3(1.5, 1.5, 1.5),
    new THREE.Vector3(CAGE_AREA_OFFSET_X, 0, CAGE_AREA_OFFSET_Z),
    new THREE.Vector3(CAGE_AREA_OFFSET_X, 0, CAGE_AREA_OFFSET_Z),
    'sand'
);
createSquareWoodenFence(CAGE_AREA_OFFSET_X, CAGE_AREA_OFFSET_Z, lionCageSize.width, lionCageSize.depth);


// Add other animals and their enclosures similarly, defining their cage size
// Enclosure: Gorilla
const gorillaCageSize = { width: 12, depth: 12 };
loadAnimalAndMainCage(
    '/Animal/gorilla.glb',
    '/Building/jail_cage.glb',
    new THREE.Vector3(0.05, 0.05, 0.05),
    new THREE.Vector3(1.2, 1.2, 1.2),
    new THREE.Vector3(-10, 0, -ZOO_BOUNDS_Z + 15),
    new THREE.Vector3(-10, 0, -ZOO_BOUNDS_Z + 15),
    'tile'
);
createSquareWoodenFence(-10, -ZOO_BOUNDS_Z + 15, gorillaCageSize.width, gorillaCageSize.depth);


// --- Trees ---
// Smaller trees, strategically placed in grass areas around paths and cages
loadTree('/Building/pine_tree.glb', new THREE.Vector3(0.05, 0.05, 0.05), new THREE.Vector3(-30, 0, -30), Math.random() * Math.PI * 2);
loadTree('/Building/pine_tree.glb', new THREE.Vector3(0.06, 0.06, 0.06), new THREE.Vector3(30, 0, -30), Math.random() * Math.PI * 2);
loadTree('/Building/pine_tree.glb', new THREE.Vector3(0.05, 0.05, 0.05), new THREE.Vector3(-30, 0, 30), Math.random() * Math.PI * 2);
loadTree('/Building/pine_tree.glb', new THREE.Vector3(0.07, 0.07, 0.07), new THREE.Vector3(30, 0, 30), Math.random() * Math.PI * 2);

loadTree('/Building/oak_trees.glb', new THREE.Vector3(0.01, 0.01, 0.01), new THREE.Vector3(-15, 0, -15), Math.random() * Math.PI * 2);
loadTree('/Building/oak_trees.glb', new THREE.Vector3(0.012, 0.012, 0.012), new THREE.Vector3(15, 0, -15), Math.random() * Math.PI * 2);
loadTree('/Building/oak_trees.glb', new THREE.Vector3(0.01, 0.01, 0.01), new THREE.Vector3(-15, 0, 15), Math.random() * Math.PI * 2);
loadTree('/Building/oak_trees.glb', new THREE.Vector3(0.011, 0.011, 0.011), new THREE.Vector3(15, 0, 15), Math.random() * Math.PI * 2);

loadTree('/Building/stylized_tree.glb', new THREE.Vector3(0.005, 0.005, 0.005), new THREE.Vector3(0, 0, -25), Math.random() * Math.PI * 2);
loadTree('/Building/stylized_tree.glb', new THREE.Vector3(0.006, 0.006, 0.006), new THREE.Vector3(0, 0, 25), Math.random() * Math.PI * 2);
loadTree('/Building/stylized_tree.glb', new THREE.Vector3(0.007, 0.007, 0.007), new THREE.Vector3(-25, 0, 0), Math.random() * Math.PI * 2);
loadTree('/Building/stylized_tree.glb', new THREE.Vector3(0.008, 0.008, 0.008), new THREE.Vector3(25, 0, 0), Math.random() * Math.PI * 2);


// --- MAP BOARD ---
// Place the map board near the entrance of the zoo, possibly on the main path
loadMapBoard(new THREE.Vector3(10, 2, ZOO_BOUNDS_Z - 10), Math.PI / 4, new THREE.Vector3(0.1, 0.1, 0.1));


// BACKGROUND (Skybox)
const backgroundGeometry = new THREE.SphereGeometry(500, 32, 32);

const backgroundTexture = textureLoader.load('/Background/langit.jpg', (texture) => {
    texture.encoding = THREE.sRGBEncoding;
});

const backgroundMaterial = new THREE.MeshBasicMaterial({
    map: backgroundTexture,
    side: THREE.BackSide
});

const backgroundMesh = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
backgroundMesh.position.set(0, 0, 0);
scene.add(backgroundMesh);

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;

scene.background = new THREE.Color(0xa0a0a0); // A default background color if texture is not loaded

// LIGHTING
const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(50, 100, 75); // Adjust position for larger scene
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;  // Increased shadow map size for better quality
directionalLight.shadow.mapSize.height = 1024; // Increased shadow map size for better quality
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 200;
directionalLight.shadow.camera.left = -50;
directionalLight.shadow.camera.right = 50;
directionalLight.shadow.camera.top = 50;
directionalLight.shadow.camera.bottom = -50;
scene.add(directionalLight);

// You can add more lights if needed for specific areas, e.g., PointLight for lampposts

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = Math.min(0.05, clock.getDelta() * 1.15) / STEPS_PER_FRAME;

    for (let i = 0; i < STEPS_PER_FRAME; i++) {
        controls(deltaTime);
        updatePlayer(deltaTime);
        teleportPlayerIfOob();
    }

    // Update animal animations if any
    animalMixers.forEach(mixer => mixer.update(deltaTime));

    TWEEN.update(); // Update Tweens for gate animation
    renderer.render(scene, camera);
}

animate();