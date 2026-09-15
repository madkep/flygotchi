package game

import (
	"encoding/json"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"sync"
	"time"

	"flygotchi/internal/brain"
)

type PetState struct {
	Hunger        float64  `json:"hunger"`
	Energy        float64  `json:"energy"`
	Bond          float64  `json:"bond"`
	Stress        float64  `json:"stress"`
	SleepPressure float64  `json:"sleep_pressure"`
	Temperature   float64  `json:"temperature"`
	Health        float64  `json:"health"`
	Hydration     float64  `json:"hydration"`
	Circadian     float64  `json:"circadian"`
	Age           float64  `json:"age"`
	Activity      string   `json:"activity"`
	Memory        []string `json:"memory"`
}

type Snapshot struct {
	Pet       PetState           `json:"pet"`
	Motor     brain.MotorFrame   `json:"motor"`
	Brain     string             `json:"brain_pack"`
	Body      BodyState          `json:"body"`
	BodyOwner bool               `json:"body_owner"`
	Visual    *brain.VisualFrame `json:"brain_visual,omitempty"`
}

// BodyState is the single visible Mica shared by every browser session.
// Rendering remains client-side, while this pose is authoritative and saved.
type BodyState struct {
	X, Y, VX, VY, Heading, BodyAngle, Altitude, VerticalVelocity float64
	Grounded                                                     bool   `json:"grounded"`
	Support                                                      string `json:"support"`
}

type World struct {
	mu            sync.Mutex
	brain         brain.Brain
	state         PetState
	body          BodyState
	bodyOwner     string
	bodyLease     time.Time
	lastMotor     brain.MotorFrame
	lastStep      time.Time
	savePath      string
	sequence      uint64
	simTime       float64
	latest        brain.SensoryFrame
	action        string
	pendingMemory string
	saveElapsed   float64
	stop          chan struct{}
	finished      chan struct{}
}

type saveFile struct {
	SavedAt time.Time `json:"saved_at"`
	Pet     PetState  `json:"pet"`
	Body    BodyState `json:"body"`
}

func New(br brain.Brain, savePath string) *World {
	w := &World{brain: br, savePath: savePath, action: "idle", latest: brain.SensoryFrame{Safety: .25, Novelty: .08}, body: BodyState{X: .48, Y: .34, Grounded: true, Support: "suelo"}, state: PetState{Hunger: 38, Energy: 73, Bond: 61, Stress: 14, SleepPressure: 18, Temperature: 0.5, Health: 100, Hydration: 74, Circadian: .5, Age: 1, Activity: "Explorando el jardín", Memory: []string{"Mica recuerda que los pétalos violetas suelen esconder néctar."}}}
	w.load()
	w.lastStep = time.Now()
	w.lastMotor = w.brain.Step(brain.SensoryFrame{Safety: .25, Novelty: .08}, brain.InternalState{Hunger: w.state.Hunger, Energy: w.state.Energy, Bond: w.state.Bond, Stress: w.state.Stress, SleepPressure: w.state.SleepPressure, Temperature: w.state.Temperature, Age: w.state.Age}, 100)
	return w
}

// Start runs the brain at a fixed 20 Hz world clock. Rendering clients only
// publish senses; they never determine how many neural ticks are simulated.
func (w *World) Start() {
	w.mu.Lock()
	if w.stop != nil {
		w.mu.Unlock()
		return
	}
	stop := make(chan struct{})
	finished := make(chan struct{})
	w.stop, w.finished = stop, finished
	w.mu.Unlock()
	go func() {
		ticker := time.NewTicker(50 * time.Millisecond)
		defer ticker.Stop()
		defer close(finished)
		for {
			select {
			case <-ticker.C:
				w.tick(0.05)
			case <-stop:
				return
			}
		}
	}()
}

func (w *World) Stop() {
	w.mu.Lock()
	stop, finished := w.stop, w.finished
	w.stop, w.finished = nil, nil
	w.mu.Unlock()
	if stop != nil {
		close(stop)
		<-finished
	}
}

