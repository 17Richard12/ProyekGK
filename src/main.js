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
const uncollectedMoneyDisplay = document.getElementById('uncollectedMoneyDisplay');
const collectedMoneyDisplay = document.getElementById('collectedMoneyDisplay');

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

function updateCollectedMoneyDisplay() {
    if (collectedMoneyDisplay) {
        collectedMoneyDisplay.innerText = `💵 ${playerMoney}`;
    }
}

function updateUncollectedMoneyDisplay() {
    if (uncollectedMoneyDisplay) {
        uncollectedMoneyDisplay.innerText = `💰 ${uncollectedMoney}`;
    }
}

function generateMoney() {
    uncollectedMoney += 10;
    updateUncollectedMoneyDisplay(); // Perbarui tampilan uncollected money
}

function collectMoney() {
    if (uncollectedMoney > 0) {
        playerMoney += uncollectedMoney; // Pindahkan uang
        uncollectedMoney = 0; // Reset uang yang belum terkumpul

        // Perbarui kedua tampilan
        updateCollectedMoneyDisplay();
        updateUncollectedMoneyDisplay();
    }
}

document.addEventListener('keydown', (event) => {
    keyStates[event.code] = true;

    if (event.code === 'KeyE' && !isWeaponSwitching) {
        toggleWeapon();
    }
    
    // HAPUS KONDISI LAMA INI (JIKA ADA):
    // if (event.code === 'KeyF' && isLeverHighlighted && !isDoorRotating) {
    //     rotateDoor();
    // }

    // --- TAMBAHKAN KONDISI BARU DI BAWAH INI ---
    if (event.code === 'KeyC') {
        collectMoney();
    }
});

const clock = new THREE.Clock();
const GRAVITY = 30;
const STEPS_PER_FRAME = 2;

const worldOctree = new Octree();
let playerMoney = 0; 
let uncollectedMoney = 0;

const playerCollider = new Capsule(new THREE.Vector3(-9, 0.8, 5), new THREE.Vector3(-9, 1.2, 5), 0.8);

const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();

let playerOnFloor = false;
const keyStates = {};
let mouseTime = 0;
let isCollidingWithDoor = false;

let knife, kar98k;
let currentWeapon = 'knife';

const loader = new GLTFLoader();
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
}, undefined, (error) => {
    console.error('Error loading knife:', error);
});

loader.load('/Gun/kar98k.glb', (gltf) => {
    kar98k = gltf.scene;
    kar98k.scale.set(0.4, 0.4, 0.4);
    kar98k.position.set(0.5, -0.5, -1);
    kar98k.rotation.set(0, Math.PI / 2, 0);

    kar98k.userData.initialPosition = kar98k.position.clone();
    kar98k.userData.initialRotation = kar98k.rotation.clone();

    kar98k.traverse((node) => {
        if (node.isMesh) {
            if (node.material.map) {
                node.material.map.encoding = THREE.sRGBEncoding;
            }
            node.material.needsUpdate = true;
        }
    });

    camera.add(kar98k);
    kar98k.visible = false; // Initially hide the gun
}, undefined, (error) => {
    console.error('Error loading gun:', error);
});

document.addEventListener('keydown', (event) => {
    keyStates[event.code] = true;

    if (event.code === 'KeyE' && !isWeaponSwitching) {
        toggleWeapon();
    }

    if (event.code === 'KeyF' && isLeverHighlighted && !isDoorRotating) {
        rotateDoor();
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

document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === document.body) {
        document.addEventListener('mousedown', onDocumentMouseDown);
    } else {
        document.removeEventListener('mousedown', onDocumentMouseDown);
    }
});

