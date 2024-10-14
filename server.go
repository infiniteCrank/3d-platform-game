package main

import (
    "encoding/json"
    "log"
    "net/http"
    "sync"

    "github.com/gorilla/websocket"
)

type Position struct {
    X float64 `json:"x"`
    Y float64 `json:"y"`
    Z float64 `json:"z"`
}

type State struct {
    Player1 PlayerState `json:"player1"`
    Player2 PlayerState `json:"player2"`
}

type PlayerState struct {
    Position Position `json:"position"`
}

type InputMessage struct {
    Action    string     `json:"action"`
    Player    string     `json:"player"`
    Direction *Direction `json:"direction,omitempty"`
}

type Direction struct {
    X float64 `json:"x"`
    Z float64 `json:"z"`
}

type Client struct {
    conn   *websocket.Conn
    send   chan []byte
    player string
}

type Server struct {
    clients    map[*Client]bool
    broadcast  chan []byte
    register   chan *Client
    unregister chan *Client
    state      State
    mutex      sync.Mutex
}

func newServer() *Server {
    return &Server{
        clients:    make(map[*Client]bool),
        broadcast:  make(chan []byte),
        register:   make(chan *Client),
        unregister: make(chan *Client),
        state: State{
            Player1: PlayerState{
                Position: Position{X: 0, Y: 1, Z: 0},
            },
            Player2: PlayerState{
                Position: Position{X: 0, Y: 1, Z: 0},
            },
        },
    }
}

func (s *Server) run() {
    for {
        select {
        case client := <-s.register:
            s.clients[client] = true
            log.Printf("Client connected: %s", client.player)
            // Optionally send initial state
            s.sendState(client)
        case client := <-s.unregister:
            if _, ok := s.clients[client]; ok {
                delete(s.clients, client)
                close(client.send)
                log.Printf("Client disconnected: %s", client.player)
            }
        case message := <-s.broadcast:
            for client := range s.clients {
                select {
                case client.send <- message:
                default:
                    close(client.send)
                    delete(s.clients, client)
                }
            }
        }
    }
}

func (s *Server) sendState(client *Client) {
    s.mutex.Lock()
    defer s.mutex.Unlock()

    stateBytes, err := json.Marshal(s.state)
    if err != nil {
        log.Println("Error marshalling state:", err)
        return
    }

    client.send <- stateBytes
}

var upgrader = websocket.Upgrader{
    ReadBufferSize:  1024,
    WriteBufferSize: 1024,
    CheckOrigin: func(r *http.Request) bool {
        return true // Allow all connections for simplicity
    },
}

func (s *Server) handleConnections(w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Println("WebSocket upgrade error:", err)
        return
    }

    // Assign player
    s.mutex.Lock()
    var player string
    if s.state.Player1.Position.X == 0 && s.state.Player1.Position.Z == 0 {
        player = "player1"
    } else if s.state.Player2.Position.X == 0 && s.state.Player2.Position.Z == 0 {
        player = "player2"
    } else {
        // Server full
        conn.WriteMessage(websocket.TextMessage, []byte(`{"error":"Server full"}`))
        conn.Close()
        s.mutex.Unlock()
        return
    }
    s.mutex.Unlock()

    client := &Client{
        conn:   conn,
        send:   make(chan []byte, 256),
        player: player,
    }

    s.register <- client

    go client.writePump()
    client.readPump(s)
}

func (c *Client) readPump(s *Server) {
    defer func() {
        s.unregister <- c
        c.conn.Close()
    }()

    for {
        _, message, err := c.conn.ReadMessage()
        if err != nil {
            log.Println("read error:", err)
            break
        }

        // Parse input message
        var input InputMessage
        err = json.Unmarshal(message, &input)
        if err != nil {
            log.Println("Invalid input message:", err)
            continue
        }

        // Update server state based on input
        s.mutex.Lock()
        if input.Player == "player1" {
            if input.Action == "move" && input.Direction != nil {
                s.state.Player1.Position.X += input.Direction.X * 0.1
                s.state.Player1.Position.Z += input.Direction.Z * 0.1
            } else if input.Action == "jump" {
                s.state.Player1.Position.Y += 1 // Simplistic jump
            }
        } else if input.Player == "player2" {
            if input.Action == "move" && input.Direction != nil {
                s.state.Player2.Position.X += input.Direction.X * 0.1
                s.state.Player2.Position.Z += input.Direction.Z * 0.1
            } else if input.Action == "jump" {
                s.state.Player2.Position.Y += 1 // Simplistic jump
            }
        }
        s.mutex.Unlock()

        // Broadcast updated state
        stateBytes, err := json.Marshal(s.state)
        if err != nil {
            log.Println("Error marshalling state:", err)
            continue
        }
        s.broadcast <- stateBytes
    }
}

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

func main() {
    server := newServer()
    go server.run()

    http.HandleFunc("/ws", server.handleConnections)
    http.Handle("/", http.FileServer(http.Dir("./public"))) // Serve client files

    log.Println("Server started on :8080")
    err := http.ListenAndServe(":8080", nil)
    if err != nil {
        log.Fatal("ListenAndServe: ", err)
    }
}
