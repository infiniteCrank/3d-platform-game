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
    // Optional: Reconnect logic can be added here.
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
// Join and Create Lobby Buttons
document.getElementById("joinLobbyBtn").addEventListener("click", () => {
  const lobbyID = document.getElementById("lobbyIDInput").value.trim();
  if (lobbyID === "") {
    document.getElementById("lobbyError").innerText =
      "Please enter a Lobby ID.";
    return;
  }
  sendMessage({ type: MESSAGE_TYPES.JOIN_LOBBY, lobbyID: lobbyID });
});

document.getElementById("createLobbyBtn").addEventListener("click", () => {
  sendMessage({ type: MESSAGE_TYPES.CREATE_LOBBY });
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
  position: new CANNON.Vec3(0, -0.5, 0),
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
      position: new CANNON.Vec3(0, 2, 0),
      linearDamping: 0.2,
      angularDamping: 0.5,
    });

    // Use a box shape for the collider
    const playerShape = new CANNON.Box(new CANNON.Vec3(1, 2, 1));
    this.body.addShape(playerShape);
    world.addBody(this.body);

    // Movement Properties
    this.speed = 10;
    this.jumpSpeed = 20;
    this.canJump = true;
    this.id = id;
  }

  update(delta) {
    // Sync Three.js mesh with Cannon.js body position and rotation
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);

    // Check if the player is lying on their side
    const up = new CANNON.Vec3(0, 1, 0); // Up vector in world space
    const forward = this.body.quaternion.vmult(up); // Get the player's upward direction

    // Determine if the player is on their side
    if (Math.abs(forward.y) < 0.5) {
      // If the player is approximately horizontal
      // Reset the player's rotation to upright
      const uprightQuaternion = new CANNON.Quaternion(); // New Quaternion
      uprightQuaternion.set(0, 0, 0, 1); // Set to upright quaternion (identity)

      this.body.quaternion.copy(uprightQuaternion); // Reset orientation to upright
      this.body.position.y = 2; // Adjust Y position as needed (to remain above ground)
    }

    // Reset jump ability if touching ground
    if (this.mesh.position.y <= 2) {
      this.canJump = true;
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
    this.body.position.set(pos.x, pos.y, pos.z);
    this.update(0); // Call update to sync the mesh position
  }
}

// Utility function to convert CANNON quaternion to Euler angles
function quaternionToEuler(quaternion) {
  const euler = new THREE.Euler();
  // Create THREE.Quaternion to convert
  const threeQuaternion = new THREE.Quaternion(
    quaternion.x,
    quaternion.y,
    quaternion.z,
    quaternion.w
  );
  euler.setFromQuaternion(threeQuaternion);
  return euler;
}

// Initialize Players
const player1 = new Player(0x0000ff, "player1");
const player2 = new Player(0xff00ff, "player2");

