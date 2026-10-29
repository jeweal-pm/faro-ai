from __future__ import annotations

import asyncio
import json
import logging
import re
from contextlib import closing
from datetime import timedelta
from typing import Any
from urllib.parse import urlparse

import httpx
import psycopg
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from psycopg.rows import dict_row

from .mcp_products import parse_mcp_product_result
from .settings import settings

logger = logging.getLogger("faroai.routing")

_PRODUCT_TERMS = re.compile(
    r"\b(ring|rings|necklace|necklaces|earring|earrings|pendant|bracelet|jewelry|jewellery|"
    r"diamond|gold|silver|engagement|wedding band)\b|แหวน|สร้อย|ต่างหู|จี้|กำไล|เครื่องประดับ",
    re.IGNORECASE,
)
_NON_SHOPPING_PRODUCT_QUESTION = re.compile(
    r"\b(how to clean|how do i clean|what is|how does|care for|repair|resize|sizing)\b",
    re.IGNORECASE,
)
_FACETS: dict[str, dict[str, str]] = {
    "product_type": {
        "ring": "ring", "necklace": "necklace", "earrings": "earrings", "bracelet": "bracelet",
        "pendant": "pendant", "other": "",
    },
    "style": {
        "classic": "classic style", "modern": "modern style", "minimal": "minimal style",
        "alluring": "alluring glamorous style", "other": "",
    },
    "recipient": {
        "girlfriend": "for girlfriend", "boyfriend": "for boyfriend", "wife": "for wife",
        "husband": "for husband", "myself": "for myself", "other": "",
    },
    "outfit": {
        "black_clothing": "to complement black clothing", "other": "",
    },
}
_STONE_SHAPES = {
    "round": ("round", "round cut", "round-cut"),
    "oval": ("oval", "oval cut", "oval-cut"),
    "princess": ("princess", "princess cut", "princess-cut"),
    "cushion": ("cushion", "cushion cut", "cushion-cut"),
    "emerald": ("emerald", "emerald cut", "emerald-cut"),
    "pear": ("pear", "pear cut", "pear-cut"),
    "marquise": ("marquise", "marquise cut", "marquise-cut"),
    "radiant": ("radiant", "radiant cut", "radiant-cut"),
    "asscher": ("asscher", "asscher cut", "asscher-cut"),
    "heart": ("heart", "heart cut", "heart-cut"),
}


def _connection() -> psycopg.Connection:
    return psycopg.connect(settings.database_url, connect_timeout=5, row_factory=dict_row)


