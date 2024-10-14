// Import Three.js (if using modules)
import * as THREE from 'three';

// Initialize Scene
const scene = new THREE.Scene();

// Initialize Camera
const camera = new THREE.PerspectiveCamera(
  75, // Field of view
  window.innerWidth / window.innerHeight, // Aspect ratio
  0.1, // Near clipping plane
  1000 // Far clipping plane
);
camera.position.set(0, 5, 10);

// Initialize Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Handle Window Resize
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// Ground
const groundGeometry = new THREE.BoxGeometry(50, 1, 50);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.position.y = -0.5;
scene.add(ground);

// Platforms
const platformGeometry = new THREE.BoxGeometry(5, 1, 5);
const platformMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });

for (let i = 0; i < 5; i++) {
  const platform = new THREE.Mesh(platformGeometry, platformMaterial);
  platform.position.set(Math.random() * 20 - 10, Math.random() * 10, Math.random() * 20 - 10);
  scene.add(platform);
}

// Player
const playerGeometry = new THREE.BoxGeometry(1, 2, 1);
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x0000ff });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
player.position.y = 1;
scene.add(player);

// Player Properties
const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();
const playerSpeed = 5;
const jumpSpeed = 8;
let canJump = false;

const keysPressed = {};

// Event Listeners for Key Presses
document.addEventListener('keydown', (event) => {
  keysPressed[event.code] = true;
});

document.addEventListener('keyup', (event) => {
  keysPressed[event.code] = false;
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  // Gravity
  playerVelocity.y -= 9.81 * delta; // Gravity acceleration

  // Movement
  playerDirection.set(0, 0, 0);
  if (keysPressed['ArrowUp'] || keysPressed['KeyW']) playerDirection.z -= 1;
  if (keysPressed['ArrowDown'] || keysPressed['KeyS']) playerDirection.z += 1;
  if (keysPressed['ArrowLeft'] || keysPressed['KeyA']) playerDirection.x -= 1;
  if (keysPressed['ArrowRight'] || keysPressed['KeyD']) playerDirection.x += 1;

  playerDirection.normalize();

  if (playerDirection.length() > 0) {
    playerVelocity.x = playerDirection.x * playerSpeed;
    playerVelocity.z = playerDirection.z * playerSpeed;
  } else {
    playerVelocity.x = 0;
    playerVelocity.z = 0;
  }

  // Jump
  if ((keysPressed['Space'] || keysPressed['KeyJ']) && canJump) {
    playerVelocity.y = jumpSpeed;
    canJump = false;
  }

  // Update Player Position
  player.position.x += playerVelocity.x * delta;
  player.position.y += playerVelocity.y * delta;
  player.position.z += playerVelocity.z * delta;

  // Collision Detection with Ground
  if (player.position.y <= 1) { // Assuming player height is 2
    player.position.y = 1;
    playerVelocity.y = 0;
    canJump = true;
  }

  // Simple Collision Detection with Platforms
  scene.traverse((object) => {
    if (object.isMesh && object !== ground && object !== player) {
      const platform = object;
      const playerBox = new THREE.Box3().setFromObject(player);
      const platformBox = new THREE.Box3().setFromObject(platform);
      
      if (playerBox.intersectsBox(platformBox)) {
        // Simple response: place player on top of the platform
        player.position.y = platform.position.y + 1.5; // 1.5 = platform height / 2 + player height / 2
        playerVelocity.y = 0;
        canJump = true;
      }
    }
  });

  // Camera follows the player
  camera.position.x = player.position.x;
  camera.position.y = player.position.y + 5;
  camera.position.z = player.position.z + 10;
  camera.lookAt(player.position);

  renderer.render(scene, camera);
}

animate();

// Ambient Light
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// Directional Light
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

// Adding Textures (Optional)
const textureLoader = new THREE.TextureLoader();
const groundTexture = textureLoader.load('path_to_ground_texture.jpg');
groundMaterial.map = groundTexture;
groundMaterial.needsUpdate = true;
