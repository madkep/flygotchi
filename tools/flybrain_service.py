#!/usr/bin/env python3
"""Persistent MaleCNS v1.0 service for FlyGotchi."""
from __future__ import annotations
import json, os, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import numpy as np
from flybrain import FlyBrain

DT_MS = 20
def clamp(value, low=0.0, high=1.0): return max(low, min(high, float(value)))

class Engine:
    def __init__(self):
        self.lock = threading.Lock()
        self.brain = FlyBrain(device=os.environ.get("FLY_DEVICE", "cpu"), dt=DT_MS / 1000,
                              sensory_input=False, refractory=0.004)
        self.carry_ms, self.steps = 0.0, 0
        self.groups = self.build_groups()
        self.visual_indices = self.choose_visual_indices(800)
        self.visual_lookup = {int(index): slot for slot, index in enumerate(self.visual_indices)}
        self.activity = np.zeros(len(self.visual_indices), dtype=np.float32)
        self.edges = self.visual_edges(900)
        self.motor_trace = {name: 0.0 for name in ("forward", "backward", "escape", "taste", "steer_left", "steer_right")}
        self.last_motor = self.empty_motor("initializing")

    def cells(self, names, side=None):
        return np.asarray(self.brain.cells(names, side=side), dtype=np.int64)

    def build_groups(self):
        groups = {
            "steer_left": self.cells(["DNa02"], "L"),
            "steer_right": self.cells(["DNa02"], "R"),
            "forward": self.cells(["DNg100"]),
            "backward": self.cells(["MDN"]),
            "escape": self.cells(["DNp01"]),
            "odor_left": self.cells(["ORN_DM1", "ORN_DM2"], "L"),
            "odor_right": self.cells(["ORN_DM1", "ORN_DM2"], "R"),
            "refuge_left": self.cells(["ORN_DM3"], "L"),
            "refuge_right": self.cells(["ORN_DM3"], "R"),
            "vision_left": self.cells(["LC4", "LPLC2"], "L"),
            "vision_right": self.cells(["LC4", "LPLC2"], "R"),
            "touch_left": self.cells(["JO-A", "JO-B"], "L"),
            "touch_right": self.cells(["JO-A", "JO-B"], "R"),
            "taste": self.cells(["BM_Taste"]),
        }
        missing = [name for name, ids in groups.items() if not len(ids)]
        if missing: raise RuntimeError("MaleCNS is missing annotated populations: " + ", ".join(missing))
        return groups

    def choose_visual_indices(self, limit):
        base = np.linspace(0, self.brain.n - 1, limit, dtype=np.int64)
        important = np.concatenate(list(self.groups.values()))
        return np.asarray(list(dict.fromkeys(np.concatenate([important, base]).tolist()))[:limit], dtype=np.int64)

    def visual_edges(self, limit):
        selected = set(map(int, self.visual_indices))
        edges = []
        for source in self.visual_indices:
            start, end = self.brain.indptr[source], self.brain.indptr[source + 1]
            for target, weight in zip(self.brain.indices[start:end], self.brain.weights[start:end]):
                if int(target) in selected: edges.append((float(abs(weight)), int(source), int(target)))
        edges.sort(reverse=True)
        return [{"from": self.visual_lookup[src], "to": self.visual_lookup[dst], "weight": weight,
                 "neurotransmitter": "signed"} for weight, src, dst in edges[:limit]]

    @staticmethod
    def empty_motor(label):
        return {"forward": 0., "turn": 0., "brake": 1., "lift": 0., "eat": 0., "rest": 0.,
                "explore": 0., "social": 0., "dominant_signal": label, "confidence": 0., "fired": 0}
    def inject(self, group, amount):
        if amount > 0: self.brain.stimulate(self.groups[group], amount)
    @staticmethod
    def group_rate(fired, group):
        return float(np.intersect1d(fired, group, assume_unique=False).size) / max(1, len(group))

    def step(self, frame):
        with self.lock:
            self.carry_ms += clamp(frame.get("duration_ms", 50), 1, 200)
            ticks = max(1, int(self.carry_ms // DT_MS)); self.carry_ms -= ticks * DT_MS
            fired = np.empty(0, dtype=np.int64)
            for _ in range(ticks):
                self.inject("odor_left", clamp(frame.get("food_smell_left", 0)) * .42)
                self.inject("odor_right", clamp(frame.get("food_smell_right", 0)) * .42)
                self.inject("refuge_left", clamp(frame.get("refuge_smell_left", 0)) * .22)
                self.inject("refuge_right", clamp(frame.get("refuge_smell_right", 0)) * .22)
                self.inject("vision_left", clamp(frame.get("vision_left", 0)) * .55)
                self.inject("vision_right", clamp(frame.get("vision_right", 0)) * .55)
                self.inject("touch_left", clamp(frame.get("touch_left", 0)) * .28)
                self.inject("touch_right", clamp(frame.get("touch_right", 0)) * .28)
                self.inject("taste", clamp(frame.get("taste", 0)) * .45)
                # The browser's generic alarm channel can represent looming
                # visual danger (for example the cursor). Keep it lateral by
                # scaling each optic pathway with that side's actual view.
                danger = clamp(frame.get("danger_smell", 0) + frame.get("vision_motion", 0) * .5)
                self.inject("vision_left", danger * clamp(frame.get("vision_left", 0)) * .25)
                self.inject("vision_right", danger * clamp(frame.get("vision_right", 0)) * .25)
                fired = self.brain.step(); self.update_activity(fired); self.steps += 1
                for name in self.motor_trace:
                    self.motor_trace[name] = self.motor_trace[name] * .82 + self.group_rate(fired, self.groups[name]) * .18
            forward, backward = self.motor_trace["forward"], self.motor_trace["backward"]
            left, right = self.motor_trace["steer_left"], self.motor_trace["steer_right"]
            escape, taste = self.motor_trace["escape"], self.motor_trace["taste"]
            # A looming cursor is represented in the visual pathways before it
            # reaches the descending escape population.  Preserve the actual
            # MaleCNS steering output, then add a lateral escape component from
            # the *difference* between the two visual hemifields.  This keeps
            # the reaction sensory-driven: a threat on the left turns right,
            # while a threat on the right turns left.
            neural_turn = clamp(right - left, -1, 1)
            visual_bias = clamp(frame.get("vision_left", 0) - frame.get("vision_right", 0), -1, 1)
            escape_turn = visual_bias * escape * .85
            turn = clamp(neural_turn + escape_turn, -1, 1)
            # DNp01 is an escape descending command. Decoding it as a brief
            # forward wing/leg drive makes a looming stimulus carry the body
            # away, while its direction, intensity and take-off still come
            # exclusively from the active MaleCNS motor populations.
            escape_drive = escape * .72
            forward_drive = clamp(forward + escape_drive)
            motion = max(forward_drive, backward, abs(turn), escape)
            # MaleCNS has no single annotated "sleep motor" population. Rest is
            # therefore a body-state decoder: a quiet descending system can only
            # restore energy after the physical body has reached the refuge.
            # Energy remains a game-side internal variable, not injected as a
            # fictitious current into a named neuron type.
            quiet = clamp(1 - motion * 8)
            refuge = clamp(frame.get("refuge_contact", 0)) * clamp(frame.get("ground_contact", 0))
            rest = refuge * quiet * clamp((100 - float(frame.get("energy", 100))) / 35)
            label = "rest" if rest > max(motion, .15) else ("idle" if motion == 0 else ("escape" if escape >= max(forward, backward, abs(turn)) else ("explore" if forward >= max(backward, abs(turn)) else ("reverse" if backward > forward else "turn"))))
            self.last_motor = {"forward": forward_drive, "turn": turn, "brake": clamp(backward),
                "lift": clamp(escape), "eat": clamp(taste), "rest": clamp(rest), "explore": clamp(forward_drive), "social": 0.,
                "dominant_signal": label, "confidence": clamp(motion), "fired": int(len(fired)),
                "ticks": ticks, "simulated_ms": ticks * DT_MS}
            return self.last_motor

    def update_activity(self, fired):
        self.activity *= .90
        for neuron in fired:
            slot = self.visual_lookup.get(int(neuron))
            if slot is not None: self.activity[slot] = 1.

    def visual(self):
        with self.lock:
            nodes = []
            for slot, index in enumerate(self.visual_indices):
                position = self.brain.positions[index] if self.brain.positions is not None else (0,0,0)
                nodes.append({"id": str(int(index)), "position": [int(v) if np.isfinite(v) else 0 for v in position],
                    "side": str(self.brain.side[index]), "super_class": str(self.brain.superclass[index]),
                    "class": str(self.brain.cell_type[index]), "activity": float(self.activity[slot])})
            return {"nodes": nodes, "edges": self.edges, "total_connections": int(len(self.brain.weights)),
                    "dataset": "fly.ai / MaleCNS v1.0", "steps": self.steps, "last_motor": self.last_motor}
    def health(self):
        return {"ok": True, "brain": "fly.ai/male-cns:v1.0", "neurons": self.brain.n,
                "connections": int(len(self.brain.weights)), "dt_ms": DT_MS, "steps": self.steps,
                "groups": {name: int(len(ids)) for name, ids in self.groups.items()}}

engine = Engine()
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_GET(self):
        if self.path == "/health": return self.send_json(engine.health())
        if self.path == "/visual": return self.send_json(engine.visual())
        self.send_error(404)
    def do_POST(self):
        if self.path != "/step": self.send_error(404); return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 16384: self.send_error(413); return
            self.send_json(engine.step(json.loads(self.rfile.read(length))))
        except Exception as exc: self.send_error(500, str(exc))
    def send_json(self, value):
        data = json.dumps(value).encode(); self.send_response(200)
        self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(data)))
        self.end_headers(); self.wfile.write(data)
if __name__ == "__main__":
    port = int(os.environ.get("FLYBRAIN_PORT", "8090"))
    print(f"fly.ai MaleCNS service listening on http://127.0.0.1:{port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
