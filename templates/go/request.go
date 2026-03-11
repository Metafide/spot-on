package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

/*
===============================================================================
METAFIDE BOT HTTP CLIENT — request.go
===============================================================================

This file provides a reusable HTTP request helper for the Metafide API.

Responsibilities:
  1. Build the full request URL
  2. Attach the API key header
  3. Send the HTTP request
  4. Throw a clear error if the response fails
  5. Return parsed JSON on success
===============================================================================
*/

// Shared HTTP client with a timeout for all bot requests.
var httpClient = &http.Client{
	Timeout: 30 * time.Second,
}

// request sends an authenticated HTTP request to the Metafide API.
//
// Parameters:
//   method -> HTTP method such as GET or POST
//   path   -> API path appended to the base endpoint
//   body   -> Optional JSON request body
//   out    -> Target structure for parsed JSON response
//
// Returns:
//   error if the request fails or the response is not OK
func request(method string, path string, body any, out any) error {
	url := METAFIDE_ENDPOINT + path

	var requestBody io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("failed to encode request body: %w", err)
		}
		requestBody = bytes.NewBuffer(payload)
	}

	req, err := http.NewRequest(method, url, requestBody)
	if err != nil {
		return fmt.Errorf("failed to build request: %w", err)
	}

	req.Header.Set("x-api-key", METAFIDE_API_KEY)

	// Only attach Content-Type when a JSON body is actually sent.
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed — %s %s — %w", method, url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf(
			"request failed — %s %s — Status: %d %s",
			method,
			url,
			resp.StatusCode,
			resp.Status,
		)
	}

	if out == nil {
		return nil
	}

	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("failed to decode response JSON: %w", err)
	}

	return nil
}