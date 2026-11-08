"""Read-only verification of the delivered evidence package."""
import hashlib
import json
from pathlib import Path
import numpy as np
from scipy.io import wavfile

root = Path(__file__).parent
manifest = json.loads((root / 'MANIFEST.json').read_text())
for name, expected in manifest['filesSha256'].items():
    actual = hashlib.sha256((root / name).read_bytes()).hexdigest()
    assert actual == expected, f'Hash mismatch: {name}'
campaign = json.loads((root / 'output/analysis.json').read_text())['campaign']
assert len(campaign['rows']) == 28
for row in campaign['rows']:
    raw = root / 'output' / (row['id'] + '.f32')
    assert hashlib.sha256(raw.read_bytes()).hexdigest() == row['sha256']
    expected = np.fromfile(raw, dtype='<f4').reshape(-1, 2)
    rate, actual = wavfile.read(root / 'output' / (row['id'] + '-raw.wav'))
    assert rate == 24000 and actual.shape == (28800, 2)
    assert np.array_equal(actual, expected) and np.all(np.isfinite(actual))
    assert row['analysis']['clippedSamplesMonitor36'] == 0
browser = json.loads((root / 'output/browser-validation.json').read_text())
assert len(browser['cases']) == 8 and not browser['errors']
assert max(c['maxPlaybackError'] for c in browser['cases']) < 1e-7
report = json.loads((root / 'output/report-validation.json').read_text())
assert report['cardCount'] == 28 and report['aVisible'] == 7 and report['bVisible'] == 14
assert report['completeImages'] and not report['errors']
assert report['fade']['first'] == report['fade']['last'] == 0
print(f"Verified {len(manifest['filesSha256'])} file hashes, 28 PCM/WAV pairs, 8 browser cases, report receipts.")
