#!/usr/bin/env python3
"""Build FlyGotchi's compact MaleCNS v1.0 brain pack.

The official neuPrint export is intentionally kept outside git.  This tool
selects the most connected neurons and retains only directed edges with at
least five synapses, matching the project's browser budget while preserving
the MaleCNS topology and provenance.
"""
import argparse, csv, gzip, hashlib, json, os
from collections import Counter

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw', default='data/raw/male-cns_v1.0')
    ap.add_argument('--output', default='data/brain-packs/malecns-v1.0-microcircuit/manifest.json')
    ap.add_argument('--nodes', type=int, default=800)
    ap.add_argument('--min-weight', type=int, default=5)
    a = ap.parse_args()
    neurons = {}
    with gzip.open(os.path.join(a.raw, 'neurons.csv.gz'), 'rt', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            bid = row['bodyId']
            neurons[bid] = row
    degree = Counter()
    edges = []
    with gzip.open(os.path.join(a.raw, 'edges.csv.gz'), 'rt', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            w = int(row['weight'])
            if w < a.min_weight or row['pre'] not in neurons or row['post'] not in neurons:
                continue
            degree[row['pre']] += w
            degree[row['post']] += w
            edges.append((row['pre'], row['post'], w))
    chosen = [bid for bid, _ in degree.most_common(a.nodes)]
    index = {bid: i for i, bid in enumerate(chosen)}
    nodes, meta = [], []
    for bid in chosen:
        n = neurons[bid]
        nodes.append(bid)
        def integer(v):
            try: return int(float(v))
            except (TypeError, ValueError): return 0
        meta.append({'position': [integer(n['somaX']), integer(n['somaY']), integer(n['somaZ'])],
                     'side': n.get('somaSide',''), 'super_class': n.get('superclass',''),
                     'class': n.get('class','')})
    nt_sign = {'gaba': 'GABA', 'glutamate': 'GLUT'}
    kept = []
    for pre, post, w in edges:
        if pre not in index or post not in index: continue
        nt = nt_sign.get((neurons[pre].get('consensusNt') or '').lower(), 'ACETYLCHOLINE')
        kept.append({'from': index[pre], 'to': index[post], 'weight': w / 60.0,
                     'neurotransmitter': nt})
    source = os.path.join(a.raw, 'edges.csv.gz')
    h = hashlib.sha256()
    with open(source, 'rb') as f:
        for block in iter(lambda: f.read(1024*1024), b''): h.update(block)
    pack = {'schema_version': 3, 'id': 'malecns-v1.0-microcircuit',
            'name': 'MaleCNS v1.0 Microcircuit (threshold >= 5)',
            'backend': 'connectome_microcircuit_v3', 'commercial_use': True,
            'source': {'dataset': 'MaleCNS / neuPrint', 'version': '1.0',
                       'file': 'edges.csv.gz (weight >= 5)', 'sha256': h.hexdigest(),
                       'license': 'CC-BY 4.0'}, 'nodes': nodes, 'node_meta': meta,
            'edges': kept}
    os.makedirs(os.path.dirname(a.output), exist_ok=True)
    with open(a.output, 'w', encoding='utf-8') as f: json.dump(pack, f, separators=(',', ':'))
    print(f'Built {a.output}: {len(nodes)} neurons, {len(kept)} directed connections (>= {a.min_weight})')
if __name__ == '__main__': main()
