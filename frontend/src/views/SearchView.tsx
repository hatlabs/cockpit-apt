/**
 * SearchView Component
 *
 * Main search interface for finding packages.
 * Provides search bar, results table, and inline install/remove actions.
 *
 * Features:
 * - Debounced search with loading states
 * - Results table with sortable columns
 * - Install/Remove actions per row
 * - Empty state for no results
 * - Error handling with retry
 * - Loading skeleton during search
 *
 * Usage:
 *   <SearchView onNavigateToPackage={(name) => navigateTo(`/package/${name}`)} />
 */

import React, { useState } from 'react';
import {
    PageSection,
    Title,
    EmptyState,
    EmptyStateBody,
    Button,
} from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import { SearchBar } from '../components/SearchBar';
import { ErrorAlert } from '../components/ErrorAlert';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { useSearch } from '../hooks/usePackages';
import type { Package } from '../lib/types';

export interface SearchViewProps {
    /** Callback when user clicks on a package to view details */
    onNavigateToPackage?: (packageName: string) => void;

    /** Callback when user installs a package */
    onInstall?: (packageName: string) => Promise<void>;

    /** Callback when user removes a package */
    onRemove?: (packageName: string) => Promise<void>;
}

export const SearchView: React.FC<SearchViewProps> = ({
    onNavigateToPackage,
    onInstall,
    onRemove,
}) => {
    const [query, setQuery] = useState('');
    const [operatingPackage, setOperatingPackage] = useState<string | null>(null);

    const { data: packages, loading, error, refetch } = useSearch(query, query.length >= 2);

    const handleInstall = async (packageName: string) => {
        if (!onInstall) return;

        setOperatingPackage(packageName);
        try {
            await onInstall(packageName);
            // Refetch to update installed status
            refetch();
        } finally {
            setOperatingPackage(null);
        }
    };

    const handleRemove = async (packageName: string) => {
        if (!onRemove) return;

        setOperatingPackage(packageName);
        try {
            await onRemove(packageName);
            // Refetch to update installed status
            refetch();
        } finally {
            setOperatingPackage(null);
        }
    };

    const handleRowClick = (pkg: Package) => {
        if (onNavigateToPackage) {
            onNavigateToPackage(pkg.name);
        }
    };

    return (
        <PageSection>
            <Title headingLevel="h1" size="2xl" style={{ marginBottom: '1.5rem' }}>
                Search Packages
            </Title>

            <SearchBar
                value={query}
                onChange={setQuery}
                loading={loading}
                placeholder="Search for packages by name or description..."
                style={{ marginBottom: '1.5rem' }}
            />

            {error && (
                <ErrorAlert
                    error={error}
                    onRetry={refetch}
                    onDismiss={() => {}}
                    style={{ marginBottom: '1.5rem' }}
                />
            )}

            {loading && <LoadingSkeleton variant="table" rows={5} />}

            {!loading && !error && query.length >= 2 && packages && packages.length === 0 && (
                <EmptyState
                    icon={SearchIcon}
                    titleText="No results found"
                    headingLevel="h4"
                >
                    <EmptyStateBody>
                        No packages match your search query &quot;{query}&quot;.
                        Try different keywords or check spelling.
                    </EmptyStateBody>
                </EmptyState>
            )}

            {!loading && !error && query.length < 2 && (
                <EmptyState
                    icon={SearchIcon}
                    titleText="Start searching"
                    headingLevel="h4"
                >
                    <EmptyStateBody>
                        Type at least 2 characters to search for packages.
                    </EmptyStateBody>
                </EmptyState>
            )}

            {!loading && !error && packages && packages.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                    <table
                        className="pf-v5-c-table pf-m-grid-md"
                        role="grid"
                        style={{ width: '100%' }}
                    >
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Summary</th>
                                <th>Version</th>
                                <th>Section</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {packages.map((pkg) => (
                                <tr
                                    key={pkg.name}
                                    onClick={() => handleRowClick(pkg)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <td data-label="Name">
                                        <strong>{pkg.name}</strong>
                                    </td>
                                    <td data-label="Summary">
                                        <div style={{
                                            maxWidth: '400px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {pkg.summary}
                                        </div>
                                    </td>
                                    <td data-label="Version">{pkg.version}</td>
                                    <td data-label="Section">{pkg.section}</td>
                                    <td data-label="Status">
                                        {pkg.installed ? (
                                            <span style={{ color: 'var(--pf-v5-global--success-color--100)' }}>
                                                Installed
                                            </span>
                                        ) : (
                                            <span style={{ color: 'var(--pf-v5-global--Color--200)' }}>
                                                Not installed
                                            </span>
                                        )}
                                    </td>
                                    <td data-label="Actions" onClick={(e) => e.stopPropagation()}>
                                        {pkg.installed ? (
                                            onRemove && (
                                                <Button
                                                    variant="danger"
                                                    size="sm"
                                                    onClick={() => handleRemove(pkg.name)}
                                                    isLoading={operatingPackage === pkg.name}
                                                    isDisabled={operatingPackage === pkg.name}
                                                >
                                                    Remove
                                                </Button>
                                            )
                                        ) : (
                                            onInstall && (
                                                <Button
                                                    variant="primary"
                                                    size="sm"
                                                    onClick={() => handleInstall(pkg.name)}
                                                    isLoading={operatingPackage === pkg.name}
                                                    isDisabled={operatingPackage === pkg.name}
                                                >
                                                    Install
                                                </Button>
                                            )
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ marginTop: '1rem', color: 'var(--pf-v5-global--Color--200)' }}>
                        Showing {packages.length} result{packages.length !== 1 ? 's' : ''}
                    </div>
                </div>
            )}
        </PageSection>
    );
};
