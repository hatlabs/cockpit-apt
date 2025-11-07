/**
 * Tests for APT wrapper functions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchPackages } from '../apt-wrapper';
import { APTError } from '../types';

describe('searchPackages', () => {
  beforeEach(() => {
    // Reset cockpit mock before each test
    global.cockpit = {
      spawn: vi.fn(),
    } as any;
  });

  it('should search packages successfully', async () => {
    const mockPackages = [
      {
        name: 'nginx',
        version: '1.18.0',
        summary: 'HTTP server',
        installed: false,
        section: 'web',
      },
    ];

    const mockProc = {
      stream: vi.fn().mockImplementation((callback) => {
        callback(JSON.stringify(mockPackages));
        return mockProc;
      }),
      done: vi.fn().mockImplementation((callback) => {
        callback();
        return mockProc;
      }),
      fail: vi.fn().mockReturnThis(),
    };

    (global.cockpit.spawn as any).mockReturnValue(mockProc);

    const results = await searchPackages('nginx');

    expect(global.cockpit.spawn).toHaveBeenCalledWith(
      ['cockpit-apt-bridge', 'search', 'nginx'],
      { err: 'message' }
    );
    expect(results).toEqual(mockPackages);
  });

  it('should reject with APTError if query is too short', async () => {
    await expect(searchPackages('a')).rejects.toThrow(APTError);
    await expect(searchPackages('a')).rejects.toThrow('at least 2 characters');
  });

  it('should handle spawn failures', async () => {
    const mockProc = {
      stream: vi.fn().mockReturnThis(),
      done: vi.fn().mockReturnThis(),
      fail: vi.fn().mockImplementation((callback) => {
        const errorJson = JSON.stringify({
          error: 'Command failed',
          code: 'EXEC_ERROR',
          details: 'Process exited with code 1',
        });
        callback(null, errorJson);
        return mockProc;
      }),
    };

    (global.cockpit.spawn as any).mockReturnValue(mockProc);

    await expect(searchPackages('nginx')).rejects.toThrow(APTError);
    await expect(searchPackages('nginx')).rejects.toThrow('Command failed');
  });

  it('should handle JSON parse errors', async () => {
    const mockProc = {
      stream: vi.fn().mockImplementation((callback) => {
        callback('invalid json');
        return mockProc;
      }),
      done: vi.fn().mockImplementation((callback) => {
        callback(null);
        return mockProc;
      }),
      fail: vi.fn().mockReturnThis(),
    };

    (global.cockpit.spawn as any).mockReturnValue(mockProc);

    await expect(searchPackages('nginx')).rejects.toThrow(APTError);
    await expect(searchPackages('nginx')).rejects.toThrow('parse response');
  });

  it('should accumulate stdout chunks', async () => {
    const mockPackages = [{ name: 'test', version: '1.0', summary: 'Test', installed: false, section: 'utils' }];
    const jsonString = JSON.stringify(mockPackages);
    const part1 = jsonString.slice(0, jsonString.length / 2);
    const part2 = jsonString.slice(jsonString.length / 2);

    const mockProc = {
      stream: vi.fn().mockImplementation((callback) => {
        callback(part1);
        callback(part2);
        return mockProc;
      }),
      done: vi.fn().mockImplementation((callback) => {
        callback(null);
        return mockProc;
      }),
      fail: vi.fn().mockReturnThis(),
    };

    (global.cockpit.spawn as any).mockReturnValue(mockProc);

    const results = await searchPackages('test');

    expect(results).toEqual(mockPackages);
  });
});
