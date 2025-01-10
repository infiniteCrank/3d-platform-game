package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Position represents a player's position in 3D space.
type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

// PlayerState holds the state of a player.
type PlayerState struct {
	Position Position `json:"position"`
}

// GameState holds the state of the game within a lobby.
type GameState struct {
	Player1   PlayerState `json:"player1"`
	Player2   PlayerState `json:"player2"`
	Platforms []Position  `json:"platforms"`
	Cubes     []Position  `json:"cubes"` // Added cubes to the game state
}

// InputMessage represents input from clients.
type InputMessage struct {
	Type      string     `json:"type"`
	LobbyID   string     `json:"lobbyID,omitempty"`
	Player    string     `json:"player,omitempty"`
	Action    string     `json:"action,omitempty"`
	PlayerID  string     `json:"playerID,omitempty"` // Indicate player ID for collection
	Direction *Direction `json:"direction,omitempty"`
}

// Direction represents movement direction.
type Direction struct {
	X float64 `json:"x"`
	Z float64 `json:"z"`
}

// Client represents a connected client.
type Client struct {
	conn     *websocket.Conn
	send     chan []byte
	lobby    *Lobby
	playerID string // 'player1' or 'player2'
}

// Lobby represents a game lobby.
type Lobby struct {
	ID         string
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	state      GameState
	mutex      sync.Mutex
}

// Server holds all lobbies.
type Server struct {
	lobbies  map[string]*Lobby
	mutex    sync.Mutex
	upgrader websocket.Upgrader
}

// Initialize a new server.
func newServer() *Server {
	return &Server{
		lobbies: make(map[string]*Lobby),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true // Allow all connections for simplicity
			},
		},
	}
}

// Initialize a new lobby.
func newLobby(id string) *Lobby {
	platforms := generateRandomPlatforms(10)
	//cubes := generateInitialCubes(5) // Create 5 initial falling cubes

	return &Lobby{
		ID:         id,
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		state: GameState{
			Player1:   PlayerState{Position: Position{X: 0, Y: 2, Z: 0}},
			Player2:   PlayerState{Position: Position{X: 0, Y: 2, Z: 0}},
			Platforms: platforms,
			Cubes:     []Position{}, // Initialize with an empty slice,
		},
	}
}

// Generate random platforms for the game
func generateRandomPlatforms(count int) []Position {
	randomSource := rand.New(rand.NewSource(time.Now().UnixNano())) // Create a new random source
	platforms := make([]Position, 0)

	maxInitialHeight := 3.0

	for i := 0; i < count; i++ {
		var newPlatform Position
		if i == 0 {
			// First platform with a max height of 3 and a random Z position
			newPlatform = Position{
				X: generateRandomFloat(-140, 140),            // Random X within range [-2, 2]
				Y: randomSource.Float64() * maxInitialHeight, // Y can be 0 to maxInitialHeight
				Z: generateRandomFloat(-140, 140),            // Random Z within range [-90, 90]
			}
		} else {
			// Increase the Y value for each subsequent platform and add random Z coordinate
			newPlatform = Position{
				X: generateRandomFloat(-140, 140), // Random X within range [-2, 2]
				Y: float64(i + 2),                 // Height Y increases by 1 for each platform (starting from 2)
				Z: generateRandomFloat(-140, 140),
			}
		}

		// Adjust X coordinate to be within horizontal distance of 2 from the platform below
		if len(platforms) > 0 {
			maxX := platforms[len(platforms)-1].X + 4
			minX := platforms[len(platforms)-1].X - 4
			newPlatform.X = minX + (randomSource.Float64() * (maxX - minX)) // Randomize within the limits
		}

		platforms = append(platforms, newPlatform)
	}

	return platforms
}

// Generate a random float64 between min and max (inclusive)
func generateRandomFloat(min, max float64) float64 {
	randomSource := rand.New(rand.NewSource(time.Now().UnixNano()))
	return randomSource.Float64()*(max-min) + min
}

// Generate initial cubes for the game
func generateInitialCubes(count int) []Position {
	cubes := make([]Position, count)
	for i := 0; i < count; i++ {
		cubes[i] = Position{
			X: (rand.Float64() * 180) - 90,
			Y: 50, // Starting height above the ground for falling cubes
			Z: (rand.Float64() * 180) - 90,
		}
	}
	return cubes
}

