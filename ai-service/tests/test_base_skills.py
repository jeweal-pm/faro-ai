import json
import shutil
import tempfile
import unittest
from pathlib import Path

from faroai.base_skills import BaseSkillRegistry, SkillRegistryError, eligible_chat_skill


class BaseSkillRegistryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "base_skills"
        shutil.copytree(Path(__file__).resolve().parents[1] / "faroai" / "base_skills", self.root)
        self.addCleanup(self.tmp.cleanup)

    def test_shared_catalog_exposes_planned_without_enabling_them(self):
        registry = BaseSkillRegistry(self.root)
        self.assertEqual(len(registry.catalog()["skills"]), 11)
        self.assertEqual(len(registry.choices("discovery.")), 2)
        with self.assertRaises(SkillRegistryError):
            registry.load("base.xlsx", "artifact.xlsx")
        with self.assertRaises(SkillRegistryError):
            registry.load("base.unknown", "discovery.product")

    def test_loads_only_matching_registered_executor_and_verified_body(self):
        registry = BaseSkillRegistry(self.root)
        skill, instructions = registry.load("base.jewelry-search", "discovery.product")
        self.assertEqual(skill.version, "1.0.0")
        self.assertIn("authorized catalog", instructions)
        with self.assertRaises(SkillRegistryError):
            registry.load("base.jewelry-search", "procurement.read")
        (self.root / "jewelry-search" / "SKILL.md").write_text("modified", encoding="utf-8")
        with self.assertRaisesRegex(SkillRegistryError, "skill_digest_mismatch"):
            registry.load("base.jewelry-search", "discovery.product")

    def test_catalog_and_inventory_skills_are_registered_and_bound_to_their_executors(self):
        registry = BaseSkillRegistry(self.root)
        catalog, catalog_body = registry.load("base.catalog-create", "catalog.create")
        inventory, inventory_body = registry.load("base.inventory-receive", "procurement.receive")
        self.assertEqual(catalog.status, "ready")
        self.assertIn("does not grant MCP access", catalog_body)
        self.assertEqual(inventory.status, "ready")
        self.assertIn("cannot approve a purchase order", inventory_body)
        with self.assertRaises(SkillRegistryError):
            registry.load("base.inventory-receive", "procurement.create")

    def test_po_create_skill_is_ready_and_bound_to_confirmation_gated_executor(self):
        registry = BaseSkillRegistry(self.root)
        skill, instructions = registry.load("base.po-create", "procurement.create")
        self.assertEqual(skill.status, "ready")
        self.assertIn("wait for the user to explicitly confirm", instructions)
        self.assertIn("Never approve a PO", instructions)
        with self.assertRaises(SkillRegistryError):
            registry.load("base.po-create", "procurement.read")

    def test_rejects_unregistered_executor_even_if_manifest_marks_it_ready(self):
        manifest_path = self.root / "release.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        next(item for item in manifest["skills"] if item["id"] == "base.xlsx")["status"] = "ready"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(SkillRegistryError, "unregistered_skill_executor"):
            BaseSkillRegistry(self.root)

    def test_jev_choice_cannot_override_read_route(self):
        self.assertEqual(eligible_chat_skill({"intent": "live", "tool": "search_products", "skill_id": "base.jewelry-search", "decision_used": True}), "base.jewelry-search")
        self.assertIsNone(eligible_chat_skill({"intent": "live", "tool": "search_products", "skill_id": "base.knowledge-answer", "decision_used": True}))
        self.assertIsNone(eligible_chat_skill({"intent": "live", "tool": "create_purchase_order", "skill_id": "base.jewelry-search", "decision_used": True}))
        self.assertEqual(eligible_chat_skill({"intent": "knowledge", "decision_used": False}), "base.knowledge-answer")
        self.assertEqual(eligible_chat_skill({"intent": "live", "tool": "search_products", "skill_id": None, "decision_used": True}), "base.jewelry-search")
        self.assertIsNone(eligible_chat_skill({"intent": "live", "tool": "search_products", "skill_id": "__invalid__", "decision_used": True}))


if __name__ == "__main__":
    unittest.main()
