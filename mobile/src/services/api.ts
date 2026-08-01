import { env } from "@/config/env";

interface ApiOptions extends Omit<RequestInit, "headers"> {
  accessToken: string;
  headers?: Record<string, string>;
}

interface ErrorPayload {
  message?: string | string[];
}

export async function apiRequest<T>(
  path: string,
  { accessToken, headers, ...options }: ApiOptions,
): Promise<T> {
  const response = await fetch(`${env.apiUrl}/api${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as ErrorPayload;
  if (!response.ok) {
    const message = Array.isArray(payload.message)
      ? payload.message[0]
      : payload.message;
    throw new Error(message || "The request could not be completed.");
  }
  return payload as T;
}
