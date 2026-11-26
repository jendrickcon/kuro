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
