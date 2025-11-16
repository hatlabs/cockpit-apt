/**
 * CategoryCard Component
 *
 * Displays a single category as a clickable card with icon, label, count, and description.
 * Used in category browsing mode when a store has category_metadata configured.
 *
 * Features:
 * - Displays category icon (PatternFly or custom image)
 * - Shows package count badge
 * - Optional description text
 * - Keyboard accessible (Enter/Space)
 * - Click navigation to category packages
 */

import { Badge, Card, CardBody, CardHeader, CardTitle } from "@patternfly/react-core";
import React from "react";
import type { Category } from "../api/types";

export interface CategoryCardProps {
  /** Category data to display */
  category: Category;
  /** Icon element to render (pre-rendered for flexibility) */
  icon: React.ReactNode;
  /** Callback when user clicks on the card */
  onNavigate: (categoryId: string) => void;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({ category, icon, onNavigate }) => {
  const handleClick = () => {
    onNavigate(category.id);
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
      aria-label={`View ${category.count} package${category.count !== 1 ? "s" : ""} in ${category.label} category`}
    >
      <CardHeader>{icon}</CardHeader>

      <CardTitle>{category.label}</CardTitle>

      <CardBody>
        <div>
          <Badge isRead>
            {category.count} package{category.count !== 1 ? "s" : ""}
          </Badge>
        </div>
        {category.description && (
          <div
            style={{
              marginTop: "0.5rem",
              fontSize: "0.875rem",
              color: "var(--pf-v5-global--Color--200)",
            }}
          >
            {category.description}
          </div>
        )}
      </CardBody>
    </Card>
  );
};
