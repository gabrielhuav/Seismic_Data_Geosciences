"""Independent byte-level checks for the optional gzip delivery layer."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('transport_builder', ROOT/'scripts/build_transport_assets.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class TransportAssetsTests(unittest.TestCase):
    def test_transport_round_trip_keeps_original_bytes_and_is_deterministic(self):
        with tempfile.TemporaryDirectory() as folder:
            dist = Path(folder); (dist/'data/catalogs/a').mkdir(parents=True)
            inputs = {'data/catalogs/a/events.json': b'{"fields":["x"],"rows":[[0],[null]]}\r\n',
                      'data/basemap.geojson': '{"type":"FeatureCollection","label":"México","features":[]}'.encode('utf-8')}
            for name, raw in inputs.items(): (dist/name).write_bytes(raw)
            report = builder.build(dist)
            self.assertEqual(report['assets'], 2)
            manifest = (dist/builder.MANIFEST).read_bytes()
            first = {name: (dist/(name+'.gz')).read_bytes() for name in inputs}
            builder.build(dist)
            self.assertEqual(manifest, (dist/builder.MANIFEST).read_bytes())
            builder.build(dist, verify_only=True)
            for item in json.loads(manifest)['assets']:
                original = inputs[item['path']]; compressed = first[item['path']]
                self.assertEqual((dist/item['path']).read_bytes(), original)
                self.assertEqual(gzip.decompress(compressed), original)
                self.assertEqual(compressed[4:8], b'\x00'*4)
                self.assertEqual(compressed[9], 255)
                self.assertEqual(hashlib.sha256(original).hexdigest(), item['sha256'])
                self.assertEqual(hashlib.sha256(compressed).hexdigest(), item['gzip']['sha256'])
            self.assertEqual(len(json.loads(manifest)['assets']), 2)

    def test_verify_rejects_changed_source_transport_and_manifest(self):
        with tempfile.TemporaryDirectory() as folder:
            dist = Path(folder); (dist/'data').mkdir()
            source = dist/'data/events.json'; source.write_bytes(b'{"rows":[[1]]}')
            builder.build(dist)
            compressed = source.with_name(source.name+'.gz')
            compressed.write_bytes(compressed.read_bytes()[:-1] + b'!')
            with self.assertRaisesRegex(ValueError, 'Gzip transport differs'): builder.build(dist, verify_only=True)
            builder.build(dist)
            source.write_bytes(b'{"rows":[[2]]}')
            with self.assertRaisesRegex(ValueError, 'Gzip transport differs'): builder.build(dist, verify_only=True)
            builder.build(dist)
            manifest = dist/builder.MANIFEST; data = json.loads(manifest.read_text())
            data['assets'][0]['sha256'] = '0'*64; manifest.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, 'Transport manifest differs'): builder.build(dist, verify_only=True)

if __name__ == '__main__':
    unittest.main()
