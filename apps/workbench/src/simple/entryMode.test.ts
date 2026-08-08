import { describe, expect, it } from 'vitest';
import { resolveEntryMode } from './entryMode';

describe('resolveEntryMode', () => {
  it('opens the scanner only when explicitly requested', () => {
    expect(
      resolveEntryMode({ search: '?entry=scanner', viteMode: 'production' }),
    ).toBe('scanner');
    expect(
      resolveEntryMode({ search: '?entry=scanner', viteMode: 'e2e' }),
    ).toBe('scanner');
  });

  it('uses the simple three-tool prototype by default', () => {
    expect(resolveEntryMode({ search: '', viteMode: 'development' })).toBe(
      'simple',
    );
    expect(resolveEntryMode({ search: '', viteMode: 'production' })).toBe(
      'simple',
    );
  });

  it('keeps the existing workbench available to the e2e suite and explicit links', () => {
    expect(resolveEntryMode({ search: '', viteMode: 'e2e' })).toBe('legacy');
    expect(
      resolveEntryMode({ search: '?entry=legacy', viteMode: 'production' }),
    ).toBe('legacy');
    expect(
      resolveEntryMode({ search: '?entry=simple', viteMode: 'e2e' }),
    ).toBe('simple');
  });
});
