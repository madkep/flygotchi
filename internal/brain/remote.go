package brain

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"
)

// RemoteBrain delegates each neural tick to the persistent fly.ai Python
// process. The world remains authoritative for physics and shared state.
type RemoteBrain struct {
	url        string
	client     *http.Client
	mu         sync.Mutex
	visual     VisualFrame
	lastVisual time.Time
	lastError  string
}

func NewRemoteBrain(url string) *RemoteBrain {
	return &RemoteBrain{url: strings.TrimRight(url, "/"), client: &http.Client{Timeout: 800 * time.Millisecond}}
}
func (b *RemoteBrain) ID() string { return "fly.ai/male-cns:v1.0" }
func (b *RemoteBrain) Step(s SensoryFrame, in InternalState, durationMS int) MotorFrame {
	payload, _ := json.Marshal(struct {
		SensoryFrame
		InternalState
		DurationMS int `json:"duration_ms"`
	}{s, in, durationMS})
	req, err := http.NewRequest(http.MethodPost, b.url+"/step", bytes.NewReader(payload))
	if err != nil {
		return b.unavailable(err.Error())
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := b.client.Do(req)
	if err != nil {
		return b.unavailable(err.Error())
	}
	defer resp.Body.Close()
	var motor MotorFrame
	if resp.StatusCode != http.StatusOK || json.NewDecoder(resp.Body).Decode(&motor) != nil {
		return b.unavailable("fly.ai returned an invalid motor frame")
	}
	b.mu.Lock()
	b.lastError = ""
	b.mu.Unlock()
	return motor
}

func (b *RemoteBrain) unavailable(message string) MotorFrame {
	b.mu.Lock()
	b.lastError = message
	b.mu.Unlock()
	return MotorFrame{Brake: 1, Dominant: "unavailable"}
}

func (b *RemoteBrain) Status() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.lastError
}

// Visual exposes activity from the same persistent Python process. It is
// cached briefly so browser polling cannot compete with neural stepping.
func (b *RemoteBrain) Visual() VisualFrame {
	b.mu.Lock()
	needsRefresh := time.Since(b.lastVisual) > 450*time.Millisecond
	cached := b.visual
	b.mu.Unlock()
	if !needsRefresh {
		return cached
	}
	resp, err := b.client.Get(b.url + "/visual")
	if err != nil {
		return cached
	}
	defer resp.Body.Close()
	var visual VisualFrame
	if resp.StatusCode == http.StatusOK && json.NewDecoder(resp.Body).Decode(&visual) == nil {
		b.mu.Lock()
		b.visual, b.lastVisual = visual, time.Now()
		b.mu.Unlock()
		return visual
	}
	return cached
}
