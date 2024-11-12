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
        this.jumpSpeed = 10; // Increased jump speed for higher jumps
        this.canJump = false;

        // Player ID
        this.id = id;
    }

    update(delta) {
        // Apply gravity
        this.velocity.y -= 30 * delta; // Stronger gravity for realism

        // Update position using interpolation for smoother movement
        this.mesh.position.y += this.velocity.y * delta;

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

// Cube Class
class Cube {
constructor() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xffff00 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.resetPosition();
    scene.add(this.mesh);
    this.isGrounded = false; // Track if the cube is on the ground or a platform
}

resetPosition() {
    this.mesh.position.set(THREE.MathUtils.randFloat(-90, 90), 50, THREE.MathUtils.randFloat(-90, 90)); // Start above the ground
    this.isGrounded = false; // Reset grounded state
}

update(delta) {
    this.mesh.position.y -= 10 * delta; // Fall speed

    // Check for collisions with the ground and platforms
    this.checkCollision();

    // If the cube is still in the air, reset position if it goes below ground (for demo purposes)
    if (!this.isGrounded && this.mesh.position.y < -1) {
        this.resetPosition();
    }
}

checkCollision() {
    const cubeBox = new THREE.Box3().setFromObject(this.mesh);

    // Check collision with ground
    const groundBox = new THREE.Box3().setFromObject(ground);
    if (!this.isGrounded && cubeBox.intersectsBox(groundBox)) {
        // Set the cube's Y position just above the ground
        this.mesh.position.y = 1; // Set to just above the ground
        this.isGrounded = true;
        return;
    }

    // Check collision with platforms
    let onPlatform = false; // Track if the cube is on any platform
    scene.children.forEach(child => {
        if (child.userData.type === 'platform') {
            const platformBox = new THREE.Box3().setFromObject(child);
            if (!this.isGrounded && cubeBox.intersectsBox(platformBox)) {
                // Set cube on top of the platform
                this.mesh.position.y = child.position.y + 1; // Set the cube's y position slightly above the platform
                onPlatform = true; // Mark as on a platform
            }
        }
    });

    // Reset grounded state if not on ground or platform
    if (!onPlatform) {
        this.isGrounded = false;
    }
}
}

const cubes = Array.from({ length: 5 }, () => new Cube()); // Create 5 cubes

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

    // Jump logic for both players using Space bar
    if (event.code === 'Space') {
        if (playerID === 'player1') {
            player1.jump();
            sendInput({ action: 'jump', playerID: 'player1' });
        } else if (playerID === 'player2') {
            player2.jump();
            sendInput({ action: 'jump', playerID: 'player2' });
        }
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
            playerID: input.playerID, // Include playerID for collection
            direction: input.direction || null
        }));
    }
}

// Animation Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // Handle player controls for both players
    handlePlayerControls(player1); // For player 1
    handlePlayerControls(player2); // For player 2

    // Update players
    player1.update(delta);
    player2.update(delta);

    // Update cubes
    cubes.forEach(cube => {
        cube.update(delta);
        checkCubeCollision(cube); // Check if player collects the cube
    });

    // Update camera to follow the active player
    updateCamera();

    // Render the scene
    renderer.render(scene, camera);
}

// Handle Player Controls Function
function handlePlayerControls(player) {
    let x = 0, z = 0;

// Arrow Keys for both players
if (keysPressed['ArrowUp']) z -= 1; // Move up
if (keysPressed['ArrowDown']) z += 1; // Move down
if (keysPressed['ArrowLeft']) x -= 1; // Move left
if (keysPressed['ArrowRight']) x += 1; // Move right

player.setDirection(x, z); // Update player direction based on keys pressed
if (x !== 0 || z !== 0) {
    sendInput({
        action: 'move',
        playerID: player.id,
        direction: { x: x, z: z }
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

// Check Cube Collision
function checkCubeCollision(cube) {
// Check collision with player1
const player1Box = new THREE.Box3().setFromObject(player1.mesh);
const cubeBox = new THREE.Box3().setFromObject(cube.mesh);

if (player1Box.intersectsBox(cubeBox)) {
    // Handle cube collection logic for player1
    scene.remove(cube.mesh); // Remove collected cube from scene
    cube.resetPosition(); // Reset cube position 
    notifyServerCubeCollected('player1');
}

// Check collision with player2
const player2Box = new THREE.Box3().setFromObject(player2.mesh);
if (player2Box.intersectsBox(cubeBox)) {
    // Handle cube collection logic for player2
    scene.remove(cube.mesh); // Remove collected cube from scene
    cube.resetPosition(); // Reset cube position 
    notifyServerCubeCollected('player2');
}
}

function notifyServerCubeCollected(playerID) {
sendInput({ action: 'collect', playerID: playerID });
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

// Update cube positions if provided
if (state.cubes) {
    updateCubes(state.cubes);
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

// Update cubes in the scene
function updateCubes(cubePositions) {
// Remove existing cubes
scene.children = scene.children.filter(child => child.userData.type !== 'cube');

// Create new cubes based on server data
cubePositions.forEach(pos => {
    const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
    const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 });
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cube.position.set(pos.x, pos.y, pos.z);
    cube.userData.type = 'cube'; // Mark as cube for collision detection
    scene.add(cube); // Add cube to the scene
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