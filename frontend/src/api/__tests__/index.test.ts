/**
 * Tests for API wrapper layer
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    listStores,
    listRepositories,
    filterPackages,
    APTBridgeError,
    formatErrorMessage,
} from '../index';

// Mock the global cockpit object
const mockSpawn = vi.fn();
(globalThis as typeof globalThis & { cockpit: typeof cockpit }).cockpit = {
    spawn: mockSpawn,
    file: vi.fn(),
    location: {} as Location,
} as typeof cockpit;

describe('API Wrapper', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('listStores', () => {
        it('should parse valid JSON response', async () => {
            const mockStores = [
                { id: 'marine', name: 'Marine Apps', repositories: ['marine'] },
            ];

            let streamCallback: ((data: string) => void) | null = null;
            let doneCallback: ((data: string | null) => void) | null = null;

            const mockProc: Spawn = {
                stream: vi.fn((cb: (data: string) => void): Spawn => {
                    streamCallback = cb;
                    return mockProc;
                }),
                done: vi.fn((cb: (data: string | null) => void): Spawn => {
                    doneCallback = cb;
                    return mockProc;
                }),
                fail: vi.fn().mockReturnThis(),
                close: vi.fn().mockReturnThis(),
            };

            mockSpawn.mockReturnValue(mockProc);

            const promise = listStores();

            // Simulate stdout data
            if (streamCallback) streamCallback(JSON.stringify(mockStores));
            if (doneCallback) doneCallback(null);

            const result = await promise;
            expect(result).toEqual(mockStores);
            expect(mockSpawn).toHaveBeenCalledWith(
                ['cockpit-apt-bridge', 'list-stores'],
                expect.any(Object)
            );
        });

        it('should handle backend errors', async () => {
            const mockError = {
                error: 'Failed to load stores',
                code: 'CONFIG_ERROR',
            };

            const mockProc = {
                stream: vi.fn().mockReturnThis(),
                done: vi.fn().mockReturnThis(),
                fail: vi.fn((callback) => {
                    callback(JSON.stringify(mockError), null);
                    return mockProc;
                }),
            };

            mockSpawn.mockReturnValue(mockProc);

            await expect(listStores()).rejects.toThrow(APTBridgeError);
            await expect(listStores()).rejects.toThrow('Failed to load stores');
        });
    });

    describe('listRepositories', () => {
        it('should call with store filter', async () => {
            const mockRepos = [
                { id: 'marine:stable', name: 'Marine', origin: 'marine', label: 'Marine', suite: 'stable', package_count: 10 },
            ];

            const mockProc = {
                stream: vi.fn((callback) => {
                    callback(JSON.stringify(mockRepos));
                    return mockProc;
                }),
                done: vi.fn((callback) => {
                    callback();
                    return mockProc;
                }),
                fail: vi.fn().mockReturnThis(),
            };

            mockSpawn.mockReturnValue(mockProc);

            const result = await listRepositories('marine');
            expect(result).toEqual(mockRepos);
            expect(mockSpawn).toHaveBeenCalledWith(
                ['cockpit-apt-bridge', 'list-repositories', '--store', 'marine'],
                expect.any(Object)
            );
        });
    });

    describe('filterPackages', () => {
        it('should build correct command arguments', async () => {
            const mockResponse = {
                packages: [],
                total_count: 0,
                applied_filters: [],
                limit: 1000,
                limited: false,
            };

            const mockProc = {
                stream: vi.fn((callback) => {
                    callback(JSON.stringify(mockResponse));
                    return mockProc;
                }),
                done: vi.fn((callback) => {
                    callback();
                    return mockProc;
                }),
                fail: vi.fn().mockReturnThis(),
            };

            mockSpawn.mockReturnValue(mockProc);

            await filterPackages({
                store_id: 'marine',
                repository_id: 'marine:stable',
                tab: 'installed',
                search_query: 'signal',
                limit: 50,
            });

            expect(mockSpawn).toHaveBeenCalledWith(
                [
                    'cockpit-apt-bridge',
                    'filter-packages',
                    '--store', 'marine',
                    '--repo', 'marine:stable',
                    '--tab', 'installed',
                    '--search', 'signal',
                    '--limit', '50',
                ],
                expect.any(Object)
            );
        });
    });

    describe('formatErrorMessage', () => {
        it('should format APTBridgeError with details', () => {
            const error = new APTBridgeError('Test error', 'TEST_CODE', 'Extra details');
            const message = formatErrorMessage(error);
            expect(message).toBe('Test error: Extra details');
        });

        it('should format APTBridgeError without details', () => {
            const error = new APTBridgeError('Test error', 'TEST_CODE');
            const message = formatErrorMessage(error);
            expect(message).toBe('Test error');
        });

        it('should format generic Error', () => {
            const error = new Error('Generic error');
            const message = formatErrorMessage(error);
            expect(message).toBe('Generic error');
        });

        it('should format unknown error', () => {
            const message = formatErrorMessage('String error');
            expect(message).toBe('String error');
        });
    });
});
