package brain

import "testing"

func TestMotorDecoderUsesNeuralActivity(t *testing.T) {
	b := &ConnectomeBrain{meta: []nodeMeta{{Side: "left", SuperClass: "optic"}, {Side: "right", SuperClass: "optic"}}, potentials: []float64{0, 0}}
	if m := b.decodeMotor(); m.Forward != 0 || m.Turn != 0 {
		t.Fatal("silent neurons must not move the body", m)
	}
	b.potentials[0] = .5
	left := b.decodeMotor()
	if left.Forward <= 0 || left.Turn >= 0 {
		t.Fatal("left visual activity must produce left turn", left)
	}
	b.potentials[0], b.potentials[1] = 0, .5
	right := b.decodeMotor()
	if right.Turn <= 0 || right.Forward != left.Forward {
		t.Fatal("mirrored activity must mirror turn", right)
	}
}

func TestMotorDecoderIgnoresSmallRestingAsymmetry(t *testing.T) {
	b := &ConnectomeBrain{meta: []nodeMeta{{Side: "left", SuperClass: "optic"}, {Side: "right", SuperClass: "optic"}}, potentials: []float64{.50, .46}}
	if m := b.decodeMotor(); m.Turn != 0 {
		t.Fatalf("small population bias must not cause a permanent turn: %+v", m)
	}
}

func TestLateralVisionAndTouchEnterCircuit(t *testing.T) {
	s := SensoryFrame{VisionLeft: 1, TouchRight: 1}
	if sensoryRateHz(nodeMeta{Side: "left", SuperClass: "optic"}, s) <= 0 {
		t.Fatal("vision ignored")
	}
	if sensoryRateHz(nodeMeta{Side: "right", SuperClass: "optic"}, s) != 0 {
		t.Fatal("vision leaked to wrong side")
	}
	if sensoryRateHz(nodeMeta{Side: "right", SuperClass: "ascending"}, s) <= 0 {
		t.Fatal("touch ignored")
	}
}
