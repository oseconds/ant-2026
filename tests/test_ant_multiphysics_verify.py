import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("multiphysics_verify", ROOT / "scripts/ant-multiphysics-verify.py")
VERIFY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY)


class InventoryTests(unittest.TestCase):
    def test_only_text_line_endings_are_canonicalized(self):
        text = SimpleNamespace(suffix=".json", read_bytes=lambda: b"one\r\ntwo\r\n")
        binary = SimpleNamespace(suffix=".gz", read_bytes=lambda: b"one\r\ntwo\r\n")
        self.assertEqual(VERIFY.file_bytes(text), b"one\ntwo\n")
        self.assertEqual(VERIFY.file_bytes(binary), b"one\r\ntwo\r\n")

    def test_receipt_rejects_tampered_byte_count(self):
        path = ROOT / "scripts/ant-multiphysics-verify.py"
        entry = VERIFY.receipt(path)
        VERIFY.verify_entries([entry])
        with self.assertRaises(ValueError):
            VERIFY.verify_entries([{**entry, "bytes": entry["bytes"] + 1}])

    def test_duplicate_inventory_is_rejected(self):
        entry = VERIFY.receipt(ROOT / "scripts/ant-multiphysics-verify.py")
        with self.assertRaises(ValueError):
            VERIFY.verify_entries([entry, entry])


if __name__ == "__main__":
    unittest.main()
