"""AI provider selection, bounded attempts, and graceful failover."""
from dataclasses import dataclass
import json
import re
import time
from urllib.parse import urlparse

import requests

COACH_PROFILE_APPROVED_PROVIDERS = frozenset({"openrouter"})


@dataclass(frozen=True)
class Provider:
    name: str
    url: str
    headers: dict[str, str]
    model: str


def _bytez_message_content(result: dict) -> str:
    """Convert Bytez chat output variants into the app's OpenAI-style contract."""
    output = result.get("output")
    if isinstance(output, str):
        return output
    if isinstance(output, dict):
        output = [output]
    if isinstance(output, list):
        for item in reversed(output):
            if isinstance(item, str) and item.strip():
                return item
            if not isinstance(item, dict):
                continue
            generated = item.get("generated_text", item.get("content"))
            if isinstance(generated, str) and generated.strip():
                return generated
            if isinstance(generated, list):
                for message in reversed(generated):
                    if isinstance(message, dict) and isinstance(message.get("content"), str):
                        if message["content"].strip():
                            return message["content"]
    choices = result.get("choices")
    if isinstance(choices, list) and choices and isinstance(choices[0], dict):
        message = choices[0].get("message")
        if isinstance(message, dict) and isinstance(message.get("content"), str):
            return message["content"]
    return ""


def _normalize_bytez_response(result: dict, model: str) -> dict:
    if result.get("error"):
        raise ValueError("Bytez returned an error response")
    content = _bytez_message_content(result)
    if not content.strip():
        raise ValueError("Bytez returned no chat content")
    return {
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": content},
            "finish_reason": "stop",
        }],
        "model": model,
    }


def has_provider_key(value: str | None) -> bool:
    """Treat common template values as missing so they never trigger doomed calls."""
    key = (value or "").strip()
    if not key:
        return False
    return re.fullmatch(
        r"(?:your[_-].*|replace[_-]?me|change[_-]?me|placeholder|<[^>]+>)",
        key,
        flags=re.IGNORECASE,
    ) is None


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
    google_ai_studio_key: str,
    google_ai_studio_url: str,
    google_ai_studio_model: str,
    logger,
    coach_profile_context: str = "",
):
    """Try configured providers within one overall deadline.

    Hosted deployments never attempt to contact the owner's PC. Each provider
    receives only its fair share of the remaining request budget, and logs
    contain latency/status metadata but never prompt content or API keys.
    """
    providers = [] if hosted else [
        Provider("omniroute", omni_url, omni_headers, payload.get("model", "quick"))
    ]
    if not hosted and has_provider_key(freellmapi_key):
        providers.append(Provider(
            "freellmapi", freellmapi_url,
            {"Authorization": f"Bearer {freellmapi_key}", "Content-Type": "application/json"},
            "auto",
        ))
    if cloud_fallback:
        if has_provider_key(google_ai_studio_key):
            providers.append(Provider(
                "google_ai_studio", google_ai_studio_url,
                {"Authorization": f"Bearer {google_ai_studio_key}", "Content-Type": "application/json"},
                google_ai_studio_model,
            ))
        if has_provider_key(openrouter_key):
            providers.append(Provider("openrouter", openrouter_url, openrouter_headers, openrouter_model))
        if has_provider_key(bytez_key):
            providers.append(Provider(
                "bytez", bytez_url,
                {"Authorization": bytez_key, "Content-Type": "application/json"},
                bytez_model,
            ))
        if has_provider_key(llm7_key):
            providers.append(Provider(
                "llm7", llm7_url,
                {"Authorization": f"Bearer {llm7_key}", "Content-Type": "application/json"},
                llm7_model,
            ))

    if hosted and coach_profile_context.strip():
        # Owner-specific context is only approved for OpenRouter. Prefer that
        # route when the profile is enabled; other providers remain clean fallbacks.
        openrouter = next((item for item in providers if item.name == "openrouter"), None)
        if openrouter:
            providers.remove(openrouter)
            providers.insert(0, openrouter)

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
        if provider.name == "bytez":
            request_payload = {
                "model": provider.model,
                "messages": payload.get("messages", []),
                "stream": False,
            }
            for key in ("temperature", "max_tokens", "top_p", "stop"):
                if key in payload:
                    request_payload[key] = payload[key]
        if provider.name == "openrouter":
            # Keep owner-specific profile data on the explicitly selected
            # OpenRouter route; never carry it into provider failover payloads.
            profile = (coach_profile_context or "").strip()[:4000]
            if profile:
                messages = [dict(message) for message in payload.get("messages", [])]
                profile_message = f"Private coaching profile (user-provided):\n{profile}"
                if messages and messages[0].get("role") == "system":
                    messages[0]["content"] = f"{messages[0].get('content', '')}\n\n{profile_message}"
                else:
                    messages.insert(0, {"role": "system", "content": profile_message})
                request_payload["messages"] = messages
            # Free reasoning models can spend the entire completion budget on
            # hidden reasoning and return empty visible content. Keep prompts
            # short while reserving enough tokens for both reasoning and reply.
            request_payload["max_tokens"] = max(1024, int(request_payload.get("max_tokens", 0) or 0))
        if coach_profile_context and provider.name in COACH_PROFILE_APPROVED_PROVIDERS:
            messages = [dict(message) for message in request_payload.get("messages", [])]
            profile_note = (
                "Private owner-provided coaching context. Use only when relevant, treat as sensitive, "
                "and do not repeat personal facts unless needed to answer the request:\n"
                f"{coach_profile_context}"
            )
            if messages and messages[0].get("role") == "system":
                messages[0]["content"] = f"{messages[0].get('content', '')}\n{profile_note}"
            else:
                messages.insert(0, {"role": "system", "content": profile_note})
            request_payload["messages"] = messages
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
            if provider.name == "bytez":
                result = _normalize_bytez_response(result, provider.model)
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
