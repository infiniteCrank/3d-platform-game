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
        const data = JSON.parse(event.data);
        handleServerMessage(data);
    };

    socket.onclose = () => {
        console.log('Disconnected from server');
    };
}

function handleServerMessage(data) {
    switch (data.type) {
        case MESSAGE_TYPES.LOBBY_CREATED:
            alert(`Lobby created! Lobby ID: ${data.lobbyID}`);
            playerID = "player1";
            console.log(`Joined Lobby: ${data.lobbyID} as ${playerID}`);
            hideLobbyModal();
            break;
        case MESSAGE_TYPES.LOBBY_JOINED:
            playerID = data.playerID;
            console.log(`Joined Lobby: ${data.lobbyID} as ${playerID}`);
            hideLobbyModal();
            break;
        case MESSAGE_TYPES.LOBBY_ERROR:
            console.error(`Lobby Error: ${data.message}`);
            document.getElementById('lobbyError').innerText = data.message;
            break;
        case MESSAGE_TYPES.GAME_START:
            console.log('Game is starting!');
            break;
        case MESSAGE_TYPES.GAME_STATE:
            updateGameState(data.state);
            break;
        default:
            console.log('Unknown message type:', data.type);
    }
}

function hideLobbyModal() {
    document.getElementById('lobbyModal').classList.remove('show');
    document.getElementById('lobbyModal').classList.add('hidden');
    document.getElementById('info').classList.remove('hidden');
}

setupWebSocket();

// Event Listeners for Lobby Actions
document.getElementById('joinLobbyBtn').addEventListener('click', () => {
    const lobbyID = document.getElementById('lobbyIDInput').value.trim();
    if (lobbyID === '') {
        document.getElementById('lobbyError').innerText = 'Please enter a Lobby ID.';
        return;
    }
    sendMessage({
        type: MESSAGE_TYPES.JOIN_LOBBY,
        lobbyID: lobbyID
    });
});

document.getElementById('createLobbyBtn').addEventListener('click', () => {
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
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
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
        this.jumpSpeed = 5; // Set jump speed for the player
        this.canJump = false;

        // Player ID
        this.id = id;
    }

    update(delta) {
        // Apply gravity
        this.velocity.y -= 30 * delta; // Stronger gravity for realism

        // Update position
        this.mesh.position.addScaledVector(this.velocity, delta);

        // Check for collision with platforms
        checkPlatformCollision(this);

        // Collision with ground
        if (this.mesh.position.y <= 2) {
            this.mesh.position.y = 2; // Reset to ground level
            this.velocity.y = 0; // Reset vertical velocity
            this.canJump = true; // Player can jump when on the ground
        }
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
            this.velocity.y = this.jumpSpeed; // Jumps up
            this.canJump = false; // Prevent further jumps until next landing
        }
    }

    setPosition(pos) {
        // Update position exactly as per server instructions
        this.mesh.position.set(pos.x, pos.y, pos.z);
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

    // Jump logic
    if (event.code === 'Space' && playerID === 'player1') {
        player1.jump();
        sendInput({ action: 'jump' });
    }
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
    console.log("Sending input: ", input);
    if (socket && socket.readyState === WebSocket.OPEN && playerID) {
        socket.send(JSON.stringify({
            type: MESSAGE_TYPES.PLAYER_INPUT,
            action: input.action,
            direction: input.direction || null
        }));
    }
}

// Animation Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // Handle player controls
    if (playerID === 'player1') {
      handlePlayerControls(player1, {
        up: 'KeyW',
        down: 'KeyS',
        left: 'KeyA',
        right: 'KeyD'
    });
}

if (playerID === 'player2') {
    handlePlayerControls(player2, {
        up: 'KeyI',
        down: 'KeyK',
        left: 'KeyJ',
        right: 'KeyL'
    });
}

// Update players
player1.update(delta);
player2.update(delta);

// Update camera to follow the active player
updateCamera();

// Render the scene
renderer.render(scene, camera);
}

// Handle Player Controls Function
function handlePlayerControls(player, controls) {
let x = 0, z = 0;

// Check for input to adjust movement
if (keysPressed[controls.up]) z -= 1; // Move forward
if (keysPressed[controls.down]) z += 1; // Move backward
if (keysPressed[controls.left]) x -= 1; // Move left
if (keysPressed[controls.right]) x += 1; // Move right

player.setDirection(x, z); // Update player direction based on keys pressed
if (x !== 0 || z !== 0) {
    sendInput({
        action: 'move',
        direction: { x: x, z: z } // Send movement direction to server
    });
}
}

// Update Camera Function
function updateCamera() {
// Set camera position to follow the player
if (playerID === 'player1') {
    camera.position.set(player1.mesh.position.x, player1.mesh.position.y + 20, player1.mesh.position.z + 30);
    camera.lookAt(player1.mesh.position);
} else if (playerID === 'player2') {
    camera.position.set(player2.mesh.position.x, player2.mesh.position.y + 20, player2.mesh.position.z + 30);
    camera.lookAt(player2.mesh.position);
}
}

// Update the game state with the latest data from the server
function updateGameState(state) {
console.log("Updating game state:", state); // Log the entire state update for debugging

if (state.player1 && state.player1.position) {
    player1.setPosition(state.player1.position); // Update player 1 position
}
if (state.player2 && state.player2.position) {
    player2.setPosition(state.player2.position); // Update player 2 position
}

// Update platform positions if provided
if (state.platforms) {
    updatePlatforms(state.platforms);
}
}

// Update platforms in the scene
function updatePlatforms(platformPositions) {
// Remove existing platforms
scene.children = scene.children.filter(child => child.userData.type !== 'platform');

// Create new platforms based on server data
platformPositions.forEach(pos => {
    const platformGeometry = new THREE.BoxGeometry(10, 1, 10); // Define platform dimensions
    const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x8B0000 });
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.set(pos.x, pos.y, pos.z);
    platform.userData.type = 'platform'; // Mark as platform for collision detection
    scene.add(platform); // Add platform to the scene
});
}

// Check for collisions with platforms
function checkPlatformCollision(player) {
const playerBox = new THREE.Box3().setFromObject(player.mesh);
let isOnPlatform = false; // Track if the player is on a platform

scene.children.forEach(child => {
    if (child.userData.type === 'platform') {
        const platformBox = new THREE.Box3().setFromObject(child);
        if (playerBox.intersectsBox(platformBox)) {
            // Check if the player is falling onto the platform
            if (player.velocity.y < 0) {
                player.mesh.position.y = child.position.y + 1; // Land on top of the platform
                player.velocity.y = 0; // Reset vertical velocity
                isOnPlatform = true; // Mark player as on platform
            }
        }
    }
});

// If not on any platform, check for ground contact
if (!isOnPlatform && player.mesh.position.y <= 2) {
    player.mesh.position.y = 2; // Set Y to ground level
    player.velocity.y = 0; // Reset vertical velocity
    player.canJump = true; // Allow jumping again from the ground
} else if (isOnPlatform) {
    player.canJump = true; // Allow jumping if on a platform
  }
}

// Start the animation loop
animate();