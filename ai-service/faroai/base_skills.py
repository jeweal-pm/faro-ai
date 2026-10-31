"""Platform-owned Base Skill metadata and bounded instruction loading.

The registry is shared by tenants; it does not authorize tools or business actions.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any


ROOT = Path(__file__).parent / "base_skills"
_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_VERSION = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")
_DIGEST = re.compile(r"^[a-f0-9]{64}$")
_EXECUTORS = {
    "base.jewelry-search": "discovery.product",
    "base.knowledge-answer": "discovery.knowledge",
    "base.po-search": "procurement.read",
    "base.catalog-create": "catalog.create",
    "base.po-create": "procurement.create",
    "base.inventory-receive": "procurement.receive",
}


class SkillRegistryError(ValueError):
    pass


@dataclass(frozen=True)
class Skill:
    id: str
    name: str
    description: str
    version: str
    status: str
    executor: str
    digest: str

    def public(self) -> dict[str, str]:
        return {"id": self.id, "name": self.name, "description": self.description,
                "version": self.version, "status": self.status, "executor": self.executor}


class BaseSkillRegistry:
    def __init__(self, root: Path = ROOT):
        self.root = root.resolve(strict=True)
        manifest_path = self.root / "release.json"
        if manifest_path.is_symlink() or not manifest_path.is_file():
            raise SkillRegistryError("invalid_release_manifest")
        raw = manifest_path.read_bytes()
        if len(raw) > 32_768:
            raise SkillRegistryError("release_manifest_too_large")
        try:
            manifest: Any = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise SkillRegistryError("invalid_release_manifest") from exc
        if not isinstance(manifest, dict) or set(manifest) != {"release", "skills"}:
            raise SkillRegistryError("invalid_release_manifest")
        release = manifest["release"]
        entries = manifest["skills"]
        if not isinstance(release, str) or not re.fullmatch(r"[a-zA-Z0-9._-]{1,80}", release):
            raise SkillRegistryError("invalid_release_id")
        if not isinstance(entries, list) or not 1 <= len(entries) <= 50:
            raise SkillRegistryError("invalid_skill_catalog")
        self.release = release
        self.release_digest = hashlib.sha256(raw).hexdigest()
        self.skills: dict[str, Skill] = {}
        for entry in entries:
            if not isinstance(entry, dict) or set(entry) != {"id", "name", "description", "version", "status", "executor", "digest"}:
                raise SkillRegistryError("invalid_skill_metadata")
            if any(not isinstance(value, str) for value in entry.values()):
                raise SkillRegistryError("invalid_skill_metadata")
            skill = Skill(**entry)
            if (not _NAME.fullmatch(skill.name) or skill.id != f"base.{skill.name}"
                    or not _VERSION.fullmatch(skill.version) or not _DIGEST.fullmatch(skill.digest)
                    or skill.status not in {"ready", "planned"}
                    or not 1 <= len(skill.description) <= 1024 or skill.id in self.skills):
                raise SkillRegistryError("invalid_skill_metadata")
            if skill.status == "ready" and _EXECUTORS.get(skill.id) != skill.executor:
                raise SkillRegistryError("unregistered_skill_executor")
            self.skills[skill.id] = skill

    def catalog(self) -> dict[str, Any]:
        return {"release": self.release, "release_digest": self.release_digest,
                "skills": [skill.public() for skill in self.skills.values()]}

    def choices(self, executor_prefix: str) -> dict[str, str]:
        return {skill.id: skill.description for skill in self.skills.values()
                if skill.status == "ready" and skill.executor.startswith(executor_prefix)}

    def load(self, skill_id: str, executor: str) -> tuple[Skill, str]:
        skill = self.skills.get(skill_id)
        if not skill or skill.status != "ready" or skill.executor != executor:
            raise SkillRegistryError("skill_not_available")
        folder = self.root / skill.name
        path = folder / "SKILL.md"
        if folder.is_symlink() or path.is_symlink() or not path.is_file() or path.resolve().parent != self.root / skill.name:
            raise SkillRegistryError("invalid_skill_path")
        raw = path.read_bytes()
        if len(raw) > 16_384 or not hmac.compare_digest(hashlib.sha256(raw).hexdigest(), skill.digest):
            raise SkillRegistryError("skill_digest_mismatch")
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise SkillRegistryError("invalid_skill_encoding") from exc
        lines = text.splitlines()
        if len(lines) < 5 or lines[0] != "---":
            raise SkillRegistryError("invalid_skill_frontmatter")
        try:
            end = lines.index("---", 1)
        except ValueError as exc:
            raise SkillRegistryError("invalid_skill_frontmatter") from exc
        header = lines[1:end]
        if header != [f"name: {skill.name}", f"description: {skill.description}"]:
            raise SkillRegistryError("skill_metadata_mismatch")
        body = "\n".join(lines[end + 1:]).strip()
        if not body:
            raise SkillRegistryError("empty_skill_instructions")
        return skill, body


@lru_cache(maxsize=1)
def get_base_skills() -> BaseSkillRegistry:
    return BaseSkillRegistry()


def eligible_chat_skill(route: dict[str, Any]) -> str | None:
    """Constrain skill choice to the existing read-only route, never select a tool."""
    intent, tool = route.get("intent"), route.get("tool")
    if intent == "product" or (intent == "live" and tool == "search_products"):
        expected = "base.jewelry-search"
    elif intent == "knowledge":
        expected = "base.knowledge-answer"
    else:
        return None
    selected = route.get("skill_id")
    if route.get("decision_used"):
        # A missing/none skill choice falls back only to the already-authorized
        # read route. An incompatible or invalid explicit choice is rejected.
        return expected if selected is None or selected == expected else None
    return expected
