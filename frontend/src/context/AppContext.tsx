/**
 * Application state management with React Context
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Store, Repository, Package, FilterParams } from '../api/types';
import { listStores, listRepositories, filterPackages, APTBridgeError } from '../api';
import {
    saveActiveStore,
    loadActiveStore,
    saveActiveRepository,
    loadActiveRepository,
    saveActiveTab,
    loadActiveTab,
    saveSearchQuery,
    loadSearchQuery,
} from '../utils/storage';

/**
 * Application state interface
 */
export interface AppState {
    // Data
    stores: Store[];
    repositories: Repository[];
    packages: Package[];
    
    // Filters
    activeStore: string | null;
    activeRepository: string | null;
    activeTab: 'installed' | 'upgradable' | 'available';
    searchQuery: string;
    
    // UI state
    loading: boolean;
    error: string | null;
    packagesLoading: boolean;
    packagesError: string | null;
    
    // Metadata
    totalPackageCount: number;
    limitedResults: boolean;
}

/**
 * Application actions interface
 */
export interface AppActions {
    // Data loading
    loadStores: () => Promise<void>;
    loadRepositories: (storeId?: string) => Promise<void>;
    loadPackages: (params?: FilterParams) => Promise<void>;
    
    // Filter actions
    setActiveStore: (storeId: string | null) => void;
    setActiveRepository: (repoId: string | null) => void;
    setActiveTab: (tab: 'installed' | 'upgradable' | 'available') => void;
    setSearchQuery: (query: string) => void;
    
    // Utility actions
    clearError: () => void;
    refresh: () => Promise<void>;
}

/**
 * Combined context type
 */
export interface AppContextType {
    state: AppState;
    actions: AppActions;
}

// Create context
const AppContext = createContext<AppContextType | undefined>(undefined);

/**
 * Initial state
 */
const initialState: AppState = {
    stores: [],
    repositories: [],
    packages: [],
    activeStore: loadActiveStore(),
    activeRepository: loadActiveRepository(),
    activeTab: loadActiveTab() || 'available',
    searchQuery: loadSearchQuery(),
    loading: false,
    error: null,
    packagesLoading: false,
    packagesError: null,
    totalPackageCount: 0,
    limitedResults: false,
};

/**
 * AppContext Provider component
 */
export function AppProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<AppState>(initialState);

    // Load stores on mount
    const loadStores = useCallback(async () => {
        setState(prev => ({ ...prev, loading: true, error: null }));
        try {
            const stores = await listStores();
            setState(prev => ({ ...prev, stores, loading: false }));
        } catch (e) {
            const error = e instanceof APTBridgeError ? e.message : String(e);
            setState(prev => ({ ...prev, error, loading: false }));
        }
    }, []);

    // Load repositories
    const loadRepositories = useCallback(async (storeId?: string) => {
        setState(prev => ({ ...prev, loading: true, error: null }));
        try {
            const repositories = await listRepositories(storeId);
            setState(prev => ({ ...prev, repositories, loading: false }));
        } catch (e) {
            const error = e instanceof APTBridgeError ? e.message : String(e);
            setState(prev => ({ ...prev, error, loading: false }));
        }
    }, []);

    // Load packages
    const loadPackages = useCallback(async (params?: FilterParams) => {
        setState(prev => ({ ...prev, packagesLoading: true, packagesError: null }));
        try {
            const filterParams: FilterParams = {
                store_id: params?.store_id ?? state.activeStore ?? undefined,
                repository_id: params?.repository_id ?? state.activeRepository ?? undefined,
                tab: params?.tab ?? (state.activeTab !== 'available' ? state.activeTab : undefined),
                search_query: params?.search_query ?? (state.searchQuery || undefined),
                limit: params?.limit ?? 1000,
            };

            const response = await filterPackages(filterParams);
            setState(prev => ({
                ...prev,
                packages: response.packages,
                totalPackageCount: response.total_count,
                limitedResults: response.limited,
                packagesLoading: false,
            }));
        } catch (e) {
            const error = e instanceof APTBridgeError ? e.message : String(e);
            setState(prev => ({ ...prev, packagesError: error, packagesLoading: false }));
        }
    }, [state.activeStore, state.activeRepository, state.activeTab, state.searchQuery]);

    // Set active store
    const setActiveStore = useCallback((storeId: string | null) => {
        setState(prev => ({ ...prev, activeStore: storeId, activeRepository: null }));
        saveActiveStore(storeId);
        saveActiveRepository(null);
    }, []);

    // Set active repository
    const setActiveRepository = useCallback((repoId: string | null) => {
        setState(prev => ({ ...prev, activeRepository: repoId }));
        saveActiveRepository(repoId);
    }, []);

    // Set active tab
    const setActiveTab = useCallback((tab: 'installed' | 'upgradable' | 'available') => {
        setState(prev => ({ ...prev, activeTab: tab }));
        saveActiveTab(tab);
    }, []);

    // Set search query
    const setSearchQuery = useCallback((query: string) => {
        setState(prev => ({ ...prev, searchQuery: query }));
        saveSearchQuery(query);
    }, []);

    // Clear error
    const clearError = useCallback(() => {
        setState(prev => ({ ...prev, error: null, packagesError: null }));
    }, []);

    // Refresh all data
    const refresh = useCallback(async () => {
        await loadStores();
        await loadRepositories(state.activeStore ?? undefined);
        await loadPackages();
    }, [loadStores, loadRepositories, loadPackages, state.activeStore]);

    // Load initial data on mount
    useEffect(() => {
        void loadStores();
        void loadRepositories(state.activeStore ?? undefined);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Reload repositories when active store changes
    useEffect(() => {
        void loadRepositories(state.activeStore ?? undefined);
    }, [state.activeStore, loadRepositories]);

    // Reload packages when filters change
    useEffect(() => {
        void loadPackages();
    }, [state.activeStore, state.activeRepository, state.activeTab, state.searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

    const actions: AppActions = {
        loadStores,
        loadRepositories,
        loadPackages,
        setActiveStore,
        setActiveRepository,
        setActiveTab,
        setSearchQuery,
        clearError,
        refresh,
    };

    return (
        <AppContext.Provider value={{ state, actions }}>
            {children}
        </AppContext.Provider>
    );
}

/**
 * Hook to use app context
 */
export function useApp(): AppContextType {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used within AppProvider');
    }
    return context;
}
