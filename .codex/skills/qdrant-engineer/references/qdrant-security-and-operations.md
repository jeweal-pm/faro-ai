# Qdrant Security and Operations Reference

Use this reference when creating or reviewing Qdrant Docker, network, authentication, tenant isolation, or collection lifecycle changes. Qdrant settings vary by version and deployment topology; confirm syntax against the official documentation for the version being deployed.

## Official documentation

- [Security and access control](https://qdrant.tech/documentation/security/)
- [Secure a self-hosted Qdrant instance with Docker Compose](https://qdrant.tech/documentation/tutorials-operations/secure-qdrant/)
- [Configuration](https://qdrant.tech/documentation/operations/configuration/)
- [Multitenancy](https://qdrant.tech/documentation/tutorials/multiple-partitions/)
- [Filtering](https://qdrant.tech/documentation/search/filtering/)
- [Payloads](https://qdrant.tech/documentation/concepts/payload/)
- [Migrate to a new embedding model](https://qdrant.tech/documentation/tutorials-operations/embedding-model-migration/)

## Deployment invariants

Qdrant's self-hosted open-source server is not secure by default: without explicit configuration, reachable clients can access data without authentication, and the service may bind to all interfaces. Production deployment must add access control and network boundaries before it is reachable by untrusted clients.

Default ports are REST/API and dashboard `6333`, gRPC `6334`, and cluster peer traffic `6335`. Only publish a port when a deployment requires it. Keep the peer port private; Qdrant's internal peer communication is not protected by API-key authentication by default. The Qdrant container should not be internet-facing.

An API key protects access to the instance but does not itself encrypt traffic and does not provide FaroAI's tenant authorization. Use TLS for connections crossing a host or trust boundary. Bind local development ports to loopback, or leave `ports` unset in Compose and let only trusted services on the private network connect.

Qdrant supports admin, read-only and (version-dependent) granular collection access keys. A global read-only key is suitable only for services that need query access; it is not tenant-scoped. Keep tenant authorization and mandatory tenant filters in FaroAI's trusted backend.

## Docker Compose baseline

This is a baseline pattern, not a drop-in production file. Pin a verified version/digest, attach only trusted API/worker services to the same private network, inject strong secrets at deploy time, and add TLS if traffic leaves the trusted Docker host/network.

```yaml
services:
  qdrant:
    image: qdrant/qdrant:<pinned-version-or-digest>
    restart: unless-stopped
    environment:
      QDRANT__SERVICE__API_KEY: ${QDRANT_API_KEY:?set QDRANT_API_KEY}
      QDRANT__SERVICE__READ_ONLY_API_KEY: ${QDRANT_READ_ONLY_API_KEY:?set QDRANT_READ_ONLY_API_KEY}
    volumes:
      - qdrant_storage:/qdrant/storage
    networks:
      - qdrant_private
    # No public port mappings. Trusted app containers use qdrant:6333.

volumes:
  qdrant_storage:

networks:
  qdrant_private:
    internal: true
```

If a host tool needs access in local development, add a loopback-only mapping such as `127.0.0.1:6333:6333`; do not use `6333:6333` on a public host. Publish `6334` only for a trusted client that requires gRPC. Do not publish `6335`.

Do not commit `.env` files containing keys. Prefer the deployment platform's secret injection. If TLS terminates at a reverse proxy, restrict the proxy and Qdrant to the private network and configure the proxy to enforce authentication and TLS correctly. If enabling Qdrant TLS directly, mount certificate/key files read-only and use the current version's documented TLS settings. Protect API keys in transit; a key sent over plaintext HTTP can be intercepted.

## Tenant-filter enforcement

For shared multi-tenant collections:

1. Obtain `tenant_id` from authenticated, validated server-side request/job context.
2. Add a mandatory `tenant_id` condition in the shared Qdrant adapter for every tenant-scoped operation, including reads, writes, updates, counts, scrolls and deletes.
3. Add a keyword payload index for fields used in filters before bulk ingestion; where supported and suitable, configure the tenant field as a tenant index.
4. Do not let browser input provide the trusted tenant scope or raw Qdrant filter object.
5. Test cross-tenant read and mutation denial, including search, scroll, retrieve, count and delete paths.

Qdrant payload filtering is an application-enforced isolation mechanism. It is not a substitute for Hono authentication/authorization. Collection-level access keys also do not enforce a `tenant_id` payload filter.

## Data and lifecycle

- Store only fields required for filtering, traceability and returned context. Avoid secrets, unnecessary PII and full raw prompts in payloads.
- Keep source and collection/model version metadata so stale vectors can be identified and removed.
- Use separate lifecycle boundaries for approved knowledge, semantic answer-cache candidates and explicitly authorized training datasets.
- Persist the authoritative source/job state in PostgreSQL. Qdrant is a rebuildable retrieval index, not the consent or training registry.
- Back up persistent storage and test restore. For model, dimension, metric or chunking changes, build a versioned collection, re-embed, validate retrieval, switch the active version and keep a rollback path before retiring old vectors.
- Restrict Docker host/volume access, pin image versions, monitor disk and memory, and plan upgrades and backup retention.

## Version and topology checks

Before writing configuration, verify the pinned Qdrant release supports the chosen authentication, TLS, tenant-index and collection-migration settings. Self-hosted single-node, distributed self-hosted and Qdrant Cloud deployments have different network and security controls. Avoid copying settings from a different topology without validation.
