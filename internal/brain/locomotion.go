package brain

import "math"

func lateralSense(side string, left, right float64) float64 {
	switch side {
	case "L", "left":
		return left
	case "R", "right":
		return right
	}
	return (left + right) / 2
}

// Experimental population decoder. These weights are designed, not identified
// biological motor pathways. No destination, route or raw sense enters here.
// Zero neural activity yields zero movement. Positive turn is clockwise.
func (b *ConnectomeBrain) decodeMotor() MotorFrame {
	var sum, count [2][3]float64
	for i, meta := range b.meta {
		group := -1
		switch meta.Class {
		case "ALPN", "ALLN", "ALIN":
			group = 0
		case "AN":
			group = 2
		}
		if group < 0 {
			switch meta.SuperClass {
			case "optic", "visual_projection", "visual_centrifugal":
				group = 0
			case "descending", "motor":
				group = 1
			case "ascending":
				group = 2
			}
		}
		if group < 0 {
			continue
		}
		for side := 0; side < 2; side++ {
			if (meta.Side == "L" || meta.Side == "left") && side == 1 {
				continue
			}
			if (meta.Side == "R" || meta.Side == "right") && side == 0 {
				continue
			}
			sum[side][group] += b.potentials[i]
			count[side][group]++
		}
	}
	for side := 0; side < 2; side++ {
		for g := 0; g < 3; g++ {
			if count[side][g] > 0 {
				sum[side][g] /= count[side][g]
			}
		}
	}
	left := sum[0][0] + .3*sum[0][1]
	right := sum[1][0] + .3*sum[1][1]
	threatLeft, threatRight := sum[0][2], sum[1][2]
	// Population sizes and resting potentials are not perfectly symmetrical in
	// this small MaleCNS-derived sample. Decode a *relative* hemispheric
	// imbalance, then discard weak asymmetry. Without this, a tiny persistent
	// baseline difference becomes a permanent circular walk.
	steer := (right - left) / (right + left + .08)
	avoid := (threatLeft - threatRight) / (threatLeft + threatRight + .08)
	turn := .65*steer + .55*avoid
	// It takes a substantial imbalance to pivot a body. This prevents low-level
	// connectome noise from accumulating into an endless spin.
	turnDeadZone := .22
	// Strong tactile input is when a fly needs to resolve a collision. Permit
	// the existing hemispheric neural imbalance to select a side only in that
	// context; while cruising, retain the wider dead zone that prevents spins.
	if threatLeft+threatRight > .35 {
		turnDeadZone = .035
	}
	if math.Abs(turn) <= turnDeadZone {
		turn = 0
	} else {
		turn = math.Copysign((math.Abs(turn)-turnDeadZone)/(1-turnDeadZone)*.45, turn)
	}
	m := MotorFrame{
		Forward: clamp((left+right)*.65, 0, 1),
		Turn:    clamp(turn, -.45, .45),
		Brake:   clamp(math.Min(threatLeft, threatRight)*.6, 0, .8),
		Lift:    clamp((sum[0][1]+sum[1][1])*.45+(left+right)*.15, 0, 1),
		Eat:     clamp((sum[0][0]+sum[1][0])*.5, 0, 1),
		Rest:    clamp((threatLeft+threatRight)*.5, 0, 1),
		Explore: clamp((left+right)*.5, 0, 1),
		Social:  clamp((threatLeft+threatRight)*.5, 0, 1),
	}
	m.Dominant, m.Confidence = dominant(m)
	return m
}
