const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface ApiErrorBody {
  message?: string | string[];
  error?: string;
  statusCode?: number;
  /**
   * A machine-readable error kind, when the backend sends one — currently
   * only `"ENTITLEMENT_DENIED"` (see EntitlementDeniedException /
   * entitlement-error.ts's `isEntitlementDeniedError`). Every other error
   * this codebase throws omits `code` entirely; do not assume it's always
   * present.
   */
  code?: string;
  /** Present only alongside `code: "ENTITLEMENT_DENIED"` — see EntitlementDeniedException's own doc comment. */
  reason?: unknown;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly details?: ApiErrorBody | undefined;
  /**
   * The request path (e.g. "/tenants/x/rentals"), stripped of its leading
   * origin/query — lets a global handler (see session-expiry.ts) tell "a
   * 401 from an already-authenticated area of the app" (a real session
   * expiry) apart from "a 401 from the login/register form itself" (an
   * expected, ordinary invalid-credentials outcome that must never trigger
   * a redirect away from the very form reporting it).
   */
  readonly path: string;

  constructor(message: string, statusCode: number, path: string = "", details?: ApiErrorBody) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.path = path;
    this.details = details;
  }
}

function pathOnly(path: string): string {
  return path.split("?")[0]!;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const isJson = response.headers.get("content-type")?.includes("application/json") ?? false;
  const body: unknown = isJson ? await response.json() : undefined;

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | undefined;
    const rawMessage = errorBody?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(", ")
      : (rawMessage ?? "Request failed");
    throw new ApiError(message, response.status, pathOnly(path), errorBody);
  }

  return body as T;
}

export type QueryParams = Record<string, string | number | boolean | undefined>;

export function toQueryString(params?: QueryParams): string {
  if (!params) {
    return "";
  }
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  }
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

async function requestForm<T>(
  path: string,
  method: "POST" | "PATCH",
  formData: FormData,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    body: formData,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json") ?? false;
  const body: unknown = isJson ? await response.json() : undefined;

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | undefined;
    const rawMessage = errorBody?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(", ")
      : (rawMessage ?? "Request failed");
    throw new ApiError(message, response.status, pathOnly(path), errorBody);
  }

  return body as T;
}

export const apiClient = {
  get: <T>(path: string, params?: QueryParams): Promise<T> =>
    request<T>(`${path}${toQueryString(params)}`, { method: "GET" }),
  post: <T>(path: string, data?: unknown): Promise<T> =>
    request<T>(path, {
      method: "POST",
      body: data !== undefined ? JSON.stringify(data) : null,
    }),
  patch: <T>(path: string, data?: unknown): Promise<T> =>
    request<T>(path, {
      method: "PATCH",
      body: data !== undefined ? JSON.stringify(data) : null,
    }),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: "DELETE" }),
  /** For multipart/form-data endpoints (file uploads) — never sets a JSON Content-Type. */
  postForm: <T>(path: string, formData: FormData): Promise<T> =>
    requestForm<T>(path, "POST", formData),
};