// RunLobby continuously listens for lobby events.
func (s *Server) runLobby(lobby *Lobby) {
	for {
		select {
		case client := <-lobby.register:
			lobby.clients[client] = true
			log.Printf("Client registered to Lobby %s as %s", lobby.ID, client.playerID)
			lobby.sendState(client)
			// If the lobby is full, start the game
			if len(lobby.clients) == 2 {
				log.Println("Lobby is full. Starting game and generating cubes...")
				lobby.state.Cubes = generateInitialCubes(5) // Generate cubes only when both players are present

				lobby.broadcastGameStart()
			}
			log.Printf("Number of clients in lobby %s: %d", lobby.ID, len(lobby.clients))
		case client := <-lobby.unregister:
			if _, ok := lobby.clients[client]; ok {
				delete(lobby.clients, client)
				close(client.send)
				log.Printf("Client unregistered from Lobby %s", lobby.ID)
			}
		case message := <-lobby.broadcast:
			lobby.broadcastToClients(message)
		}
	}
}

// Broadcast to all clients safely.
func (l *Lobby) broadcastToClients(message []byte) {
	l.mutex.Lock()
	defer l.mutex.Unlock()

	for client := range l.clients {
		select {
		case client.send <- message:
		default:
			// If sending fails, close the send channel and remove the client
			close(client.send)
			delete(l.clients, client)
		}
	}
}

// SendState sends the current game state to a specific client.
func (l *Lobby) sendState(client *Client) {
	l.mutex.Lock()
	defer l.mutex.Unlock()

	stateBytes, err := json.Marshal(map[string]interface{}{
		"type":  "game_state",
		"state": l.state,
	})
	if err != nil {
		log.Println("Error marshalling state:", err)
		return
	}

	client.send <- stateBytes
}

// BroadcastGameStart notifies all clients in the lobby that the game is starting.
func (l *Lobby) broadcastGameStart() {
	startMessage, err := json.Marshal(map[string]interface{}{
		"type": "game_start",
	})
	if err != nil {
		log.Println("Error marshalling game_start:", err)
		return
	}
	log.Println("Broadcasting game start message to clients.")
	l.broadcast <- startMessage
}

// HandleConnections upgrades HTTP connections to WebSockets and assigns clients to lobbies.
func (s *Server) handleConnections(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}

	client := &Client{
		conn: conn,
		send: make(chan []byte, 256), // Buffered channel for messages to send to the client
	}

	go client.writePump()
	client.readPump(s)
}

// ReadPump reads messages from the WebSocket connection.
func (c *Client) readPump(s *Server) {
	defer func() {
		c.disconnect()
	}()

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			log.Println("read error:", err)
			break
		}

		var input InputMessage
		err = json.Unmarshal(message, &input)
		if err != nil {
			log.Println("Invalid input message:", err)
			continue
		}

		switch input.Type {
		case "create_lobby":
			s.createLobby(c)
		case "join_lobby":
			s.joinLobby(c, input.LobbyID)
		case "player_input":
			s.handlePlayerInput(c, input)
		default:
			log.Println("Unknown message type:", input.Type)
		}
	}
}

// WritePump writes messages from the send channel to the WebSocket connection.
func (c *Client) writePump() {
	for {
		message, ok := <-c.send
		if !ok {
			// Channel closed
			c.conn.WriteMessage(websocket.CloseMessage, []byte{})
			return
		}

		err := c.conn.WriteMessage(websocket.TextMessage, message)
		if err != nil {
			log.Println("write error:", err)
			return
		}
	}
}

// Disconnect handles client disconnection.
func (c *Client) disconnect() {
	if c.lobby != nil {
		c.lobby.unregister <- c
	}
	c.conn.Close()
}

// CreateLobby handles the creation of a new lobby.
func (s *Server) createLobby(c *Client) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	// Generate a unique lobby ID
	lobbyID := generateLobbyID()
	for {
		if _, exists := s.lobbies[lobbyID]; !exists {
			break
		}
		lobbyID = generateLobbyID()
	}

	// Create a new lobby
	lobby := newLobby(lobbyID)
	s.lobbies[lobbyID] = lobby

	// Start the lobby's run loop
	go s.runLobby(lobby)

	// Assign client as player1
	c.lobby = lobby
	c.playerID = "player1"

	// Register the client to the lobby
	lobby.register <- c

	// Send lobby creation confirmation
	response, _ := json.Marshal(map[string]interface{}{
		"type":    "lobby_created",
		"lobbyID": lobbyID,
	})
	c.send <- response
}

