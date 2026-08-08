import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './shims/browserRequire';
import { SimpleMoleculeModeler } from './simple/SimpleMoleculeModeler';
import { resolveEntryMode } from './simple/entryMode';
import './styles/global.css';

const LegacyApp = lazy(() =>
  import('./app/App').then(({ App }) => ({ default: App })),
);

const PhysicalMoleculeScanner = lazy(() =>
  import('./scanner/PhysicalMoleculeScanner').then(({ PhysicalMoleculeScanner }) => ({
    default: PhysicalMoleculeScanner,
  })),
);

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element was not found.');
}

const entryMode = resolveEntryMode({
  search: window.location.search,
  viteMode: import.meta.env.MODE,
});

createRoot(rootElement).render(
  <StrictMode>
    {entryMode === 'legacy' ? (
      <Suspense fallback={<div>기존 분자 모델링 도구를 불러오는 중입니다.</div>}>
        <LegacyApp />
      </Suspense>
    ) : entryMode === 'scanner' ? (
      <Suspense fallback={<div>실물 분자 모형 스캐너를 불러오는 중입니다.</div>}>
        <PhysicalMoleculeScanner />
      </Suspense>
    ) : (
      <SimpleMoleculeModeler />
    )}
  </StrictMode>,
);
