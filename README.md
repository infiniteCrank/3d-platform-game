# 3d-platform-game
This is a 3d platform game I made for GoLang DoJo in 2024 at Ippon technologies 

Data Structures:

Position: Represents a player's position in 3D space.
State: Holds the state of both players.
InputMessage: Structure for messages received from clients.
Client: Represents a connected client with a WebSocket connection.
Server: Manages connected clients, broadcasting messages, and game state.
Server Operations:

Registration: When a client connects, assign them as player1 or player2.
Broadcasting: After processing an input, broadcast the updated state to all clients.
Handling Inputs: Receive movement and jump inputs to update player positions.
Concurrency:

Uses Go's goroutines and channels to handle multiple clients concurrently.
Serving Client Files:

Assumes that your client-side files (index.html, main.js, etc.) are in a public directory.

## Build and Run the Server:

```go run server.go```

## Access the Game:

Open your browser and navigate to http://localhost:8080. Open the same URL in another browser or incognito window to simulate the second player.

b. Testing Player Interactions
Player 1 Controls:

Move: W, A, S, D
Jump: Space
Player 2 Controls:

Move: I, J, K, L
Jump: KeyJ