# ADR-0035: Separate Business Development and Product Owner discovery roles

- **Status:** Accepted
- **Date:** 2026-10-29
- **Decider:** Project owner

## Context

Jewelry, AI and ecommerce feature proposals need a clear business opportunity,
target audience, product outcome and accountable owner. Combining commercial,
product and technical authority in one role obscures tradeoffs and handoffs.
FaroAI also uses PO for purchase orders, so the Product Owner role needs an explicit boundary.

## Decision

Create project-scoped `bd` and `po` standalone subagent profiles. BD owns commercial
opportunity evidence and business-value recommendations. PO owns product goals,
functional scope, backlog priority and acceptance criteria within the approved
strategy. They are peer functions under the human business owner/sponsor.
Engineering retains architecture, estimates, implementation and operational release ownership.

The parent agent coordinates a shared discovery task, exchanges both analyses for
cross-review, and writes one decision brief after convergence. An explicit need for
validation or a sponsor decision is a valid conclusion; fabricated agreement is not.
Discovery tasks invoke the pair; routine technical fixes and purchase-order operations do not.

The profiles inherit model and permissions from the parent. Creating them grants
no business authority or permission to implement a proposed feature. A current
runtime that has not exposed the profiles can validate their behavior using default
subagents explicitly instructed to read the role files.

## Consequences

Every recommendation states the feature, user/payer segment, reason, measurable
outcome, evidence, MVP, risks, acceptance criteria and next owner. Commercial and
product reviews remain identifiable. Discovery adds peer review cost, so it is
scoped to product/business planning rather than all project tasks.

## References

- [Role ownership and discovery SPEC](../spec/bd-po-product-discovery.md)
- [Official custom subagent file format](https://learn.chatgpt.com/docs/agent-configuration/subagents?surface=app)
