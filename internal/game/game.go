package game

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"

	"flygotchi/internal/brain"
)

type PetState struct {
	Hunger   float64  `json:"hunger"`
	Energy   float64  `json:"energy"`
	Bond     float64  `json:"bond"`
	Stress   float64  `json:"stress"`
	Activity string   `json:"activity"`
	Memory   []string `json:"memory"`
}

type Snapshot struct {
	Pet   PetState         `json:"pet"`
	Motor brain.MotorFrame `json:"motor"`
	Brain string           `json:"brain_pack"`
}

type World struct {
	mu       sync.Mutex
	brain    brain.Brain
	state    PetState
	savePath string
}

type saveFile struct {
	SavedAt time.Time `json:"saved_at"`
	Pet     PetState  `json:"pet"`
}

func New(br brain.Brain, savePath string) *World {
	w := &World{brain: br, savePath: savePath, state: PetState{Hunger: 38, Energy: 73, Bond: 61, Stress: 14, Activity: "Explorando el jardín", Memory: []string{"Mica recuerda que los pétalos violetas suelen esconder néctar."}}}
	w.load()
	return w
}

func (w *World) Snapshot() Snapshot {
	w.mu.Lock()
	defer w.mu.Unlock()
	return Snapshot{Pet: w.state, Brain: w.brain.ID()}
}

// Step turns a player action into sensory input. The brain determines which
// motor signal is strongest; the world applies the resulting behaviour.
func (w *World) Step(action string) Snapshot {
	w.mu.Lock()
	defer w.mu.Unlock()

	sensory, memory := sensoryFor(action)
	internal := brain.InternalState{Hunger: w.state.Hunger, Energy: w.state.Energy, Bond: w.state.Bond, Stress: w.state.Stress}
	motor := w.brain.Step(sensory, internal, 100)
	w.apply(motor, sensory)
	if memory != "" {
		w.remember(memory)
	}
	w.save()
	return Snapshot{Pet: w.state, Motor: motor, Brain: w.brain.ID()}
}

func sensoryFor(action string) (brain.SensoryFrame, string) {
	switch action {
	case "food":
		return brain.SensoryFrame{FoodSmell: 1, FoodContact: .9, Reward: .48, Safety: .65}, "Mica asoció el brillo coral con néctar nutritivo."
	case "play":
		return brain.SensoryFrame{Touch: .88, Reward: .86, Novelty: .34, Safety: .8}, "Mica aprendió tu ritmo de juego."
	case "rest":
		return brain.SensoryFrame{Safety: 1, Novelty: .02}, "La hoja grande es un refugio tranquilo."
	case "explore":
		return brain.SensoryFrame{Novelty: .95, Safety: .54, Reward: .22}, "Una luciérnaga dejó una ruta luminosa cerca del estanque."
	default:
		return brain.SensoryFrame{Novelty: .18, Safety: .68}, ""
	}
}

func (w *World) apply(m brain.MotorFrame, s brain.SensoryFrame) {
	// Baseline needs drift. Motor output, rather than the raw player action,
	// determines the magnitude of the behaviour's consequences.
	w.state.Hunger = clamp(w.state.Hunger+.48-m.Eat*(4+s.FoodContact*18), 0, 100)
	w.state.Energy = clamp(w.state.Energy-.28+m.Rest*7-m.Explore*.38, 0, 100)
	w.state.Bond = clamp(w.state.Bond+m.Social*(1+s.Touch*5), 0, 100)
	w.state.Stress = clamp(w.state.Stress-m.Rest*1.4-m.Social*.8+m.Explore*.22, 0, 100)
	w.state.Activity = map[string]string{"eat": "Saboreando néctar", "rest": "Descansando bajo una hoja", "explore": "Trazando una nueva ruta", "socialize": "Jugando contigo"}[m.Dominant]
}

func (w *World) remember(message string) {
	w.state.Memory = append([]string{message}, w.state.Memory...)
	if len(w.state.Memory) > 8 {
		w.state.Memory = w.state.Memory[:8]
	}
}

func (w *World) load() {
	data, err := os.ReadFile(w.savePath)
	var saved saveFile
	if err == nil && json.Unmarshal(data, &saved) == nil && len(saved.Pet.Memory) > 0 {
		w.state = saved.Pet
		return
	}
}

func (w *World) save() {
	if err := os.MkdirAll(filepath.Dir(w.savePath), 0o755); err != nil {
		return
	}
	data, err := json.MarshalIndent(saveFile{SavedAt: time.Now().UTC(), Pet: w.state}, "", "  ")
	if err == nil {
		_ = os.WriteFile(w.savePath, data, 0o600)
	}
}

func clamp(value, low, high float64) float64 {
	if value < low {
		return low
	}
	if value > high {
		return high
	}
	return value
}
