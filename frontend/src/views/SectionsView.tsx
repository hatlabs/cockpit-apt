/**
 * SectionsView Component
 *
 * Displays Debian sections as a grid of cards.
 * Each card shows section name, package count, and icon.
 *
 * Features:
 * - Grid layout responsive to screen size
 * - Click on card navigates to section package list
 * - Loading skeleton during initial load
 * - Error handling with retry
 * - Empty state if no sections found
 *
 * Usage:
 *   <SectionsView onNavigateToSection={(name) => navigateTo(`/sections/${name}`)} />
 */

import React from 'react';
import {
    PageSection,
    Title,
    Card,
    CardHeader,
    CardTitle,
    CardBody,
    Grid,
    GridItem,
    EmptyState,
    EmptyStateBody,
    Badge,
} from '@patternfly/react-core';
import { CubesIcon, FolderIcon } from '@patternfly/react-icons';
import { ErrorAlert } from '../components/ErrorAlert';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { useSections } from '../hooks/usePackages';

export interface SectionsViewProps {
    /** Callback when user clicks on a section to view packages */
    onNavigateToSection?: (sectionName: string) => void;
}

/**
 * Get a default icon for a section
 * In future, this could be customized via configuration
 */
function getSectionIcon(_sectionName: string): React.ReactNode {
    // Default icon for all sections
    return <FolderIcon style={{ fontSize: '2rem', color: 'var(--pf-v5-global--primary-color--100)' }} />;
}

/**
 * Get a friendly display name for a section
 */
function getSectionDisplayName(sectionName: string): string {
    // Capitalize first letter
    return sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
}

export const SectionsView: React.FC<SectionsViewProps> = ({
    onNavigateToSection,
}) => {
    const { data: sections, loading, error, refetch } = useSections();

    const handleSectionClick = (sectionName: string) => {
        if (onNavigateToSection) {
            onNavigateToSection(sectionName);
        }
    };

    return (
        <PageSection>
            <Title headingLevel="h1" size="2xl" style={{ marginBottom: '1.5rem' }}>
                Browse by Section
            </Title>

            {error && (
                <ErrorAlert
                    error={error}
                    onRetry={refetch}
                    style={{ marginBottom: '1.5rem' }}
                />
            )}

            {loading && <LoadingSkeleton variant="card" rows={8} />}

            {!loading && !error && sections && sections.length === 0 && (
                <EmptyState
                    icon={CubesIcon}
                    titleText="No sections found"
                    headingLevel="h4"
                >
                    <EmptyStateBody>
                        No package sections are available in the APT cache.
                    </EmptyStateBody>
                </EmptyState>
            )}

            {!loading && !error && sections && sections.length > 0 && (
                <>
                    <div style={{ marginBottom: '1rem', color: 'var(--pf-v5-global--Color--200)' }}>
                        {sections.length} section{sections.length !== 1 ? 's' : ''} available
                    </div>

                    <Grid hasGutter>
                        {sections.map((section) => (
                            <GridItem key={section.name} md={6} lg={4} xl={3}>
                                <Card
                                    isClickable
                                    onClick={() => handleSectionClick(section.name)}
                                    style={{ height: '100%' }}
                                >
                                    <CardHeader>
                                        {getSectionIcon(section.name)}
                                    </CardHeader>

                                    <CardTitle>
                                        {getSectionDisplayName(section.name)}
                                    </CardTitle>

                                    <CardBody>
                                        <div>
                                            <Badge isRead>
                                                {section.count} package{section.count !== 1 ? 's' : ''}
                                            </Badge>
                                        </div>
                                    </CardBody>
                                </Card>
                            </GridItem>
                        ))}
                    </Grid>
                </>
            )}
        </PageSection>
    );
};
