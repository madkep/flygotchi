package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"path/filepath"

	"flygotchi/internal/brain"
	"flygotchi/internal/game"
)

func main() {
	port := flag.Int("port", 8080, "local web server port")
	flag.Parse()

	webRoot := filepath.Join("web")
	world := game.New(brain.SyntheticBrain{}, filepath.Join("data", "mica-state.json"))
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/state", func(w http.ResponseWriter, _ *http.Request) { writeJSON(w, world.Snapshot()) })
	mux.HandleFunc("POST /api/brain/step", func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Action string `json:"action"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		writeJSON(w, world.Step(request.Action))
	})
	mux.Handle("/", http.FileServer(http.Dir(webRoot)))

	addr := fmt.Sprintf("127.0.0.1:%d", *port)
	log.Printf("FlyGotchi is listening at http://%s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(value)
}
