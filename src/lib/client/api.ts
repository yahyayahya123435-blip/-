'use client';

/**
 * RENDERER-ONLY. Thin wrapper around window.api.invoke that throws a
 * user-safe Arabic Error on failure so calling code can just try/catch (or
 * let a hook surface it as a toast) instead of checking `.ok` everywhere.
 */
export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ApiError';
  }
}

export async function apiInvoke<T = unknown>(channel: string, payload?: unknown): Promise<T> {
  const result = await window.api.invoke<T>(channel, payload);
  if (!result.ok) {
    throw new ApiError(result.error.code, result.error.message);
  }
  return result.data;
}
