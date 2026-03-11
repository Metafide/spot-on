package main

import (
	"fmt"
	"math"
	"math/rand"
	"sync"
	"time"
)

/*
===============================================================================
METAFIDE BOT CORE LOOP — spot.go
===============================================================================

This file contains the main bot behavior.

Responsibilities:
  1. Poll the Metafide API continuously
  2. Check the current live game state
  3. Determine whether positions can be placed
  4. Generate randomized positions
  5. Submit those positions
  6. Retry failed submissions

Runtime model:
  - initialize() starts an infinite loop
  - each cycle waits for the previous one to finish
  - then sleeps for 5 seconds before running again

This prevents overlapping execution.
===============================================================================
*/

// SpotPositionPayload is the position payload sent to the Metafide API.
type SpotPositionPayload struct {
	GID string `json:"gid"`
	C   string `json:"c"`
	A   string `json:"a"`
	SP  string `json:"sp"`
	F   string `json:"f"`
	PW  string `json:"pw"`
	N   string `json:"n"`
	IT  int    `json:"it"`
}

// StatusPosition is the position data returned in the status response.
type StatusPosition struct {
	F any  `json:"f"`
	W bool `json:"w"`
	R any  `json:"r"`
}

// StatusStreak is the streak data returned in the status response.
type StatusStreak struct {
	PositionID string `json:"positionId"`
	Streak     int    `json:"streak"`
}

// StatusResponse is the status response shape used by this bot.
type StatusResponse struct {
	Positions []StatusPosition `json:"positions"`
	Streaks   []StatusStreak   `json:"streaks"`
}

// SpotGameResponse is the live game response shape used by this bot.
type SpotGameResponse struct {
	CanPlacePosition    bool `json:"can_place_position"`
	EarlyPrecisionWindow bool `json:"early_precision_window"`
	LiveGame            struct {
		GID string `json:"gid"`
	} `json:"liveGame"`
}

// LivePriceResponse is the live price response shape used by this bot.
type LivePriceResponse struct {
	Value float64 `json:"value"`
}

// UserBalanceResponse is the minimal balance response shape.
// The current bot only checks presence, not balance fields.
type UserBalanceResponse map[string]any

// SpotSubmitResponse is the response returned after a successful position submit.
type SpotSubmitResponse struct {
	TxID string `json:"txid"`
}

// sleep pauses between bot cycles and retry attempts.
func sleep(duration time.Duration) {
	time.Sleep(duration)
}

// initialize is the entry point for the bot loop.
//
// Parameters:
//   message -> session ID used only for logging context
//
// Behavior:
//   - runs forever
//   - calls mainCycle() once per cycle
//   - catches unexpected errors so one cycle failure does not kill the bot
//   - sleeps 5 seconds before the next cycle
func initialize(message string) {
	fmt.Printf("Running bot session: %s\n", message)

	for {
		func() {
			defer func() {
				if recovered := recover(); recovered != nil {
					fmt.Printf("Error in main loop: %v\n", recovered)
				}
			}()
			mainCycle()
		}()

		sleep(5 * time.Second)
	}
}

