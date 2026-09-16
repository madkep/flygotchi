package brain

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// RemoteBrain delegates each neural tick to the persistent fly.ai Python
// process. The world remains authoritative for physics and shared state.
type RemoteBrain struct {
	url    string
	client *http.Client
}

func NewRemoteBrain(url string) *RemoteBrain {
	return &RemoteBrain{url: strings.TrimRight(url, "/"), client: &http.Client{Timeout: 150 * time.Millisecond}}
}
func (b *RemoteBrain) ID() string { return "fly.ai/male-cns:v1.0" }
func (b *RemoteBrain) Step(s SensoryFrame, in InternalState, _ int) MotorFrame {
	payload, _ := json.Marshal(struct {
		SensoryFrame
		InternalState
	}{s, in})
	req, err := http.NewRequest(http.MethodPost, b.url+"/step", bytes.NewReader(payload))
	if err != nil {
		return MotorFrame{}
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := b.client.Do(req)
	if err != nil {
		return MotorFrame{}
	}
	defer resp.Body.Close()
	var motor MotorFrame
	if resp.StatusCode != http.StatusOK || json.NewDecoder(resp.Body).Decode(&motor) != nil {
		return MotorFrame{}
	}
	return motor
}
