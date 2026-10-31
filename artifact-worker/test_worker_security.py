import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault('DATABASE_URL', 'postgresql://invalid/unused')
os.environ.setdefault('REDIS_URL', 'redis://invalid/0')
stub = types.ModuleType('document_render')
stub.FORMATS = {'pdf', 'xlsx', 'docx', 'pptx'}
stub.render_document = lambda kind, data, path: path.write_bytes(b'fixture document')
sys.modules['document_render'] = stub
import artifact_worker as worker


class Cursor:
    def __init__(self, authorized): self.authorized, self.queries = authorized, []
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def execute(self, query, parameters=()): self.queries.append((query, parameters))
    def fetchone(self): return (1,) if self.authorized else None


class Connection:
    def __init__(self, authorized): self.cur = Cursor(authorized)
    def transaction(self): return self
    def cursor(self, **kwargs): return self.cur
    def __enter__(self): return self
    def __exit__(self, *args): pass


class WorkerSecurityTests(unittest.TestCase):
    def test_uuid_path_validation_rejects_traversal(self):
        with self.assertRaises(ValueError):
            worker.file_path('../outside', '00000000-0000-0000-0000-000000000001', 'pdf')
        with self.assertRaises(ValueError):
            worker.file_path('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '../../pdf')

    def test_rechecks_authorization_before_publishing_and_deletes_temp(self):
        job = {'tenant_id': '00000000-0000-0000-0000-000000000001',
               'id': '00000000-0000-0000-0000-000000000002', 'api_key_id': '00000000-0000-0000-0000-000000000003',
               'claim_id': '00000000-0000-0000-0000-000000000004', 'format': 'pdf', 'input_payload': {}}
        with tempfile.TemporaryDirectory() as folder, patch.object(worker, 'ROOT', Path(folder)):
            denied = Connection(False)
            worker.run_job(denied, job)
            target = worker.file_path(job['tenant_id'], job['id'], 'pdf')
            self.assertFalse(target.exists())
            self.assertEqual(list(target.parent.iterdir()), [])
            allowed = Connection(True)
            worker.run_job(allowed, job)
            self.assertEqual(target.read_bytes(), b'fixture document')
            self.assertTrue(any("status='completed'" in q[0] for q in allowed.cur.queries))


if __name__ == '__main__':
    unittest.main()