func (w *World) tick(dtSeconds float64) {
	w.mu.Lock()
	defer w.mu.Unlock()
	motor := w.brain.Step(w.latest, brain.InternalState{Hunger: w.state.Hunger, Energy: w.state.Energy, Bond: w.state.Bond, Stress: w.state.Stress, SleepPressure: w.state.SleepPressure, Temperature: w.state.Temperature, Age: w.state.Age}, int(dtSeconds*1000))
	w.lastMotor = motor
	w.apply(motor, w.latest, dtSeconds)
	if w.pendingMemory != "" {
		w.remember(w.pendingMemory)
		w.pendingMemory = ""
	}
	w.simTime += dtSeconds
	w.lastStep = time.Now()
	w.saveElapsed += dtSeconds
	if w.saveElapsed >= 1 {
		w.saveElapsed = 0
		w.save()
	}
}

func (w *World) Snapshot() Snapshot {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.snapshot()
}

// Step turns a player action into sensory input. The brain determines which
// motor signal is strongest; the world applies the resulting behaviour.
func (w *World) Step(action string) Snapshot {
	return w.StepInput(action, action == "food", 0)
}

// StepInput is the versioned world entry point. A button can request a food
// search without claiming that the proboscis touched food. Sequence numbers
// make retries safe for clients that reconnect after a timeout.
func (w *World) StepInput(action string, foodContact bool, sequence uint64) Snapshot {
	w.mu.Lock()
	defer w.mu.Unlock()
	sensory, memory := sensoryFor(action, foodContact)
	return w.stepLocked(action, sensory, memory, sequence)
}

// SetSenses publishes a world measurement for the fixed scheduler. It does
// not execute a step itself, so changing render FPS cannot change simulation
// speed. A snapshot is returned for immediate UI acknowledgement.
func (w *World) SetSenses(action string, sensory brain.SensoryFrame, sequence uint64) Snapshot {
	w.mu.Lock()
	defer w.mu.Unlock()
	if sequence != 0 && sequence <= w.sequence {
		return w.snapshot()
	}
	if sequence != 0 {
		w.sequence = sequence
	}
	w.latest = sanitizeSenses(sensory)
	w.action = action
	if w.latest.FoodContact > 0.1 && w.latest.Taste > .2 && w.latest.Reward > .2 {
		w.pendingMemory = "Mica asoció el aroma dulce con alimento nutritivo."
	}
	return w.snapshot()
}

// SetBodySenses grants a short lease to one renderer. Other tabs receive the
// same body pose but cannot inject competing senses or a second local Mica.
func (w *World) SetBodySenses(action string, sensory brain.SensoryFrame, sequence uint64, client string, body BodyState) (Snapshot, bool) {
	w.mu.Lock()
	defer w.mu.Unlock()
	now := time.Now()
	owner := client != "" && (w.bodyOwner == client || now.After(w.bodyLease))
	if !owner {
		return w.snapshot(), false
	}
	w.bodyOwner, w.bodyLease = client, now.Add(2*time.Second)
	w.body = sanitizeBody(body)
	if sequence != 0 && sequence > w.sequence {
		w.sequence = sequence
		w.latest = sanitizeSenses(sensory)
		w.action = action
	}
	s := w.snapshot()
	s.BodyOwner = true
	return s, true
}

func sanitizeBody(body BodyState) BodyState {
	body.X, body.Y = clamp(body.X, .06, .9), clamp(body.Y, .12, .78)
	body.VX, body.VY = clamp(body.VX, -.8, .8), clamp(body.VY, -.8, .8)
	body.Heading, body.BodyAngle = clamp(body.Heading, -720, 720), clamp(body.BodyAngle, -13, 13)
	body.Altitude, body.VerticalVelocity = clamp(body.Altitude, 0, 2), clamp(body.VerticalVelocity, -2, 2)
	if body.Support == "" {
		body.Support = "suelo"
	}
	return body
}

