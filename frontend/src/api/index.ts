/**
 * API wrapper for backend commands
 * Provides typed Promise-based interface to cockpit-apt-bridge
 */

import type {
  APIError,
  Category,
  FilterPackagesResponse,
  FilterParams,
  Package,
  Repository,
  Store,
} from "./types";

/**
 * Custom error class for API errors
 */
export class APTBridgeError extends Error {
  code?: string;
  details?: string;

  constructor(message: string, code?: string, details?: string) {
    super(message);
    this.name = "APTBridgeError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Execute backend command and parse JSON response
 */
async function executeCommand<T>(
  command: string,
  args: string[] = [],
  timeout = 30000
): Promise<T> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let settled = false; // Prevent race conditions

    const proc = cockpit.spawn(["cockpit-apt-bridge", command, ...args], {
      err: "out",
      superuser: "try",
    });

    // Set timeout
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          proc.close(() => {
            reject(new APTBridgeError(`Command timed out after ${timeout}ms`, "TIMEOUT"));
          });
        }
      }, timeout);
    }

    proc.stream((data: string) => {
      stdout += data;
    });

    proc.done(() => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);

      try {
        // Parse JSON response
        const parsed = JSON.parse(stdout);

        // Check for error response
        if (parsed.error) {
          const apiError = parsed as APIError;
          reject(new APTBridgeError(apiError.error, apiError.code, apiError.details));
          return;
        }

        resolve(parsed as T);
      } catch (e) {
        reject(new APTBridgeError("Failed to parse backend response", "PARSE_ERROR", stdout));
      }
    });

    proc.fail((error: unknown, data: string | null) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);

      const errorStr = String(error || data || "");

      // Try to parse error as JSON
      try {
        const parsed = JSON.parse(errorStr);
        if (parsed.error) {
          const apiError = parsed as APIError;
          reject(new APTBridgeError(apiError.error, apiError.code, apiError.details));
          return;
        }
      } catch {
        // Not JSON, treat as plain error message
      }

      reject(new APTBridgeError(errorStr || "Backend command failed", "COMMAND_FAILED"));
    });
  });
}

/**
 * List all configured stores
 */
export async function listStores(): Promise<Store[]> {
  return executeCommand<Store[]>("list-stores");
}

/**
 * List all repositories, optionally filtered by store
 */
export async function listRepositories(storeId?: string): Promise<Repository[]> {
  const args = storeId ? ["--store", storeId] : [];
  return executeCommand<Repository[]>("list-repositories", args);
}

/**
 * Filter packages with cascade filtering
 */
export async function filterPackages(params: FilterParams = {}): Promise<FilterPackagesResponse> {
  const args: string[] = [];

  if (params.store_id) {
    args.push("--store", params.store_id);
  }
  if (params.repository_id) {
    args.push("--repo", params.repository_id);
  }
  if (params.tab) {
    args.push("--tab", params.tab);
  }
  if (params.search_query) {
    args.push("--search", params.search_query);
  }
  if (params.limit !== undefined) {
    args.push("--limit", params.limit.toString());
  }

  return executeCommand<FilterPackagesResponse>("filter-packages", args);
}

/**
 * List categories for a store (auto-discovered from package tags)
 * Categories are extracted from package category:: tags
 * Optionally enhanced with metadata from store configuration
 */
export async function listCategories(storeId?: string): Promise<Category[]> {
  const args = storeId ? ["--store", storeId] : [];
  return executeCommand<Category[]>("list-categories", args);
}

/**
 * List packages in a specific category for a store
 * Only packages matching the store filter (if provided) are included
 */
export async function listPackagesByCategory(
  categoryId: string,
  storeId?: string
): Promise<Package[]> {
  const args = [categoryId];
  if (storeId) {
    args.push("--store", storeId);
  }
  return executeCommand<Package[]>("list-packages-by-category", args);
}

/**
 * Format error message for user display
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof APTBridgeError) {
    let message = error.message;
    if (error.details) {
      message += `: ${error.details}`;
    }
    return message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
