CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    consent_version integer NOT NULL DEFAULT 1 CHECK (consent_version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    key_hash bytea NOT NULL UNIQUE,
    label text NOT NULL,
    scopes text[] NOT NULL DEFAULT ARRAY['chat:write', 'feedback:write'],
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz,
    revoked_at timestamptz,
    UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_active ON api_keys (tenant_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS products (
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    id text NOT NULL,
    sku text NOT NULL,
    name text NOT NULL,
    path text,
    image text,
    product_type text,
    metal text,
    metal_karat text,
    metal_color text,
    stone_type text,
    stone_shape text,
    stone_carat numeric(10, 3),
    price numeric(14, 2),
    currency char(3) NOT NULL DEFAULT 'USD',
    weight numeric(12, 3),
    availability text,
    search_text text,
    summary text,
    catalogue_version text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_products_tenant_type_price ON products (tenant_id, product_type, price);
CREATE INDEX IF NOT EXISTS idx_products_tenant_sku ON products (tenant_id, upper(sku));

CREATE TABLE IF NOT EXISTS mcp_sources (
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    mode text NOT NULL CHECK (mode IN ('indexed', 'live')),
    endpoint_secret_ref text,
    allowed_resources text[] NOT NULL DEFAULT '{}',
    allowed_tools text[] NOT NULL DEFAULT '{}',
    refresh_seconds integer,
    source_version text,
    status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
    last_synced_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    CHECK ((mode = 'indexed' AND refresh_seconds IS NOT NULL) OR mode = 'live')
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    id text NOT NULL,
    source_id uuid NOT NULL,
    title text NOT NULL,
    sanitized_content text NOT NULL,
    language text NOT NULL CHECK (language IN ('en', 'th', 'fr')),
    content_version text NOT NULL,
    content_hash bytea NOT NULL,
    status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'removed')),
    approved_by text,
    approved_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, source_id) REFERENCES mcp_sources(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS embedding_jobs (
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    source_id uuid,
    job_kind text NOT NULL DEFAULT 'knowledge_documents' CHECK (job_kind IN ('knowledge_documents', 'catalogue_products')),
    source_version text NOT NULL,
    collection_name text NOT NULL,
    embedding_model text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'processing', 'completed', 'failed', 'cancelled')),
    attempts integer NOT NULL DEFAULT 0,
    total_documents integer NOT NULL DEFAULT 0,
    completed_documents integer NOT NULL DEFAULT 0,
    payload jsonb NOT NULL,
    error_code text,
    correlation_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, source_id) REFERENCES mcp_sources(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_embedding_jobs_pending ON embedding_jobs (created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_embedding_jobs_tenant_status ON embedding_jobs (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS document_chunks (
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    document_id text NOT NULL,
    chunk_index integer NOT NULL CHECK (chunk_index >= 0),
    content_version text NOT NULL,
    collection_name text NOT NULL,
    point_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, document_id, content_version, chunk_index),
    FOREIGN KEY (tenant_id, document_id) REFERENCES knowledge_documents(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS model_policies (
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    task text NOT NULL,
    provider text NOT NULL CHECK (provider IN ('openrouter', 'ollama', 'lmstudio', 'none')),
    model text NOT NULL,
    max_tokens integer NOT NULL DEFAULT 600,
    timeout_seconds integer NOT NULL DEFAULT 30,
    enabled boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, task)
);

CREATE TABLE IF NOT EXISTS tenant_consents (
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    subject_ref_hash bytea NOT NULL,
    purpose text NOT NULL CHECK (purpose IN ('ai_chat', 'ai_improve', 'ai_training')),
    granted boolean NOT NULL,
    policy_version integer NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz,
    PRIMARY KEY (tenant_id, subject_ref_hash, purpose, policy_version)
);

CREATE TABLE IF NOT EXISTS faroai_feedback (
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    rating text NOT NULL CHECK (rating IN ('up', 'down')),
    intent text,
    language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'th', 'fr')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS unanswered_gaps (
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    text_hash bytea NOT NULL,
    scrubbed_text text NOT NULL,
    reason text NOT NULL,
    language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'th', 'fr')),
    hits integer NOT NULL DEFAULT 1,
    first_seen timestamptz NOT NULL DEFAULT now(),
    last_seen timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, text_hash)
);

CREATE TABLE IF NOT EXISTS faroai_synonyms (
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    phrase text NOT NULL,
    filter_key text NOT NULL,
    filter_value text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, phrase, filter_key)
);

CREATE TABLE IF NOT EXISTS audit_events (
    tenant_id uuid,
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    correlation_id text NOT NULL,
    actor_key_id uuid,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_created ON audit_events (tenant_id, created_at DESC);
