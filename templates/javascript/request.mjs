import { METAFIDE_API_KEY, METAFIDE_ENDPOINT } from "./config.mjs";

/**
 * request(method, path, body)
 *
 * A reusable HTTP request utility for the Metafide API.
 * Automatically attaches the API key header and constructs the full URL
 * from the base endpoint defined in config.mjs.
 *
 * @param {string} method - HTTP method: "GET", "POST", "PUT", "DELETE"
 * @param {string} path   - The API path to append to the base endpoint.
 *                          Include query params here for GET requests.
 *                          Example: "user-balance?currency=USDC&network=testnet"
 * @param {Object} [body] - Optional request body for POST/PUT requests.
 *                          Will be automatically serialized to JSON.
 *
 * @returns {Promise<Object>} Parsed JSON response from the API
 *
 * @throws Will throw an error if the request fails or the response is not OK
 *
 */
export async function request(method, path, body = null) {
  const url = `${METAFIDE_ENDPOINT}${path}`;

  const headers = new Headers();
  headers.append("x-api-key", METAFIDE_API_KEY);

  // Only set Content-Type for requests that carry a body
  if (body) {
    headers.append("Content-Type", "application/json");
  }

  const options = {
    method,
    headers,
    redirect: "follow",
    ...(body && { body: JSON.stringify(body) }),
  };

  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Request failed — ${method} ${url} — Status: ${response.status} ${response.statusText}`);
  }

  return response.json();
}