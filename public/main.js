// Import Three.js (if using modules)
import * as THREE from "three";

// Define message types
const MESSAGE_TYPES = {
  CREATE_LOBBY: "create_lobby",
  JOIN_LOBBY: "join_lobby",
  LOBBY_CREATED: "lobby_created",
  LOBBY_JOINED: "lobby_joined",
  LOBBY_ERROR: "lobby_error",
  GAME_START: "game_start",
  GAME_STATE: "game_state",
  PLAYER_INPUT: "player_input",
};

// WebSocket Setup
let socket;

function setupWebSocket() {
  socket = new WebSocket("ws://" + window.location.host + "/ws");

  socket.onopen = () => {
    console.log("Connected to server");
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
  };

  socket.onclose = () => {
    console.log("Disconnected from server");
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
      document.getElementById("lobbyError").innerText = data.message;
      break;
    case MESSAGE_TYPES.GAME_START:
      console.log("Game is starting!");
      break;
    case MESSAGE_TYPES.GAME_STATE:
      updateGameState(data.state);
      break;
    default:
      console.log("Unknown message type:", data.type);
  }
}

function hideLobbyModal() {
  document.getElementById("lobbyModal").classList.remove("show");
  document.getElementById("lobbyModal").classList.add("hidden");
  document.getElementById("info").classList.remove("hidden");
}

setupWebSocket();

// Event Listeners for Lobby Actions
document.getElementById("joinLobbyBtn").addEventListener("click", () => {
  const lobbyID = document.getElementById("lobbyIDInput").value.trim();
  if (lobbyID === "") {
    document.getElementById("lobbyError").innerText =
      "Please enter a Lobby ID.";
    return;
  }
  sendMessage({
    type: MESSAGE_TYPES.JOIN_LOBBY,
    lobbyID: lobbyID,
  });
});

document.getElementById("createLobbyBtn").addEventListener("click", () => {
  sendMessage({
    type: MESSAGE_TYPES.CREATE_LOBBY,
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
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 20, 30);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Handle Window Resize
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// Cannon.js World Setup
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0); // Gravity

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(50, 50, 50);
scene.add(directionalLight);

// Ground
const groundGeometry = new THREE.BoxGeometry(200, 1, 200);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x228b22 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.position.y = -0.5;
scene.add(ground);

const groundBody = new CANNON.Body({
  mass: 0, // Static body
  position: new CANNON.Vec3(0, -0.5, 0) 
});
const groundShape = new CANNON.Box(new CANNON.Vec3(100, 0.5, 100)); 
groundBody.addShape(groundShape);
world.addBody(groundBody);

// Player Class with Cannon Physics
class Player {
  constructor(color, id) {
    const geometry = new THREE.BoxGeometry(2, 4, 2);
    const material = new THREE.MeshStandardMaterial({ color });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(0, 2, 0);
    scene.add(this.mesh);

    // Physics Body
    this.body = new CANNON.Body({
      mass: 1,
      position: new CANNON.Vec3(0, 2, 0)
    });
    const playerShape = new CANNON.Box(new CANNON.Vec3(1, 2, 1));
    this.body.addShape(playerShape);
    world.addBody(this.body);

    // Movement Properties
    this.speed = 10;
    this.jumpSpeed = 5; // Adjusted for better physics
    this.canJump = true; // Allow jumps initially

    this.id = id;
  }

  update(delta) {
    // Update Three.js mesh based on Cannon.js body position and quaternion
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);

    // Reset jump ability if touching ground
    if (this.mesh.position.y <= 2) {
      this.canJump = true; // Reset jump ability
    }
  }

  setDirection(x, z) {
    const force = new CANNON.Vec3(x, 0, z).scale(this.speed);
    this.body.applyForce(force, this.body.position);
  }

  jump() {
    if (this.canJump) {
      this.body.velocity.y = this.jumpSpeed; // Set jump velocity
      this.canJump = false; // Prevent double jumping
    }
  }

  setPosition(pos) {
    this.body.position.set(pos.x, pos.y, pos.z); // Sync position with server
  }
}

// Initialize Players
const player1 = new Player(0x0000ff, "player1");
const player2 = new Player(0xff00ff, "player2");

// Platforms Creation
const platforms = [];
function createPlatform(position) {
  const platformBody = new CANNON.Body({
    mass: 0,
    position: new CANNON.Vec3(position.x, position.y, position.z)
  });
  const platformShape = new CANNON.Box(new CANNON.Vec3(5, 0.5, 5)); // Define size
  platformBody.addShape(platformShape);
  world.addBody(platformBody);
  return platformBody;
}

// Hide game info initially
document.getElementById("info").classList.add("hidden");

// Controls
const keysPressed = {};

// Event Listeners for Key Presses
document.addEventListener("keydown", (event) => {
  keysPressed[event.code] = true;

  // Jump logic for both players using Space bar
  if (event.code === "Space") {
    if (playerID === "player1") {
      player1.jump();
      sendInput({ action: "jump", playerID: "player1" });
    } else if (playerID === "player2") {
      player2.jump();
      sendInput({ action: "jump", playerID: "player2" });
    }
  }
});

document.addEventListener("keyup", (event) => {
  keysPressed[event.code] = false;
});

// Send Player Input to Server
function sendInput(input) {
  //console.log("Sending input: ", input);
  if (socket && socket.readyState === WebSocket.OPEN && playerID) {
    socket.send(
      JSON.stringify({
        type: MESSAGE_TYPES.PLAYER_INPUT,
        action: input.action,
        playerID: input.playerID, // Include playerID for collection
        direction: input.direction || null,
      })
    );
  }
}

// Animation Loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  
  // Step the Cannon.js world
  world.step(1 / 60, delta, 3);

  // Handle player controls for both players
  handlePlayerControls(player1); // For player 1
  handlePlayerControls(player2); // For player 2

  // Update players
  player1.update(delta);
  player2.update(delta);

  // Update cubes to fall
  cubes.forEach((cube) => {
    if (cube.position.y > 0) {
      cube.position.y -= 0.2; // Falling speed
    }
  });

  // Update camera to follow the active player
  updateCamera();

  // Render the scene
  renderer.render(scene, camera);
}