// StepSenses accepts measurements produced by the physical world. Continuous
// values are clamped at the boundary so malformed clients cannot inject NaN or
// unbounded currents into the brain.
func (w *World) StepSenses(action string, sensory brain.SensoryFrame, sequence uint64) Snapshot {
	w.mu.Lock()
	defer w.mu.Unlock()
	sensory = sanitizeSenses(sensory)
	memory := ""
	if action == "food" && sensory.FoodContact > 0.1 {
		memory = "Mica asoció el brillo coral con néctar nutritivo."
	}
	return w.stepLocked(action, sensory, memory, sequence)
}

func sanitizeSenses(sensory brain.SensoryFrame) brain.SensoryFrame {
	sensory.FoodSmell = clampFinite(sensory.FoodSmell)
	sensory.FoodSmellLeft = clampFinite(sensory.FoodSmellLeft)
	sensory.FoodSmellRight = clampFinite(sensory.FoodSmellRight)
	sensory.FoodContact = clampFinite(sensory.FoodContact)
	sensory.RefugeSmell = clampFinite(sensory.RefugeSmell)
	sensory.RefugeLeft = clampFinite(sensory.RefugeLeft)
	sensory.RefugeRight = clampFinite(sensory.RefugeRight)
	sensory.RefugeCue = clampFinite(sensory.RefugeCue)
	sensory.RefugeContact = clampFinite(sensory.RefugeContact)
	sensory.Touch = clampFinite(sensory.Touch)
	sensory.TouchLeft = clampFinite(sensory.TouchLeft)
	sensory.TouchRight = clampFinite(sensory.TouchRight)
	sensory.VisionLeft = clampFinite(sensory.VisionLeft)
	sensory.VisionRight = clampFinite(sensory.VisionRight)
	sensory.DangerSmell = clampFinite(sensory.DangerSmell)
	sensory.Safety = clampFinite(sensory.Safety)
	sensory.Novelty = clampFinite(sensory.Novelty)
	sensory.Temperature = clampFinite(sensory.Temperature)
	sensory.WaterContact = clampFinite(sensory.WaterContact)
	sensory.Taste = clampFinite(sensory.Taste)
	sensory.Humidity = clampFinite(sensory.Humidity)
	sensory.Airflow = clampFinite(sensory.Airflow)
	sensory.AngularSpeed = clampFinite(sensory.AngularSpeed)
	sensory.BodySpeed = clampFinite(sensory.BodySpeed)
	sensory.GroundContact = clampFinite(sensory.GroundContact)
	sensory.VisionMotion = clampFinite(sensory.VisionMotion)
	sensory.Reward = clampFinite(sensory.Reward)
	return sensory
}

func (w *World) stepLocked(action string, sensory brain.SensoryFrame, memory string, sequence uint64) Snapshot {
	if sequence != 0 && sequence <= w.sequence {
		return w.snapshot()
	}
	if sequence != 0 {
		w.sequence = sequence
	}

	dtSeconds := clamp(time.Since(w.lastStep).Seconds(), .1, 10)
	w.lastStep = time.Now()
	w.simTime += dtSeconds
	internal := brain.InternalState{Hunger: w.state.Hunger, Energy: w.state.Energy, Bond: w.state.Bond, Stress: w.state.Stress, SleepPressure: w.state.SleepPressure, Temperature: w.state.Temperature, Age: w.state.Age}
	motor := w.brain.Step(sensory, internal, int(dtSeconds*1000))
	w.lastMotor = motor
	w.apply(motor, sensory, dtSeconds)
	if memory != "" {
		w.remember(memory)
	}
	w.save()
	return w.snapshot()
}

func clampFinite(value float64) float64 {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	return clamp(value, 0, 1)
}

// SimTime returns the monotonic world time used for telemetry, independent of
// wall-clock rendering and HTTP polling frequency.
func (w *World) SimTime() float64 {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.simTime
}

