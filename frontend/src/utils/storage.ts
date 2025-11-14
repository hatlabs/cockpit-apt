/**
 * LocalStorage utilities for persisting application state
 */

const STORAGE_PREFIX = 'cockpit-apt:';

// Storage keys
const KEYS = {
    ACTIVE_STORE: `${STORAGE_PREFIX}activeStore`,
    ACTIVE_REPOSITORY: `${STORAGE_PREFIX}activeRepository`,
    ACTIVE_TAB: `${STORAGE_PREFIX}activeTab`,
    SEARCH_QUERY: `${STORAGE_PREFIX}searchQuery`,
} as const;

/**
 * Check if localStorage is available
 */
function isStorageAvailable(): boolean {
    try {
        const test = '__storage_test__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
    } catch {
        return false;
    }
}

/**
 * Save a value to localStorage with error handling
 */
function saveItem(key: string, value: string): void {
    if (!isStorageAvailable()) {
        console.warn('localStorage not available');
        return;
    }

    try {
        localStorage.setItem(key, value);
    } catch (e) {
        if (e instanceof Error && e.name === 'QuotaExceededError') {
            console.error('localStorage quota exceeded');
            // Try to clear old data and retry
            try {
                Object.values(KEYS).forEach(k => localStorage.removeItem(k));
                localStorage.setItem(key, value);
            } catch {
                console.error('Failed to save to localStorage even after clearing');
            }
        } else {
            console.error('Failed to save to localStorage:', e);
        }
    }
}

/**
 * Load a value from localStorage with error handling
 */
function loadItem(key: string): string | null {
    if (!isStorageAvailable()) {
        return null;
    }

    try {
        return localStorage.getItem(key);
    } catch (e) {
        console.error('Failed to load from localStorage:', e);
        return null;
    }
}

/**
 * Remove a value from localStorage
 */
function removeItem(key: string): void {
    if (!isStorageAvailable()) {
        return;
    }

    try {
        localStorage.removeItem(key);
    } catch (e) {
        console.error('Failed to remove from localStorage:', e);
    }
}

/**
 * Save active store ID
 */
export function saveActiveStore(storeId: string | null): void {
    if (storeId === null) {
        removeItem(KEYS.ACTIVE_STORE);
    } else {
        saveItem(KEYS.ACTIVE_STORE, storeId);
    }
}

/**
 * Load active store ID
 */
export function loadActiveStore(): string | null {
    return loadItem(KEYS.ACTIVE_STORE);
}

/**
 * Save active repository ID
 */
export function saveActiveRepository(repoId: string | null): void {
    if (repoId === null) {
        removeItem(KEYS.ACTIVE_REPOSITORY);
    } else {
        saveItem(KEYS.ACTIVE_REPOSITORY, repoId);
    }
}

/**
 * Load active repository ID
 */
export function loadActiveRepository(): string | null {
    return loadItem(KEYS.ACTIVE_REPOSITORY);
}

/**
 * Save active tab
 */
export function saveActiveTab(tab: 'installed' | 'upgradable' | 'available'): void {
    saveItem(KEYS.ACTIVE_TAB, tab);
}

/**
 * Load active tab
 */
export function loadActiveTab(): 'installed' | 'upgradable' | 'available' | null {
    const tab = loadItem(KEYS.ACTIVE_TAB);
    if (tab === 'installed' || tab === 'upgradable' || tab === 'available') {
        return tab;
    }
    return null;
}

/**
 * Save search query
 */
export function saveSearchQuery(query: string): void {
    if (query === '') {
        removeItem(KEYS.SEARCH_QUERY);
    } else {
        saveItem(KEYS.SEARCH_QUERY, query);
    }
}

/**
 * Load search query
 */
export function loadSearchQuery(): string {
    return loadItem(KEYS.SEARCH_QUERY) || '';
}

/**
 * Clear all stored state
 */
export function clearAllState(): void {
    Object.values(KEYS).forEach(key => removeItem(key));
}
