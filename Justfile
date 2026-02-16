# Stealth Sidekick - Justfile

# Default recipe to run the app in development mode
default: dev

# Run the app in development mode with a clean slate
dev:
    @echo "🚀 Cleaning up previous instances..."
    @pkill tauri-app || true
    @lsof -ti:1420 | xargs kill -9 2>/dev/null || true
    @echo "📦 Starting Stealth Sidekick..."
    npm run tauri dev

# Clean up all temporary files and build artifacts
clean:
    @echo "🧹 Cleaning up..."
    @pkill tauri-app || true
    rm -rf src-tauri/target
    rm -rf dist
    rm -rf logs/*

# Show logs from today
logs:
    @ls -t logs/*.md | head -n 1 | xargs cat

# Quick help
help:
    @just --list
