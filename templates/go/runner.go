package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"
)

/*
===============================================================================
METAFIDE BOT RUNTIME — runner.go
===============================================================================

This file is the actual runtime launcher for the bot.

Responsibilities:
  1. Validate configuration before startup
  2. Register shutdown signal handlers
  3. Start the continuous bot loop from spot.go

This file is used in two modes:

  Foreground mode:
    go run . run

  Background mode:
    go run . start

Why this file exists:
  It separates "CLI process management" from "bot runtime logic".
  That keeps main.go focused on commands, while this file focuses on
  actually starting and running the bot safely.
===============================================================================
*/

// validateConfig validates all config values before the bot starts.
//
// Why this matters:
//   If config is invalid, we want to fail immediately with clear messages
//   instead of letting the bot run in a broken or unsafe state.
func validateConfig() {
	errors := make([]string, 0)

	// -------------------------------------------------------------------------
	// Required fields
	// -------------------------------------------------------------------------
	if METAFIDE_API_KEY == "" {
		errors = append(errors, "METAFIDE_API_KEY is not set")
	}

	if METAFIDE_USER_ADDRESS == "" {
		errors = append(errors, "METAFIDE_USER_ADDRESS is not set")
	}

	// -------------------------------------------------------------------------
	// NETWORK validation
	// -------------------------------------------------------------------------
	validNetworks := map[string]bool{
		"mainnet": true,
		"testnet": true,
	}

	if !validNetworks[NETWORK] {
		errors = append(
			errors,
			fmt.Sprintf(`NETWORK must be one of: mainnet, testnet — got "%s"`, NETWORK),
		)
	}

	// -------------------------------------------------------------------------
	// INTERVAL validation
	// -------------------------------------------------------------------------
	validIntervals := map[int]bool{
		60:    true,
		3600:  true,
		23400: true,
		86400: true,
	}

	if !validIntervals[INTERVAL] {
		errors = append(
			errors,
			fmt.Sprintf(`INTERVAL must be one of: 60, 3600, 23400, 86400 — got "%d"`, INTERVAL),
		)
	}

	// -------------------------------------------------------------------------
	// Currency and asset validation
	// -------------------------------------------------------------------------
	if CURRENCY != "USDC" {
		errors = append(errors, fmt.Sprintf(`CURRENCY must be "USDC" — got "%s"`, CURRENCY))
	}

	if ASSET != "BTC_USDT" {
		errors = append(errors, fmt.Sprintf(`ASSET must be "BTC_USDT" — got "%s"`, ASSET))
	}

	// -------------------------------------------------------------------------
	// Position and feature flag validation
	// -------------------------------------------------------------------------
	if MAX_ALLOWED_POSITIONS < 1 || MAX_ALLOWED_POSITIONS > 10 {
		errors = append(
			errors,
			fmt.Sprintf(
				`MAX_ALLOWED_POSITIONS must be a number between 1 and 10 — got "%d"`,
				MAX_ALLOWED_POSITIONS,
			),
		)
	}

	// -------------------------------------------------------------------------
	// POSITIONS_RANGE validation
	// Each interval must have an allowed set of position sizes.
	// -------------------------------------------------------------------------
	positionMinimums := map[int]float64{
		60:    0.1,
		3600:  1,
		23400: 5,
		86400: 5,
	}

	validIntervalList := []int{60, 3600, 23400, 86400}

	for _, interval := range validIntervalList {
		rangeValues, ok := POSITIONS_RANGE[interval]

		if !ok || len(rangeValues) == 0 {
			errors = append(errors, fmt.Sprintf("POSITIONS_RANGE[%d] must be a non-empty array", interval))
			continue
		}

		minimum := positionMinimums[interval]
		invalidValues := make([]float64, 0)

		for _, value := range rangeValues {
			if value < minimum {
				invalidValues = append(invalidValues, value)
			}
		}

		if len(invalidValues) > 0 {
			errors = append(
				errors,
				fmt.Sprintf(
					"POSITIONS_RANGE[%d] values must be numbers >= %g — invalid: %v",
					interval,
					minimum,
					invalidValues,
				),
			)
		}
	}

	for key := range POSITIONS_RANGE {
		if !validIntervals[key] {
			errors = append(
				errors,
				fmt.Sprintf(
					"POSITIONS_RANGE has unexpected key: [%d] — only 60, 3600, 23400, 86400 are allowed",
					key,
				),
			)
		}
	}

	// -------------------------------------------------------------------------
	// PRICE_RANGES validation
	// Each interval must define a numeric min/max randomization range.
	// -------------------------------------------------------------------------
	for _, interval := range validIntervalList {
		priceRange, ok := PRICE_RANGES[interval]
		if !ok {
			errors = append(errors, fmt.Sprintf("PRICE_RANGES[%d] must be an object with { min, max }", interval))
			continue
		}

		if priceRange.Min >= priceRange.Max {
			errors = append(
				errors,
				fmt.Sprintf("PRICE_RANGES[%d].min must be less than .max", interval),
			)
		}
	}

	for key := range PRICE_RANGES {
		if !validIntervals[key] {
			errors = append(
				errors,
				fmt.Sprintf(
					"PRICE_RANGES has unexpected key: [%d] — only 60, 3600, 23400, 86400 are allowed",
					key,
				),
			)
		}
	}

	// -------------------------------------------------------------------------
	// Final result
	// -------------------------------------------------------------------------
	if len(errors) > 0 {
		fmt.Println("Bot startup failed — invalid config:")
		for _, err := range errors {
			fmt.Printf("  ✖ %s\n", err)
		}
		os.Exit(1)
	}

	fmt.Println("Config validated successfully. Starting bot...")
}

// setupSignalHandlers registers signal handlers for graceful shutdown.
//
// These signals are common ways to stop a process:
//   - SIGTERM: usually sent by process managers or the stop command
//   - SIGINT: usually sent by Ctrl+C in the terminal
func setupSignalHandlers() {
	signalChannel := make(chan os.Signal, 1)
	signal.Notify(signalChannel, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		sig := <-signalChannel
		fmt.Printf("Received %s. Shutting down bot...\n", sig.String())
		os.Exit(0)
	}()
}

// runBot starts the bot runtime.
//
// Flow:
//   1. Validate config
//   2. Register signal handlers
//   3. Create a session ID for easier log tracing
//   4. Launch the infinite bot loop from spot.go
func runBot() {
	validateConfig()
	setupSignalHandlers()

	sessionID := fmt.Sprintf("bot-%d", time.Now().UnixMilli())

	fmt.Println("*******************************************************")
	fmt.Println("LAUNCHING GO BOT")
	fmt.Println("*******************************************************")
	fmt.Printf("Session ID: %s\n", sessionID)

	initialize(sessionID)
}