function onDocumentMouseDown(event) {
    // Memeriksa jika tombol kiri mouse yang ditekan
    if (event.button === 0) {
        // Jika senjata saat ini adalah kar98k, panggil fungsi tembak
        if (currentWeapon === 'kar98k') {
            shoot();
        } 
        // Jika pisaunya, lakukan animasi putaran
        else if (currentWeapon === 'knife') {
            mouseTime = performance.now();
            startSpin();
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

        // Check if player is colliding with the door
        if (doorBoundingBox && doorBoundingBox.containsPoint(playerCollider.start)) {
            playerVelocity.set(0, 0, 0);
        } else {
            playerCollider.translate(result.normal.multiplyScalar(result.depth));
        }
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
    if (isCollidingWithDoor) return;

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
        playerCollider.start.set(-9, 0.8, 5);
        playerCollider.end.set(-9, 1.2, 5);
        playerCollider.radius = 0.8;
        camera.position.copy(playerCollider.end);
        camera.rotation.set(0, 0, 0);
    }
}

let longwall1, longwall2, longwall3, longwall4, longwall5, longwall6, longwall7, longwall8, lever
let mixer_chamber;
let mixer_wallgun1, mixer_wallgun2, mixer_wallgun3, mixer_wallgun4;
let doorBoundingBox;

// longwall1 =========================
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall1 = gltf.scene;
    longwall1.scale.set(2, 2, 2);
    longwall1.rotation.set(0, 0, 0);
    longwall1.position.set(-10, 0, -24.7);
	scene.add( longwall1 );
    worldOctree.fromGraphNode( longwall1 )
});
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall1 = gltf.scene;
    longwall1.scale.set(2, 2, 2);
    longwall1.rotation.set(0, 0, 0);
    longwall1.position.set(-10, 3.5, -24.7);
	scene.add( longwall1 );
    worldOctree.fromGraphNode( longwall1 )
});

//longwall2 =========================
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall2 = gltf.scene;
    longwall2.scale.set(2, 2, 2);
    longwall2.rotation.set(0, 90 * (Math.PI / 180), 0);
    longwall2.position.set(-24.5, 0, -6);
	scene.add( longwall2 );
    worldOctree.fromGraphNode( longwall2 )
});
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall2 = gltf.scene;
    longwall2.scale.set(2, 2, 2);
    longwall2.rotation.set(0, 90 * (Math.PI / 180), 0);
    longwall2.position.set(-24.5, 3.5, -6);
	scene.add( longwall2 );
    worldOctree.fromGraphNode( longwall2 )
});

//longwall3 =========================
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall3 = gltf.scene;
    longwall3.scale.set(2, 2, 2);
    longwall3.rotation.set(0, 90 * (Math.PI / 180), 0);
    longwall3.position.set(-24.3, 0, 6.3);
	scene.add( longwall3 );
    worldOctree.fromGraphNode( longwall3 )
});
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall3 = gltf.scene;
    longwall3.scale.set(2, 2, 2);
    longwall3.rotation.set(0, 90 * (Math.PI / 180), 0);
    longwall3.position.set(-24.3, 3.5, 6.3);
	scene.add( longwall3 );
    worldOctree.fromGraphNode( longwall3 )
});

//longwall4 =========================
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall4 = gltf.scene;
    longwall4.scale.set(2, 2, 2);
    longwall4.rotation.set(0, -1 * (Math.PI / 180), 0);
    longwall4.position.set(-10, 0, 25);
	scene.add( longwall4 );
    worldOctree.fromGraphNode( longwall4 )
});
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall4 = gltf.scene;
    longwall4.scale.set(2, 2, 2);
    longwall4.rotation.set(0, -1 * (Math.PI / 180), 0);
    longwall4.position.set(-10, 3.5, 25);
	scene.add( longwall4 );
    worldOctree.fromGraphNode( longwall4 )
});

//longwall5 =========================
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall5 = gltf.scene;
    longwall5.scale.set(2, 2, 2);
    longwall5.rotation.set(0, 90 * (Math.PI / 180), 0);
    longwall5.position.set(24.5, 0, -6);
    // longwall5.traverse((node) => {
    //     if (node.isMesh) {
    //       node.castShadow = true;
    //       node.receiveShadow = true;
    //     }
    // });

	scene.add( longwall5 );
    worldOctree.fromGraphNode( longwall5 )
});
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall5 = gltf.scene;
    longwall5.scale.set(2, 2, 2);
    longwall5.rotation.set(0, 90 * (Math.PI / 180), 0);
    longwall5.position.set(24.5, 3.5, -6);
    // longwall5.traverse((node) => {
    //     if (node.isMesh) {
    //       node.castShadow = true;
    //       node.receiveShadow = true;
    //     }
    // });

	scene.add( longwall5 );
    worldOctree.fromGraphNode( longwall5 )
});