// mainCycle runs one full bot cycle.
//
// High-level flow:
//
//   Step 1:
//     Fetch current status for the configured asset/interval
//
//   Step 2:
//     Check how many positions already exist in the live game
//
//   Step 3:
//     If max positions are already reached, stop this cycle early
//
//   Step 4:
//     Fetch balance, live game data, and price concurrently
//
//   Step 5:
//     Validate whether the game is currently accepting positions
//
//   Step 6:
//     Optionally enforce early precision mode
//
//   Step 7:
//     Generate only the remaining number of allowed positions
//
//   Step 8:
//     Submit those positions to the API
func mainCycle() {
	// -------------------------------------------------------------------------
	// Step 1: Fetch current live status for this asset/interval/network
	// -------------------------------------------------------------------------
	var status StatusResponse
	err := request(
		"GET",
		fmt.Sprintf(
			"status?asset=%s&token=%s&network=%s&interval=%d",
			ASSET,
			CURRENCY,
			NETWORK,
			INTERVAL,
		),
		nil,
		&status,
	)
	if err != nil {
		fmt.Printf("Error in main: %v\n", err)
		return
	}

	// -------------------------------------------------------------------------
	// Step 2: Inspect current positions already placed in the live game
	// -------------------------------------------------------------------------
	existingPositions := status.Positions
	currentPositionCount := len(existingPositions)

	// If positions already exist, print a useful summary for monitoring.
	if currentPositionCount > 0 {
		logPositionSummary(status)

		// ---------------------------------------------------------------------
		// Step 3: Enforce the configured maximum position count
		// ---------------------------------------------------------------------
		if currentPositionCount >= MAX_ALLOWED_POSITIONS {
			fmt.Println("Max positions reached for the current live game. Skipping cycle.")
			return
		}
	}

	// -------------------------------------------------------------------------
	// Step 4: Fetch balance, game metadata, and live price in parallel
	// This is faster than fetching them one after another.
	// -------------------------------------------------------------------------
	var (
		balance UserBalanceResponse
		games   SpotGameResponse
		price   LivePriceResponse
		wg      sync.WaitGroup
		errMu   sync.Mutex
		errors  []error
	)

	wg.Add(3)

	go func() {
		defer wg.Done()
		var response UserBalanceResponse
		if err := request(
			"GET",
			fmt.Sprintf("user-balance?currency=%s&network=%s", CURRENCY, NETWORK),
			nil,
			&response,
		); err != nil {
			errMu.Lock()
			errors = append(errors, err)
			errMu.Unlock()
			return
		}
		balance = response
	}()

	go func() {
		defer wg.Done()
		var response SpotGameResponse
		if err := request(
			"GET",
			fmt.Sprintf("spot?asset=%s&interval=%d", ASSET, INTERVAL),
			nil,
			&response,
		); err != nil {
			errMu.Lock()
			errors = append(errors, err)
			errMu.Unlock()
			return
		}
		games = response
	}()

	go func() {
		defer wg.Done()
		var response LivePriceResponse
		if err := request(
			"GET",
			fmt.Sprintf("live-price?asset=%s", ASSET),
			nil,
			&response,
		); err != nil {
			errMu.Lock()
			errors = append(errors, err)
			errMu.Unlock()
			return
		}
		price = response
	}()

	wg.Wait()

	if len(errors) > 0 {
		fmt.Printf("Error in main: %v\n", errors[0])
		return
	}

	// If any key dependency is missing, skip this cycle.
	if balance == nil || games.LiveGame.GID == "" || price.Value == 0 {
		fmt.Println("Incomplete data received. Skipping cycle.")
		return
	}

	// -------------------------------------------------------------------------
	// Step 5: Confirm that the game currently allows placing positions
	// -------------------------------------------------------------------------
	if !games.CanPlacePosition {
		fmt.Println("Game is not accepting positions at this time. Skipping cycle.")
		return
	}

	// -------------------------------------------------------------------------
	// Step 6: Optional early precision restriction
	// If enabled, only place positions during the early precision window.
	// -------------------------------------------------------------------------
	if ENABLE_EARLY_PRECISION && !games.EarlyPrecisionWindow {
		fmt.Println("Early precision window is not open. Skipping cycle.")
		return
	}

	// Current price is rounded to a whole number before randomization.
	currentPrice := int(math.Round(price.Value))

	// -------------------------------------------------------------------------
	// Step 7: Only generate the remaining number of allowed positions
	//
	// Example:
	//   MAX_ALLOWED_POSITIONS = 10
	//   currentPositionCount  = 6
	//   remainingSlots        = 4
	//
	// This is safer than always attempting 10 positions every cycle.
	// -------------------------------------------------------------------------
	remainingSlots := MAX_ALLOWED_POSITIONS - currentPositionCount

	if remainingSlots <= 0 {
		fmt.Println("No remaining slots available. Skipping cycle.")
		return
	}

	positions := generatePositions(
		games.LiveGame.GID,
		currentPrice,
		remainingSlots,
	)

	fmt.Printf("Generated positions: %d\n", len(positions))

	// -------------------------------------------------------------------------
	// Step 8: Submit generated positions
	// -------------------------------------------------------------------------
	submitPositions(positions, 0)
}

