from __future__ import annotations

import os
import json
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Settings:
    database_url: str = os.environ["DATABASE_URL"]
    redis_url: str = os.environ["REDIS_URL"]
    qdrant_url: str = os.environ.get("QDRANT_URL", "http://qdrant:6333")
    qdrant_api_key: str = os.environ["QDRANT_API_KEY"]
    internal_secret: str = os.environ.get("FAROAI_INTERNAL_SECRET", "")
    embedding_model: str = os.environ.get("EMBEDDING_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
    embedding_dimension: int = int(os.environ.get("EMBEDDING_DIMENSION", "384"))
    embedding_cache_dir: str = os.environ.get("EMBEDDING_CACHE_DIR", "/tmp/fastembed")
    qdrant_collection: str = os.environ.get("QDRANT_COLLECTION", "approved_knowledge_v1")
    qdrant_product_collection: str = os.environ.get("QDRANT_PRODUCT_COLLECTION", "faroai_products_v1")
    model_provider: str = os.environ.get("MODEL_PROVIDER", "none").lower()
    model_base_url: str = os.environ.get("MODEL_BASE_URL", "").rstrip("/")
    model_api_key: str = os.environ.get("MODEL_API_KEY", "")
    model_name: str = os.environ.get("MODEL_NAME", "")
    openrouter_data_collection: str = os.environ.get("OPENROUTER_DATA_COLLECTION", "deny")
    decision_api_url: str = "https://openrouter.ai/api/alpha/decisions"
    decision_model: str = "typesafe/jev-1.13"
    deployment_mode: str = os.environ.get("FAROAI_DEPLOYMENT_MODE", "hosted")
    tenant_mode: str = os.environ.get("FAROAI_TENANT_MODE", "multi")
    single_tenant_id: str = os.environ.get("FAROAI_SINGLE_TENANT_ID", "")
    shared_training_enabled: bool = os.environ.get("FAROAI_SHARED_TRAINING_ENABLED", "false").lower() == "true"
    learning_policy_version: int = int(os.environ.get("FAROAI_LEARNING_POLICY_VERSION", "1"))
    local_llm_enabled: bool = os.environ.get("FAROAI_LOCAL_LLM_ENABLED", "false").lower() == "true"
    mcp_connections: dict[str, dict[str, str]] = field(
        default_factory=lambda: json.loads(os.environ.get("MCP_CONNECTIONS_JSON") or "{}")
    )
    mcp_allowed_hosts: frozenset[str] = frozenset(host.strip().lower() for host in os.environ.get("MCP_ALLOWED_HOSTS", "").split(",") if host.strip())
    mcp_allow_docker_host_http: bool = os.environ.get("MCP_ALLOW_DOCKER_HOST_HTTP", "false").lower() == "true"
    product_base_url: str = os.environ.get("PRODUCT_BASE_URL", "").rstrip("/")


settings = Settings()
