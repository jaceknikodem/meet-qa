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

# Run all tests (frontend and rust)
test: test-frontend test-rust

# Run frontend tests
test-frontend:
    @echo "🧪 Running frontend tests..."
    npm test -- --run

# Run Rust tests
test-rust:
    @echo "🦀 Running Rust tests..."
    cargo test --manifest-path src-tauri/Cargo.toml

# Show logs from today
logs:
    @ls -t logs/*.md | head -n 1 | xargs cat

# Build the production app for the current platform
build:
    @echo "🏗️ Building production version..."
    npm run tauri build

# Quick help
help:
    @just --list
