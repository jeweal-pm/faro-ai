from __future__ import annotations

import hashlib
import hmac
import re
import time

from fastapi import HTTPException, Request

from .settings import settings


async def verify_internal_request(request: Request) -> None:
    if not settings.internal_secret:
        raise HTTPException(status_code=503, detail="internal_auth_unavailable")
    timestamp = request.headers.get("x-faroai-timestamp", "")
    signature = request.headers.get("x-faroai-signature", "")
    if not re.fullmatch(r"\d{10}", timestamp) or not re.fullmatch(r"[a-f0-9]{64}", signature):
        raise HTTPException(status_code=401, detail="unauthorized")
    if abs(int(time.time()) - int(timestamp)) > 300:
        raise HTTPException(status_code=401, detail="expired_request")
    body = await request.body()
    expected = hmac.new(
        settings.internal_secret.encode(),
        timestamp.encode() + b"." + body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="unauthorized")
