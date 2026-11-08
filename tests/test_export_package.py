import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]

class ExportPackageTests(unittest.TestCase):
    def test_zip_is_readable_by_independent_standard_library(self):
        bundled = Path(sys.executable).parent.parent / 'node/bin/node.exe'
        node = str(bundled) if bundled.exists() else shutil.which('node')
        self.assertTrue(node, 'Node is required to verify browser ZIP output')
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'analysis.zip'
            script = """
const fs=require('node:fs'), assert=require('node:assert/strict');
const Z=require('./system/dist/export-package.js');
assert.equal(Z.crc32(new TextEncoder().encode('123456789')),0xcbf43926);
for(const entries of [[{name:'../escape',data:''}],[{name:'x',data:''},{name:'x',data:''}]])assert.throws(()=>Z.zipStored(entries));
Z.zipStored([{name:'résumé.csv',data:'id,value\\r\\na,0\\r\\nb,-1'}, {name:'empty.json',data:''},{name:'bytes.bin',data:new Uint8Array([0,255,128,1])}]).arrayBuffer().then(b=>fs.writeFileSync(process.argv[1],Buffer.from(b)));
"""
            subprocess.run([node,'-e',script,str(target)],cwd=ROOT,check=True,capture_output=True)
            with zipfile.ZipFile(target) as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(archive.namelist(),['résumé.csv','empty.json','bytes.bin'])
                self.assertEqual(archive.read('résumé.csv').decode(),'id,value\r\na,0\r\nb,-1')
                self.assertEqual(archive.read('empty.json'),b'')
                self.assertEqual(archive.read('bytes.bin'),bytes([0,255,128,1]))
