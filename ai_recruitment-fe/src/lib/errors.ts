/**
 * Extracts a human-readable message from an API error without unsafe casts.
 * Centralises the `(err as { response?... })` narrowing previously duplicated
 * across pages.
 */
export function getApiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (typeof err === 'object' && err !== null) {
    const response = (err as { response?: { data?: { error?: unknown } } }).response
    const apiError = response?.data?.error
    if (typeof apiError === 'string' && apiError.length > 0) return apiError
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}
