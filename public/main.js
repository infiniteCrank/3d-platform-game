// Import Three.js (if using modules)
import * as THREE from 'three';

// Define message types
const MESSAGE_TYPES = {
  CREATE_LOBBY: 'create_lobby',
  JOIN_LOBBY: 'join_lobby',
  LOBBY_CREATED: 'lobby_created',
  LOBBY_JOINED: 'lobby_joined',
  LOBBY_ERROR: 'lobby_error',
  GAME_START: 'game_start',
  GAME_STATE: 'game_state',
  PLAYER_INPUT: 'player_input'
};

// WebSocket Setup
let socket;

function setupWebSocket() {
  socket = new WebSocket('ws://' + window.location.host + '/ws');

  socket.onopen = () => {
    console.log('Connected to server');
  };

  socket.onmessage = (event) => {
    console.log(event)
    const data = JSON.parse(event.data);
    switch (data.type) {
      case MESSAGE_TYPES.LOBBY_CREATED:
        console.log(`Lobby created with ID: ${data.lobbyID}`);
        alert(`Lobby created! Lobby ID: ${data.lobbyID}`);
        document.getElementById('lobbyModal').classList.remove('show');
        document.getElementById('lobbyModal').classList.add('hidden');
        document.getElementById('info').classList.remove('hidden');
        break;
      case MESSAGE_TYPES.LOBBY_JOINED:
        console.log(`Joined Lobby: ${data.lobbyID} as ${data.playerID}`);
        playerID = data.playerID;
        // Hide lobby modal and show game info
        document.getElementById('lobbyModal').classList.remove('show');
        document.getElementById('lobbyModal').classList.add('hidden');
        document.getElementById('info').classList.remove('hidden');
        break;
      case MESSAGE_TYPES.LOBBY_ERROR:
        console.error(`Lobby Error: ${data.message}`);
        document.getElementById('lobbyError').innerText = data.message;
        break;
      case MESSAGE_TYPES.GAME_START:
        console.log('Game is starting!');
        // Additional game start logic if needed
        break;
      case MESSAGE_TYPES.GAME_STATE:
        // Update game state
        console.log("i updated game state.")
        updateGameState(data.state);
        break;
      default:
        console.log('Unknown message type:', data.type);
    }
  };

  socket.onclose = () => {
    console.log('Disconnected from server');
  };
}

setupWebSocket();

// Lobby Modal Elements
const lobbyModal = document.getElementById('lobbyModal');
const lobbyIDInput = document.getElementById('lobbyIDInput');
const joinLobbyBtn = document.getElementById('joinLobbyBtn');
const createLobbyBtn = document.getElementById('createLobbyBtn');
const lobbyError = document.getElementById('lobbyError');

// Event Listeners for Lobby Actions
joinLobbyBtn.addEventListener('click', () => {
  const lobbyID = lobbyIDInput.value.trim();
  if (lobbyID === '') {
    lobbyError.innerText = 'Please enter a Lobby ID.';
    return;
  }
  sendMessage({
    type: MESSAGE_TYPES.JOIN_LOBBY,
    lobbyID: lobbyID
  });
});

createLobbyBtn.addEventListener('click', () => {
  sendMessage({
    type: MESSAGE_TYPES.CREATE_LOBBY
  });
});

function sendMessage(message) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

// Player Identifier
let playerID = null; // 'player1' or 'player2'

// Three.js Initialization
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75, window.innerWidth / window.innerHeight, 0.1, 1000
);
camera.position.set(0, 20, 30);

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
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(50, 50, 50);
scene.add(directionalLight);

// Ground
const groundGeometry = new THREE.BoxGeometry(200, 1, 200);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.position.y = -0.5;
scene.add(ground);

// Player Class
class Player {
  constructor(color, id) {
    const geometry = new THREE.BoxGeometry(2, 4, 2);
    const material = new THREE.MeshStandardMaterial({ color });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = 2;
    scene.add(this.mesh);

    // Movement properties
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.speed = 10;
    this.jumpSpeed = 15;
    this.canJump = false;

    // Player ID
    this.id = id;
  }