// Platforms Creation
const platforms = [];
function createPlatform(position) {
  const platformBody = new CANNON.Body({
    mass: 0,
    position: new CANNON.Vec3(position.x, position.y, position.z),
  });

  const platformShape = new CANNON.Box(new CANNON.Vec3(5, 0.5, 5));
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

  // Shooting logic - check if the enter key is pressed
  if (event.code === "Enter") {
    sendInput({ action: "shoot", playerID: playerID }); // Send shoot action to server
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
  if (document.hidden) {
    requestAnimationFrame(animate);
    return;
  }
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  // Step the Cannon.js world
  //world.step(1 / 60, delta, 3);
  world.step(1 / 30, delta, 1); // Example of less frequent updates

  // Handle player controls for both players
  handlePlayerControls(player1); // For player 1
  handlePlayerControls(player2); // For player 2

  // Update players
  player1.update(delta);
  player2.update(delta);

  // Check for cube collection
  collectCubes(player1); // Check for player1 collecting cubes
  collectCubes(player2); // Check for player2 collecting cubes

  // Update each cube
  cubes.forEach((cube) => cube.update());

  // Update camera to follow the active player
  updateCamera();

  // Render the scene
  renderer.render(scene, camera);
}

// Cube Class for collectibles
class Cube {
  constructor(position) {
    // Create the physical body for the cube
    this.body = new CANNON.Body({
      mass: 1, // Allow it to fall
      position: new CANNON.Vec3(position.x, position.y, position.z),
    });

    const cubeShape = new CANNON.Box(new CANNON.Vec3(2.5, 2.5, 2.5));
    this.body.addShape(cubeShape);
    world.addBody(this.body);

    // Create the visual representation of the cube
    const geometry = new THREE.BoxGeometry(5, 5, 5);
    const material = new THREE.MeshStandardMaterial({
      color: Math.random() * 0xffffff,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(this.body.position);
    scene.add(this.mesh);

    this.mesh.userData.type = "cube"; // Optional userData for identifying cubes
  }

  update() {
    // Sync the position of the Three.js mesh with the Cannon.js body
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
  }

  dispose() {
    // Dispose of the mesh and remove from the scene
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// Function to create cubes from server positions
const cubes = [];
function updateCubes(cubePositions) {
  //this fixes the extra cube problem
  if (cubePositions.length < 5) {
    return;
  }
  // Clear existing cubes
  while (cubes.length > 0) {
    const cubeToRemove = cubes.pop();
    cubeToRemove.dispose(); // Properly dispose of cube objects
    world.remove(cubeToRemove.body);
  }

  // Create new cubes based on server data
  for (const pos of cubePositions) {
    const cube = new Cube(pos);
    cubes.push(cube);
  }
}

// Collect Cubes Function
function collectCubes(player) {
  const playerBox = new THREE.Box3().setFromObject(player.mesh);

  for (let i = cubes.length - 1; i >= 0; i--) {
    const cube = cubes[i];
    const cubeBox = new THREE.Box3().setFromObject(cube.mesh);

    // Check for intersection
    if (playerBox.intersectsBox(cubeBox)) {
      cube.dispose(); // Dispose of the cube when collected
      cubes.splice(i, 1); // Remove from cubes array
      notifyServerCubeCollected(player.id); // Notify server
      console.log(`Player ${player.id} collected a cube`);
    }
  }
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
var platformInit = false;
// Update the game state with the latest data from the server
function updateGameState(state) {
  // console.log("Updating game state:", state); // Log the entire state update for debugging
  if (state.player1 && state.player1.position) {
    player1.setPosition(state.player1.position); // Update player 1 position
  }
  if (state.player2 && state.player2.position) {
    player2.setPosition(state.player2.position); // Update player 2 position
  }

  // Update platform positions if provided
  if (state.platforms && !platformInit) {
    updatePlatforms(state.platforms);
    platformInit = true;
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

  var player1HealthElement = document.getElementById("player1Health");
  player1HealthElement.innerHTML = "Player1 Health: " + state.player1Health;
  var player2HealthElement = document.getElementById("player2Health");
  player2HealthElement.innerHTML = "Player2 Health: " + state.player2Health;
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

function updatePlatforms(platformPositions) {
  // Clear existing platforms from the physics world and the scene
  platforms.forEach(({ body, mesh }) => {
    world.remove(body); // Remove from the physics world
    scene.remove(mesh); // Remove from the scene
    mesh.geometry.dispose(); // Dispose of geometry
    mesh.material.dispose(); // Dispose of material
  });

  // Clear the platforms array for new platforms
  platforms.length = 0;

  // Create new platforms
  platformPositions.forEach((pos) => {
    const platformBody = createPlatform(pos); // Create physical platform
    const meshGeometry = new THREE.BoxGeometry(10, 1, 10);
    const meshMaterial = new THREE.MeshStandardMaterial({ color: 0x8b0000 });
    const mesh = new THREE.Mesh(meshGeometry, meshMaterial);
    mesh.position.set(pos.x, pos.y, pos.z);
    scene.add(mesh); // Add mesh visual representation

    // Store platform body and mesh together
    platforms.push({ body: platformBody, mesh: mesh }); // Save the platform body and its mesh
  });
}

// Start the animation loop
animate();
