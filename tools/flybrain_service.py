#!/usr/bin/env python3
"""Persistent fly.ai adapter for FlyGotchi.

Run after installing the upstream package with ``pip install flybrain`` and
downloading its MaleCNS data (``flybrain download``). The Go world can then
send sensory frames to /step without constructing a new 166k-neuron brain.
"""
import json, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import numpy as np
from flybrain import FlyBrain

brain = FlyBrain(device=os.environ.get("FLY_DEVICE", "cpu"), dt=0.02,
                 sensory_input=False, refractory=0.004)
groups = {name: brain.cells(types) for name, types in {
    "left_steer": ["DNa02"], "right_steer": ["DNa02"],
    "forward": ["DNg100"], "backward": ["MDN"],
    "escape": ["DNp01"], "eat": ["proboscis motor neuron"],
    "rest": ["descending_neuron"],
}.items()}

def level(fired, idx):
    return min(1.0, float(np.intersect1d(fired, idx, assume_unique=False).size) / max(1, len(idx) * .04))

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_GET(self):
        if self.path == "/health": self.send_json({"ok": True, "brain": "fly.ai/male-cns:v1.0"})
        else: self.send_error(404)
    def do_POST(self):
        if self.path != "/step": self.send_error(404); return
        try:
            n = int(self.headers.get("Content-Length", "0")); s = json.loads(self.rfile.read(n))
            smell = float(s.get("food_smell", 0)); vl = float(s.get("vision_left", 0)); vr = float(s.get("vision_right", 0))
            if smell > 0:
                brain.stimulate(brain.cells(["DM1", "DM2"]), smell * .35)
            if vl > 0: brain.stimulate(brain.cells(["LC4", "LPLC2"], side="L"), vl * .5)
            if vr > 0: brain.stimulate(brain.cells(["LC4", "LPLC2"], side="R"), vr * .5)
            fired = brain.step()
            forward = level(fired, groups["forward"]); backward = level(fired, groups["backward"])
            steer = level(fired, groups["left_steer"]) - level(fired, groups["right_steer"])
            out = {"forward": max(forward, .08 * (1 - backward)), "turn": float(np.tanh(steer)),
                   "brake": min(1., backward), "lift": min(1., level(fired, groups["escape"])),
                   "eat": level(fired, groups["eat"]), "rest": level(fired, groups["rest"]),
                   "explore": forward, "social": 0., "dominant_signal": "forward", "confidence": forward,
                   "fired": int(len(fired))}
            self.send_json(out)
        except Exception as exc: self.send_error(500, str(exc))
    def send_json(self, value):
        data = json.dumps(value).encode(); self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

if __name__ == "__main__":
    port = int(os.environ.get("FLYBRAIN_PORT", "8090")); print(f"fly.ai brain listening on 127.0.0.1:{port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
