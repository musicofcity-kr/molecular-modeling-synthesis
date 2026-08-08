export type EntryMode = 'simple' | 'legacy' | 'scanner';

interface ResolveEntryModeOptions {
  search: string;
  viteMode: string;
}

export function resolveEntryMode({
  search,
  viteMode,
}: ResolveEntryModeOptions): EntryMode {
  const requestedEntry = new URLSearchParams(search).get('entry');

  if (
    requestedEntry === 'simple' ||
    requestedEntry === 'legacy' ||
    requestedEntry === 'scanner'
  ) {
    return requestedEntry;
  }

  return viteMode === 'e2e' ? 'legacy' : 'simple';
}
