---
description: How to run tests for Kuroko
---

# Testing Workflow

This project has both frontend and backend tests.

## Frontend Tests (Vitest)
// turbo
1. Run `npm run test -- --run` to execute frontend tests once.
2. Run `npm run test` to start Vitest in watch mode.

## Backend Tests (Cargo)
// turbo
1. Run `cargo test` inside `src-tauri` directory.

## Summary
To run all tests:
// turbo
npm run test -- --run && cd src-tauri && cargo test
