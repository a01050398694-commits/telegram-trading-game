/**
 * Legal page routing via URL search param (?legal=terms|privacy|refund)
 * Enables legal page overlay with localStorage persistence
 */

export type LegalPageKey = 'terms' | 'privacy' | 'refund';

function getSearchParam(key: string): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get(key);
}

function setSearchParam(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (value === null) {
    params.delete(key);
  } else {
    params.set(key, value);
  }
  const newUrl = new URL(window.location.href);
  newUrl.search = params.toString();
  window.history.replaceState({}, '', newUrl);
}

/**
 * Get current legal page from URL param
 */
export function getLegalPage(): LegalPageKey | null {
  const param = getSearchParam('legal');
  if (param === 'terms' || param === 'privacy' || param === 'refund') {
    return param;
  }
  return null;
}

/**
 * Set legal page (opens overlay) or clear (closes)
 */
export function setLegalPage(key: LegalPageKey | null): void {
  setSearchParam('legal', key);
}

/**
 * Hook to manage legal page state
 */
export function useLegalPage() {
  const page = getLegalPage();
  return {
    page,
    open: (key: LegalPageKey) => setLegalPage(key),
    close: () => setLegalPage(null),
  };
}
