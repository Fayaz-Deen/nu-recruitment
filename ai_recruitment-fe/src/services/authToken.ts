/**
 * Module-level token store.
 * Access token lives in memory (never localStorage) so XSS cannot exfiltrate it.
 * Refresh token lives in an httpOnly cookie managed by the server.
 *
 * The store also holds a reference to the refresh function set by AuthContext,
 * so the axios interceptor can trigger a token refresh without importing React context.
 */

let _accessToken: string | null = null;
let _refreshFn: (() => Promise<string | null>) | null = null;

export const tokenStore = {
  getToken: () => _accessToken,
  setToken: (t: string | null) => { _accessToken = t; },
  setRefreshFn: (fn: (() => Promise<string | null>) | null) => { _refreshFn = fn; },
  refresh: (): Promise<string | null> => _refreshFn?.() ?? Promise.resolve(null),
};
