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
// PERUBAHAN: Rate dasar + rate per bangunan + rate per kandang akan kita kelola
const incomeRatePerBuilding = [10, 25, 75, 200]; 
const incomePerPen = 5; // Setiap kandang yang dibeli menambah +5 income
const PEN_COST = 250; // Menetapkan harga per kandang

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

// PERUBAHAN: Logika baru untuk manajemen kandang
let pensPurchasedCount = 0; // Menghitung jumlah kandang yang sudah dibeli
const TOTAL_PENS = 9;
let penObjects = []; // Hanya untuk menyimpan model kandang

// BARU: Logika untuk manajemen hewan
let animalsPurchasedCount = 0;
const TOTAL_ANIMALS_PER_PEN = 1; // Maksimal 1 hewan per kandang
const ANIMAL_COST = 100; // Harga per hewan
const incomePerAnimal = 20; // Pendapatan per hewan
const animalModels = [
    '/Animal/african_buffalo.glb',
    '/Animal/elephanttff.glb',
    '/Animal/giraffe.glb',
    '/Animal/gorilla.glb',
    '/Animal/hippopotamus.glb',
    '/Animal/lion_lowpoly1.glb',
    '/Animal/polar_bear.glb',
    '/Animal/rhinoceros.glb',
    '/Animal/zebra.glb'
];
let animalObjects = []; // Untuk menyimpan model hewan

// Objek interaktif akan dikelola di sini
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

// Tuas Pembangunan (Disederhanakan)
loader.load('/Lever/lever.glb', function (gltf) {
    const buildLever = gltf.scene;
    
    // =======================================================
    // PERUBAHAN: Simpan model tuas ke variabel global
    // =======================================================
    buildLeverModel = buildLever;

    buildLever.scale.set(1, 1, 1);
    buildLever.rotation.set(0, Math.PI / 2, 0);
    buildLever.position.set(15, 0.7, -7);
    scene.add(buildLever);

    // Logika interaksi tetap sama
    interactiveObjects.push({
        model: buildLever,
        action: buildBuilding,
        getDetails: () => {
            // Logika ini sekarang hanya akan berjalan sebelum bangunan pertama dibeli
            if (buildingLevel >= 1) { // Kita anggap hanya ada 1 bangunan yang bisa dibeli
                return { canInteract: false, message: 'Bangunan sudah dibeli', highlightColor: '#ffff00' };
            }
            const currentCost = buildingTierCosts[0]; // Selalu cek biaya bangunan pertama
            const hasEnoughMoney = playerMoney >= currentCost;
            return {
                canInteract: hasEnoughMoney,
                message: hasEnoughMoney ? `Beli Bangunan (Biaya: ${currentCost})` : `Uang tidak cukup (Butuh: ${currentCost})`,
                highlightColor: hasEnoughMoney ? '#00ff00' : '#ff0000'
            };
        }
    });
});

