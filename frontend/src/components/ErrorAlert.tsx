/**
 * ErrorAlert Component
 *
 * Displays errors with icon, message, error code, and optional details.
 * Supports dismissal, retry actions, and collapsible details.
 *
 * Features:
 * - User-friendly error messages via getUserMessage()
 * - Error code badge for debugging
 * - Collapsible details section
 * - Retry button for retryable operations
 * - Different alert variants (danger, warning, info)
 * - Dismissible
 *
 * Usage:
 *   <ErrorAlert
 *     error={error}
 *     onRetry={() => refetch()}
 *     onDismiss={() => setError(null)}
 *   />
 */

import React, { useState } from 'react';
import {
    Alert,
    AlertActionCloseButton,
    AlertActionLink,
    ExpandableSection,
    Label,
} from '@patternfly/react-core';
import { getUserMessage, APTError } from '../lib/error-handler';

export interface ErrorAlertProps {
    /** Error to display */
    error: Error | APTError | unknown;

    /** Optional retry callback */
    onRetry?: () => void;

    /** Optional dismiss callback */
    onDismiss?: () => void;

    /** Alert variant (default: danger) */
    variant?: 'danger' | 'warning' | 'info';

    /** Title override (default: "Error") */
    title?: string;

    /** Optional style object */
    style?: React.CSSProperties;

    /** Additional CSS class name */
    className?: string;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
    error,
    onRetry,
    onDismiss,
    variant = 'danger',
    title = 'Error',
    className,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Get user-friendly message
    const message = getUserMessage(error);

    // Extract error details if available
    let errorCode: string | undefined;
    let errorDetails: string | undefined;

    if (error instanceof APTError) {
        errorCode = error.code;
        errorDetails = error.details;
    } else if (error instanceof Error) {
        errorDetails = error.message;
    }

    // Determine if we have technical details to show
    const hasDetails = Boolean(errorDetails && errorDetails !== message);

    return (
        <Alert
            variant={variant}
            title={title}
            className={className}
            actionClose={onDismiss ? <AlertActionCloseButton onClose={onDismiss} /> : undefined}
            actionLinks={
                onRetry ? (
                    <AlertActionLink onClick={onRetry}>
                        Try again
                    </AlertActionLink>
                ) : undefined
            }
        >
            <div>
                {message}
                {errorCode && (
                    <div style={{ marginTop: '0.5rem' }}>
                        <Label color="red">{errorCode}</Label>
                    </div>
                )}
            </div>

            {hasDetails && (
                <ExpandableSection
                    toggleText={isExpanded ? 'Hide details' : 'Show details'}
                    onToggle={() => setIsExpanded(!isExpanded)}
                    isExpanded={isExpanded}
                    style={{ marginTop: '1rem' }}
                >
                    <pre
                        style={{
                            fontSize: '0.875rem',
                            overflow: 'auto',
                            maxHeight: '200px',
                            padding: '0.5rem',
                            backgroundColor: 'var(--pf-v5-global--BackgroundColor--200)',
                            borderRadius: '3px',
                        }}
                    >
                        {errorDetails}
                    </pre>
                </ExpandableSection>
            )}
        </Alert>
    );
};
