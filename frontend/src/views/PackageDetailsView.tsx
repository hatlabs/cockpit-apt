/**
 * PackageDetailsView Component
 *
 * Comprehensive package information display with tabbed interface.
 * Shows description, metadata, dependencies, and actions.
 *
 * Features:
 * - Header with package name, version, and status
 * - Tabbed interface (Overview, Dependencies)
 * - Overview: Description, metadata, homepage link
 * - Dependencies: List with version constraints
 * - Install/Remove action buttons
 * - Loading state during fetch
 * - Error handling with retry
 *
 * Usage:
 *   <PackageDetailsView
 *     packageName="nginx"
 *     onInstall={handleInstall}
 *     onRemove={handleRemove}
 *   />
 */

import React, { useState } from 'react';
import {
    PageSection,
    Title,
    Tabs,
    Tab,
    TabTitleText,
    DescriptionList,
    DescriptionListGroup,
    DescriptionListTerm,
    DescriptionListDescription,
    Button,
    Flex,
    FlexItem,
    Badge,
    Label,
    Divider,
} from '@patternfly/react-core';
import { ExternalLinkAltIcon, CheckCircleIcon } from '@patternfly/react-icons';
import { ErrorAlert } from '../components/ErrorAlert';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { usePackageDetails } from '../hooks/usePackages';

export interface PackageDetailsViewProps {
    /** Package name to display */
    packageName: string;

    /** Callback when user installs the package */
    onInstall?: (packageName: string) => Promise<void>;

    /** Callback when user removes the package */
    onRemove?: (packageName: string) => Promise<void>;

    /** Callback to navigate back */
    onBack?: () => void;
}

