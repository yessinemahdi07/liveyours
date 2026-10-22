"""AI provider selection, bounded attempts, and graceful failover."""
from dataclasses import dataclass
import json
import re
import time
from urllib.parse import urlparse

import requests


@dataclass(frozen=True)
class Provider:
    name: str
    url: str
    headers: dict[str, str]
    model: str


def _safe_provider_error(response) -> str:
    """Extract a short provider error code/message without logging payloads or secrets."""
    if response is None:
        return ""
    if not callable(getattr(response, "json", None)):
        return ""
    try:
        body = response.json()
    except (ValueError, json.JSONDecodeError):
        body = {"message": getattr(response, "text", "")}
    if not isinstance(body, dict):
        return ""
    error = body.get("error", body)
    if isinstance(error, str):
        error = {"message": error}
    if not isinstance(error, dict):
        return ""
    parts = []
    for field in ("code", "type", "status", "message", "detail", "reason"):
        value = error.get(field)
        if isinstance(value, str):
            # Keep only short diagnostic text; mask token-like strings and URLs.
            value = re.sub(r"https?://\S+", "[url]", value)
            value = re.sub(r"(?i)(key|token|authorization)\s*[:=]\s*\S+", r"\1=[redacted]", value)
            value = re.sub(r"\b(?:sk|bytez)[-_][A-Za-z0-9_-]{12,}\b", "[redacted]", value, flags=re.I)
            value = re.sub(r"<[^>]*>", " ", value)
            value = re.sub(r"\b[A-Za-z0-9_-]{32,}\b", "[redacted]", value)
            value = re.sub(r"\s+", " ", value)
            value = re.sub(r"[^A-Za-z0-9 _.:/-]", "", value)[:120].strip()
            if value:
                parts.append(f"{field}={value}")
    return ", ".join(parts)


def request_completion(
    payload: dict,
    timeout: float = 30,
    *,
    hosted: bool,
    cloud_fallback: bool,
    omni_url: str,
    omni_headers: dict[str, str],
    freellmapi_key: str,
    freellmapi_url: str,
    openrouter_key: str,
    openrouter_url: str,
    openrouter_headers: dict[str, str],
    openrouter_model: str,
    bytez_key: str,
    bytez_url: str,
    bytez_model: str,
    llm7_key: str,
    llm7_url: str,
    llm7_model: str,
    logger,
):
    """Try configured providers within one overall deadline.

    Hosted deployments never attempt to contact the owner's PC. Each provider
    receives only its fair share of the remaining request budget, and logs
    contain latency/status metadata but never prompt content or API keys.
    """
    providers = [] if hosted else [
        Provider("omniroute", omni_url, omni_headers, payload.get("model", "quick"))
    ]
    if not hosted and freellmapi_key:
        providers.append(Provider(
            "freellmapi", freellmapi_url,
            {"Authorization": f"Bearer {freellmapi_key}", "Content-Type": "application/json"},
            "auto",
        ))
    if cloud_fallback:
        if openrouter_key:
            providers.append(Provider("openrouter", openrouter_url, openrouter_headers, openrouter_model))
        if bytez_key:
            providers.append(Provider(
                "bytez", bytez_url,
                {"Authorization": bytez_key, "Content-Type": "application/json"},
                bytez_model,
            ))
        if llm7_key:
            providers.append(Provider(
                "llm7", llm7_url,
                {"Authorization": f"Bearer {llm7_key}", "Content-Type": "application/json"},
                llm7_model,
            ))

    if not providers:
        logger.warning("No AI provider is available: local OmniRoute is unreachable from hosted deployments and cloud fallback is disabled or unconfigured.")

    started_at = time.monotonic()
    provider_count = max(1, len(providers))
    for provider_index, provider in enumerate(providers):
        remaining = timeout - (time.monotonic() - started_at)
        if remaining <= 0:
            break
        # Give the primary provider most of the bounded request window when
        # only one fallback is configured; keep even slices for larger chains.
        provider_share = 0.8 if provider_index == 0 and provider_count == 2 else 1 / provider_count
        provider_budget = min(15.0, remaining * provider_share)
        connect_timeout = min(3.0, max(0.1, provider_budget * 0.15))
        read_timeout = max(0.1, provider_budget - connect_timeout)
        provider_started_at = time.monotonic()
        request_payload = {**payload, "model": provider.model}
        if provider.name == "openrouter":
            # Free reasoning models can spend the entire completion budget on
            # hidden reasoning and return empty visible content. Keep prompts
            # short while reserving enough tokens for both reasoning and reply.
            request_payload["max_tokens"] = max(1024, int(request_payload.get("max_tokens", 0) or 0))
        try:
            response = requests.post(
                provider.url,
                headers=provider.headers,
                json=request_payload,
                timeout=(connect_timeout, read_timeout),
            )
            response.raise_for_status()
            result = response.json()
            if not isinstance(result, dict) or result.get("error"):
                raise ValueError("AI provider returned an error response")
            choices = result.get("choices")
            choice = choices[0] if isinstance(choices, list) and choices and isinstance(choices[0], dict) else None
            if not choice or choice.get("error") or choice.get("finish_reason") == "error":
                raise ValueError("AI provider returned a failed completion")
            message = choice.get("message")
            if not isinstance(message, dict):
                raise ValueError("AI provider returned no message")
            content = message.get("content")
            if isinstance(content, list):
                content = "".join(
                    part if isinstance(part, str) else part.get("text", "")
                    for part in content
                    if isinstance(part, str) or (isinstance(part, dict) and isinstance(part.get("text"), str))
                )
                message["content"] = content
            if not isinstance(content, str) or not content.strip():
                raise ValueError(
                    "AI provider returned an empty completion"
                    f" (finish_reason={choice.get('finish_reason') or 'unknown'})"
                )
            logger.info(
                "AI provider %s succeeded with model %s in %d ms.",
                provider.name,
                provider.model,
                round((time.monotonic() - provider_started_at) * 1000),
            )
            return result
        except Exception as exc:
            host = urlparse(provider.url).hostname or "unknown"
            error_response = getattr(exc, "response", None)
            status = getattr(error_response, "status_code", None)
            detail = str(exc) if isinstance(exc, ValueError) else type(exc).__name__
            # Provider errors are useful for separating exhausted quota from
            # invalid keys/models. Keep the parsed details short and scrubbed;
            # never log prompts, headers, or full provider response bodies.
            provider_error = _safe_provider_error(error_response) if error_response is not None else ""
            request_id = ""
            if error_response is not None:
                headers = getattr(error_response, "headers", {})
                if hasattr(headers, "get"):
                    request_id = (
                        headers.get("x-request-id")
                        or headers.get("x-openrouter-id")
                        or headers.get("cf-ray")
                        or ""
                    )[:80]
            logger.warning(
                "AI provider %s (%s, model %s) failed after %d ms (HTTP %s; %s).%s%s",
                provider.name,
                host,
                provider.model,
                round((time.monotonic() - provider_started_at) * 1000),
                status if status is not None else "unavailable",
                detail,
                f" Provider error: {provider_error}." if provider_error else "",
                f" Request ID: {request_id}." if request_id else "",
            )
    raise RuntimeError("All configured AI providers failed")