def _clean_text(value: str, limit: int = 6000) -> str:
    value = re.sub(r"<[^>]*>", " ", value)
    value = re.sub(r"[\x00-\x1f\x7f]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()[:limit]


def available_mcp_sources(tenant_id: str) -> list[dict[str, Any]]:
    # Connections sent by the gateway are the authoritative tenant-scoped runtime set.
    # This query remains for legacy environment/database sources.
    try:
        with closing(_connection()) as conn, conn.cursor() as cur:
            cur.execute(
                """SELECT id,name,allowed_tools,allowed_resources,endpoint_secret_ref
                   FROM mcp_sources WHERE tenant_id=%s AND mode='live' AND status='active'""",
                (tenant_id,),
            )
            return [dict(row) for row in cur.fetchall()]
    except psycopg.Error:
        logger.warning(json.dumps({"event": "legacy_mcp_source_lookup_failed", "tenant_id": tenant_id}))
        return []


def _is_product_discovery_query(message: str) -> bool:
    return bool(_PRODUCT_TERMS.search(message)) and not _NON_SHOPPING_PRODUCT_QUESTION.search(message)


def _requires_product_recommendation(message: str) -> bool:
    """Return true when a product request includes a preference that needs reasoning."""
    explicit_recommendation = re.search(
        r"\b(recommend|recommendation|suggest|suggestion|help me choose|best|ideal)\b",
        message,
        re.IGNORECASE,
    )
    meaningful_preference = re.search(
        r"\b(girlfriend|boyfriend|wife|husband|fianc[ée]|fianc[eé]|mother|father|daughter|son|"
        r"bride|groom|black|white|red|blue|green|pink|classic|modern|minimal|vintage|"
        r"avoid|without|except|instead of|not|under \$?\d+)\b",
        message,
        re.IGNORECASE,
    )
    return bool(explicit_recommendation or meaningful_preference)


def _deterministic_shape_exclusions(message: str) -> list[str]:
    """Recognize a small set of explicit shape negations when Jev is unavailable."""
    excluded: list[str] = []
    for shape, aliases in _STONE_SHAPES.items():
        shape_pattern = "|".join(
            re.escape(alias).replace(r"\ ", r"[ -]")
            for alias in sorted(aliases, key=len, reverse=True)
        )
        if re.search(
            rf"\b(?:not|no|without|avoid|excluding|exclude|except)\s+(?:the\s+)?(?:{shape_pattern})\b",
            message,
            re.IGNORECASE,
        ):
            excluded.append(shape)
    return excluded


def _remove_excluded_shape_phrases(message: str, excluded_shapes: list[str]) -> str:
    query = message
    for shape in excluded_shapes:
        aliases = _STONE_SHAPES.get(shape, (shape,))
        shape_pattern = "|".join(
            re.escape(alias).replace(r"\ ", r"[ -]")
            for alias in sorted(aliases, key=len, reverse=True)
        )
        negative_patterns = (
            rf"\b(?:not|no|without|avoid|excluding|exclude|except)\s+(?:the\s+)?(?:{shape_pattern})\b",
            rf"\b(?:{shape_pattern})\s+(?:is\s+)?(?:not\s+(?:what\s+i\s+)?want|isn't\s+what\s+i\s+want)\b",
        )
        for pattern in negative_patterns:
            query = re.sub(pattern, " ", query, flags=re.IGNORECASE)
    query = re.sub(r"\s+", " ", query).strip(" ,;:-")
    return query or message


def _route_from_jev(
    tenant_id: str,
    message: str,
    sources: list[dict[str, Any]],
    model_candidates: list[dict[str, Any]],
    decision_api_key: str,
) -> dict[str, Any] | None:
    if not decision_api_key:
        return None


    source_by_route: dict[str, tuple[str, str]] = {}
    mcp_criteria: dict[str, str] = {"none": "No live MCP tool is required."}
    for source in sources:
        source_id = str(source.get("id") or source.get("source_id") or "")
        if not source_id:
            continue
        for tool_name in source.get("allowed_tools") or []:
            if not isinstance(tool_name, str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,100}", tool_name):
                continue
            route_id = f"{source_id}:{tool_name}"
            source_by_route[route_id] = (source_id, tool_name)
            label = _clean_text(str(source.get("name") or "MCP source"), 100)
            mcp_criteria[route_id] = f"Use approved tool {tool_name} from {label}."

    candidate_ids: set[str] = set()
    candidate_criteria: dict[str, str] = {"none": "No generated response model is required."}
    for candidate in model_candidates:
        candidate_id = str(candidate.get("candidate_id") or "")
        if not candidate_id:
            continue
        candidate_ids.add(candidate_id)
        input_rate = candidate.get("input_usd_per_million_tokens")
        output_rate = candidate.get("output_usd_per_million_tokens")
        candidate_criteria[candidate_id] = (
            f"Use the approved {candidate.get('provider', 'provider')} model "
            f"{_clean_text(str(candidate.get('model', '')), 120)} to generate prose. "
            f"Its eligible rate is ${input_rate}/1M input tokens and ${output_rate}/1M output tokens."
        )
    requires_candidate = _is_product_discovery_query(message) and _requires_product_recommendation(message)
    if requires_candidate and candidate_ids:
        candidate_criteria.pop("none", None)

    questions: dict[str, Any] = {
        "intent": {
            "type": "choice",
            "instructions": "What does the user want FaroAI to do?",
            "criteria": {
                "product": "Find or recommend jewelry products from the live catalog.",
                "knowledge": "Answer from approved indexed knowledge.",
                "live": "Get current business information from an approved live MCP tool.",
                "chat": "A conversational response that does not require live catalog lookup.",
            },
        },
        "mcp_route": {
            "type": "choice",
            "instructions": "For a live product or business lookup, which single approved MCP tool should be used?",
            "criteria": mcp_criteria,
        },
        "candidate": {
            "type": "choice",
            "instructions": (
                "Select the lowest-priced eligible paid model suitable for generating a concise answer grounded "
                "only in the verified catalog or knowledge results. A model is required for this request. "
                "Never select a model outside this list."
                if requires_candidate and candidate_ids else
                "For a request that asks for a recommendation, includes meaningful preferences or exclusions, "
                "or needs an explanation, select the lowest-priced eligible paid model suitable for generating "
                "a concise answer grounded only in the verified catalog or knowledge results. Choose none only "
                "for a plain category lookup that product cards alone satisfy. Never select a model outside this list."
            ),
            "criteria": candidate_criteria,
        },
    }
    if _is_product_discovery_query(message) and source_by_route:
        for question, instructions in (
            ("product_type", "What jewelry product type is requested?"),
            ("style", "What jewelry style does the user describe?"),
            ("recipient", "Who is the jewelry for?"),
            ("outfit", "What clothing context should be considered, if any?"),
        ):
            choices = _FACETS[question]
            questions[question] = {
                "type": "choice", "instructions": instructions,
                "criteria": {key: (value or "No specific preference was given.") for key, value in choices.items()},
            }
        questions["excluded_stone_shape"] = {
            "type": "choice",
            "instructions": "Which gemstone shape, if any, does the user explicitly reject? Ignore shapes mentioned without a clear negative constraint.",
            "criteria": {
                "none": "No gemstone shape is explicitly rejected.",
                **{shape: f"The user explicitly rejects {shape} or a {shape}-cut gemstone." for shape in _STONE_SHAPES},
            },
        }

    try:
        # This is the fixed OpenRouter Decisions endpoint/model. No client-controlled URL.
        with httpx.Client(timeout=httpx.Timeout(12, connect=3), follow_redirects=False, trust_env=False) as client:
            response = client.post(
                settings.decision_api_url,
                headers={"authorization": f"Bearer {decision_api_key}", "content-type": "application/json"},
                json={
                    "model": settings.decision_model,
                    "state": {"request": _clean_text(message, 500), "available_sources": [
                        {"source_id": str(source.get("id") or source.get("source_id")),
                         "name": _clean_text(str(source.get("name") or "MCP source"), 100),
                         "approved_tools": source.get("allowed_tools") or []}
                        for source in sources
                    ]},
                    "questions": questions,
                },
            )
            response.raise_for_status()
            payload = response.json()
        answers = payload.get("answers")
        if not isinstance(answers, dict):
            return None
        intent_answer = answers.get("intent", {})
        intent = intent_answer.get("choice") if isinstance(intent_answer, dict) else None
        if intent not in {"product", "knowledge", "live", "chat"}:
            return None
        route_answer = answers.get("mcp_route", {})
        route_id = route_answer.get("choice") if isinstance(route_answer, dict) else None
        selected_route = source_by_route.get(route_id) if isinstance(route_id, str) else None
        candidate_answer = answers.get("candidate", {})
        candidate_id = candidate_answer.get("choice") if isinstance(candidate_answer, dict) else None
        if not isinstance(candidate_id, str) or candidate_id not in candidate_ids:
            candidate_id = None

        if intent == "product" and selected_route and selected_route[1] == "search_products":
            exclusion_answer = answers.get("excluded_stone_shape", {})
            selected_exclusion = exclusion_answer.get("choice") if isinstance(exclusion_answer, dict) else None
            excluded_shapes = [selected_exclusion] if selected_exclusion in _STONE_SHAPES else []
            if not excluded_shapes:
                excluded_shapes = _deterministic_shape_exclusions(message)
            phrases = [_remove_excluded_shape_phrases(message, excluded_shapes)]
            for question, mapping in _FACETS.items():
                answer = answers.get(question)
                selection = answer.get("choice") if isinstance(answer, dict) else None
                phrase = mapping.get(selection, "") if isinstance(selection, str) else ""
                if phrase and phrase not in phrases:
                    phrases.append(phrase)
            return {
                "intent": "live", "source_id": selected_route[0], "tool": selected_route[1],
                "candidate_id": candidate_id, "search_query": ", ".join(phrases),
                "search_filters": {"stone_shape_exclude": excluded_shapes}, "decision_used": True,
            }
        if intent == "product":
            eligible = [source for source in sources if "search_products" in (source.get("allowed_tools") or [])]
            if len(eligible) == 1:
                source_id = str(eligible[0].get("id") or eligible[0].get("source_id"))
                excluded_shapes = _deterministic_shape_exclusions(message)
                return {"intent": "live", "source_id": source_id, "tool": "search_products",
                        "candidate_id": candidate_id,
                        "search_query": _remove_excluded_shape_phrases(message, excluded_shapes),
                        "search_filters": {"stone_shape_exclude": excluded_shapes}, "decision_used": True}
        if intent == "live" and selected_route:
            return {"intent": "live", "source_id": selected_route[0], "tool": selected_route[1],
                    "candidate_id": candidate_id, "decision_used": True}
        return {"intent": intent, "source_id": None, "tool": None, "candidate_id": candidate_id,
                "decision_used": True}
    except Exception as error:
        logger.warning(json.dumps({"event": "decision_model_failed", "tenant_id": tenant_id,
                                   "error_type": type(error).__name__}))
        return None


def choose_product_generation_model(tenant_id: str, prompt: str, count: int,
                                    model_candidates: list[dict[str, Any]],
                                    decision_api_key: str) -> str | None:
    """Ask Jev to choose only among server-approved eligible paid model IDs."""
    if not decision_api_key or not model_candidates:
        return None
    choices: dict[str, str] = {}
    for candidate in model_candidates:
        candidate_id = str(candidate.get("candidate_id") or "")
        if candidate_id:
            choices[candidate_id] = (
                f"Use the eligible paid {candidate.get('provider')} model "
                f"{_clean_text(str(candidate.get('model') or ''), 120)} to create exactly {count} distinct jewelry product drafts "
                f"with input price ${float(candidate.get('input_usd_per_million_tokens') or 0):.6f} and output price ${float(candidate.get('output_usd_per_million_tokens') or 0):.6f} per 1M tokens, up to {int(candidate.get('max_tokens') or 0)} output tokens. "
                "The task requires exact JSON, exact item count, 50-100 character names, and 300-500 character descriptions."
            )
    if not choices:
        return None
    try:
        with httpx.Client(timeout=httpx.Timeout(12, connect=3), follow_redirects=False, trust_env=False) as client:
            response = client.post(
                settings.decision_api_url,
                headers={"authorization": f"Bearer {decision_api_key}", "content-type": "application/json"},
                json={
                    "model": settings.decision_model,
                    "state": {"request": _clean_text(prompt, 1000), "task": "draft_new_gis_products", "count": count},
                    "questions": {"candidate": {
                        "type": "choice",
                        "instructions": "Choose the most capable eligible paid model for exact structured output and long creative copy. Follow exact counts, 50-100 character names, and distinct 300-500 character descriptions across the full batch, using up to 7,000 output tokens. Quality and constraint-following come first; use price as a tie-breaker because all candidates already satisfy the tenant's configured price limits. Choose only from the provided candidates.",
                        "criteria": choices,
                    }},
                },
            )
            response.raise_for_status()
            answers = response.json().get("answers")
        answer = answers.get("candidate") if isinstance(answers, dict) else None
        selected = answer.get("choice") if isinstance(answer, dict) else None
        return selected if isinstance(selected, str) and selected in choices else None
    except Exception as error:
        logger.warning(json.dumps({"event": "product_model_decision_failed", "tenant_id": tenant_id,
                                   "error_type": type(error).__name__}))
        return None


def choose_procurement_model(tenant_id: str, prompt: str,
                             model_candidates: list[dict[str, Any]],
                             decision_api_key: str) -> str | None:
    """Ask Jev for an eligible paid model that supports grounded MCP workflows."""
    if not decision_api_key or not model_candidates:
        return None
    choices: dict[str, str] = {}
    for candidate in model_candidates:
        candidate_id = str(candidate.get("candidate_id") or "")
        if candidate_id:
            choices[candidate_id] = (
                f"Use the eligible paid {candidate.get('provider')} model "
                f"{_clean_text(str(candidate.get('model') or ''), 120)} for a Thai/English GIS purchase-order and inventory assistant. "
                "It must follow detailed instructions, use OpenAI-compatible function/tool calling reliably, "
                "track all missing required fields, reply in the user's language, and never invent GIS data. "
                "Avoid micro, instant, or lightweight models if they are likely to miss constraints in a multi-step ERP workflow."
            )
    if not choices:
        return None
    try:
        with httpx.Client(timeout=httpx.Timeout(12, connect=3), follow_redirects=False, trust_env=False) as client:
            response = client.post(
                settings.decision_api_url,
                headers={"authorization": f"Bearer {decision_api_key}", "content-type": "application/json"},
                json={
                    "model": settings.decision_model,
                    "state": {"request": _clean_text(prompt, 1000), "task": "gis_purchase_order_and_inventory_mcp_assistant"},
                    "questions": {"candidate": {
                        "type": "choice",
                        "instructions": "First choose a model capable of accurate multi-step tool use, strict instruction following, and natural Thai/English responses for ERP procurement. "
                        "Do not choose a micro/lightweight model just because it is cheapest if it is likely to omit required fields. "
                        "Among candidates that meet the task-quality bar, prefer the lower-cost one. Choose only from these paid, price-eligible candidates.",
                        "criteria": choices,
                    }},
                },
            )
            response.raise_for_status()
            answers = response.json().get("answers")
        answer = answers.get("candidate") if isinstance(answers, dict) else None
        selected = answer.get("choice") if isinstance(answer, dict) else None
        return selected if isinstance(selected, str) and selected in choices else None
    except Exception as error:
        logger.warning(json.dumps({"event": "procurement_model_decision_failed", "tenant_id": tenant_id,
                                   "error_type": type(error).__name__}))
        return None


def choose_route(
    tenant_id: str,
    message: str,
    sources: list[dict[str, Any]],
    model_candidates: list[dict[str, Any]],
    decision_api_key: str,
) -> dict[str, Any]:
    decision = _route_from_jev(tenant_id, message, sources, model_candidates, decision_api_key)
    if decision is not None:
        return decision

    default = next((item for item in model_candidates if item.get("is_default")), None)
    default_id = None
    if (settings.deployment_mode == "self_hosted" and settings.local_llm_enabled and default
            and default.get("provider") in {"ollama", "lmstudio"}):
        default_id = str(default.get("candidate_id"))

    if _is_product_discovery_query(message):
        eligible = [
            source for source in sources
            if "search_products" in (source.get("allowed_tools") or [])
        ]
        if len(eligible) == 1:
            source = eligible[0]
            source_id = str(source.get("id") or source.get("source_id"))
            return {"intent": "live", "source_id": source_id, "tool": "search_products",
                    "candidate_id": default_id, "search_query": _remove_excluded_shape_phrases(
                        message, _deterministic_shape_exclusions(message)),
                    "search_filters": {"stone_shape_exclude": _deterministic_shape_exclusions(message)},
                    "decision_used": False}

    lowered = message.casefold()
    intent = "product" if _PRODUCT_TERMS.search(lowered) else "knowledge"
    if re.search(r"\b(stock|availability|order status|promotion|eligible)\b|มีของ|สต็อก|สถานะคำสั่งซื้อ", lowered):
        intent = "live"
    return {"intent": intent, "source_id": None, "tool": None, "candidate_id": default_id,
            "decision_used": False}


def call_live_tool(tenant_id: str, source: dict[str, Any], tool: str, message: str, lang: str,
                   filters: dict[str, Any] | None = None) -> dict[str, Any]:
    if not source:
        return {"success": False, "text": "", "products": [], "products_valid": False}
    url = str(source.get("endpoint_url") or "")
    api_key = str(source.get("api_key") or source.get("bearer_token") or "")
    auth_method = str(source.get("auth_method") or "bearer")
    if tool not in (source.get("allowed_tools") or []):
        return {"success": False, "text": "", "products": [], "products_valid": False}
    try:
        validate_mcp_endpoint(url)
        result = asyncio.run(_call_streamable_mcp(url, api_key, auth_method, tool, message, lang, filters or {}))
        if getattr(result, "isError", False):
            raise RuntimeError("mcp_tool_error")
        products, products_valid = parse_mcp_product_result(result) if tool == "search_products" else ([], False)
        texts = [item.text for item in getattr(result, "content", [])
                 if getattr(item, "type", None) == "text" and isinstance(getattr(item, "text", None), str)]
        return {"success": True, "text": _clean_text("\n".join(texts), 4000),
                "products": products, "products_valid": products_valid}
    except Exception as error:
        logger.warning(json.dumps({"event": "mcp_tool_failed", "tenant_id": tenant_id,
                                   "source_id": str(source.get("id") or source.get("source_id") or ""),
                                   "error_type": type(error).__name__}))
        return {"success": False, "text": "", "products": [], "products_valid": False}


def validate_mcp_endpoint(url: str) -> str:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower().rstrip(".")
    loopback = host in {"localhost", "127.0.0.1", "::1"}
    docker_host_dev = host == "host.docker.internal" and settings.mcp_allow_docker_host_http
    if parsed.username or parsed.password or parsed.query or parsed.fragment or not host:
        raise ValueError("unsupported_endpoint_url")
    if not loopback and not docker_host_dev and host not in settings.mcp_allowed_hosts:
        raise ValueError("endpoint_host_not_allowed")
    if parsed.scheme != "https" and not (parsed.scheme == "http" and (loopback or docker_host_dev)):
        raise ValueError("endpoint_tls_required")
    return host


def mcp_test_error_code(error: Exception) -> str:
    if isinstance(error, ValueError):
        return str(error)
    if isinstance(error, httpx.TimeoutException):
        return "mcp_timeout"
    if isinstance(error, httpx.ConnectError):
        return "mcp_connection_failed"
    if isinstance(error, httpx.HTTPStatusError):
        status = error.response.status_code
        return "mcp_unauthorized" if status in {401, 403} else "mcp_http_error"
    return "mcp_protocol_error"


def test_mcp_connection(url: str, api_key: str, auth_method: str = "bearer") -> list[str]:
    validate_mcp_endpoint(url)
    return asyncio.run(_list_streamable_mcp_tools(url, api_key, auth_method))


def _auth_headers(api_key: str, auth_method: str, endpoint_url: str = "") -> dict[str, str]:
    headers: dict[str, str] = {}
    if api_key:
        if auth_method == "x-api-key":
            headers["X-API-Key"] = api_key
        elif auth_method == "bearer":
            headers["Authorization"] = f"Bearer {api_key}"
        else:
            raise ValueError("unsupported_auth_method")
    hostname = (urlparse(endpoint_url).hostname or "").lower()
    if hostname.endswith(".ngrok-free.dev"):
        headers["ngrok-skip-browser-warning"] = "true"
    return headers


async def _list_streamable_mcp_tools(url: str, api_key: str, auth_method: str) -> list[str]:
    async with httpx.AsyncClient(headers=_auth_headers(api_key, auth_method, url),
                                 timeout=httpx.Timeout(8), follow_redirects=False,
                                 trust_env=False) as client:
        async with streamable_http_client(url, http_client=client, terminate_on_close=True) as (
            read_stream, write_stream, _get_session_id
        ):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                result = await session.list_tools()
                return [tool.name for tool in result.tools
                        if isinstance(tool.name, str) and re.fullmatch(r"[A-Za-z0-9_.:-]{1,100}", tool.name)][:100]


async def _list_streamable_mcp_tool_specs(url: str, api_key: str, auth_method: str) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(headers=_auth_headers(api_key, auth_method, url),
                                 timeout=httpx.Timeout(8), follow_redirects=False,
                                 trust_env=False) as client:
        async with streamable_http_client(url, http_client=client, terminate_on_close=True) as (
            read_stream, write_stream, _get_session_id
        ):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                result = await session.list_tools()
                return [
                    {"name": tool.name, "description": str(getattr(tool, "description", "") or "")[:1000],
                     "input_schema": getattr(tool, "inputSchema", {})}
                    for tool in result.tools
                    if isinstance(tool.name, str) and re.fullmatch(r"[A-Za-z0-9_.:-]{1,100}", tool.name)
                ][:100]


def list_approved_mcp_tool_specs(connection: dict[str, Any], permitted: set[str]) -> list[dict[str, Any]]:
    """Fetch the actual GIS tools/list and expose only the fixed, tenant-approved procurement tools."""
    url = str(connection.get("endpoint_url") or "")
    validate_mcp_endpoint(url)
    allowed = set(connection.get("allowed_tools") or [])
    listed = asyncio.run(_list_streamable_mcp_tool_specs(
        url, str(connection.get("api_key") or ""), str(connection.get("auth_method") or "bearer"),
    ))
    return [
        item for item in listed
        if item["name"] in permitted and item["name"] in allowed and isinstance(item.get("input_schema"), dict)
    ]


async def _call_streamable_mcp(url: str, api_key: str, auth_method: str, tool: str,
                               message: str, lang: str, filters: dict[str, Any] | None = None) -> Any:
    async with httpx.AsyncClient(headers=_auth_headers(api_key, auth_method, url),
                                 timeout=httpx.Timeout(15), follow_redirects=False,
                                 trust_env=False) as client:
        async with streamable_http_client(url, http_client=client, terminate_on_close=True) as (
            read_stream, write_stream, _get_session_id
        ):
            async with ClientSession(read_stream, write_stream) as session:
                arguments: dict[str, Any] = {"query": message, "language": lang}
                if filters:
                    available = await session.list_tools()
                    selected_tool = next((item for item in available.tools if item.name == tool), None)
                    input_schema = getattr(selected_tool, "inputSchema", None) if selected_tool else None
                    properties = input_schema.get("properties", {}) if isinstance(input_schema, dict) else {}
                    filter_schema = properties.get("filters") if isinstance(properties, dict) else None
                    filter_fields = filter_schema.get("properties", {}) if isinstance(filter_schema, dict) else {}
                    supports_shape_filter = (
                        isinstance(filter_schema, dict)
                        and filter_schema.get("type") == "object"
                        and (
                            "stone_shape_exclude" in filter_fields
                            or filter_schema.get("additionalProperties") is True
                            or not filter_fields
                        )
                    )
                    logger.info(json.dumps({
                        "event": "mcp_search_filter_schema",
                        "tool": tool,
                        "supports_shape_filter": supports_shape_filter,
                    }))
                    if supports_shape_filter:
                        arguments["filters"] = filters
                return await session.call_tool(tool, arguments=arguments)


async def _call_streamable_mcp_operation(url: str, api_key: str, auth_method: str,
                                        tool: str, arguments: dict[str, Any]) -> Any:
    """Call one fixed product-management tool after verifying it is advertised by GIS."""
    async with httpx.AsyncClient(headers=_auth_headers(api_key, auth_method, url),
                                 timeout=httpx.Timeout(20), follow_redirects=False,
                                 trust_env=False) as client:
        async with streamable_http_client(url, http_client=client, terminate_on_close=True) as (
            read_stream, write_stream, _get_session_id
        ):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                listed = await session.list_tools()
                if tool not in {item.name for item in listed.tools}:
                    raise ValueError("mcp_tool_not_discovered")
                return await session.call_tool(tool, arguments=arguments)


def call_product_mcp_tool(tenant_id: str, connection: dict[str, Any], tool: str,
                          arguments: dict[str, Any]) -> dict[str, Any]:
    """Execute an allow-listed GIS product tool without exposing endpoint or key to a model."""
    return call_approved_mcp_tool(tenant_id, connection, tool, arguments,
                                  {"get_product_master_data", "preview_product", "create_product",
                                   "create_products_bulk", "get_mcp_bulk_job_status"})


def call_approved_mcp_tool(tenant_id: str, connection: dict[str, Any], tool: str,
                           arguments: dict[str, Any], permitted: set[str]) -> dict[str, Any]:
    """Execute only a server-owned tool from the live GIS tools/list and tenant approval set."""
    if tool not in permitted or tool not in (connection.get("allowed_tools") or []):
        return {"success": False, "error": "tool_not_approved"}
    try:
        validate_mcp_endpoint(str(connection.get("endpoint_url") or ""))
        result = asyncio.run(_call_streamable_mcp_operation(
            str(connection["endpoint_url"]), str(connection.get("api_key") or ""),
            str(connection.get("auth_method") or "bearer"), tool, arguments,
        ))
        is_error = bool(getattr(result, "isError", False))
        structured = getattr(result, "structuredContent", None)
        texts = [item.text for item in getattr(result, "content", [])
                 if getattr(item, "type", None) == "text" and isinstance(getattr(item, "text", None), str)]
        value: Any = structured
        if value is None and texts:
            try:
                value = json.loads("\n".join(texts))
            except json.JSONDecodeError:
                value = None
        if not isinstance(value, dict):
            return {"success": False, "error": "mcp_tool_failed" if is_error else "mcp_response_invalid", "text": ""}
        return {"success": True, "result": value}
    except Exception as error:
        logger.warning(json.dumps({"event": "mcp_product_operation_failed", "tenant_id": tenant_id,
                                   "tool": tool, "error_type": type(error).__name__}))
        return {"success": False, "error": "mcp_operation_failed", "text": ""}
