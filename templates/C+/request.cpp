#ifndef METAFIDE_REQUEST_HPP
#define METAFIDE_REQUEST_HPP

/*
===============================================================================
METAFIDE BOT HTTP CLIENT — request.hpp
===============================================================================

This file defines the reusable HTTP request helper for the Metafide API.
===============================================================================
*/

#include <nlohmann/json.hpp>
#include <string>

nlohmann::json request(
    const std::string& method,
    const std::string& path,
    const nlohmann::json* body = nullptr
);

#endif