// JoinLobby handles a client's request to join an existing lobby.
func (s *Server) joinLobby(c *Client, lobbyID string) {
	s.mutex.Lock()
	lobby, exists := s.lobbies[lobbyID]
	s.mutex.Unlock()

	if !exists {
		// Send error message
		errorMessage, _ := json.Marshal(map[string]interface{}{
			"type":    "lobby_error",
			"message": "Lobby does not exist.",
		})
		c.send <- errorMessage
		return
	}

	// Check if lobby is full
	if len(lobby.clients) >= 2 {
		errorMessage, _ := json.Marshal(map[string]interface{}{
			"type":    "lobby_error",
			"message": "Lobby is full.",
		})
		c.send <- errorMessage
		return
	}

	// Assign client as player2
	c.lobby = lobby
	c.playerID = "player2"

	// Register the client to the lobby
	lobby.register <- c

	// Send lobby joined confirmation
	response, _ := json.Marshal(map[string]interface{}{
		"type":     "lobby_joined",
		"lobbyID":  lobbyID,
		"playerID": c.playerID,
	})
	c.send <- response
}

// HandlePlayerInput processes player input and updates the game state.
func (s *Server) handlePlayerInput(c *Client, input InputMessage) {
	if c.lobby == nil {
		log.Println("Client not in a lobby.")
		return
	}

	lobby := c.lobby
	lobby.mutex.Lock()
	defer lobby.mutex.Unlock()

	// Apply gravity and handle jumping
	gravity := 0.1
	if c.playerID == "player1" {
		lobby.state.Player1.Position.Y -= gravity
	} else if c.playerID == "player2" {
		lobby.state.Player2.Position.Y -= gravity
	}

	// Ensure the player's Y position doesn't fall below ground level
	if lobby.state.Player1.Position.Y < 2 {
		lobby.state.Player1.Position.Y = 2
	}

	if lobby.state.Player2.Position.Y < 2 {
		lobby.state.Player2.Position.Y = 2
	}

	switch input.Action {
	case "move":
		moveAmount := 0.5 // Adjust movement scaling as needed
		if input.Direction != nil {
			if c.playerID == "player1" {
				lobby.state.Player1.Position.X += input.Direction.X * moveAmount
				lobby.state.Player1.Position.Z += input.Direction.Z * moveAmount
			} else if c.playerID == "player2" {
				lobby.state.Player2.Position.X += input.Direction.X * moveAmount
				lobby.state.Player2.Position.Z += input.Direction.Z * moveAmount
			}
		}
	case "jump":
		if c.playerID == "player1" && lobby.state.Player1.Position.Y <= 2 {
			lobby.state.Player1.Position.Y += 4 // Simulate jump height
		} else if c.playerID == "player2" && lobby.state.Player2.Position.Y <= 2 {
			lobby.state.Player2.Position.Y += 4 // Simulate jump height
		}
	case "collect":
		// Handle cube collection
		if input.PlayerID != "" {
			if input.PlayerID == "player1" {
				collectCube(&lobby.state.Player1, lobby)
			} else if input.PlayerID == "player2" {
				collectCube(&lobby.state.Player2, lobby)
			}
		}
	}

	// Check for collisions with cubes
	checkCubeCollision(lobby)

	// Broadcast updated state to all clients in the lobby
	stateBytes, err := json.Marshal(map[string]interface{}{
		"type":  "game_state",
		"state": lobby.state,
	})
	if err != nil {
		log.Println("Error marshalling state:", err)
		return
	}
	lobby.broadcast <- stateBytes
}

// CollectCube checks if a player has collected a cube
func collectCube(player *PlayerState, lobby *Lobby) {
	for i, cube := range lobby.state.Cubes {
		if player.Position.X >= cube.X-5 && player.Position.X <= cube.X+5 &&
			player.Position.Z >= cube.Z-5 && player.Position.Z <= cube.Z+5 &&
			player.Position.Y <= cube.Y+5 {
			fmt.Printf("%v collected a cube!", player.Position)
			// Remove the cube from the lobby
			lobby.state.Cubes = append(lobby.state.Cubes[:i], lobby.state.Cubes[i+1:]...) // Remove the cube
			return                                                                        // Exit after collecting one cube
		}
	}
}

// CheckCubeCollision checks player positions against cubes
func checkCubeCollision(lobby *Lobby) {
	// Implement if you want to handle real-time checking here
}

// Generate a unique lobby ID.
func generateLobbyID() string {
	rand.Seed(time.Now().UnixNano())
	return strconv.Itoa(rand.Intn(100000)) // Simple numeric ID; for better uniqueness, consider using UUIDs.
}

// Main function to run the server
func main() {
	server := newServer()

	http.HandleFunc("/ws", server.handleConnections)        // Handle WebSocket connections
	http.Handle("/", http.FileServer(http.Dir("./public"))) // Serve client files

	log.Println("Server started on :8080")
	err := http.ListenAndServe(":8080", nil) // Start listening on port 8080
	if err != nil {
		log.Fatal("ListenAndServe: ", err) // Log any errors starting the server
	}
}