export const PackageDetailsView: React.FC<PackageDetailsViewProps> = ({
    packageName,
    onInstall,
    onRemove,
    onBack,
}) => {
    const [activeTab, setActiveTab] = useState<string | number>(0);
    const [operating, setOperating] = useState(false);

    const { data: details, loading, error, refetch } = usePackageDetails(packageName);

    const handleInstall = async () => {
        if (!onInstall || !details) return;

        setOperating(true);
        try {
            await onInstall(details.name);
            // Refetch to update installed status
            refetch();
        } finally {
            setOperating(false);
        }
    };

    const handleRemove = async () => {
        if (!onRemove || !details) return;

        setOperating(true);
        try {
            await onRemove(details.name);
            // Refetch to update installed status
            refetch();
        } finally {
            setOperating(false);
        }
    };

    if (error) {
        return (
            <PageSection>
                <ErrorAlert
                    error={error}
                    onRetry={refetch}
                    title="Failed to load package details"
                />
                {onBack && (
                    <Button variant="link" onClick={onBack} style={{ marginTop: '1rem' }}>
                        Go back
                    </Button>
                )}
            </PageSection>
        );
    }

    if (loading) {
        return (
            <PageSection>
                <LoadingSkeleton variant="details" />
            </PageSection>
        );
    }

    if (!details) {
        return (
            <PageSection>
                <Title headingLevel="h1">Package not found</Title>
            </PageSection>
        );
    }

    return (
        <PageSection>
            {/* Header */}
            <Flex
                justifyContent={{ default: 'justifyContentSpaceBetween' }}
                alignItems={{ default: 'alignItemsCenter' }}
                style={{ marginBottom: '1.5rem' }}
            >
                <FlexItem>
                    <Title headingLevel="h1" size="2xl">
                        {details.name}
                    </Title>
                    <div style={{ marginTop: '0.5rem' }}>
                        {details.installed && (
                            <Label color="green" icon={<CheckCircleIcon />}>
                                Installed
                            </Label>
                        )}
                        {' '}
                        <Badge isRead>{details.candidateVersion || details.installedVersion}</Badge>
                        {' '}
                        <Badge isRead>{details.section}</Badge>
                    </div>
                </FlexItem>

                <FlexItem>
                    {details.installed ? (
                        onRemove && (
                            <Button
                                variant="danger"
                                onClick={handleRemove}
                                isLoading={operating}
                                isDisabled={operating}
                            >
                                Remove Package
                            </Button>
                        )
                    ) : (
                        onInstall && (
                            <Button
                                variant="primary"
                                onClick={handleInstall}
                                isLoading={operating}
                                isDisabled={operating}
                            >
                                Install Package
                            </Button>
                        )
                    )}
                </FlexItem>
            </Flex>

            {/* Summary */}
            <div style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>
                {details.summary}
            </div>

            <Divider style={{ marginBottom: '1.5rem' }} />

            {/* Tabs */}
            <Tabs
                activeKey={activeTab}
                onSelect={(_event, tabIndex) => setActiveTab(tabIndex)}
            >
                <Tab eventKey={0} title={<TabTitleText>Overview</TabTitleText>}>
                    <div style={{ paddingTop: '1.5rem' }}>
                        {/* Description */}
                        <Title headingLevel="h3" size="lg" style={{ marginBottom: '1rem' }}>
                            Description
                        </Title>
                        <div style={{
                            whiteSpace: 'pre-wrap',
                            marginBottom: '2rem',
                            lineHeight: '1.6',
                        }}>
                            {details.description}
                        </div>

                        {/* Metadata */}
                        <Title headingLevel="h3" size="lg" style={{ marginBottom: '1rem' }}>
                            Details
                        </Title>
                        <DescriptionList isHorizontal>
                            <DescriptionListGroup>
                                <DescriptionListTerm>Version</DescriptionListTerm>
                                <DescriptionListDescription>
                                    {details.candidateVersion || 'N/A'}
                                </DescriptionListDescription>
                            </DescriptionListGroup>

                            {details.installed && details.installedVersion && (
                                <DescriptionListGroup>
                                    <DescriptionListTerm>Installed Version</DescriptionListTerm>
                                    <DescriptionListDescription>
                                        {details.installedVersion}
                                    </DescriptionListDescription>
                                </DescriptionListGroup>
                            )}

                            <DescriptionListGroup>
                                <DescriptionListTerm>Section</DescriptionListTerm>
                                <DescriptionListDescription>
                                    {details.section}
                                </DescriptionListDescription>
                            </DescriptionListGroup>

                            <DescriptionListGroup>
                                <DescriptionListTerm>Priority</DescriptionListTerm>
                                <DescriptionListDescription>
                                    {details.priority}
                                </DescriptionListDescription>
                            </DescriptionListGroup>

                            {details.maintainer && (
                                <DescriptionListGroup>
                                    <DescriptionListTerm>Maintainer</DescriptionListTerm>
                                    <DescriptionListDescription>
                                        {details.maintainer}
                                    </DescriptionListDescription>
                                </DescriptionListGroup>
                            )}

                            {details.homepage && (
                                <DescriptionListGroup>
                                    <DescriptionListTerm>Homepage</DescriptionListTerm>
                                    <DescriptionListDescription>
                                        <a
                                            href={details.homepage}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            {details.homepage}
                                            {' '}
                                            <ExternalLinkAltIcon />
                                        </a>
                                    </DescriptionListDescription>
                                </DescriptionListGroup>
                            )}

                            <DescriptionListGroup>
                                <DescriptionListTerm>Download Size</DescriptionListTerm>
                                <DescriptionListDescription>
                                    {formatBytes(details.size)}
                                </DescriptionListDescription>
                            </DescriptionListGroup>

                            <DescriptionListGroup>
                                <DescriptionListTerm>Installed Size</DescriptionListTerm>
                                <DescriptionListDescription>
                                    {formatBytes(details.installedSize)}
                                </DescriptionListDescription>
                            </DescriptionListGroup>
                        </DescriptionList>
                    </div>
                </Tab>

                <Tab eventKey={1} title={<TabTitleText>Dependencies ({details.dependencies.length})</TabTitleText>}>
                    <div style={{ paddingTop: '1.5rem' }}>
                        {details.dependencies.length === 0 ? (
                            <div>No dependencies</div>
                        ) : (
                            <DescriptionList isCompact>
                                {details.dependencies.map((dep, index) => (
                                    <DescriptionListGroup key={index}>
                                        <DescriptionListTerm>{dep.name}</DescriptionListTerm>
                                        <DescriptionListDescription>
                                            {dep.relation && dep.version ? (
                                                <Badge isRead>{dep.relation} {dep.version}</Badge>
                                            ) : (
                                                <span style={{ color: 'var(--pf-v5-global--Color--200)' }}>
                                                    Any version
                                                </span>
                                            )}
                                        </DescriptionListDescription>
                                    </DescriptionListGroup>
                                ))}
                            </DescriptionList>
                        )}

                        {details.reverseDependencies && details.reverseDependencies.length > 0 && (
                            <>
                                <Divider style={{ margin: '2rem 0' }} />
                                <Title headingLevel="h3" size="lg" style={{ marginBottom: '1rem' }}>
                                    Reverse Dependencies ({details.reverseDependencies.length})
                                </Title>
                                <div style={{ color: 'var(--pf-v5-global--Color--200)', marginBottom: '1rem' }}>
                                    Packages that depend on this package (max 50 shown)
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    {details.reverseDependencies.map((pkgName) => (
                                        <Badge key={pkgName} isRead>{pkgName}</Badge>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </Tab>
            </Tabs>
        </PageSection>
    );
};

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
