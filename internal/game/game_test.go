package game

import (
	"math"
	"path/filepath"
	"testing"
	"time"

	"flygotchi/internal/brain"
)

func TestNeedsRequireAppropriateSensoryInput(t *testing.T) {
	w := New(brain.SyntheticBrain{}, filepath.Join(t.TempDir(), "mica.json"))
	initial := w.Snapshot().Pet
	for range 7 {
		w.Step("idle")
	}
	idle := w.Snapshot().Pet
	if idle.Hunger <= initial.Hunger {
		t.Fatalf("idle should increase hunger: %v -> %v", initial.Hunger, idle.Hunger)
	}
	if idle.Energy >= initial.Energy {
		t.Fatalf("idle should consume energy: %v -> %v", initial.Energy, idle.Energy)
	}
	if idle.Bond > initial.Bond {
		t.Fatalf("idle should not create social bond: %v -> %v", initial.Bond, idle.Bond)
	}
	if fed := w.Step("food").Pet; fed.Hunger >= idle.Hunger {
		t.Fatalf("food contact should reduce hunger: %v -> %v", idle.Hunger, fed.Hunger)
	}
	beforeRest := w.Snapshot().Pet.Energy
	if rested := w.Step("rest").Pet; rested.Energy <= beforeRest {
		t.Fatalf("safe rest should restore energy: %v -> %v", beforeRest, rested.Energy)
	}
	beforePlay := w.Snapshot().Pet.Bond
	if played := w.Step("play").Pet; played.Bond <= beforePlay {
		t.Fatalf("touch should increase bond: %v -> %v", beforePlay, played.Bond)
	}
}

func TestFoodSearchDoesNotFeedUntilContact(t *testing.T) {
	w := New(brain.SyntheticBrain{}, filepath.Join(t.TempDir(), "mica.json"))
	before := w.Snapshot().Pet.Hunger
	search := w.StepInput("food", false, 1).Pet.Hunger
	if search < before {
		t.Fatalf("food smell without contact must not reduce hunger: %v -> %v", before, search)
	}
	eaten := w.StepInput("food", true, 2).Pet.Hunger
	if eaten >= search {
		t.Fatalf("contact should reduce hunger: %v -> %v", search, eaten)
	}
}

func TestDuplicateSequenceIsIdempotent(t *testing.T) {
	w := New(brain.SyntheticBrain{}, filepath.Join(t.TempDir(), "mica.json"))
	first := w.StepInput("food", true, 7)
	duplicate := w.StepInput("food", true, 7)
	if first.Pet.Hunger != duplicate.Pet.Hunger || first.Pet.Energy != duplicate.Pet.Energy {
		t.Fatalf("duplicate sequence advanced state: first=%+v duplicate=%+v", first.Pet, duplicate.Pet)
	}
}

func TestSensoryBoundaryRejectsNonFiniteValues(t *testing.T) {
	w := New(brain.SyntheticBrain{}, filepath.Join(t.TempDir(), "mica.json"))
	got := w.StepSenses("idle", brain.SensoryFrame{FoodSmell: math.NaN(), Reward: math.Inf(1)}, 1)
	if got.Pet.Hunger < 0 || got.Pet.Hunger > 100 || got.Motor.Eat < 0 || got.Motor.Eat > 1 {
		t.Fatalf("invalid senses escaped boundary: %+v", got)
	}
}

func TestFixedSchedulerAdvancesWithoutRequests(t *testing.T) {
	w := New(brain.SyntheticBrain{}, filepath.Join(t.TempDir(), "mica.json"))
	w.Start()
	defer w.Stop()
	before := w.SimTime()
	time.Sleep(140 * time.Millisecond)
	if w.SimTime() <= before {
		t.Fatalf("scheduler did not advance simulated time: %v -> %v", before, w.SimTime())
	}
}

func TestOnlyOneRendererOwnsSharedBody(t *testing.T) {
	w := New(brain.SyntheticBrain{}, filepath.Join(t.TempDir(), "mica.json"))
	first, owns := w.SetBodySenses("idle", brain.SensoryFrame{Safety: .4}, 1, "tab-a", BodyState{X: .31, Y: .52, Grounded: true, Support: "suelo"})
	if !owns || !first.BodyOwner || first.Body.X != .31 {
		t.Fatalf("first renderer should own and publish body: %+v", first)
	}
	second, owns := w.SetBodySenses("idle", brain.SensoryFrame{Safety: 1}, 2, "tab-b", BodyState{X: .8, Y: .2, Grounded: true, Support: "suelo"})
	if owns || second.BodyOwner || second.Body.X != .31 || second.Body.Y != .52 {
		t.Fatalf("second renderer must mirror the existing body: %+v", second)
	}
}
