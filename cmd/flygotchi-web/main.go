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
	world.Start()
	defer world.Stop()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/state", func(w http.ResponseWriter, _ *http.Request) { writeJSON(w, world.Snapshot()) })
	mux.HandleFunc("POST /api/brain/step", func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Action   string `json:"action"`
			Contact  bool   `json:"contact"`
			Sequence uint64 `json:"sequence"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4096)
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil || !validAction(request.Action) {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		writeJSON(w, world.StepInput(request.Action, request.Contact, request.Sequence))
	})
	// Versioned endpoints used by the Godot client. The old browser endpoint
	// remains available as a compatibility adapter.
	mux.HandleFunc("GET /api/v1/state", func(w http.ResponseWriter, _ *http.Request) {
		snapshot := world.Snapshot()
		snapshot.Visual = nil
		writeJSON(w, snapshot)
	})
	mux.HandleFunc("GET /api/v1/brain/topology", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, world.Snapshot())
	})
	mux.HandleFunc("GET /api/v1/brain/activity", func(w http.ResponseWriter, _ *http.Request) {
		snapshot := world.Snapshot()
		activity := []float64{}
		if snapshot.Visual != nil {
			for _, node := range snapshot.Visual.Nodes {
				activity = append(activity, node.Activity)
			}
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, map[string]any{"activity": activity, "brain_pack": snapshot.Brain, "sim_time": world.SimTime()})
	})
	mux.HandleFunc("GET /api/v1/telemetry", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"sim_time": world.SimTime(), "brain_pack": world.Snapshot().Brain})
	})
	mux.HandleFunc("POST /api/v1/senses", func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Action         string         `json:"action"`
			ClientID       string         `json:"client_id"`
			Body           game.BodyState `json:"body"`
			Contact        bool           `json:"food_contact"`
			Sequence       uint64         `json:"sequence"`
			FoodSmell      float64        `json:"food_smell"`
			FoodSmellLeft  float64        `json:"food_smell_left"`
			FoodSmellRight float64        `json:"food_smell_right"`
			RefugeSmell    float64        `json:"refuge_smell"`
			RefugeLeft     float64        `json:"refuge_smell_left"`
			RefugeRight    float64        `json:"refuge_smell_right"`
			RefugeCue      float64        `json:"refuge_cue"`
			RefugeContact  float64        `json:"refuge_contact"`
			Touch          float64        `json:"touch"`
			TouchLeft      float64        `json:"touch_left"`
			TouchRight     float64        `json:"touch_right"`
			VisionLeft     float64        `json:"vision_left"`
			VisionRight    float64        `json:"vision_right"`
			DangerSmell    float64        `json:"danger_smell"`
			Safety         float64        `json:"safety"`
			Novelty        float64        `json:"novelty"`
			Temperature    float64        `json:"temperature"`
			WaterContact   float64        `json:"water_contact"`
			Taste          float64        `json:"taste"`
			Humidity       float64        `json:"humidity"`
			Airflow        float64        `json:"airflow"`
			AngularSpeed   float64        `json:"angular_speed"`
			BodySpeed      float64        `json:"body_speed"`
			GroundContact  float64        `json:"ground_contact"`
			VisionMotion   float64        `json:"vision_motion"`
			Reward         float64        `json:"reward"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4096)
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil || !validAction(request.Action) {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		snapshot, _ := world.SetBodySenses(request.Action, brain.SensoryFrame{FoodSmell: request.FoodSmell, FoodSmellLeft: request.FoodSmellLeft, FoodSmellRight: request.FoodSmellRight, FoodContact: boolFloat(request.Contact), RefugeSmell: request.RefugeSmell, RefugeLeft: request.RefugeLeft, RefugeRight: request.RefugeRight, RefugeCue: request.RefugeCue, RefugeContact: request.RefugeContact, Touch: request.Touch, TouchLeft: request.TouchLeft, TouchRight: request.TouchRight, VisionLeft: request.VisionLeft, VisionRight: request.VisionRight, DangerSmell: request.DangerSmell, Safety: request.Safety, Novelty: request.Novelty, Temperature: request.Temperature, WaterContact: request.WaterContact, Taste: request.Taste, Humidity: request.Humidity, Airflow: request.Airflow, AngularSpeed: request.AngularSpeed, BodySpeed: request.BodySpeed, GroundContact: request.GroundContact, VisionMotion: request.VisionMotion, Reward: request.Reward}, request.Sequence, request.ClientID, request.Body)
		snapshot.Visual = nil
		writeJSON(w, snapshot)
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

func validAction(action string) bool {
	switch action {
	case "idle", "food", "play", "rest", "explore":
		return true
	default:
		return false
	}
}

func boolFloat(value bool) float64 {
	if value {
		return 1
	}
	return 0
}