// =======================================================
// BARU: TUAS KHUSUS UNTUK MEMBELI KANDANG
// =======================================================
loader.load('/Lever/lever.glb', function (gltf) {
    const penLever = gltf.scene;
    penLever.scale.set(1, 1, 1);
    penLever.rotation.set(0, Math.PI / 2, 0);
    penLever.position.set(15, 0.7, -5); // Posisi di tengah
    scene.add(penLever);

    interactiveObjects.push({
        model: penLever,
        action: buyNextPen, // Fungsi baru yang akan kita buat
        getDetails: () => {
            if (pensPurchasedCount >= TOTAL_PENS) {
                return { canInteract: false, message: 'Semua Kandang Telah Dibeli', highlightColor: '#ffff00' };
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

// BARU: TUAS KHUSUS UNTUK MEMBELI HEWAN
loader.load('/Lever/lever.glb', function (gltf) {
    const animalLever = gltf.scene;
    animalLever.scale.set(1, 1, 1);
    animalLever.rotation.set(0, Math.PI / 2, 0);
    animalLever.position.set(15, 0.7, -1); // Posisi di samping tuas lainnya
    scene.add(animalLever);

    interactiveObjects.push({
        model: animalLever,
        action: buyNextAnimal, // Fungsi baru untuk membeli hewan
        getDetails: () => {
            if (animalsPurchasedCount >= TOTAL_PENS * TOTAL_ANIMALS_PER_PEN) {
                return { canInteract: false, message: 'Semua Hewan Telah Dibeli', highlightColor: '#ffff00' };
            }
            if (pensPurchasedCount <= animalsPurchasedCount) {
                return { canInteract: false, message: 'Beli Kandang Dulu!', highlightColor: '#ff0000' };
            }
            const hasEnoughMoney = playerMoney >= ANIMAL_COST;
            return {
                canInteract: hasEnoughMoney,
                message: hasEnoughMoney ? `Beli Hewan (${animalsPurchasedCount + 1}/${TOTAL_PENS * TOTAL_ANIMALS_PER_PEN}) (Biaya: ${ANIMAL_COST})` : `Uang tidak cukup (Butuh: ${ANIMAL_COST})`,
                highlightColor: hasEnoughMoney ? '#00ff00' : '#ff0000'
            };
        }
    });
});


// --- Dinding, Lantai, Latar Belakang & Cahaya ---
(function setupWorld() {
    // --- FUNGSI UNTUK MEMUAT DINDING (tidak berubah) ---
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

    // ===================================================================
    // PERUBAHAN: FUNGSI MEMUAT PAGAR AGAR BISA DIGABUNG DALAM GRUP
    // ===================================================================
    function loadFence(position, rotationY = 0, parentGroup) {
        loader.load('/Wall/low_poly_wood_fence_with_snow.glb', function (gltf) {
            const fence = gltf.scene;
            fence.scale.set(1.5, 1.5, 1.5);
            fence.rotation.y = rotationY;
            fence.position.copy(position);
            
            // Tambahkan ke grup, bukan langsung ke scene
            parentGroup.add(fence);
            
            // Tambahkan collision untuk setiap bagian pagar
            worldOctree.fromGraphNode(fence);
        });
    }

    function loadPineTree(position) {
    loader.load('/Building/pine_tree.glb', function (gltf) {
        const tree = gltf.scene;
        tree.scale.set(1.5, 1.5, 1.5); // Sesuaikan ukurannya jika perlu
        tree.position.copy(position);

        // Beri sedikit variasi rotasi agar tidak terlihat seragam
        tree.rotation.y = Math.random() * Math.PI * 2;
        
        scene.add(tree);
        
        // Tambahkan pohon ke octree agar pemain tidak bisa menembusnya
        worldOctree.fromGraphNode(tree);
    });
}

    // ===================================================================
    // FUNGSI BARU UNTUK MEMBUAT SATU KANDANG YANG DAPAT DIBELI
    // ===================================================================
    function createBuyablePen(centerPosition, penIndex) {
        const penGroup = new THREE.Group();
        penGroup.userData.isPen = true;
        penGroup.userData.penIndex = penIndex;

        penGroup.visible = false; 
        
        scene.add(penGroup);
        
        // Simpan model kandang ke dalam array penObjects
        penObjects[penIndex] = penGroup;

        // Logika pembuatan pagar (sama seperti sebelumnya, tidak perlu diubah)
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
    
    // --- MEMUAT DINDING (tidak berubah) ---
    const wallPositions = [ { pos: new THREE.Vector3(-10, 0, -24.7) }, { pos: new THREE.Vector3(-24.5, 0, -6), rot: Math.PI / 2 }, { pos: new THREE.Vector3(-24.3, 0, 6.3), rot: Math.PI / 2 }, { pos: new THREE.Vector3(-10, 0, 25) }, { pos: new THREE.Vector3(24.5, 0, -6), rot: Math.PI / 2 }, { pos: new THREE.Vector3(24.7, 0, 6.3), rot: Math.PI / 2 }, { pos: new THREE.Vector3(8, 0, -24.7) }, { pos: new THREE.Vector3(8, 0, 25) }];
    wallPositions.forEach(w => loadWall(w.pos, w.rot));

    // ===================================================================
    // LOGIKA BARU UNTUK MEMBUAT 9 KANDANG YANG BISA DIBELI
    // ===================================================================
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

    // --- MEMUAT LANTAI, BACKGROUND, DAN CAHAYA (tidak berubah) ---
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

    // 1. Temukan semua objek yang berada dalam jangkauan
    const nearbyObjects = [];
    for (const obj of interactiveObjects) {
        if (!obj.model) continue;

        const objPosition = new THREE.Vector3();
        obj.model.getWorldPosition(objPosition);
        const distance = playerPosition.distanceTo(objPosition);
        
        // Gunakan radius interaksi khusus per objek, atau default 3
        const interactionRadius = obj.interactionRadius || 3; 

        if (distance < interactionRadius) {
            nearbyObjects.push({ object: obj, distance: distance });
        }
    }

    // 2. Dari yang terjangkau, temukan yang paling dekat
    if (nearbyObjects.length > 0) {
        nearbyObjects.sort((a, b) => a.distance - b.distance);
        closestInteractiveObject = nearbyObjects[0].object;
    }

    // 3. Proses interaksi untuk objek terdekat, nonaktifkan yang lain
    activeInteraction = null;
    let somethingIsHighlighted = false;
    for (const obj of interactiveObjects) {
        if (obj === closestInteractiveObject) {
            const details = obj.getDetails();
            highlightObject(obj.model, true, details.highlightColor);
            
            // Hanya set activeInteraction jika bisa di-klik
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

function buyNextPen() {
    // Cek apakah semua kandang sudah dibeli atau uang tidak cukup
    if (pensPurchasedCount >= TOTAL_PENS || playerMoney < PEN_COST) {
        return;
    }

    // Kurangi uang pemain
    playerMoney -= PEN_COST;
    updateCollectedMoneyDisplay();

    // Animasikan tuas
    animateLeverPull(interactiveObjects.find(o => o.action === buyNextPen)?.model);

    // Dapatkan kandang berikutnya dari array dan buat terlihat
    const nextPen = penObjects[pensPurchasedCount];
    if (nextPen) {
        nextPen.visible = true;
    }

    // Tambah jumlah kandang yang dibeli
    pensPurchasedCount++;
    
    // Tingkatkan pendapatan pemain dan perbarui tampilan
    // Pastikan baseIncome sudah diperhitungkan jika bangunan sudah ada
    const baseIncome = (buildingLevel >= 1) ? (incomeRatePerBuilding[buildingLevel + 1] || incomeRatePerBuilding[incomeRatePerBuilding.length - 1]) : incomeRatePerBuilding[0];
    currentIncomeRate = baseIncome + (pensPurchasedCount * incomePerPen) + (animalsPurchasedCount * incomePerAnimal);
    updateIncomeRateDisplay();
}

// BARU: Fungsi untuk membeli hewan berikutnya
function buyNextAnimal() {
    // Cek apakah semua hewan sudah dibeli atau uang tidak cukup
    if (animalsPurchasedCount >= TOTAL_PENS * TOTAL_ANIMALS_PER_PEN || playerMoney < ANIMAL_COST) {
        return;
    }

    // Pastikan ada kandang yang tersedia untuk hewan ini
    if (pensPurchasedCount <= animalsPurchasedCount) {
        // Ini berarti kita mencoba membeli hewan ke-X, tapi baru ada X-1 kandang atau kurang.
        // Seharusnya ini dicegah oleh getDetails pada lever, tapi sebagai fail-safe.
        return;
    }

    // Kurangi uang pemain
    playerMoney -= ANIMAL_COST;
    updateCollectedMoneyDisplay();

    // Animasikan tuas
    animateLeverPull(interactiveObjects.find(o => o.action === buyNextAnimal)?.model);

    // Tentukan kandang tempat hewan ini akan ditempatkan
    const targetPenIndex = animalsPurchasedCount; // Hewan ke-0 di kandang ke-0, hewan ke-1 di kandang ke-1, dst.
    const targetPenGroup = penObjects[targetPenIndex];

    if (targetPenGroup) {
        const animalPath = animalModels[animalsPurchasedCount % animalModels.length]; // Cycle through animal models
        loader.load(animalPath, (gltf) => {
            const newAnimal = gltf.scene;
            // Sesuaikan skala dan posisi relatif terhadap penGroup
            newAnimal.scale.set(1, 1, 1); // Sesuaikan skala hewan jika perlu
            newAnimal.position.set(0, 0.5, 0); // Posisikan di tengah kandang, sedikit di atas lantai
            
            // Tambahkan ke grup kandang agar ikut bergerak jika kandang dipindahkan (meskipun tidak di kasus ini)
            targetPenGroup.add(newAnimal);
            animalObjects.push(newAnimal); // Simpan referensi ke objek hewan

            // Tambahkan ke octree agar pemain tidak bisa menembusnya
            worldOctree.fromGraphNode(newAnimal);
        });
    }

    // Tambah jumlah hewan yang dibeli
    animalsPurchasedCount++;
    
    // Tingkatkan pendapatan pemain dan perbarui tampilan
    const baseIncome = (buildingLevel >= 1) ? (incomeRatePerBuilding[buildingLevel + 1] || incomeRatePerBuilding[incomeRatePerBuilding.length - 1]) : incomeRatePerBuilding[0];
    currentIncomeRate = baseIncome + (pensPurchasedCount * incomePerPen) + (animalsPurchasedCount * incomePerAnimal);
    updateIncomeRateDisplay();
}

// Ganti fungsi buildBuilding() Anda dengan yang ini
function buildBuilding() {
    // Kita hanya izinkan build jika level masih 0
    if (buildingLevel >= 1) return;

    const cost = buildingTierCosts[buildingLevel];
    if (playerMoney >= cost) {
        playerMoney -= cost;
        updateCollectedMoneyDisplay();
        animateLeverPull(buildLeverModel); // Langsung gunakan referensi model

        // Memuat model bangunan
        loader.load(buildingTierModels[buildingLevel], (gltf) => {
            const newBuilding = gltf.scene;
            newBuilding.position.set(-10, 0, 10);
            newBuilding.scale.set(2, 2, 2);
            scene.add(newBuilding);
            worldOctree.fromGraphNode(newBuilding);
            buildings[buildingLevel] = newBuilding;
        });

        // Update pendapatan
        const baseIncome = incomeRatePerBuilding[buildingLevel + 1] || incomeRatePerBuilding[incomeRatePerBuilding.length - 1];
        currentIncomeRate = baseIncome + (pensPurchasedCount * incomePerPen) + (animalsPurchasedCount * incomePerAnimal);
        updateIncomeRateDisplay();
        
        // Naikkan level agar tidak bisa build lagi
        buildingLevel++;

        // =======================================================
        // LOGIKA BARU: HILANGKAN TUAS SETELAH PEMBELIAN
        // =======================================================
        
        // 1. Sembunyikan model 3D tuas dari scene
        if (buildLeverModel) {
            buildLeverModel.visible = false;
        }

        // 2. Hapus tuas dari daftar objek yang bisa diinteraksikan
        interactiveObjects = interactiveObjects.filter(obj => obj.action !== buildBuilding);

        // 3. Pastikan pesan interaksi juga hilang
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
    updateInteractions(); // Satu fungsi untuk semua interaksi
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