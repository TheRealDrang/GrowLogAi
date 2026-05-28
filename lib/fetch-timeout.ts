const DEFAULT_TIMEOUT_MS = 8000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
) {
  // Codex chose this approach because: external APIs should not be able to hold a user-facing route open indefinitely.
  const signal = init.signal ?? AbortSignal.timeout(timeoutMs);
  return fetch(input, { ...init, signal });
}
