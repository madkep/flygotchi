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
	brainPack := flag.String("brain-pack", filepath.Join("data", "brain-packs", "flywire-v783-microcircuit", "manifest.json"), "path to a brain-pack manifest")
	flag.Parse()

	webRoot := filepath.Join("web")
	activeBrain := brain.Brain(brain.SyntheticBrain{})
	if connectome, err := brain.LoadConnectomeBrain(*brainPack); err == nil {
		activeBrain = connectome
		log.Printf("loaded brain pack %q", connectome.ID())
	} else {
		log.Printf("using synthetic brain: could not load %s: %v", *brainPack, err)
	}
	world := game.New(activeBrain, filepath.Join("data", "mica-state.json"))
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