// generatePositions builds an array of position objects for API submission.
//
// Parameters:
//   gid          -> current live game ID
//   currentPrice -> current rounded live price
//   count        -> number of positions to generate
//
// How generation works:
//   - choose a random amount from POSITIONS_RANGE[INTERVAL]
//   - choose a randomized strike price around currentPrice
//   - build the payload expected by the Metafide API
func generatePositions(gid string, currentPrice int, count int) []SpotPositionPayload {
	amountOptions := POSITIONS_RANGE[INTERVAL]
	positions := make([]SpotPositionPayload, 0, count)

	for i := 0; i < count; i++ {
		amount := amountOptions[rand.Intn(len(amountOptions))]
		randomizedPrice := randomizePrice(currentPrice)

		positions = append(positions, SpotPositionPayload{
			GID: gid,
			C:   CURRENCY,
			A:   ASSET,
			SP:  fmt.Sprintf("%d", randomizedPrice),
			F:   fmt.Sprintf("%g", amount),
			PW:  METAFIDE_USER_ADDRESS,
			N:   NETWORK,
			IT:  INTERVAL,
		})
	}

	return positions
}

// randomizePrice applies a random offset to the current live price.
//
// The offset range depends on the configured INTERVAL.
//
// Example:
//   currentPrice = 65000
//   range = { min: -10, max: 10 }
//   result may be anywhere from 64990 to 65010
//
// Fallback:
//   If no range exists for the current interval, use { min: -40, max: 50 }.
func randomizePrice(currentPrice int) int {
	priceRange, ok := PRICE_RANGES[INTERVAL]
	if !ok {
		priceRange = PriceRange{Min: -40, Max: 50}
	}

	offset := randInt(priceRange.Min, priceRange.Max)
	return currentPrice + offset
}

// randInt returns a random integer between min and max, inclusive.
func randInt(minValue int, maxValue int) int {
	return rand.Intn(maxValue-minValue+1) + minValue
}

// submitPositions submits positions to the API.
//
// Behavior:
//   - submits all positions concurrently
//   - successful submissions are logged
//   - failed submissions are collected
//   - failed positions are retried up to MAX_RETRIES
func submitPositions(positions []SpotPositionPayload, retries int) {
	const maxRetries = 3

	type result struct {
		index int
		txid  string
		err   error
	}

	results := make(chan result, len(positions))
	var wg sync.WaitGroup

	for index, position := range positions {
		wg.Add(1)

		go func(i int, p SpotPositionPayload) {
			defer wg.Done()

			var response SpotSubmitResponse
			err := request("POST", "spot", p, &response)
			if err != nil {
				results <- result{index: i, err: err}
				return
			}

			results <- result{index: i, txid: response.TxID}
		}(index, position)
	}

	wg.Wait()
	close(results)

	failed := make([]SpotPositionPayload, 0)

	for result := range results {
		if result.err == nil {
			fmt.Printf("Position %d placed: %s\n", result.index+1, result.txid)
		} else {
			fmt.Printf("Position %d failed: %v\n", result.index+1, result.err)
			failed = append(failed, positions[result.index])
		}
	}

	// Retry only failed positions, not successful ones.
	if len(failed) > 0 && retries < maxRetries {
		fmt.Printf(
			"Retrying %d failed position(s)... (attempt %d of %d)\n",
			len(failed),
			retries+1,
			maxRetries,
		)
		sleep(1 * time.Second)
		submitPositions(failed, retries+1)
	}

	// Final failure state after retries are exhausted.
	if len(failed) > 0 && retries >= maxRetries {
		fmt.Printf(
			"%d position(s) failed after %d retries. Skipping.\n",
			len(failed),
			maxRetries,
		)
	}
}

// logPositionSummary prints a readable summary of current positions and streaks.
//
// This is useful for monitoring how the live game is progressing.
func logPositionSummary(status StatusResponse) {
	fmt.Println("Current positions:")
	for _, position := range status.Positions {
		fmt.Printf(
			"  amount=%v win=%v return=%v\n",
			position.F,
			position.W,
			position.R,
		)
	}

	fmt.Println("Current streaks:")
	for _, streak := range status.Streaks {
		fmt.Printf(
			"  positionId=%s streak=%d\n",
			streak.PositionID,
			streak.Streak,
		)
	}
}