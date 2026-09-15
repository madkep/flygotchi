// build_flywire_pack turns the public FAFB v783 aggregated connection table
// into a small, locally runnable brain pack. It never modifies the source data.
package main

import (
	"compress/gzip"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
)

type weightedID struct {
	ID     string
	Weight int
}
type edge struct {
	From             int     `json:"from"`
	To               int     `json:"to"`
	Weight           float64 `json:"weight"`
	Neurotransmitter string  `json:"neurotransmitter"`
}
type nodeMeta struct {
	Position   [3]int `json:"position"`
	Side       string `json:"side,omitempty"`
	SuperClass string `json:"super_class,omitempty"`
	Class      string `json:"class,omitempty"`
}
type pack struct {
	SchemaVersion int    `json:"schema_version"`
	ID            string `json:"id"`
	Name          string `json:"name"`
	Backend       string `json:"backend"`
	CommercialUse bool   `json:"commercial_use"`
	Source        struct {
		Dataset string `json:"dataset"`
		Version string `json:"version"`
		File    string `json:"file"`
		SHA256  string `json:"sha256"`
		License string `json:"license"`
	} `json:"source"`
	Nodes    []string   `json:"nodes"`
	NodeMeta []nodeMeta `json:"node_meta,omitempty"`
	Edges    []edge     `json:"edges"`
}

func main() {
	input := flag.String("input", "data/flywire-v783-source/connections.csv.gz", "FAFB v783 connections.csv.gz")
	output := flag.String("output", "data/brain-packs/flywire-v783-microcircuit/manifest.json", "generated brain pack manifest")
	limit := flag.Int("nodes", 800, "number of high-connectivity neurons to retain")
	flag.Parse()

	counts, _, err := scan(*input, nil)
	if err != nil {
		panic(err)
	}
	ordered := make([]weightedID, 0, len(counts))
	for id, weight := range counts {
		ordered = append(ordered, weightedID{id, weight})
	}
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].Weight > ordered[j].Weight })
	if len(ordered) < *limit {
		*limit = len(ordered)
	}
	chosen := map[string]int{}
	nodes := make([]string, *limit)
	for i, item := range ordered[:*limit] {
		chosen[item.ID], nodes[i] = i, item.ID
	}
	_, edges, err := scan(*input, chosen)
	if err != nil {
		panic(err)
	}
	meta, err := loadMetadata(filepath.Dir(*input), chosen, len(nodes))
	if err != nil {
		panic(err)
	}

	checksum, err := fileSHA256(*input)
	if err != nil {
		panic(err)
	}
	p := pack{SchemaVersion: 2, ID: "flywire-fafb-v783-microcircuit", Name: "FlyWire FAFB v783 Microcircuit", Backend: "connectome_microcircuit_v2", CommercialUse: false, Nodes: nodes, NodeMeta: meta, Edges: edges}
	p.Source.Dataset, p.Source.Version, p.Source.File, p.Source.SHA256 = "FlyWire FAFB", "783", filepath.Base(*input), checksum
	p.Source.License = "FlyWire research/non-commercial terms; attribution required"
	if err := os.MkdirAll(filepath.Dir(*output), 0o755); err != nil {
		panic(err)
	}
	f, err := os.Create(*output)
	if err != nil {
		panic(err)
	}
	defer f.Close()
	if err := json.NewEncoder(f).Encode(p); err != nil {
		panic(err)
	}
	fmt.Printf("Built %s: %d neurons, %d connections\n", *output, len(nodes), len(edges))
}

func loadMetadata(sourceDir string, chosen map[string]int, count int) ([]nodeMeta, error) {
	meta := make([]nodeMeta, count)
	for _, product := range []string{"classification", "coordinates"} {
		path := filepath.Join(sourceDir, product+".csv.gz")
		f, err := os.Open(path)
		if err != nil {
			return nil, fmt.Errorf("%s is required for anatomical brain view: %w", path, err)
		}
		gz, err := gzip.NewReader(f)
		if err != nil {
			f.Close()
			return nil, err
		}
		r := csv.NewReader(gz)
		r.ReuseRecord = true
		if _, err := r.Read(); err != nil {
			gz.Close()
			f.Close()
			return nil, err
		}
		for {
			record, err := r.Read()
			if err == io.EOF {
				break
			}
			if err != nil {
				gz.Close()
				f.Close()
				return nil, err
			}
			index, found := chosen[record[0]]
			if !found {
				continue
			}
			if product == "classification" {
				meta[index].SuperClass, meta[index].Class, meta[index].Side = record[2], record[3], record[6]
			} else {
				var x, y, z int
				if _, err := fmt.Sscanf(record[1], "[%d %d %d]", &x, &y, &z); err == nil {
					meta[index].Position = [3]int{x, y, z}
				}
			}
		}
		gz.Close()
		f.Close()
	}
	return meta, nil
}

func scan(path string, selected map[string]int) (map[string]int, []edge, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return nil, nil, err
	}
	defer gz.Close()
	r := csv.NewReader(gz)
	r.ReuseRecord = true
	if _, err := r.Read(); err != nil {
		return nil, nil, err
	}
	counts := map[string]int{}
	var edges []edge
	for {
		record, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, nil, err
		}
		weight, err := strconv.Atoi(record[3])
		if err != nil {
			continue
		}
		if selected == nil {
			counts[record[0]] += weight
			counts[record[1]] += weight
			continue
		}
		from, foundFrom := selected[record[0]]
		to, foundTo := selected[record[1]]
		if foundFrom && foundTo {
			edges = append(edges, edge{From: from, To: to, Weight: float64(weight) / 60, Neurotransmitter: record[4]})
		}
	}
	return counts, edges, nil
}

func fileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err = io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