//longwall6 =========================
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall6 = gltf.scene;
    longwall6.scale.set(2, 2, 2);
    longwall6.rotation.set(0, 90 * (Math.PI / 180), 0);
    longwall6.position.set(24.7, 0, 6.3);
    // longwall6.traverse((node) => {
    //     if (node.isMesh) {
    //       node.castShadow = true;
    //       node.receiveShadow = true;
    //     }
    // });

	scene.add( longwall6 );
    worldOctree.fromGraphNode( longwall6 )
});
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall6 = gltf.scene;
    longwall6.scale.set(2, 2, 2);
    longwall6.rotation.set(0, 90 * (Math.PI / 180), 0);
    longwall6.position.set(24.7, 3.5, 6.3);
    // longwall6.traverse((node) => {
    //     if (node.isMesh) {
    //       node.castShadow = true;
    //       node.receiveShadow = true;
    //     }
    // });

	scene.add( longwall6 );
    worldOctree.fromGraphNode( longwall6 )
});

// longwall7 =========================
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall7 = gltf.scene;
    longwall7.scale.set(2, 2, 2);
    longwall7.rotation.set(0, 0, 0);
    longwall7.position.set(8, 0, -24.7);
    // longwall7.traverse((node) => {
    //     if (node.isMesh) {
    //       node.castShadow = true;
    //       node.receiveShadow = true;
    //     }
    // });

	scene.add( longwall7 );
    worldOctree.fromGraphNode( longwall7 )
});
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall7 = gltf.scene;
    longwall7.scale.set(2, 2, 2);
    longwall7.rotation.set(0, 0, 0);
    longwall7.position.set(8, 3.5, -24.7);
    // longwall7.traverse((node) => {
    //     if (node.isMesh) {
    //       node.castShadow = true;
    //       node.receiveShadow = true;
    //     }
    // });

	scene.add( longwall7 );
    worldOctree.fromGraphNode( longwall7 )
});

//longwall8 =========================
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall8 = gltf.scene;
    longwall8.scale.set(2, 2, 2);
    longwall8.rotation.set(0, -1 * (Math.PI / 180), 0);
    longwall8.position.set(8, 0, 25);
    // longwall8.traverse((node) => {
    //     if (node.isMesh) {
    //       node.castShadow = true;
    //       node.receiveShadow = true;
    //     }
    // });

	scene.add( longwall8 );
    worldOctree.fromGraphNode( longwall8 )
});
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall8 = gltf.scene;
    longwall8.scale.set(2, 2, 2);
    longwall8.rotation.set(0, -1 * (Math.PI / 180), 0);
    longwall8.position.set(8, 3.5, 25);
    // longwall8.traverse((node) => {
    //     if (node.isMesh) {
    //       node.castShadow = true;
    //       node.receiveShadow = true;
    //     }
    // });

	scene.add( longwall8 );
    worldOctree.fromGraphNode( longwall8 )
});

const raycaster = new THREE.Raycaster();
const rayDirection = new THREE.Vector3();

//function buat tembak 
function shoot() {
    // 1. Atur posisi awal sinar (origin) dari tengah kamera
    const origin = new THREE.Vector3();
    camera.getWorldPosition(origin);
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);

    // 2. Lakukan "tembakan" sinar dan dapatkan objek apa saja yang berpotongan
    // Kita buat daftar objek yang bisa ditembak. Untuk awal, kita masukkan semua children dari scene.
    // Nanti ini bisa dioptimalkan hanya untuk objek-objek tertentu (musuh, dinding, dll.)
    const intersects = raycaster.intersectObjects(scene.children, true);

    // 3. Periksa apakah ada objek yang kena tembak
    if (intersects.length > 0) {
        // Ambil objek pertama yang paling dekat dengan kamera
        const intersection = intersects[0];

        // Titik lokasi peluru mengenai target
        const impactPoint = intersection.point;
        
        // Di sini kita akan panggil fungsi untuk membuat jejak peluru dan bekas tembakan
        createBulletTrail(impactPoint);
        createImpactMark(impactPoint, intersection.face.normal);

        console.log('Hit:', intersection.object.name, 'at', impactPoint);
    } else {
        // Jika tidak mengenai apa-apa, jejak peluru tetap dibuat tapi ke arah yang jauh
        const missPoint = new THREE.Vector3();
        raycaster.ray.at(100, missPoint); // 100 adalah jarak "miss"
        createBulletTrail(missPoint);
    }
}