// New function to handle cube collection
function collectCubes(player) {
  const playerBox = new THREE.Box3().setFromObject(player.mesh);

  cubes.forEach((cube, index) => {
    const cubeBox = new THREE.Box3().setFromObject(cube);
    if (playerBox.intersectsBox(cubeBox)) {
      // The cube has been collected
      scene.remove(cube); // Remove cube from the scene
      cubes.splice(index, 1); // Remove from cubes array
      notifyServerCubeCollected(player.id); // Notify server about the collected cube
      console.log(`Player ${player.id} collected a cube`);
    }
  });
}

// notifyServerCubeCollected("player2");
function notifyServerCubeCollected(playerID) {
  sendInput({ action: "collect", playerID: playerID });
}

// Handle Player Controls Function
function handlePlayerControls(player) {
  let x = 0,
    z = 0;

  // Arrow Keys for both players
  if (keysPressed["ArrowUp"]) z -= 1; // Move up
  if (keysPressed["ArrowDown"]) z += 1; // Move down
  if (keysPressed["ArrowLeft"]) x -= 1; // Move left
  if (keysPressed["ArrowRight"]) x += 1; // Move right

  player.setDirection(x, z); // Update player direction based on keys pressed
  if (x !== 0 || z !== 0) {
    sendInput({
      action: "move",
      playerID: player.id,
      direction: { x: x, z: z },
    });
  }
}

// Update Camera Function
function updateCamera() {
  // Set camera position to follow the player
  if (playerID === "player1") {
    camera.position.set(
      player1.mesh.position.x,
      player1.mesh.position.y + 20,
      player1.mesh.position.z + 30
    );
    camera.lookAt(player1.mesh.position);
  } else if (playerID === "player2") {
    camera.position.set(
      player2.mesh.position.x,
      player2.mesh.position.y + 20,
      player2.mesh.position.z + 30
    );
    camera.lookAt(player2.mesh.position);
  }
}

var cubeInit = false;
// Update the game state with the latest data from the server
function updateGameState(state) {
  console.log("Updating game state:", state); // Log the entire state update for debugging
  console.log("cubes:", state.cubes.length);
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

  if (state.cubes.length > 0 && !cubeInit) {
    // Reset the cubes only if there are cubes available and the initialization hasn't happened yet
    updateCubes(state.cubes);
    cubeInit = true;
  }
  if (countCubesInScene() === 0) {
    cubeInit = false;
  }

  var totalCubesElement = document.getElementById("totalCubes");
  totalCubesElement.innerHTML = "Total Cubes: " + state.cubes.length;

  var player1CubesElement = document.getElementById("player1Cubes");
  player1CubesElement.innerHTML = "Player1 Cubes: " + state.player1Cubes;
  var player2CubesElement = document.getElementById("player2Cubes");
  player2CubesElement.innerHTML = "Player2 Cubes: " + state.player2Cubes;
}

// Function to count the number of cubes in the scene
function countCubesInScene() {
  let cubeCount = 0;

  // Loop through all children in the scene
  scene.children.forEach((child) => {
    // Check if the child has userData type of 'cube'
    if (child.userData.type === "cube") {
      cubeCount++;
    }
  });
  return cubeCount;
}

const cubes = [];
// Update cubes in the scene
function updateCubes(cubePositions) {
  if (cubePositions.length < 5) {
    return;
  }
  // Create new cubes based on server data
  cubePositions.forEach((pos) => {
    const cubeGeometry = new THREE.BoxGeometry(5, 5, 5); // Define cube dimensions
    const cubeMaterial = new THREE.MeshStandardMaterial({
      color: Math.random() * 0xffffff,
    });
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cube.position.set(pos.x, pos.y, pos.z);
    cube.userData.type = "cube"; // Mark as cube for collision detection
    scene.add(cube); // Add cube to the scene
    cubes.push(cube); // add cube to cubes array for later
  });
}

// Update platforms in the scene
// Update Platforms in the scene
function updatePlatforms(platformPositions) {
  // Clear existing platforms
  platforms.forEach((platform) => world.remove(platform));
  platforms.length = 0; // Clear the array

  // Create new platforms
  platformPositions.forEach((pos) => {
    const platform = createPlatform(pos); // Create physical platform
    const meshGeometry = new THREE.BoxGeometry(10, 1, 10);
    const meshMaterial = new THREE.MeshStandardMaterial({ color: 0x8b0000 });
    const mesh = new THREE.Mesh(meshGeometry, meshMaterial);
    mesh.position.set(pos.x, pos.y, pos.z);
    scene.add(mesh);
    platforms.push(platform); // Store the body
  });
}

// Check for collisions with platforms
function checkPlatformCollision(player) {
  const playerBox = new THREE.Box3().setFromObject(player.mesh);
  let isOnPlatform = false; // Track if the player is on a platform

  scene.children.forEach((child) => {
    if (child.userData.type === "platform") {
      const platformBox = new THREE.Box3().setFromObject(child);
      if (playerBox.intersectsBox(platformBox)) {
        // Check if the player is falling onto the platform
        if (player.velocity.y < 0) {
          // Set the player's Y position to the top of the platform (height + 0.5)
          player.mesh.position.y =
            child.position.y +
            child.geometry.parameters.height / 2 +
            player.mesh.geometry.parameters.height / 2;
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
