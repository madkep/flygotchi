package main

import (
	"fmt"
	"sort"
	"time"

	"flygotchi/internal/brain"
)

func main() {
	s := brain.SensoryFrame{FoodSmell: .5, Safety: .7, Novelty: .2}
	in := brain.InternalState{Hunger: 50, Energy: 70, Bond: 60, Stress: 10}
	measure("synthetic-v1", brain.SyntheticBrain{}, s, in, 1000)
	if connectome, err := brain.LoadConnectomeBrain("data/brain-packs/flywire-v783-microcircuit/manifest.json"); err == nil {
		measure(connectome.ID(), connectome, s, in, 20)
	}
}

type stepper interface {
	Step(brain.SensoryFrame, brain.InternalState, int) brain.MotorFrame
}

func measure(label string, b stepper, s brain.SensoryFrame, in brain.InternalState, iterations int) {
	durations := make([]int64, iterations)
	for i := range durations {
		start := time.Now()
		_ = b.Step(s, in, 50)
		durations[i] = time.Since(start).Nanoseconds()
	}
	sort.Slice(durations, func(i, j int) bool { return durations[i] < durations[j] })
	p50, p95 := durations[iterations/2], durations[(iterations*95)/100]
	fmt.Printf("%s: %d steps, p50=%.3f ms p95=%.3f ms\n", label, iterations, float64(p50)/1e6, float64(p95)/1e6)
}
