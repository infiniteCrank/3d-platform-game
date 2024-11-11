package main

import (
	"encoding/json"
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
}

// InputMessage represents input from clients.
type InputMessage struct {
	Type      string     `json:"type"`
	LobbyID   string     `json:"lobbyID,omitempty"`
	Player    string     `json:"player,omitempty"`
	Action    string     `json:"action,omitempty"`
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
	platforms := generateRandomPlatforms(20) // Generate 20 random platforms

	return &Lobby{
		ID:         id,
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256), // Ensure channels are buffered
		register:   make(chan *Client),
		unregister: make(chan *Client),
		state: GameState{
			Player1:   PlayerState{Position: Position{X: 0, Y: 2, Z: 0}},
			Player2:   PlayerState{Position: Position{X: 0, Y: 2, Z: 0}},
			Platforms: platforms,
		},
	}
}

func generateRandomPlatforms(count int) []Position {
	platforms := make([]Position, count)
	for i := 0; i < count; i++ {
		platforms[i] = Position{
			X: (rand.Float64() * 180) - 90,
			Y: (rand.Float64() * 40) + 5,
			Z: (rand.Float64() * 180) - 90,
		}
	}
	return platforms
}

// RunLobby continuously listens for lobby events.
func (s *Server) runLobby(lobby *Lobby) {
	for {
		select {
		case client := <-lobby.register:
			lobby.clients[client] = true
			log.Printf("Client registered to Lobby %s as %s", lobby.ID, client.playerID)
			// Send initial game state to the newly joined client
			lobby.sendState(client)
			// If the lobby is full, start the game
			if len(lobby.clients) == 2 {
				log.Println("Lobby is full. Starting game...")
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
	// Lock the lobby mutex to safely iterate over clients
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

	switch input.Action {
	case "move":
		if input.Direction != nil {
			moveAmount := 0.5 // Adjust movement scaling as needed
			if c.playerID == "player1" {
				lobby.state.Player1.Position.X += input.Direction.X * moveAmount
				lobby.state.Player1.Position.Z += input.Direction.Z * moveAmount
			} else if c.playerID == "player2" {
				lobby.state.Player2.Position.X += input.Direction.X * moveAmount
				lobby.state.Player2.Position.Z += input.Direction.Z * moveAmount
			}
		}
	case "jump":
		if c.playerID == "player1" && lobby.state.Player1.Position.Y <= 2 { // Assuming ground level is 2
			lobby.state.Player1.Position.Y += 5 // Set to a value to simulate the jump height.
		} else if c.playerID == "player2" && lobby.state.Player2.Position.Y <= 2 {
			lobby.state.Player2.Position.Y += 5 // Same here
		}
	}

	// Apply some gravity
	if lobby.state.Player1.Position.Y > 2 {
		lobby.state.Player1.Position.Y -= 0.2 // Simulates gravity effect.
		for _, platform := range lobby.state.Platforms {
			if collidesWithPlatform(lobby.state.Player1.Position, platform) {
				lobby.state.Player1.Position.Y = platform.Y + 1 // Land on top of the platform
			}
		}
		if lobby.state.Player1.Position.Y < 2 {
			lobby.state.Player1.Position.Y = 2 // Reset to ground level
		}
	}

	if lobby.state.Player2.Position.Y > 2 {
		lobby.state.Player2.Position.Y -= 0.2 // Simulates gravity effect.
		for _, platform := range lobby.state.Platforms {
			if collidesWithPlatform(lobby.state.Player2.Position, platform) {
				lobby.state.Player2.Position.Y = platform.Y + 1 // Land on top of the platform
			}
		}
		if lobby.state.Player2.Position.Y < 2 {
			lobby.state.Player2.Position.Y = 2 // Reset to ground level
		}
	}

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

// Collision detection function
func collidesWithPlatform(playerPos Position, platform Position) bool {
	// Simple AABB collision detection
	return playerPos.X >= platform.X-5 && playerPos.X <= platform.X+5 &&
		playerPos.Z >= platform.Z-5 && playerPos.Z <= platform.Z+5 &&
		playerPos.Y <= platform.Y+1 // Allow slight overlap for landing
}

// Generate a unique lobby ID.
func generateLobbyID() string {
	rand.Seed(time.Now().UnixNano())
	return strconv.Itoa(rand.Intn(100000)) // Simple numeric ID; for better uniqueness, consider using UUIDs.
}

func main() {
	server := newServer()

	http.HandleFunc("/ws", server.handleConnections)
	http.Handle("/", http.FileServer(http.Dir("./public"))) // Serve client files

	log.Println("Server started on :8080")
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
