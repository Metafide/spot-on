require "net/http"
require "json"
require "uri"
require_relative "./config"

# =============================================================================
# METAFIDE BOT HTTP CLIENT — request.rb
# =============================================================================
#
# This file provides a reusable HTTP request helper for the Metafide API.
#
# Responsibilities:
#   1. Build the full request URL
#   2. Attach the API key header
#   3. Send the HTTP request
#   4. Throw a clear error if the response fails
#   5. Return parsed JSON on success
# =============================================================================

# Sends an authenticated HTTP request to the Metafide API.
#
# Parameters:
#   method -> HTTP method such as GET or POST
#   path   -> API path appended to the base endpoint
#   body   -> Optional JSON request body
#
# Returns:
#   Parsed JSON response
#
# Raises:
#   RuntimeError when the response is not OK
def request(method, path, body = nil)
  url = URI.parse("#{METAFIDE_ENDPOINT}#{path}")

  http = Net::HTTP.new(url.host, url.port)
  http.use_ssl = (url.scheme == "https")
  http.read_timeout = 30
  http.open_timeout = 30

  request_class = case method.upcase
                  when "GET"    then Net::HTTP::Get
                  when "POST"   then Net::HTTP::Post
                  when "PUT"    then Net::HTTP::Put
                  when "DELETE" then Net::HTTP::Delete
                  else
                    raise ArgumentError, "Unsupported HTTP method: #{method}"
                  end

  req = request_class.new(url.request_uri)
  req["x-api-key"] = METAFIDE_API_KEY

  # Only attach Content-Type when a JSON body is actually sent.
  unless body.nil?
    req["Content-Type"] = "application/json"
    req.body = JSON.generate(body)
  end

  response = http.request(req)

  unless response.is_a?(Net::HTTPSuccess)
    raise(
      "Request failed — #{method.upcase} #{url} — " \
      "Status: #{response.code} #{response.message}"
    )
  end

  JSON.parse(response.body)
end