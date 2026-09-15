package game

import (
	"path/filepath"
	"testing"

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
