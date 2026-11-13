from __future__ import annotations

import ipaddress
import json
import math
import re
from typing import Any
from urllib.parse import urlparse


MAX_MCP_CANDIDATES = 10
MAX_MCP_RESULT_BYTES = 24_000
_STONE_SHAPE_TERMS = {
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


def _text(value: Any, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    value = re.sub(r"<[^>]*>", " ", value)
    value = re.sub(r"[\x00-\x1f\x7f]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value[:limit] or None


def _public_https_url(value: Any) -> str | None:
    if not isinstance(value, str) or len(value) > 2048:
        return None
    try:
        parsed = urlparse(value)
        host = parsed.hostname
        if parsed.scheme != "https" or not host or parsed.username or parsed.password:
            return None
        normalized_host = host.lower().rstrip(".")
        if normalized_host == "localhost" or normalized_host.endswith((".localhost", ".local")):
            return None
        try:
            address = ipaddress.ip_address(host)
            if not address.is_global:
                return None
        except ValueError:
            pass
        return value
    except ValueError:
        return None


def _price(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(parsed) or parsed < 0 or parsed > 1_000_000_000:
        return None
    return parsed


def _records(value: Any) -> list[Any]:
    if not isinstance(value, dict):
        return []
    records = value.get("products")
    return records[:MAX_MCP_CANDIDATES] if isinstance(records, list) else []


def _within_payload_limit(value: Any) -> bool:
    try:
        return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) <= MAX_MCP_RESULT_BYTES
    except (TypeError, ValueError, OverflowError):
        return False


def _normalize_record(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    product_id = _text(value.get("id", value.get("product_id")), 120)
    name = _text(value.get("name", value.get("title")), 200)
    if not product_id or not name:
        return None

    currency = value.get("currency")
    if not isinstance(currency, str) or not re.fullmatch(r"[A-Za-z]{3}", currency):
        currency = None
    else:
        currency = currency.upper()
    price = _price(value.get("price"))
    if currency is None:
        price = None

    availability_value = value.get("availability")
    availability = (
        _text(availability_value, 80)
        if isinstance(availability_value, str)
        else ("Available" if availability_value is True else "Unavailable" if availability_value is False else None)
    )
    attributes = value.get("verified_attributes", value.get("verifiedAttributes"))
    attributes = attributes if isinstance(attributes, dict) else {}

    def attribute_ref(raw: Any) -> dict[str, str] | None:
        if not isinstance(raw, dict):
            return None
        attribute_id = _text(raw.get("id"), 120)
        attribute_name = _text(raw.get("name"), 100)
        return {"id": attribute_id, "name": attribute_name} if attribute_id and attribute_name else None

    gemstones_raw = attributes.get("gemstone")
    gemstones = []
    if isinstance(gemstones_raw, list):
        for item in gemstones_raw[:12]:
            ref = attribute_ref(item)
            if ref:
                gemstones.append(ref)

    price_rows_raw = value.get("prices_by_location", value.get("pricesByLocation"))
    price_rows = []
    if isinstance(price_rows_raw, list):
        for row in price_rows_raw[:20]:
            if not isinstance(row, dict):
                continue
            row_currency = row.get("currency")
            if not isinstance(row_currency, str) or not re.fullmatch(r"[A-Za-z]{3}", row_currency):
                continue
            row_price = _price(row.get("price"))
            if row_price is None:
                continue
            price_rows.append({"price": row_price, "currency": row_currency.upper()})

    return {
        "id": product_id,
        "name": name,
        "sku": _text(value.get("sku"), 120),
        "productType": _text(value.get("product_type", value.get("productType")), 80),
        "stoneShape": _text(value.get("stone_shape", value.get("stoneShape")), 80),
        "verifiedAttributes": {
            "item": attribute_ref(attributes.get("item")),
            "metal": attribute_ref(attributes.get("metal")),
            "color": attribute_ref(attributes.get("color")),
            "style": attribute_ref(attributes.get("style")),
            "gemstone": gemstones,
        },
        "price": price,
        "currency": currency,
        "pricesByLocation": price_rows,
        "availability": availability,
        "image": _public_https_url(value.get("image_url", value.get("image"))),
        "url": _public_https_url(value.get("product_url", value.get("url"))),
        "summary": _text(value.get("summary"), 500),
    }


def normalize_product_records(value: Any) -> list[dict[str, Any]]:
    """Return bounded, display-safe products from a decoded MCP search result."""
    products: list[dict[str, Any]] = []
    seen: set[str] = set()
    for record in _records(value):
        normalized = _normalize_record(record)
        if normalized is None or normalized["id"] in seen:
            continue
        seen.add(normalized["id"])
        products.append(normalized)
        if len(products) == MAX_MCP_CANDIDATES:
            break
    return products


def remove_excluded_stone_shapes(
    products: list[dict[str, Any]], excluded_shapes: list[str],
) -> list[dict[str, Any]]:
    """Drop products whose verified shape or searchable display text names an excluded shape."""
    excluded = {shape for shape in excluded_shapes if shape in _STONE_SHAPE_TERMS}
    if not excluded:
        return products[:8]

    kept: list[dict[str, Any]] = []
    for product in products:
        shape = str(product.get("stoneShape") or "").casefold().strip()
        text = " ".join((str(product.get("name") or ""), str(product.get("summary") or ""))).casefold()
        rejected = False
        for excluded_shape in excluded:
            aliases = _STONE_SHAPE_TERMS[excluded_shape]
            if shape and any(alias in shape for alias in aliases):
                rejected = True
                break
            if any(re.search(rf"(?<![a-z]){re.escape(alias)}(?![a-z])", text) for alias in aliases):
                rejected = True
                break
        if not rejected:
            kept.append(product)
        if len(kept) == 8:
            break
    return kept


def _mcp_product_payloads(result: Any) -> list[Any]:
    payloads = []
    structured = getattr(result, "structuredContent", None)
    if structured is not None and _within_payload_limit(structured):
        payloads.append(structured)

    contents = getattr(result, "content", [])
    for item in contents:
        if getattr(item, "type", None) != "text":
            continue
        text = getattr(item, "text", None)
        if not isinstance(text, str) or len(text.encode("utf-8")) > MAX_MCP_RESULT_BYTES:
            continue
        try:
            decoded = json.loads(text)
        except (ValueError, TypeError):
            continue
        payloads.append(decoded)
    return payloads


def parse_mcp_product_result_details(result: Any) -> tuple[list[dict[str, Any]], bool, dict[str, Any]]:
    """Return validated products, envelope validity, and bounded filter evidence."""
    for payload in _mcp_product_payloads(result):
        products = normalize_product_records(payload)
        recognized = isinstance(payload, dict) and isinstance(payload.get("products"), list)
        if recognized:
            applied = payload.get("applied_filters")
            applied = applied if isinstance(applied, dict) else {}
            allowed_applied = {
                key: applied[key] for key in ("item", "metal", "gemstone", "color", "style", "price", "exclude_terms", "stone_shape_exclude")
                if key in applied
            }
            unmatched = payload.get("unmatched_filters")
            unmatched_fields = []
            if isinstance(unmatched, list):
                for item in unmatched[:12]:
                    field = item.get("facet") if isinstance(item, dict) else item
                    if isinstance(field, str) and field[:100] not in unmatched_fields:
                        unmatched_fields.append(field[:100])
            return products, True, {"applied_filters": allowed_applied, "unmatched_filters": unmatched_fields}
    return [], False, {"applied_filters": {}, "unmatched_filters": []}


def parse_mcp_product_result(result: Any) -> tuple[list[dict[str, Any]], bool]:
    """Return validated products and whether a recognized product envelope was present."""
    products, valid, _metadata = parse_mcp_product_result_details(result)
    return products, valid

