// Import Three.js (if using modules)
import * as THREE from 'three';

// Initialize Scene, Camera, Renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75, window.innerWidth / window.innerHeight, 0.1, 1000
);
camera.position.set(0, 10, 20);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Handle Window Resize
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

// Ground
const groundGeometry = new THREE.BoxGeometry(100, 1, 100);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.position.y = -0.5;
scene.add(ground);

// Platforms
const platformGeometry = new THREE.BoxGeometry(5, 1, 5);
const platformMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });

for (let i = 0; i < 10; i++) {
  const platform = new THREE.Mesh(platformGeometry, platformMaterial);
  platform.position.set(
    Math.random() * 80 - 40,
    Math.random() * 20 + 1,
    Math.random() * 80 - 40
  );
  scene.add(platform);
}

// Player Class
class Player {
  constructor(color, id) {
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    const material = new THREE.MeshStandardMaterial({ color });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = 1;
    scene.add(this.mesh);

    // Movement properties
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.speed = 5;
    this.jumpSpeed = 8;
    this.canJump = false;

    // Player ID
    this.id = id;
  }

  update(delta) {
    // Apply gravity
    this.velocity.y -= 9.81 * delta;

    // Update position
    this.mesh.position.addScaledVector(this.velocity, delta);

    // Collision with ground
    if (this.mesh.position.y <= 1) {
      this.mesh.position.y = 1;
      this.velocity.y = 0;
      this.canJump = true;
    }

    // TODO: Implement collision with platforms
  }

  setDirection(x, z) {
    this.direction.set(x, 0, z).normalize();
    if (this.direction.length() > 0) {
      this.velocity.x = this.direction.x * this.speed;
      this.velocity.z = this.direction.z * this.speed;
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
  }

  jump() {
    if (this.canJump) {
      this.velocity.y = this.jumpSpeed;
      this.canJump = false;
    }
  }

  setPosition(pos) {
    this.mesh.position.set(pos.x, pos.y, pos.z);
  }
}

// Initialize Players
const player1 = new Player(0x0000ff, 'player1');
const player2 = new Player(0xff00ff, 'player2');

// Camera follows player1 by default
function updateCamera() {
  camera.position.x = player1.mesh.position.x;
  camera.position.y = player1.mesh.position.y + 10;
  camera.position.z = player1.mesh.position.z + 20;
  camera.lookAt(player1.mesh.position);
}

// Controls
const keysPressed = {};

// Event Listeners for Key Presses
document.addEventListener('keydown', (event) => {
  keysPressed[event.code] = true;

  // Player 1 Jump
  if (event.code === 'Space') {
    player1.jump();
    sendInput({ action: 'jump', player: 'player1' });
  }

  // Player 2 Jump (e.g., 'KeyJ')
  if (event.code === 'KeyJ') {
    player2.jump();
    sendInput({ action: 'jump', player: 'player2' });
  }
});

document.addEventListener('keyup', (event) => {
  keysPressed[event.code] = false;
});

// WebSocket Setup
let socket;

function setupWebSocket() {
  // Replace the WebSocket URL with your server's address
  //socket = new WebSocket('ws://' + window.location.host + '/ws');
  socket = new WebSocket('ws://localhost:8080/ws');

  socket.onopen = () => {
    console.log('Connected to server');
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'state') {
      // Update other player positions
      if (data.player1) {
        player1.setPosition(data.player1.position);
      }
      if (data.player2) {
        player2.setPosition(data.player2.position);
      }
    }else{
      // Handle other message types if necessary
    }
  };

  socket.onclose = () => {
    console.log('Disconnected from server');
  };
}

function sendInput(input) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(input));
  }
}

setupWebSocket();

// Animation Loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  // Handle player1 controls
  let p1x = 0, p1z = 0;
  if (keysPressed['KeyW'] || keysPressed['ArrowUp']) p1z -= 1;
  if (keysPressed['KeyS'] || keysPressed['ArrowDown']) p1z += 1;
  if (keysPressed['KeyA'] || keysPressed['ArrowLeft']) p1x -= 1;
  if (keysPressed['KeyD'] || keysPressed['ArrowRight']) p1x += 1;
  player1.setDirection(p1x, p1z);
  sendInput({ 
    action: 'move', 
    player: 'player1', 
    direction: { x: p1x, z: p1z } 
  });

  // Handle player2 controls
  let p2x = 0, p2z = 0;
  if (keysPressed['KeyI']) p2z -= 1;
  if (keysPressed['KeyK']) p2z += 1;
  if (keysPressed['KeyJ']) p2x -= 1;
  if (keysPressed['KeyL']) p2x += 1;
  player2.setDirection(p2x, p2z);
  sendInput({ 
    action: 'move', 
    player: 'player2', 
    direction: { x: p2x, z: p2z } 
  });

  // Update players
  player1.update(delta);
  player2.update(delta);

  // Update camera
  updateCamera();

  renderer.render(scene, camera);
}

animate();