function createBulletTrail(endPoint) {
    // Titik awal jejak peluru (sedikit di depan dan di kanan kamera, seolah dari laras senjata)
    const gunPosition = new THREE.Vector3();
    camera.getWorldPosition(gunPosition);
    
    // Gunakan Vector3 untuk kalkulasi posisi yang lebih akurat
    const startPoint = new THREE.Vector3();
    camera.getWorldPosition(startPoint);

    // Buat geometri garis dari titik awal ke titik akhir
    const points = [startPoint, endPoint];
    const trailGeometry = new THREE.BufferGeometry().setFromPoints(points);

    // Buat material untuk garis (warna kuning terang agar terlihat jelas)
    const trailMaterial = new THREE.LineBasicMaterial({
        color: 0xffff00,
        linewidth: 2, // Atur ketebalan garis
    });

    // Buat objek garis
    const bulletTrail = new THREE.Line(trailGeometry, trailMaterial);
    
    // Render jejak peluru di atas objek lain dan nonaktifkan depth test agar selalu terlihat
    bulletTrail.renderOrder = 999;
    bulletTrail.material.depthTest = false;

    scene.add(bulletTrail);

    // Hapus jejak peluru setelah beberapa milidetik agar tidak memenuhi scene
    setTimeout(() => {
        scene.remove(bulletTrail);
    }, 150); // 150 milidetik
}

function createImpactMark(point, normal) {
    // Membuat geometri sederhana untuk bekas tembakan (misalnya, lingkaran)
    const impactGeometry = new THREE.CircleGeometry(0.1, 16); // radius 0.1, 16 segmen

    // Material bekas tembakan (warna hitam atau tekstur lubang peluru)
    const impactMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.DoubleSide
    });

    const impactMark = new THREE.Mesh(impactGeometry, impactMaterial);
    
    // Posisikan bekas tembakan di titik tumbukan
    impactMark.position.copy(point);
    
    // Pindahkan sedikit ke arah luar permukaan untuk menghindari "z-fighting" (flickering)
    impactMark.position.addScaledVector(normal, 0.01);

    // Arahkan bekas tembakan agar menghadap kamera
    impactMark.lookAt(camera.position);

    // Render di atas objek lain
    impactMark.renderOrder = 999;
    impactMark.material.depthTest = false;

    scene.add(impactMark);

    // Hapus bekas tembakan setelah beberapa detik
    setTimeout(() => {
        scene.remove(impactMark);
    }, 2000); // 2 detik
}

function checkCollisionWithDoorRaycasting() {
    const playerPosition = new THREE.Vector3();
    playerCollider.getCenter(playerPosition);

    // Set the direction of the ray to the camera's direction
    camera.getWorldDirection(rayDirection);

    // Set the origin and direction of the ray
    raycaster.set(playerPosition, rayDirection);

    // Check for intersections with the door
    const intersects = raycaster.intersectObject(rotatingdoor, true);

    if (intersects.length > 0) {
        const intersection = intersects[0];
        const distance = intersection.distance;
        const collisionThreshold = 1.0; // Adjust the threshold as needed

        if (distance < collisionThreshold) {
            // Collision detected
            isCollidingWithDoor = true;
            playerVelocity.set(0, 0, 0);
        } else {
            isCollidingWithDoor = false;
        }
    } else {
        isCollidingWithDoor = false;
    }
}


// Add these variables at the beginning of your script
let isLeverHighlighted = false;
const leverMessage = document.getElementById('leverMessage'); // Element to show lever message

