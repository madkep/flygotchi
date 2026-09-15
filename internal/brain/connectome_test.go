package brain

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestConnectomeSpikesTravelAlongDirectedEdge(t *testing.T) {
	pack := connectomePack{
		ID:       "test-circuit",
		Nodes:    []string{"olfactory", "downstream"},
		NodeMeta: []nodeMeta{{Class: "ALPN", Position: [3]int{10, 20, 30}}, {SuperClass: "central", Position: [3]int{40, 50, 60}}},
		Edges:    []connectomeEdge{{From: 0, To: 1, Weight: 5, Neurotransmitter: "ACH"}},
	}
	data, err := json.Marshal(pack)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "pack.json")
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	b, err := LoadConnectomeBrain(path)
	if err != nil {
		t.Fatal(err)
	}
	b.Step(SensoryFrame{}, InternalState{}, 100)
	if b.Visual().Nodes[1].Activity != 0 {
		t.Fatal("downstream should be silent without an input")
	}
	activated := false
	for range 4 {
		b.Step(SensoryFrame{FoodSmell: 1}, InternalState{}, 100)
		if b.Visual().Nodes[1].Activity > 0 {
			activated = true
			break
		}
	}
	if !activated {
		t.Fatal("olfactory input should reach the downstream cell over the real directed edge")
	}
	if visual := b.Visual(); len(visual.Edges) != 1 || visual.Nodes[0].Position != [3]int{10, 20, 30} {
		t.Fatal("visual frame should preserve source edge and position")
	}
}
