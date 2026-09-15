package brain

import (
	"encoding/json"
	"math"
	"math/rand"
	"os"
	"sort"
)

// ConnectomeBrain executes a compact, derived FlyWire circuit. The topology
// and transmitter labels are real FAFB v783 data; sensory and motor mappings
// are a game-facing adapter, not a claim of a biological behavioural model.
type ConnectomeBrain struct {
	id          string
	nodes       []string
	meta        []nodeMeta
	edges       []connectomeEdge
	outgoing    [][]synapse
	visualEdges []VisualEdge
	potentials  []float64
	membrane    []float64
	conductance []float64
	refractory  []float64
}

type synapse struct {
	to    int
	delta float64
}

type connectomePack struct {
	ID       string           `json:"id"`
	Nodes    []string         `json:"nodes"`
	NodeMeta []nodeMeta       `json:"node_meta"`
	Edges    []connectomeEdge `json:"edges"`
}

type nodeMeta struct {
	Position   [3]int `json:"position"`
	Side       string `json:"side"`
	SuperClass string `json:"super_class"`
	Class      string `json:"class"`
}

type connectomeEdge struct {
	From             int     `json:"from"`
	To               int     `json:"to"`
	Weight           float64 `json:"weight"`
	Neurotransmitter string  `json:"neurotransmitter"`
}

func LoadConnectomeBrain(path string) (*ConnectomeBrain, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var pack connectomePack
	if err := json.Unmarshal(data, &pack); err != nil {
		return nil, err
	}
	if len(pack.Nodes) == 0 || len(pack.Edges) == 0 {
		return nil, os.ErrInvalid
	}
	if len(pack.NodeMeta) != len(pack.Nodes) {
		return nil, os.ErrInvalid
	}
	b := &ConnectomeBrain{id: pack.ID, nodes: pack.Nodes, meta: pack.NodeMeta, edges: pack.Edges, outgoing: make([][]synapse, len(pack.Nodes)), potentials: make([]float64, len(pack.Nodes)), membrane: make([]float64, len(pack.Nodes)), conductance: make([]float64, len(pack.Nodes)), refractory: make([]float64, len(pack.Nodes))}
	for i := range b.membrane {
		b.membrane[i] = -52
	}
	for _, edge := range pack.Edges {
		if edge.From < 0 || edge.To < 0 || edge.From >= len(b.nodes) || edge.To >= len(b.nodes) {
			continue
		}
		sign := 1.0
		if edge.Neurotransmitter == "GABA" || edge.Neurotransmitter == "GLUT" {
			sign = -1
		}
		// The source pack stores synapse count / 60. A reduced-circuit gain
		// keeps activity stable when most of the full-brain partners are absent.
		delta := sign * math.Min(edge.Weight*60, 300) * .275 * .35
		b.outgoing[edge.From] = append(b.outgoing[edge.From], synapse{to: edge.To, delta: delta})
	}
	ordered := append([]connectomeEdge(nil), pack.Edges...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].Weight > ordered[j].Weight })
	for _, edge := range ordered {
		if edge.From == edge.To || edge.From < 0 || edge.To < 0 || edge.From >= len(b.nodes) || edge.To >= len(b.nodes) {
			continue
		}
		b.visualEdges = append(b.visualEdges, VisualEdge{From: edge.From, To: edge.To, Weight: edge.Weight, Neurotransmitter: edge.Neurotransmitter})
		if len(b.visualEdges) == 900 {
			break
		}
	}
	return b, nil
}

func (b *ConnectomeBrain) ID() string { return b.id }

