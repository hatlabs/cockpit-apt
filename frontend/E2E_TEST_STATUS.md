# E2E Test Status

## Overview

Playwright E2E tests have been implemented for cockpit-apt. The test framework is fully functional, but most tests fail because the **backend is not yet implemented**.

## Test Results (as of 2025-11-07)

- **Total Tests**: 25
- **Passing**: 4 ✓
- **Failing**: 21 ✘

### Passing Tests

These tests verify UI elements that don't require backend data:

1. ✓ Keyboard Navigation › should clear search with Escape key
2. ✓ Accessibility › should have proper heading hierarchy
3. ✓ Package Search › should clear search with Escape key
4. ✓ Package Search › should show empty state for no results

### Expected Failures

The following tests fail because the **backend API is not implemented**:

#### Search Tests (no search results available)
- Package Search › should display search view by default
- Package Search › should show hint for short queries
- Package Search › should search and display results
- Package Search › should search immediately with Enter key
- Package Search › should navigate to package details on click

#### Sections Tests (no section data available)
- All "Sections Navigation" tests
- All "Section Package List" tests

#### Keyboard Navigation Tests (depend on backend data)
- Tests that navigate to package details
- Tests that interact with section cards

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e -- --ui

# Run specific test file
npm run test:e2e e2e/search.spec.ts

# Debug mode
npm run test:e2e -- --debug
```

## Test Files

- `frontend/e2e/fixtures.ts` - Authentication fixture
- `frontend/e2e/search.spec.ts` - Search functionality tests
- `frontend/e2e/sections.spec.ts` - Sections navigation tests
- `frontend/e2e/keyboard.spec.ts` - Keyboard navigation & accessibility tests

## Next Steps

1. **Implement Backend API** - Once the backend commands are implemented (search, sections, details, etc.), these tests should pass
2. **Mock Backend for Testing** - Alternative: Create mock responses to test UI without backend
3. **Add More Tests** - Cover install/remove operations, error handling, etc.

## Known Issues

### Tab Selector Timing

Some tests intermittently fail finding `[role="tab"]:has-text("Search")` even though the fixture successfully waits for it. This might be a race condition with React re-rendering.

**Possible Fix**: Add more specific selectors or wait for both tab presence AND visibility.

### Backend Dependency

Most tests require a functioning backend. For true E2E testing, we need:
- Implement backend commands (search, sections, details)
- Or create a mock backend for testing

## Test Configuration

- **Browser**: Chromium (configurable in `playwright.config.ts`)
- **Base URL**: `https://halos.local:9090`
- **Timeout**: 30 seconds per test
- **Screenshots**: Captured on failure
- **Video**: On first retry only

## Authentication

Tests use an authenticated fixture that automatically:
1. Logs into Cockpit with test credentials (claude/claude123)
2. Navigates to the APT module (`/apt`)
3. Waits for the page to load completely

This means individual tests don't need to handle authentication.