  update(delta) {
    // Apply gravity
    this.velocity.y -= 30 * delta; // Stronger gravity for realism

    // Update position
    this.mesh.position.addScaledVector(this.velocity, delta);

    // Collision with ground
    if (this.mesh.position.y <= 2) {
      this.mesh.position.y = 2;
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
    this.mesh.position.set(pos.X, pos.Y, pos.Z);
  }
}

// Initialize Players
const player1 = new Player(0x0000ff, 'player1');
const player2 = new Player(0xff00ff, 'player2');

// Hide game info initially
document.getElementById('info').classList.add('hidden');

// Controls
const keysPressed = {};

// Event Listeners for Key Presses
document.addEventListener('keydown', (event) => {
  keysPressed[event.code] = true;

  // Player 1 Jump
  if (event.code === 'Space' && playerID === 'player1') {
    player1.jump();
    sendInput({ action: 'jump' });
  }

  // Player 2 Jump
  if (event.code === 'KeyO' && playerID === 'player2') {
    player2.jump();
    sendInput({ action: 'jump' });
  }
});

document.addEventListener('keyup', (event) => {
  keysPressed[event.code] = false;
});

// Send Player Input to Server
function sendInput(input) {
  if (socket && socket.readyState === WebSocket.OPEN && playerID) {
    socket.send(JSON.stringify({
      type: MESSAGE_TYPES.PLAYER_INPUT,
      action: input.action,
      direction: input.direction || null
    }));
  }
}

// Define player identifiers
// playerID is set when joining a lobby
// It determines whether this client controls player1 or player2

// Animation Loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  // Handle player1 controls
  if (playerID === 'player1') {
    let p1x = 0, p1z = 0;
    if (keysPressed['KeyW'] || keysPressed['ArrowUp']) p1z -= 1;
    if (keysPressed['KeyS'] || keysPressed['ArrowDown']) p1z += 1;
    if (keysPressed['KeyA'] || keysPressed['ArrowLeft']) p1x -= 1;
    if (keysPressed['KeyD'] || keysPressed['ArrowRight']) p1x += 1;
    player1.setDirection(p1x, p1z);
    if (p1x !== 0 || p1z !== 0) {
      sendInput({
        action: 'move',
        direction: { x: p1x, z: p1z }
      });
    }
  }

  // Handle player2 controls
  if (playerID === 'player2') {
    let p2x = 0, p2z = 0;
    if (keysPressed['KeyI']) p2z -= 1;
    if (keysPressed['KeyK']) p2z += 1;
    if (keysPressed['KeyJ']) p2x -= 1;
    if (keysPressed['KeyL']) p2x += 1;
    player2.setDirection(p2x, p2z);
    if (p2x !== 0 || p2z !== 0) {
      sendInput({
        action: 'move',
        direction: { x: p2x, z: p2z }
      });
    }
  }

  // Update players
  player1.update(delta);
  player2.update(delta);

  // Update camera
  updateCamera();

  renderer.render(scene, camera);
}

animate();

// Update Camera to follow the active player
function updateCamera() {
  if (playerID === 'player1') {
    camera.position.x = player1.mesh.position.x;
    camera.position.y = player1.mesh.position.y + 20;
    camera.position.z = player1.mesh.position.z + 30;
    camera.lookAt(player1.mesh.position);
  } else if (playerID === 'player2') {
    camera.position.x = player2.mesh.position.x;
    camera.position.y = player2.mesh.position.y + 20;
    camera.position.z = player2.mesh.position.z + 30;
    camera.lookAt(player2.mesh.position);
  }
}

// Placeholder function to update game state
function updateGameState(state) {
  // Update player positions
  if (state.Player1) {
    player1.setPosition(state.Player1.Position);
  }
  if (state.Player2) {
    player2.setPosition(state.Player2.Position);
  }

  // Update platform positions
  if (state.platforms) {
    updatePlatforms(state.platforms);
  }
}

function updatePlatforms(platformPositions) {
  // Remove existing platforms
  scene.children = scene.children.filter(child => child.userData.type !== 'platform');

  // Create new platforms based on server data
  platformPositions.forEach(pos => {
      const platformGeometry = new THREE.BoxGeometry(10, 1, 10);
      const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x8B0000 });
      const platform = new THREE.Mesh(platformGeometry, platformMaterial);
      platform.position.set(pos.x, pos.y, pos.z);
      platform.userData.type = 'platform';
      scene.add(platform);
  });
}
