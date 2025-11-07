/**
 * Vitest setup file.
 *
 * This file runs before all tests to set up the testing environment.
 */

import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock cockpit global
global.cockpit = {
  spawn: () => ({
    stream: () => ({ done: () => ({ fail: () => ({}) }) }),
    done: () => ({ fail: () => ({}) }),
    fail: () => ({}),
  }),
  file: () => ({
    read: () => Promise.resolve(''),
    replace: () => Promise.resolve(),
    watch: () => {},
  }),
  location: {
    path: [],
    options: {},
    go: () => {},
  },
} as any;
