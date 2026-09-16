// Package brain defines the stable boundary between FlyGotchi's world and a
// particular brain implementation. A connectome adapter can implement Brain
// later without requiring changes to the game or its HTTP API.
package brain

import "math"

type SensoryFrame struct {
	FoodSmell      float64 `json:"food_smell"`
	FoodSmellLeft  float64 `json:"food_smell_left"`
	FoodSmellRight float64 `json:"food_smell_right"`
	FoodContact    float64 `json:"food_contact"`
	RefugeSmell    float64 `json:"refuge_smell"`
	RefugeLeft     float64 `json:"refuge_smell_left"`
	RefugeRight    float64 `json:"refuge_smell_right"`
	RefugeCue      float64 `json:"refuge_cue"`
	RefugeContact  float64 `json:"refuge_contact"`
	Touch          float64 `json:"touch"`
	TouchLeft      float64 `json:"touch_left"`
	TouchRight     float64 `json:"touch_right"`
	VisionLeft     float64 `json:"vision_left"`
	VisionRight    float64 `json:"vision_right"`
	DangerSmell    float64 `json:"danger_smell"`
	Safety         float64 `json:"safety"`
	Novelty        float64 `json:"novelty"`
	Temperature    float64 `json:"temperature"`
	WaterContact   float64 `json:"water_contact"`
	Taste          float64 `json:"taste"`
	Humidity       float64 `json:"humidity"`
	Airflow        float64 `json:"airflow"`
	AngularSpeed   float64 `json:"angular_speed"`
	BodySpeed      float64 `json:"body_speed"`
	GroundContact  float64 `json:"ground_contact"`
	VisionMotion   float64 `json:"vision_motion"`
	Reward         float64 `json:"reward"`
}

type InternalState struct {
	Hunger        float64 `json:"hunger"`
	Energy        float64 `json:"energy"`
	Bond          float64 `json:"bond"`
	Stress        float64 `json:"stress"`
	SleepPressure float64 `json:"sleep_pressure"`
	Temperature   float64 `json:"temperature"`
	Reward        float64 `json:"reward"`
	Pain          float64 `json:"pain"`
	Age           float64 `json:"age"`
}

type MotorFrame struct {
	Forward float64 `json:"forward"`
	Turn    float64 `json:"turn"`
	Brake   float64 `json:"brake"`
	Lift    float64 `json:"lift"`
	Eat     float64 `json:"eat"`
	Rest    float64 `json:"rest"`
	Explore float64 `json:"explore"`
	Social  float64 `json:"social"`

	Dominant   string  `json:"dominant_signal"`
	Confidence float64 `json:"confidence"`
}

type Brain interface {
	ID() string
	Step(SensoryFrame, InternalState, int) MotorFrame
}

// VisualFrame exposes the actual selected topology and representative neuron
// positions to the browser. The positions are points, not traced morphology.
type VisualFrame struct {
	Nodes            []VisualNode `json:"nodes"`
	Edges            []VisualEdge `json:"edges"`
	TotalConnections int          `json:"total_connections"`
	Dataset          string       `json:"dataset"`
}

type VisualNode struct {
	ID         string  `json:"id"`
	Position   [3]int  `json:"position"`
	Side       string  `json:"side"`
	SuperClass string  `json:"super_class"`
	CellClass  string  `json:"cell_class"`
	Activity   float64 `json:"activity"`
}

type VisualEdge struct {
	From             int     `json:"from"`
	To               int     `json:"to"`
	Weight           float64 `json:"weight"`
	Neurotransmitter string  `json:"neurotransmitter"`
}

type VisualBrain interface{ Visual() VisualFrame }

// SyntheticBrain is deliberately small and inspectable. It is not intended as
// a biological model: it is a useful, replaceable brain pack for the game.
type SyntheticBrain struct{}

func (SyntheticBrain) ID() string { return "synthetic-v1" }

func (SyntheticBrain) Step(s SensoryFrame, in InternalState, _ int) MotorFrame {
	eat := activation(0.24 + s.FoodSmell*0.62 + s.FoodContact*0.32 + in.Hunger/100*0.72 - in.Stress/100*0.12 - s.DangerSmell*.16)
	rest := activation(0.19 + (1-in.Energy/100)*0.86 + in.SleepPressure/100*.34 + s.Safety*0.24 - s.Novelty*0.10)
	explore := activation(0.17 + s.Novelty*0.70 + in.Energy/100*0.28 + s.Reward*0.12 - in.Hunger/100*0.19)
	social := activation(0.13 + s.Touch*0.66 + s.Reward*0.30 + in.Bond/100*0.26 - in.Stress/100*0.11)

	motor := MotorFrame{Eat: eat, Rest: rest, Explore: explore, Social: social, Lift: clamp(s.Novelty*.35+s.VisionMotion*.2-s.GroundContact*.18, 0, 1)}
	motor.Dominant, motor.Confidence = dominant(motor)
	return motor
}

func activation(value float64) float64 { return 1 / (1 + math.Exp(-4*(value-0.5))) }

func dominant(m MotorFrame) (string, float64) {
	label, score := "eat", m.Eat
	for _, candidate := range []struct {
		label string
		score float64
	}{{"rest", m.Rest}, {"explore", m.Explore}, {"socialize", m.Social}} {
		if candidate.score > score {
			label, score = candidate.label, candidate.score
		}
	}
	return label, score
}
