package game

import (
	"encoding/json"
	"math/rand"
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
	Pet    PetState           `json:"pet"`
	Motor  brain.MotorFrame   `json:"motor"`
	Brain  string             `json:"brain_pack"`
	Visual *brain.VisualFrame `json:"brain_visual,omitempty"`
}

type World struct {
	mu        sync.Mutex
	brain     brain.Brain
	state     PetState
	lastMotor brain.MotorFrame
	lastStep  time.Time
	savePath  string
}

type saveFile struct {
	SavedAt time.Time `json:"saved_at"`
	Pet     PetState  `json:"pet"`
}

func New(br brain.Brain, savePath string) *World {
	w := &World{brain: br, savePath: savePath, state: PetState{Hunger: 38, Energy: 73, Bond: 61, Stress: 14, Activity: "Explorando el jardín", Memory: []string{"Mica recuerda que los pétalos violetas suelen esconder néctar."}}}
	w.load()
	w.lastStep = time.Now()
	w.lastMotor = w.brain.Step(brain.SensoryFrame{Safety: .25, Novelty: .08}, brain.InternalState{Hunger: w.state.Hunger, Energy: w.state.Energy, Bond: w.state.Bond, Stress: w.state.Stress}, 100)
	return w
}

func (w *World) Snapshot() Snapshot {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.snapshot()
}

// Step turns a player action into sensory input. The brain determines which
// motor signal is strongest; the world applies the resulting behaviour.
func (w *World) Step(action string) Snapshot {
	w.mu.Lock()
	defer w.mu.Unlock()

	sensory, memory := sensoryFor(action)
	dtSeconds := clamp(time.Since(w.lastStep).Seconds(), .1, 10)
	w.lastStep = time.Now()
	internal := brain.InternalState{Hunger: w.state.Hunger, Energy: w.state.Energy, Bond: w.state.Bond, Stress: w.state.Stress}
	motor := w.brain.Step(sensory, internal, int(dtSeconds*1000))
	w.lastMotor = motor
	w.apply(motor, sensory, dtSeconds)
	if memory != "" {
		w.remember(memory)
	}
	w.save()
	return w.snapshot()
}

func (w *World) snapshot() Snapshot {
	s := Snapshot{Pet: w.state, Motor: w.lastMotor, Brain: w.brain.ID()}
	if visualBrain, ok := w.brain.(brain.VisualBrain); ok {
		visual := visualBrain.Visual()
		s.Visual = &visual
	}
	return s
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
		return brain.SensoryFrame{Novelty: .03 + rand.Float64()*.12, Safety: .15 + rand.Float64()*.08}, ""
	}
}

func (w *World) apply(m brain.MotorFrame, s brain.SensoryFrame, dtSeconds float64) {
	// Needs drift with elapsed time. Contact and a suitable refuge gate the
	// consequences; a motor intention alone cannot feed or heal the pet.
	baseline := clamp(dtSeconds/5, .02, 2)
	restCue := clamp((s.Safety-.8)/.2, 0, 1) * (1 - s.Touch) * (1 - s.FoodContact)
	w.state.Hunger = clamp(w.state.Hunger+.42*baseline-m.Eat*s.FoodContact*14, 0, 100)
	w.state.Energy = clamp(w.state.Energy-.34*baseline-m.Explore*s.Novelty*2.2-m.Social*s.Touch*1.1+m.Rest*restCue*8, 0, 100)
	w.state.Bond = clamp(w.state.Bond-.025*baseline+m.Social*s.Touch*5.5, 0, 100)
	w.state.Stress = clamp(w.state.Stress+.035*baseline+m.Explore*s.Novelty*.35-m.Rest*restCue*.9-m.Social*s.Touch*.5, 0, 100)
	switch m.Dominant {
	case "eat":
		if s.FoodContact > .1 {
			w.state.Activity = "Saboreando néctar"
		} else {
			w.state.Activity = "Buscando néctar"
		}
	case "rest":
		if restCue > .1 {
			w.state.Activity = "Descansando bajo una hoja"
		} else {
			w.state.Activity = "Buscando refugio"
		}
	case "socialize":
		if s.Touch > .1 {
			w.state.Activity = "Jugando contigo"
		} else {
			w.state.Activity = "Atenta a tu presencia"
		}
	default:
		w.state.Activity = "Trazando una nueva ruta"
	}
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
