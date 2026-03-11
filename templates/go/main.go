package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
)

/*
===============================================================================
METAFIDE BOT CLI — main.go
===============================================================================

This file is the command-line entry point for the bot.

It provides a small process manager so the bot can be:
  - run in the foreground
  - started in the background
  - stopped later using a command
  - checked for status
  - inspected via log output

Supported commands:
  go run . run
  go run . start
  go run . stop
  go run . status
  go run . logs
===============================================================================
*/

const (
	pidFile = ".metafide-bot.pid"
	logFile = "metafide-bot.log"
)

// getCommand returns the CLI command passed by the user.
// Defaults to "run" if no command is given.
func getCommand() string {
	if len(os.Args) > 1 {
		return os.Args[1]
	}
	return "run"
}

// readPid reads the PID file and returns the stored process ID.
func readPid() (int, error) {
	data, err := os.ReadFile(pidFile)
	if err != nil {
		return 0, err
	}

	raw := strings.TrimSpace(string(data))
	if raw == "" {
		return 0, fmt.Errorf("empty PID file")
	}

	pid, err := strconv.Atoi(raw)
	if err != nil {
		return 0, err
	}

	return pid, nil
}

// isProcessRunning checks whether a process is currently running for a given PID.
func isProcessRunning(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}

	err = process.Signal(syscall.Signal(0))
	return err == nil
}

// removePidFile deletes the PID file if it exists.
func removePidFile() {
	_ = os.Remove(pidFile)
}

// ensureStalePidIsCleared cleans up a stale PID file.
func ensureStalePidIsCleared() {
	pid, err := readPid()
	if err == nil && !isProcessRunning(pid) {
		removePidFile()
	}
}

// startBot starts the bot in background mode.
func startBot() {
	ensureStalePidIsCleared()

	existingPid, err := readPid()
	if err == nil && isProcessRunning(existingPid) {
		fmt.Printf("Bot is already running with PID %d\n", existingPid)
		return
	}

	logHandle, err := os.OpenFile(logFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		fmt.Printf("Failed to open log file: %v\n", err)
		return
	}
	defer logHandle.Close()

	// -------------------------------------------------------------------------
	// Start a detached copy of this same executable with the "run" command.
	//
	// os.Executable() allows the CLI to relaunch itself in background mode.
	// -------------------------------------------------------------------------
	executablePath, err := os.Executable()
	if err != nil {
		fmt.Printf("Failed to get executable path: %v\n", err)
		return
	}

	cmd := exec.Command(executablePath, "run")
	cmd.Stdout = logHandle
	cmd.Stderr = logHandle
	cmd.Stdin = nil

	// -------------------------------------------------------------------------
	// On Unix-like systems, Setsid creates a new session so the child becomes
	// detached from the current terminal.
	// -------------------------------------------------------------------------
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid: true,
	}

	if err := cmd.Start(); err != nil {
		fmt.Printf("Failed to start bot: %v\n", err)
		return
	}

	if err := os.WriteFile(pidFile, []byte(fmt.Sprintf("%d", cmd.Process.Pid)), 0644); err != nil {
		fmt.Printf("Failed to write PID file: %v\n", err)
		return
	}

	fmt.Printf("Bot started in background. PID: %d\n", cmd.Process.Pid)
	fmt.Printf("Logs: %s\n", logFile)
}

// stopBot stops the background bot process using the PID file.
func stopBot() {
	pid, err := readPid()
	if err != nil {
		fmt.Println("Bot is not running.")
		return
	}

	if !isProcessRunning(pid) {
		fmt.Printf("Found stale PID file for PID %d. Cleaning up.\n", pid)
		removePidFile()
		return
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		fmt.Printf("Failed to find process with PID %d: %v\n", pid, err)
		return
	}

	if err := process.Signal(syscall.SIGTERM); err != nil {
		fmt.Printf("Failed to stop bot with PID %d: %v\n", pid, err)
		return
	}

	removePidFile()
	fmt.Printf("Bot stopped. PID: %d\n", pid)
}

// showStatus displays whether the bot is currently running.
func showStatus() {
	ensureStalePidIsCleared()

	pid, err := readPid()
	if err != nil {
		fmt.Println("Bot is not running.")
		return
	}

	if isProcessRunning(pid) {
		fmt.Printf("Bot is running. PID: %d\n", pid)
	} else {
		fmt.Printf("Bot is not running, stale PID file found for PID %d.\n", pid)
		removePidFile()
	}
}

// showLogs prints the last N lines of the log file.
func showLogs(lines int) {
	file, err := os.Open(logFile)
	if err != nil {
		fmt.Println("No log file found yet.")
		return
	}
	defer file.Close()

	var allLines []string
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		allLines = append(allLines, scanner.Text())
	}

	if len(allLines) == 0 {
		fmt.Println("")
		return
	}

	start := 0
	if len(allLines) > lines {
		start = len(allLines) - lines
	}

	for _, line := range allLines[start:] {
		fmt.Println(line)
	}
}

// runForeground runs the bot in the current terminal session.
func runForeground() {
	runBot()
}

// main is the CLI dispatcher.
func main() {
	command := getCommand()

	switch command {
	case "run":
		runForeground()
	case "start":
		startBot()
	case "stop":
		stopBot()
	case "status":
		showStatus()
	case "logs":
		showLogs(50)
	default:
		fmt.Printf("Unknown command: %s\n", command)
		fmt.Println("Usage: go run . [run|start|stop|status|logs]")
	}
}