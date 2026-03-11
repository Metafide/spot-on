#include "runner.hpp"

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include <csignal>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

/*
===============================================================================
METAFIDE BOT CLI — main.cpp
===============================================================================

This file is the command-line entry point for the bot.

It provides a small process manager so the bot can be:
  - run in the foreground
  - started in the background
  - stopped later using a command
  - checked for status
  - inspected via log output

Supported commands:
  ./metafide-bot run
  ./metafide-bot start
  ./metafide-bot stop
  ./metafide-bot status
  ./metafide-bot logs
===============================================================================
*/

namespace fs = std::filesystem;

const fs::path PID_FILE = ".metafide-bot.pid";
const fs::path LOG_FILE = "metafide-bot.log";

std::string get_command(int argc, char* argv[]) {
    return (argc > 1) ? argv[1] : "run";
}

pid_t read_pid() {
    if (!fs::exists(PID_FILE)) {
        return -1;
    }

    std::ifstream input(PID_FILE);
    std::string raw;
    std::getline(input, raw);

    if (raw.empty()) {
        return -1;
    }

    try {
        return static_cast<pid_t>(std::stol(raw));
    } catch (...) {
        return -1;
    }
}

bool is_process_running(pid_t pid) {
    if (pid <= 0) {
        return false;
    }

    return kill(pid, 0) == 0;
}

void remove_pid_file() {
    if (fs::exists(PID_FILE)) {
        fs::remove(PID_FILE);
    }
}

void ensure_stale_pid_is_cleared() {
    const pid_t pid = read_pid();
    if (pid > 0 && !is_process_running(pid)) {
        remove_pid_file();
    }
}

void start_bot(const char* executable_path) {
    ensure_stale_pid_is_cleared();

    const pid_t existing_pid = read_pid();
    if (existing_pid > 0 && is_process_running(existing_pid)) {
        std::cout << "Bot is already running with PID " << existing_pid << "\n";
        return;
    }

    pid_t pid = fork();
    if (pid < 0) {
        std::cout << "Failed to fork background process.\n";
        return;
    }

    if (pid > 0) {
        std::ofstream pid_output(PID_FILE);
        pid_output << pid;
        std::cout << "Bot started in background. PID: " << pid << "\n";
        std::cout << "Logs: " << LOG_FILE.string() << "\n";
        return;
    }

    // -------------------------------------------------------------------------
    // Child process becomes session leader so it detaches from the terminal.
    // -------------------------------------------------------------------------
    if (setsid() < 0) {
        std::exit(1);
    }

    FILE* log = std::fopen(LOG_FILE.c_str(), "a");
    if (!log) {
        std::exit(1);
    }

    dup2(fileno(log), STDOUT_FILENO);
    dup2(fileno(log), STDERR_FILENO);
    fclose(log);

    execl(executable_path, executable_path, "run", nullptr);
    std::exit(1);
}

void stop_bot() {
    const pid_t pid = read_pid();

    if (pid <= 0) {
        std::cout << "Bot is not running.\n";
        return;
    }

    if (!is_process_running(pid)) {
        std::cout << "Found stale PID file for PID " << pid << ". Cleaning up.\n";
        remove_pid_file();
        return;
    }

    if (kill(pid, SIGTERM) == 0) {
        remove_pid_file();
        std::cout << "Bot stopped. PID: " << pid << "\n";
    } else {
        std::cout << "Failed to stop bot with PID " << pid << "\n";
    }
}

void show_status() {
    ensure_stale_pid_is_cleared();

    const pid_t pid = read_pid();
    if (pid <= 0) {
        std::cout << "Bot is not running.\n";
        return;
    }

    if (is_process_running(pid)) {
        std::cout << "Bot is running. PID: " << pid << "\n";
    } else {
        std::cout << "Bot is not running, stale PID file found for PID " << pid << ".\n";
        remove_pid_file();
    }
}

void show_logs(int lines = 50) {
    if (!fs::exists(LOG_FILE)) {
        std::cout << "No log file found yet.\n";
        return;
    }

    std::ifstream input(LOG_FILE);
    std::vector<std::string> all_lines;
    std::string line;

    while (std::getline(input, line)) {
        all_lines.push_back(line);
    }

    const int start = static_cast<int>(
        all_lines.size() > static_cast<std::size_t>(lines)
            ? all_lines.size() - lines
            : 0
    );

    for (std::size_t i = start; i < all_lines.size(); ++i) {
        std::cout << all_lines[i] << "\n";
    }
}

void run_foreground() {
    run_bot();
}

int main(int argc, char* argv[]) {
    try {
        const std::string command = get_command(argc, argv);

        if (command == "run") {
            run_foreground();
        } else if (command == "start") {
            start_bot(argv[0]);
        } else if (command == "stop") {
            stop_bot();
        } else if (command == "status") {
            show_status();
        } else if (command == "logs") {
            show_logs();
        } else {
            std::cout << "Unknown command: " << command << "\n";
            std::cout << "Usage: ./metafide-bot [run|start|stop|status|logs]\n";
        }
    } catch (const std::exception& error) {
        std::cout << "CLI error: " << error.what() << "\n";
        return 1;
    }

    return 0;
}