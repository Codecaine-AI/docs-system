import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Status color utilities for consistent badge/indicator styling.
 */

/**
 * Get Tailwind color classes for project status badges.
 */
export function getProjectStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: "bg-status-success-fill text-status-success border border-status-success-border",
    onboarding: "bg-status-info-fill text-status-info border border-status-info-border",
    pending: "bg-muted text-muted-foreground",
    paused: "bg-status-warning-fill text-status-warning border border-status-warning-border",
    archived: "bg-status-danger-fill text-status-danger border border-status-danger-border",
  };
  return colors[status] || colors.pending;
}

/**
 * Get Tailwind color classes for session phase status indicators.
 */
export function getPhaseStatusColor(status: "complete" | "in_progress" | "pending"): string {
  const colors: Record<string, string> = {
    complete: "bg-status-success",
    in_progress: "bg-status-info animate-pulse",
    pending: "bg-muted-foreground/30",
  };
  return colors[status] || colors.pending;
}

/**
 * Get Tailwind color classes for session status badges.
 */
export function getSessionStatusColor(status: string): string {
  const colors: Record<string, string> = {
    idle: "bg-muted text-muted-foreground",
    running: "bg-status-info-fill text-status-info border border-status-info-border",
    awaiting_user_input: "bg-status-warning-fill text-status-warning border border-status-warning-border",
    failed: "bg-status-danger-fill text-status-danger border border-status-danger-border",
  };
  return colors[status] || colors.idle;
}

/**
 * Get Tailwind color classes for agent status badges.
 */
/**
 * Compact relative time label from a date string (e.g. "now", "5m", "2h", "3d 4h").
 */
export function getCompactAge(dateString: string | null | undefined): string {
  if (!dateString) return "--";

  // Handle PostgreSQL timestamp formats: "2026-02-21 10:05:22" or ISO 8601
  const normalized = dateString.includes("T") ? dateString : dateString.replace(" ", "T");
  const timestamp = new Date(normalized).getTime();
  const diffMs = Date.now() - timestamp;

  if (Number.isNaN(timestamp) || diffMs < 0) return "--";

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  if (totalMinutes < 1) return "now";

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 1) return `${totalMinutes}m`;

  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;

  if (days === 0) return `${remainingHours}h`;
  if (days < 100) return `${days}d ${remainingHours}h`;
  return `${days}d`;
}

export function getAgentStatusColorUtil(status: string): string {
  const colors: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    queued: "bg-status-info-fill text-status-info border border-status-info-border",
    executing: "bg-primary/15 text-primary",
    complete: "bg-status-success-fill text-status-success border border-status-success-border",
    failed: "bg-status-danger-fill text-status-danger border border-status-danger-border",
    cancelled: "bg-status-warning-fill text-status-warning border border-status-warning-border",
  };
  return colors[status] || colors.pending;
}