func (b *ConnectomeBrain) Step(s SensoryFrame, in InternalState, dtMS int) MotorFrame {
	// An inexpensive LIF-inspired frame: 1 ms Euler ticks, 20 ms membrane
	// timescale, 5 ms synaptic decay, -52/-45 mV rest/threshold, 2.2 ms
	// refractory period. These are the published Shiu et al. parameters;
	// stimulus mapping and reduced-circuit synaptic gain are game adapters.
	ticks := int(clamp(float64(dtMS), 80, 130))
	for tick := 0; tick < ticks; tick++ {
		firing := make([]int, 0, 30)
		for i := range b.nodes {
			b.conductance[i] *= math.Exp(-1.0 / 5)
			b.potentials[i] *= .986
			if b.refractory[i] > 0 {
				b.refractory[i] -= 1
				b.membrane[i] = -52
				continue
			}
			b.membrane[i] += (b.conductance[i] - (b.membrane[i] + 52)) / 20
			rate := sensoryRateHz(b.meta[i], s)
			if b.membrane[i] < -45 && rand.Float64() >= rate/1000 {
				continue
			}
			b.membrane[i] = -52
			b.refractory[i] = 2.2
			b.potentials[i] = clamp(b.potentials[i]+.24, 0, 1)
			firing = append(firing, i)
		}
		for _, from := range firing {
			for _, edge := range b.outgoing[from] {
				b.conductance[edge.to] += edge.delta
			}
		}
	}

	base := SyntheticBrain{}.Step(s, in, dtMS)
	activity := b.classActivity()
	// Cell superclasses have biological meaning; they do not identify a
	// four-action motor decoder. The game adapter uses them as small gains.
	base.Eat = clamp(base.Eat*(.92+activity[0]*.17), 0, 1)
	base.Rest = clamp(base.Rest*(1.04-activity[1]*.11), 0, 1)
	base.Explore = clamp(base.Explore*(.91+activity[1]*.19), 0, 1)
	base.Social = clamp(base.Social*(.93+activity[2]*.15), 0, 1)
	base.Dominant, base.Confidence = dominant(base)
	return base
}

func sensoryRateHz(meta nodeMeta, s SensoryFrame) float64 {
	// Codex classifications supply a more meaningful stimulus seed than an
	// arbitrary node-index group. Taste contact has no identified GRNs in this
	// high-degree subset, so it remains part of the game-side motor adapter.
	switch meta.Class {
	case "ALPN", "ALLN", "ALIN":
		return s.FoodSmell * 95
	case "MBON", "MBIN", "DAN":
		return s.Reward * 55
	case "AN":
		return s.Touch * 85
	}
	switch meta.SuperClass {
	case "optic", "visual_projection", "visual_centrifugal":
		return s.Novelty * 80
	case "ascending":
		return s.Touch * 60
	default:
		return 0
	}
}

func (b *ConnectomeBrain) classActivity() [3]float64 {
	var sums [3]float64
	var counts [3]float64
	for index, potential := range b.potentials {
		group := -1
		if b.meta[index].Class == "ALPN" || b.meta[index].Class == "ALLN" || b.meta[index].Class == "ALIN" {
			group = 0
		}
		if b.meta[index].SuperClass == "optic" || b.meta[index].SuperClass == "visual_projection" || b.meta[index].SuperClass == "visual_centrifugal" {
			group = 1
		}
		if b.meta[index].SuperClass == "ascending" {
			group = 2
		}
		if group < 0 {
			continue
		}
		sums[group] += potential
		counts[group]++
	}
	for group := range sums {
		if counts[group] > 0 {
			sums[group] /= counts[group]
		}
	}
	return sums
}

func (b *ConnectomeBrain) Visual() VisualFrame {
	nodes := make([]VisualNode, len(b.nodes))
	for i, id := range b.nodes {
		nodes[i] = VisualNode{ID: id, Position: b.meta[i].Position, Side: b.meta[i].Side, SuperClass: b.meta[i].SuperClass, CellClass: b.meta[i].Class, Activity: b.potentials[i]}
	}
	return VisualFrame{Nodes: nodes, Edges: b.visualEdges, TotalConnections: len(b.edges), Dataset: "FlyWire FAFB v783"}
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