func (w *World) snapshot() Snapshot {
	s := Snapshot{Pet: w.state, Motor: w.lastMotor, Brain: w.brain.ID(), Body: w.body}
	if visualBrain, ok := w.brain.(brain.VisualBrain); ok {
		visual := visualBrain.Visual()
		s.Visual = &visual
	}
	return s
}

func sensoryFor(action string, foodContact bool) (brain.SensoryFrame, string) {
	switch action {
	case "food":
		contact := 0.0
		if foodContact {
			contact = .9
			return brain.SensoryFrame{FoodSmell: 1, FoodContact: contact, Reward: .48, Safety: .65}, "Mica asoció el brillo coral con néctar nutritivo."
		}
		return brain.SensoryFrame{FoodSmell: 1, FoodContact: contact, Reward: .18, Safety: .65}, ""
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
	// Needs are rates expressed in real seconds. The world ticks at 20 Hz, so
	// motor activity must be multiplied by elapsed time; otherwise a single
	// second of flight is accidentally charged twenty times as a full action.
	// Contact and a suitable refuge still gate the consequences: an intention
	// alone cannot feed or restore the pet.
	baseline := math.Min(dtSeconds/20, 2)
	activityTime := math.Min(dtSeconds, 1)
	restCue := clamp((s.Safety-.8)/.2, 0, 1) * (1 - s.Touch) * (1 - s.FoodContact)
	w.state.Hunger = clamp(w.state.Hunger+.42*baseline-m.Eat*s.FoodContact*14, 0, 100)
	passiveDrain := .003 * activityTime
	flightDrain := m.Explore * (.01 + .025*s.Novelty) * activityTime
	socialDrain := m.Social * s.Touch * .008 * activityTime
	// Resting in the actual refuge should be visibly restorative while still
	// requiring sustained neural rest rather than a button press.
	recovery := m.Rest * restCue * .32 * activityTime
	w.state.Energy = clamp(w.state.Energy-passiveDrain-flightDrain-socialDrain+recovery, 0, 100)
	w.state.Bond = clamp(w.state.Bond-.025*baseline+m.Social*s.Touch*5.5, 0, 100)
	w.state.Stress = clamp(w.state.Stress+.035*baseline+m.Explore*s.Novelty*.35-m.Rest*restCue*.9-m.Social*s.Touch*.5, 0, 100)
	w.state.SleepPressure = clamp(w.state.SleepPressure+.28*baseline-m.Rest*restCue*2.4, 0, 100)
	w.state.Temperature = clamp(w.state.Temperature+(s.Temperature-.5)*baseline*.08, 0, 1)
	w.state.Hydration = clamp(w.state.Hydration-(.12+s.Airflow*.08)*baseline+s.WaterContact*baseline*.8, 0, 100)
	w.state.Circadian = math.Mod(w.state.Circadian+baseline/240, 1)
	w.state.Health = clamp(w.state.Health-(s.DangerSmell*.08+s.WaterContact*.02)*baseline, 0, 100)
	w.state.Age += baseline / (24 * 60 * 60)
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
	if len(w.state.Memory) > 0 && w.state.Memory[0] == message {
		return
	}
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
		if saved.Body.X != 0 || saved.Body.Y != 0 {
			w.body = sanitizeBody(saved.Body)
		}
		if w.state.Hydration == 0 {
			w.state.Hydration = 74
		}
		return
	}
}

func (w *World) save() {
	if err := os.MkdirAll(filepath.Dir(w.savePath), 0o755); err != nil {
		return
	}
	data, err := json.MarshalIndent(saveFile{SavedAt: time.Now().UTC(), Pet: w.state, Body: w.body}, "", "  ")
	if err == nil {
		temporary := w.savePath + ".tmp"
		if os.WriteFile(temporary, data, 0o600) == nil {
			_ = os.Rename(temporary, w.savePath)
		}
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