// Add these functions to handle lever proximity and highlighting
function checkLeverProximityAndOrientation() {
    if (!lever) return;

    const leverPosition = new THREE.Vector3();
    lever.getWorldPosition(leverPosition);
    const playerPosition = new THREE.Vector3();
    playerCollider.getCenter(playerPosition);

    const distance = leverPosition.distanceTo(playerPosition);
    const forwardVector = getForwardVector();
    const directionToLever = leverPosition.clone().sub(playerPosition).normalize();

    if (distance < 3 && forwardVector.dot(directionToLever) > 0.7) {
        if (!isLeverHighlighted) {
            highlightLever(true);
            leverMessage.style.display = 'block';
            isLeverHighlighted = true;
        }
    } else {
        if (isLeverHighlighted) {
            highlightLever(false);
            leverMessage.style.display = 'none';
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

// FLOOR======================
const floorSize = 50;
const tileSize = 10;
const numTiles = Math.ceil(floorSize / tileSize);

const floorGeometry = new THREE.PlaneGeometry(tileSize * numTiles, tileSize * numTiles, numTiles, numTiles);
const floorMaterial = new THREE.MeshPhongMaterial({ color: 0x999999, depthWrite: true });

const floorLoader = new THREE.TextureLoader();
const floorTexture = floorLoader.load('/Floor/tile.jpg');
floorTexture.wrapS = THREE.RepeatWrapping;
floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(numTiles, numTiles);
floorMaterial.map = floorTexture;

const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.receiveShadow = true;
floorMesh.castShadow = true;
scene.add(floorMesh);

worldOctree.fromGraphNode(floorMesh);

// BACKGROUND
const backgroundGeometry = new THREE.SphereGeometry(500, 32, 32);

const backgroundTextureLoader = new THREE.TextureLoader();
const backgroundTexture = backgroundTextureLoader.load('/Background/ascentmap.jpg', (texture) => {
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

scene.background = new THREE.Color(0xa0a0a0);

// LIGHTING
const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7.5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 512;  // Reduced shadow map size
directionalLight.shadow.mapSize.height = 512; // Reduced shadow map size
scene.add(directionalLight);

// Animation variables
let isSpinning = false;
let spinStartTime = 0;
const spinDuration = 500;
let isWeaponSwitching = false;

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
            const spinKar = (elapsedTime / spinDuration) * Math.PI * 2;
            if (currentWeapon === 'knife') {
                knife.rotation.y = spinAngle;
                knife.rotation.z = twistAngle;
            } else {
                kar98k.rotation.x = spinKar;
            }
        } else {
            isSpinning = false;
            if (currentWeapon === 'knife') {
                knife.rotation.copy(knife.userData.initialRotation);
            } else {
                kar98k.rotation.copy(kar98k.userData.initialRotation);
            }
            isWeaponSwitching = false; // Allow weapon switching again
        }
    }
}

function preventKnifeClipping() {
    if (knife.position.y <= -1.5) {
        knife.position.copy(knife.userData.initialPosition);
    }
}

function preventGunClipping() {
    if (kar98k.position.y <= -1.5) {
        kar98k.position.copy(kar98k.userData.initialPosition);
    }
}

function toggleWeapon() {
    if (knife && kar98k && !isWeaponSwitching) {
        isWeaponSwitching = true;
        startSpin(); // Start the spin animation
        if (currentWeapon === 'knife') {
            knife.visible = false;
            kar98k.visible = true;
            currentWeapon = 'kar98k';
        } else {
            knife.visible = true;
            kar98k.visible = false;
            currentWeapon = 'knife';
        }
    }
}
function animate() {
    requestAnimationFrame(animate);

    const deltaTime = Math.min(0.05, clock.getDelta() * 1.15) / STEPS_PER_FRAME;

    for (let i = 0; i < STEPS_PER_FRAME; i++) {
        controls(deltaTime);
        updatePlayer(deltaTime);
        teleportPlayerIfOob();
    }

    handleSpin();
    preventKnifeClipping();
    preventGunClipping();
    checkLeverProximityAndOrientation();


    if (mixer_chamber) {
        mixer_chamber.update(deltaTime);
    }
    if (mixer_wallgun1) {
        mixer_wallgun1.update(deltaTime);
    }
    if (mixer_wallgun2) {
        mixer_wallgun2.update(deltaTime);
    }
    if (mixer_wallgun3) {
        mixer_wallgun3.update(deltaTime);
    }
    if (mixer_wallgun4) {
        mixer_wallgun4.update(deltaTime);
    }

    TWEEN.update();
    renderer.render(scene, camera);
}

updateCollectedMoneyDisplay();
updateUncollectedMoneyDisplay();

setInterval(generateMoney, 1000);

animate();