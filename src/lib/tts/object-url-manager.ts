export interface ObjectUrlApi {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
}

export interface ObjectUrlManager {
  getCurrent: () => string | null;
  replace: (blob: Blob) => string;
  revoke: () => void;
}

/** Tracks at most one active browser blob URL and guarantees prior URL revocation on replace or cleanup. */
export function createObjectUrlManager(api: ObjectUrlApi = URL): ObjectUrlManager {
  let currentUrl: string | null = null;

  return {
    getCurrent() {
      return currentUrl;
    },
    replace(blob: Blob) {
      if (currentUrl !== null) {
        api.revokeObjectURL(currentUrl);
        currentUrl = null;
      }
      const nextUrl = api.createObjectURL(blob);
      currentUrl = nextUrl;
      return nextUrl;
    },
    revoke() {
      if (currentUrl !== null) {
        api.revokeObjectURL(currentUrl);
        currentUrl = null;
      }
    },
  };
}

export interface EpisodeObjectUrlPool {
  get: (cacheKey: string) => string | null;
  set: (cacheKey: string, blob: Blob) => string;
  revoke: (cacheKey: string) => boolean;
  revokeAll: () => number;
  size: () => number;
}

/**
 * Manages active-episode blob URLs keyed by segment cache identity.
 * Guarantees each created URL is revoked at most once on replacement, teardown, or session disposal.
 */
export function createEpisodeObjectUrlPool(api: ObjectUrlApi = URL): EpisodeObjectUrlPool {
  const urls = new Map<string, string>();

  function revokeKey(cacheKey: string): boolean {
    const existing = urls.get(cacheKey);
    if (existing === undefined) {
      return false;
    }
    urls.delete(cacheKey);
    api.revokeObjectURL(existing);
    return true;
  }

  return {
    get(cacheKey: string) {
      return urls.get(cacheKey) ?? null;
    },
    set(cacheKey: string, blob: Blob) {
      revokeKey(cacheKey);
      const nextUrl = api.createObjectURL(blob);
      urls.set(cacheKey, nextUrl);
      return nextUrl;
    },
    revoke: revokeKey,
    revokeAll() {
      const entries = Array.from(urls.values());
      urls.clear();
      for (const url of entries) {
        api.revokeObjectURL(url);
      }
      return entries.length;
    },
    size() {
      return urls.size;
    },
  };
}
