const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface ApiErrorBody {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly details?: ApiErrorBody | undefined;

  constructor(message: string, statusCode: number, details?: ApiErrorBody) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
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
    throw new ApiError(message, response.status, errorBody);
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
    throw new ApiError(message, response.status, errorBody);
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
