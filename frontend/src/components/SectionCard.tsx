/**
 * SectionCard Component
 *
 * Displays a single Debian section as a clickable card with icon, label, and count.
 * Used in sections browsing mode (All Packages or stores without category_metadata).
 *
 * Features:
 * - Displays section icon based on Debian section name
 * - Shows archive area prefix if applicable (contrib, non-free, etc.)
 * - Shows package count badge
 * - Optional description from custom_sections metadata
 * - Keyboard accessible (Enter/Space)
 * - Click navigation to section packages
 */

import { Badge, Card, CardBody, CardHeader, CardTitle } from "@patternfly/react-core";
import React from "react";
import type { CustomSection } from "../api/types";
import type { Section } from "../lib/types";

export interface SectionCardProps {
  /** Section data to display */
  section: Section;
  /** Icon element to render (pre-rendered for flexibility) */
  icon: React.ReactNode;
  /** Optional custom section metadata for enhanced display */
  customSection?: CustomSection;
  /** Archive area prefix (e.g., "contrib", "non-free") */
  archivePrefix?: string | null;
  /** Archive area label for display */
  archiveLabel?: string;
  /** Display name for the section */
  displayName: string;
  /** Callback when user clicks on the card */
  onNavigate: (sectionName: string) => void;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  section,
  icon,
  customSection,
  archivePrefix,
  archiveLabel,
  displayName,
  onNavigate,
}) => {
  const handleClick = () => {
    onNavigate(section.name);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <Card
      isClickable
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{ height: "100%" }}
      tabIndex={0}
      role="button"
      aria-label={`View ${section.count} package${section.count !== 1 ? "s" : ""} in ${archivePrefix ? `${archiveLabel} ` : ""}${displayName} section`}
    >
      <CardHeader>{icon}</CardHeader>

      <CardTitle>
        {archivePrefix && (
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: "normal",
              color: "var(--pf-v5-global--Color--200)",
              marginBottom: "0.25rem",
            }}
          >
            {archiveLabel}
          </div>
        )}
        {displayName}
      </CardTitle>

      <CardBody>
        <div>
          <Badge isRead>
            {section.count} package{section.count !== 1 ? "s" : ""}
          </Badge>
        </div>
        {customSection?.description && (
          <div
            style={{
              marginTop: "0.5rem",
              fontSize: "0.875rem",
              color: "var(--pf-v5-global--Color--200)",
            }}
          >
            {customSection.description}
          </div>
        )}
      </CardBody>
    </Card>
  );
};
