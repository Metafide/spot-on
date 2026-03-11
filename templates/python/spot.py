"""
===============================================================================
METAFIDE BOT HTTP CLIENT — request.py
===============================================================================

This file provides a reusable HTTP request helper for the Metafide API.

Responsibilities:
  1. Build the full request URL
  2. Attach the API key header
  3. Send the HTTP request
  4. Throw a clear error if the response fails
  5. Return parsed JSON on success
===============================================================================
"""

from typing import Any, Optional
import requests

from config import METAFIDE_API_KEY, METAFIDE_ENDPOINT


def request(method: str, path: str, body: Optional[dict[str, Any]] = None) -> Any:
    """
    Sends an authenticated HTTP request to the Metafide API.

    Args:
        method: HTTP method such as GET or POST
        path: API path appended to the base endpoint
        body: Optional JSON request body

    Returns:
        Parsed JSON response

    Raises:
        RuntimeError: when the response is not OK
    """
    url = f"{METAFIDE_ENDPOINT}{path}"

    headers: dict[str, str] = {
        "x-api-key": METAFIDE_API_KEY,
    }

    # Only attach Content-Type when a JSON body is actually sent.
    if body is not None:
        headers["Content-Type"] = "application/json"

    response = requests.request(
        method=method,
        url=url,
        headers=headers,
        json=body,
        timeout=30,
    )

    if not response.ok:
        raise RuntimeError(
            f"Request failed — {method} {url} — "
            f"Status: {response.status_code} {response.reason}"
        )

    return response.json()