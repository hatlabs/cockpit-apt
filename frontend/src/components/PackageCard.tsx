/**
 * PackageCard Component
 *
 * Compact package display card with icon, name, summary, version, and actions.
 * Supports click to navigate to details and inline install/remove actions.
 *
 * Features:
 * - Optional icon display (AppStream support - Phase 1.5)
 * - Installed badge
 * - Install/Remove button with loading state
 * - Click anywhere on card navigates to details
 * - Graceful handling of missing AppStream data
 *
 * Usage:
 *   <PackageCard
 *     package={pkg}
 *     onNavigate={(name) => navigateToDetails(name)}
 *     onInstall={(name) => installPackage(name)}
 *   />
 */

import React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  CardFooter,
  Button,
  Badge,
  Label,
  Flex,
  FlexItem,
} from "@patternfly/react-core";
import { CubeIcon, CheckCircleIcon } from "@patternfly/react-icons";
import type { Package } from "../lib/types";

export interface PackageCardProps {
  /** Package to display */
  package: Package;

  /** Callback when card is clicked (navigate to details) */
  onNavigate?: (packageName: string) => void;

  /** Callback when install button is clicked */
  onInstall?: (packageName: string) => void;

  /** Callback when remove button is clicked */
  onRemove?: (packageName: string) => void;

  /** Whether an operation is in progress for this package */
  loading?: boolean;

  /** Additional CSS class name */
  className?: string;
}

export const PackageCard: React.FC<PackageCardProps> = ({
  package: pkg,
  onNavigate,
  onInstall,
  onRemove,
  loading = false,
  className,
}) => {
  const handleCardClick = (event: React.MouseEvent) => {
    // Don't navigate if clicking on a button
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }

    if (onNavigate) {
      onNavigate(pkg.name);
    }
  };

  const handleInstall = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (onInstall) {
      onInstall(pkg.name);
    }
  };

  const handleRemove = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (onRemove) {
      onRemove(pkg.name);
    }
  };

  return (
    <Card
      isClickable={Boolean(onNavigate)}
      onClick={handleCardClick}
      className={className}
      style={{ height: "100%" }}
    >
      <CardHeader>
        <Flex alignItems={{ default: "alignItemsCenter" }}>
          <FlexItem>
            <CubeIcon />
          </FlexItem>
          {pkg.installed && (
            <FlexItem>
              <Label color="green" icon={<CheckCircleIcon />}>
                Installed
              </Label>
            </FlexItem>
          )}
        </Flex>
      </CardHeader>

      <CardTitle>{pkg.name}</CardTitle>

      <CardBody>
        <div style={{ marginBottom: "0.5rem" }}>
          <small style={{ color: "var(--pf-v5-global--Color--200)" }}>{pkg.summary}</small>
        </div>
        <div>
          <Badge isRead>{pkg.version}</Badge> <Badge isRead>{pkg.section}</Badge>
        </div>
      </CardBody>

      <CardFooter>
        {pkg.installed
          ? onRemove && (
              <Button
                variant="danger"
                size="sm"
                isBlock
                onClick={handleRemove}
                isLoading={loading}
                isDisabled={loading}
              >
                Remove
              </Button>
            )
          : onInstall && (
              <Button
                variant="primary"
                size="sm"
                isBlock
                onClick={handleInstall}
                isLoading={loading}
                isDisabled={loading}
              >
                Install
              </Button>
            )}
      </CardFooter>
    </Card>
  );
};
