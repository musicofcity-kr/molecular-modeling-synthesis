import { expect, test, type Locator, type Page } from '@playwright/test';

const SCANNER_ENTRY = '/?entry=scanner';
const DEMO_METHANE_IMAGE = 'public/scanner-fixtures/demo-methane.svg';
const METHANE_PUBCHEM_3D_ENDPOINT =
  /\/rest\/pug\/compound\/cid\/297\/record\/SDF\?record_type=3d$/;

const PARTIALLY_OCCLUDED_WATER_IMAGE = `
  <svg xmlns="http://www.w3.org/2000/svg" width="900" height="700" viewBox="0 0 900 700">
    <rect width="900" height="700" fill="#66798b" />
    <circle cx="460" cy="350" r="38" fill="#f5f5f5" />
    <circle cx="288" cy="350" r="45" fill="#f5f5f5" />
    <circle cx="450" cy="350" r="70" fill="#d23232" />
  </svg>
`;

const METHANE_3D_SDF = `methane PubChem 3D
  PubChem  080826

  5  4  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.6291    0.6291    0.6291 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.6291   -0.6291    0.6291 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.6291    0.6291   -0.6291 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.6291   -0.6291   -0.6291 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  1  3  1  0
  1  4  1  0
  1  5  1  0
M  END
$$$$`;

async function openScannerWithDemoImage(page: Page) {
  await page.goto(SCANNER_ENTRY);
  await expect(page.getByTestId('scanner-shell')).toBeVisible();
  await page.getByTestId('scanner-image-input').setInputFiles(DEMO_METHANE_IMAGE);
  await expect(page.getByTestId('scanner-candidate-marker')).toHaveCount(5);
}

async function openScannerWithPartiallyOccludedWater(page: Page) {
  await page.goto(SCANNER_ENTRY);
  await expect(page.getByTestId('scanner-shell')).toBeVisible();
  await page.getByTestId('scanner-image-input').setInputFiles({
    name: 'occluded-water.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(PARTIALLY_OCCLUDED_WATER_IMAGE),
  });
  await expect(page.getByTestId('scanner-candidate-marker')).toHaveCount(2);
  await expect(page.getByTestId('scanner-status')).toContainText(
    '2개의 원자 후보를 찾았습니다',
  );
}

async function addManualAtom(
  page: Page,
  element: 'H' | 'C' | 'N' | 'O' | 'F' | 'Cl',
  xRatio: number,
  yRatio: number,
) {
  await page.getByLabel('추가할 원소').selectOption(element);
  await page.getByTestId('scanner-add-button').click();
  const preview = page.getByTestId('scanner-preview');
  const box = await preview.boundingBox();
  expect(box, 'scanner preview must have a visible bounding box').not.toBeNull();
  await preview.click({
    position: {
      x: (box?.width ?? 1) * xRatio,
      y: (box?.height ?? 1) * yRatio,
    },
  });
  await expect(page.getByTestId('scanner-candidate-editor')).toContainText(
    '직접 추가 · 자동 신뢰도 없음',
  );
}

async function completeAtomReviewAndStartBondReview(page: Page) {
  await openScannerWithDemoImage(page);

  const atomMarkers = page.getByTestId('scanner-candidate-marker');
  for (let index = 0; index < 5; index += 1) {
    await atomMarkers.nth(index).click();
    await page.getByTestId('scanner-confirm-selected').click();
  }
  await expect(page.getByTestId('scanner-confirmation-status')).toContainText('5/5');
  await page.getByTestId('scanner-whole-model-checkbox').check();
  await page.getByTestId('scanner-complete-button').click();
  await expect(page.getByTestId('scanner-completion-summary')).toBeVisible();

  const startBondReviewButton = page.getByTestId('scanner-start-bond-review');
  await expect(startBondReviewButton).toBeVisible();
  await startBondReviewButton.click();
  await expect(page.getByTestId('scanner-bond-review')).toBeVisible();
}

async function completeDemoMethanePhysicalGraph(
  page: Page,
  options: { makeFirstBondDouble?: boolean } = {},
) {
  await completeAtomReviewAndStartBondReview(page);

  const bondMarkers = page.getByTestId('scanner-bond-marker');
  await expect(bondMarkers).toHaveCount(4);
  if (options.makeFirstBondDouble) {
    await bondMarkers.first().click();
    await page.getByTestId('scanner-selected-bond-order').selectOption('2');
  }
  for (let index = 0; index < 4; index += 1) {
    await bondMarkers.nth(index).click();
    await page.getByTestId('scanner-confirm-selected-bond').click();
  }
  await page.getByTestId('scanner-bond-whole-model-checkbox').check();
  await page.getByTestId('scanner-confirm-physical-graph').click();
  await expect(page.getByTestId('scanner-physical-graph-summary')).toBeVisible();
}

async function startChemistryValidation(page: Page) {
  const startValidationButton = page.getByTestId('scanner-start-chemistry-validation');
  await expect(startValidationButton).toBeVisible();
  await startValidationButton.click();
  await expect(page.getByTestId('scanner-validation-stage')).toBeVisible();
}

async function completeUnknownChlorineFluoridePhysicalGraph(page: Page) {
  await openScannerWithDemoImage(page);

  const atomMarkers = page.getByTestId('scanner-candidate-marker');
  const hydrogenMarkers = atomMarkers.filter({ hasText: 'H' });
  for (let index = 0; index < 3; index += 1) {
    await hydrogenMarkers.last().click();
    await page.getByTestId('scanner-delete-selected').click();
  }
  await expect(atomMarkers).toHaveCount(2);

  await atomMarkers.filter({ hasText: 'C' }).click();
  await page.getByTestId('scanner-selected-candidate-element').selectOption('Cl');
  await atomMarkers.filter({ hasText: 'H' }).click();
  await page.getByTestId('scanner-selected-candidate-element').selectOption('F');

  for (let index = 0; index < 2; index += 1) {
    await atomMarkers.nth(index).click();
    await page.getByTestId('scanner-confirm-selected').click();
  }
  await page.getByTestId('scanner-whole-model-checkbox').check();
  await page.getByTestId('scanner-complete-button').click();
  await page.getByTestId('scanner-start-bond-review').click();

  const bondMarkers = page.getByTestId('scanner-bond-marker');
  await expect(bondMarkers).toHaveCount(1);
  await bondMarkers.click();
  await page.getByTestId('scanner-confirm-selected-bond').click();
  await page.getByTestId('scanner-bond-whole-model-checkbox').check();
  await page.getByTestId('scanner-confirm-physical-graph').click();
  await expect(page.getByTestId('scanner-physical-graph-summary')).toBeVisible();
}

async function completeLoneCarbonPhysicalGraph(page: Page) {
  await openScannerWithDemoImage(page);

  const atomMarkers = page.getByTestId('scanner-candidate-marker');
  const hydrogenMarkers = atomMarkers.filter({ hasText: 'H' });
  for (let index = 0; index < 4; index += 1) {
    await hydrogenMarkers.last().click();
    await page.getByTestId('scanner-delete-selected').click();
  }
  await expect(atomMarkers).toHaveCount(1);
  await expect(atomMarkers).toHaveText('C');
  await atomMarkers.click();
  await page.getByTestId('scanner-confirm-selected').click();
  await page.getByTestId('scanner-whole-model-checkbox').check();
  await page.getByTestId('scanner-complete-button').click();
  await page.getByTestId('scanner-start-bond-review').click();

  await expect(page.getByTestId('scanner-bond-marker')).toHaveCount(0);
  await expect(page.getByTestId('graph-atom-count')).toHaveText('1');
  await expect(page.getByTestId('graph-bond-count')).toHaveText('0');
  await expect(page.getByTestId('graph-component-count')).toHaveText('1');
  await page.getByTestId('scanner-bond-whole-model-checkbox').check();
  await page.getByTestId('scanner-confirm-physical-graph').click();
  await expect(page.getByTestId('scanner-physical-graph-summary')).toBeVisible();
}

async function expectNoN5Outputs(page: Page) {
  await expect(page.getByTestId('viewer-3d')).toHaveCount(0);
  await expect(page.getByTestId('scanner-reference-viewer')).toHaveCount(0);
  await expect(page.getByTestId('distance-output')).toHaveCount(0);
  await expect(page.getByTestId('angle-output')).toHaveCount(0);
}

async function completeValidatedDemoMethane(page: Page) {
  await completeDemoMethanePhysicalGraph(page);
  await startChemistryValidation(page);
  await expect(page.getByTestId('scanner-validation-status')).toHaveAttribute(
    'data-validation-status',
    'valid',
  );
  await expect(page.getByTestId('scanner-formula-output')).toHaveText('CH4');
  await expect(page.getByTestId('scanner-identity-panel')).toHaveAttribute(
    'data-identity-status',
    'single',
  );
  await expect(page.getByTestId('scanner-n5-readiness')).toHaveAttribute('data-ready', 'true');
}

async function startScientificReference3D(page: Page) {
  const startReferenceButton = page.getByTestId('scanner-start-reference-3d');
  await expect(startReferenceButton).toBeVisible();
  await startReferenceButton.click();
  await expect(page.getByTestId('scanner-reference-3d-stage')).toBeVisible();
}

function referenceAtomButton(page: Page, atomIndex: number) {
  return page.locator(
    `[data-testid="scanner-reference-atom-button"][data-atom-index="${atomIndex}"]`,
  );
}

async function expectNoN6Outputs(page: Page) {
  await expect(page.getByTestId('scanner-comparison-stage')).toHaveCount(0);
  await expect(page.getByTestId('scanner-structure-coach')).toHaveCount(0);
}

async function completeDemoMethaneReferenceExploration(page: Page) {
  await completeValidatedDemoMethane(page);
  await startScientificReference3D(page);
  await expect(page.getByTestId('scanner-reference-load-status')).toHaveAttribute(
    'data-status',
    'success',
    { timeout: 90_000 },
  );
  await expect(page.getByTestId('scanner-reference-viewer')).toHaveAttribute(
    'data-model-rendered',
    'true',
    { timeout: 30_000 },
  );
  await expect(page.getByTestId('scanner-start-comparison')).toBeDisabled();
  await page.getByTestId('scanner-reference-rotate-left').click();
  await expect(page.getByTestId('scanner-start-comparison')).toBeEnabled();
  await page.getByTestId('scanner-reference-distance-mode').click();
  await referenceAtomButton(page, 1).click();
  await referenceAtomButton(page, 2).click();
  await expect(page.getByTestId('scanner-reference-distance-output')).toBeVisible();
}

async function startStructureComparison(page: Page) {
  const startComparisonButton = page.getByTestId('scanner-start-comparison');
  await expect(startComparisonButton).toBeVisible();
  await expect(startComparisonButton).toBeEnabled();
  await startComparisonButton.click();
  await expect(page.getByTestId('scanner-comparison-stage')).toBeVisible();
}

async function expectNoN7Outputs(page: Page) {
  await expect(page.getByTestId('scanner-classroom-qa-stage')).toHaveCount(0);
  await expect(page.getByTestId('scanner-start-classroom-qa')).toHaveCount(0);
}

async function expectTouchTargetAtLeast44(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, 'touch target must have a visible bounding box').not.toBeNull();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
}

test.describe('Physical molecule scanner atom candidates', () => {
  test('keeps five DEMO candidates editable and unconfirmed until human review', async ({ page }) => {
    await openScannerWithDemoImage(page);

    await expect(page.getByTestId('scanner-demo-badge')).toContainText('DEMO');
    const markers = page.getByTestId('scanner-candidate-marker');

    const carbonMarker = markers.filter({ hasText: 'C' });
    const carbonId = await carbonMarker.getAttribute('data-candidate-id');
    expect(carbonId).toBeTruthy();
    await carbonMarker.click();
    const elementSelect = page.getByTestId('scanner-selected-candidate-element');
    await expect(elementSelect).toHaveValue('C');
    await elementSelect.selectOption('N');
    await expect(elementSelect).toHaveValue('N');
    await expect(page.locator(`[data-candidate-id="${carbonId}"]`)).toHaveText('N');
    await elementSelect.selectOption('C');

    await page.getByTestId('scanner-add-button').click();
    await page.getByTestId('scanner-preview').click({ position: { x: 45, y: 45 } });
    await expect(markers).toHaveCount(6);
    await expect(page.getByTestId('scanner-candidate-editor')).toContainText('직접 추가 · 자동 신뢰도 없음');
    const firstManualId = await markers.last().getAttribute('data-candidate-id');

    await page.getByTestId('scanner-add-button').click();
    await page.getByTestId('scanner-preview').click({ position: { x: 90, y: 45 } });
    const secondManualId = await markers.last().getAttribute('data-candidate-id');
    expect(firstManualId).toBeTruthy();
    expect(secondManualId).toBeTruthy();
    await page.locator(`[data-candidate-id="${firstManualId}"]`).click();
    await page.getByTestId('scanner-delete-selected').click();
    await expect(markers).toHaveCount(6);

    await page.getByTestId('scanner-add-button').click();
    await page.getByTestId('scanner-preview').click({ position: { x: 135, y: 45 } });
    const markerIds = await markers.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-candidate-id')),
    );
    expect(new Set(markerIds).size).toBe(markerIds.length);
    await page.getByTestId('scanner-delete-selected').click();
    await page.locator(`[data-candidate-id="${secondManualId}"]`).click();
    await page.getByTestId('scanner-delete-selected').click();
    await expect(markers).toHaveCount(5);

    const completeButton = page.getByTestId('scanner-complete-button');
    await expect(page.getByTestId('scanner-confirmation-status')).toContainText('0/5');
    await expect(completeButton).toBeDisabled();

    for (let index = 0; index < 5; index += 1) {
      await markers.nth(index).click();
      await page.getByTestId('scanner-confirm-selected').click();
    }
    await expect(page.getByTestId('scanner-confirmation-status')).toContainText('5/5');
    await expect(completeButton).toBeDisabled();
    const wholeModelCheck = page.getByTestId('scanner-whole-model-check');
    const wholeModelCheckbox = page.getByTestId('scanner-whole-model-checkbox');
    await wholeModelCheckbox.check();
    await expect(completeButton).toBeEnabled();
    await completeButton.click();

    const summary = page.getByTestId('scanner-completion-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('아직 결합, 분자식, 분자 정체는 확인하지 않았습니다.');
    await expect(summary).toContainText('화학 구조 결과가 아닙니다.');

    await page.locator(`[data-candidate-id="${carbonId}"]`).click();
    await elementSelect.selectOption('N');
    await expect(summary).not.toBeVisible();
    await expect(page.getByTestId('scanner-confirmation-status')).toContainText('4/5');
    await expect(wholeModelCheckbox).not.toBeChecked();
    await expect(completeButton).toBeDisabled();

    await page.getByTestId('scanner-image-input').setInputFiles(DEMO_METHANE_IMAGE);
    await expect(page.getByTestId('scanner-confirmation-status')).toContainText('0/5');
    await expect(wholeModelCheckbox).not.toBeChecked();
  });

  test('recovers a partially occluded H2O through student correction and validation', async ({ page }) => {
    await openScannerWithPartiallyOccludedWater(page);
    await expect(page.getByTestId('scanner-confirmation-status')).toContainText('0/2');

    await addManualAtom(page, 'H', 0.62, 0.5);

    const atomMarkers = page.getByTestId('scanner-candidate-marker');
    await expect(atomMarkers).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      await atomMarkers.nth(index).click();
      await page.getByTestId('scanner-confirm-selected').click();
    }
    await page.getByTestId('scanner-whole-model-checkbox').check();
    await page.getByTestId('scanner-complete-button').click();
    await expect(page.getByTestId('scanner-completion-summary')).toContainText(
      '아직 결합, 분자식, 분자 정체는 확인하지 않았습니다.',
    );

    await page.getByTestId('scanner-start-bond-review').click();
    const bondMarkers = page.getByTestId('scanner-bond-marker');
    await expect(bondMarkers).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) {
      await bondMarkers.nth(index).click();
      await page.getByTestId('scanner-confirm-selected-bond').click();
    }
    await expect(page.getByTestId('graph-atom-count')).toHaveText('3');
    await expect(page.getByTestId('graph-bond-count')).toHaveText('2');
    await expect(page.getByTestId('graph-component-count')).toHaveText('1');
    await page.getByTestId('scanner-bond-whole-model-checkbox').check();
    await page.getByTestId('scanner-confirm-physical-graph').click();

    await startChemistryValidation(page);
    await expect(page.getByTestId('scanner-validation-status')).toHaveAttribute(
      'data-validation-status',
      'valid',
    );
    await expect(page.getByTestId('scanner-formula-output')).toHaveText('H2O');
    await expect(page.getByTestId('scanner-identity-panel')).toHaveAttribute(
      'data-identity-status',
      'single',
    );
  });

  test('has no horizontal overflow and keeps controls touch-sized at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openScannerWithDemoImage(page);

    await expect.poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-candidate-marker').first());
    await page.getByTestId('scanner-candidate-marker').first().click();
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-selected-candidate-element'));
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-confirm-selected'));
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-whole-model-check'));
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-complete-button'));
  });
});

test.describe('Physical molecule scanner bond confirmation', () => {
  test('builds a human-confirmed Physical Model graph without chemical inference', async ({ page }) => {
    await completeAtomReviewAndStartBondReview(page);

    const bondMarkers = page.getByTestId('scanner-bond-marker');
    await expect(bondMarkers).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      await expect(bondMarkers.nth(index)).toHaveAttribute('data-review-status', 'unconfirmed');
      await expect(bondMarkers.nth(index)).toHaveAttribute('data-line-style', 'dashed');
    }
    await expect(page.getByTestId('scanner-bond-confirmation-status')).toContainText('0/4');
    await expect(page.getByTestId('graph-atom-count')).toHaveText('5');
    await expect(page.getByTestId('graph-bond-count')).toHaveText('0');
    await expect(page.getByTestId('graph-component-count')).toHaveText('5');
    await expect(page.getByTestId('graph-isolated-count')).toHaveText('5');
    await expect(page.getByTestId('scanner-confirm-physical-graph')).toBeDisabled();

    const wrongBond = bondMarkers.first();
    const wrongBondId = await wrongBond.getAttribute('data-bond-id');
    const fromAtomId = await wrongBond.getAttribute('data-from-atom-id');
    const toAtomId = await wrongBond.getAttribute('data-to-atom-id');
    expect(wrongBondId).toBeTruthy();
    expect(fromAtomId).toBeTruthy();
    expect(toAtomId).toBeTruthy();
    await wrongBond.click();
    await page.getByTestId('scanner-delete-selected-bond').click();
    await expect(bondMarkers).toHaveCount(3);
    await expect(page.locator(`[data-bond-id="${wrongBondId}"]`)).toHaveCount(0);

    await page.getByTestId('scanner-add-bond-button').click();
    await page.locator(`[data-candidate-id="${fromAtomId}"]`).click();
    await page.locator(`[data-candidate-id="${toAtomId}"]`).click();
    await expect(bondMarkers).toHaveCount(4);

    const replacementBond = bondMarkers.last();
    await replacementBond.click();
    const replacementBondId = await replacementBond.getAttribute('data-bond-id');
    expect(replacementBondId).toBeTruthy();
    expect(replacementBondId).toBe(wrongBondId);
    const orderSelect = page.getByTestId('scanner-selected-bond-order');
    await orderSelect.selectOption('2');
    await expect(replacementBond).toHaveAttribute('data-bond-order', '2');
    await expect(replacementBond).toHaveAttribute('data-review-status', 'unconfirmed');
    await expect(page.getByTestId('graph-bond-count')).toHaveText('0');
    await orderSelect.selectOption('1');

    for (let index = 0; index < 4; index += 1) {
      await bondMarkers.nth(index).click();
      await page.getByTestId('scanner-confirm-selected-bond').click();
    }
    await expect(page.getByTestId('scanner-bond-confirmation-status')).toContainText('4/4');
    await expect(page.getByTestId('graph-atom-count')).toHaveText('5');
    await expect(page.getByTestId('graph-bond-count')).toHaveText('4');
    await expect(page.getByTestId('graph-component-count')).toHaveText('1');
    await expect(page.getByTestId('graph-isolated-count')).toHaveText('0');

    const disconnectingBond = bondMarkers.first();
    const disconnectedFromAtomId = await disconnectingBond.getAttribute('data-from-atom-id');
    const disconnectedToAtomId = await disconnectingBond.getAttribute('data-to-atom-id');
    expect(disconnectedFromAtomId).toBeTruthy();
    expect(disconnectedToAtomId).toBeTruthy();
    await disconnectingBond.click();
    await page.getByTestId('scanner-delete-selected-bond').click();
    await expect(page.getByTestId('graph-bond-count')).toHaveText('3');
    await expect(page.getByTestId('graph-component-count')).toHaveText('2');
    await expect(page.getByTestId('graph-isolated-count')).toHaveText('1');
    await expect(page.getByTestId('scanner-connectivity-status')).toContainText(
      '현재 구조가 2개의 조각으로 나뉘어 있습니다.',
    );
    await expect(page.getByTestId('scanner-confirm-physical-graph')).toBeDisabled();

    await page.getByTestId('scanner-add-bond-button').click();
    await page.locator(`[data-candidate-id="${disconnectedFromAtomId}"]`).click();
    await page.locator(`[data-candidate-id="${disconnectedToAtomId}"]`).click();
    await bondMarkers.last().click();
    await page.getByTestId('scanner-confirm-selected-bond').click();
    await expect(page.getByTestId('graph-atom-count')).toHaveText('5');
    await expect(page.getByTestId('graph-bond-count')).toHaveText('4');
    await expect(page.getByTestId('graph-component-count')).toHaveText('1');
    await expect(page.getByTestId('graph-isolated-count')).toHaveText('0');

    const confirmGraphButton = page.getByTestId('scanner-confirm-physical-graph');
    const wholeModelCheckbox = page.getByTestId('scanner-bond-whole-model-checkbox');
    await expect(wholeModelCheckbox).not.toBeChecked();
    await expect(confirmGraphButton).toBeDisabled();
    await wholeModelCheckbox.check();
    await expect(confirmGraphButton).toBeEnabled();
    await confirmGraphButton.click();

    const graphSummary = page.getByTestId('scanner-physical-graph-summary');
    await expect(graphSummary).toBeVisible();
    await expect(graphSummary).toContainText('학생이 확인한 모형 연결 기록');
    await expect(graphSummary).toContainText('원자 5개');
    await expect(graphSummary).toContainText('결합 4개');
    await expect(graphSummary).toContainText('연결 조각 1개');
    await expect(graphSummary).toHaveAttribute('data-graph-revision', /\S+/);
    await expect(graphSummary).not.toContainText(/분자식|분자 정체|RDKit|Å/);
    await expect(page.getByTestId('formula-output')).toHaveCount(0);
    await expect(page.getByTestId('molecule-identity-output')).toHaveCount(0);

    const completedRevision = await graphSummary.getAttribute('data-graph-revision');
    expect(completedRevision).toBeTruthy();
    await page.getByTestId('scanner-back-to-atoms').click();
    await expect(page.getByTestId('scanner-candidate-marker')).toHaveCount(5);
    await page.getByTestId('scanner-start-bond-review').click();
    await expect(page.getByTestId('scanner-bond-confirmation-status')).toContainText('4/4');
    await expect(graphSummary).toBeVisible();
    await expect(graphSummary).toHaveAttribute('data-graph-revision', completedRevision ?? '');

    await bondMarkers.first().click();
    await page.getByTestId('scanner-selected-bond-order').selectOption('2');
    await expect(graphSummary).not.toBeVisible();
    await expect(wholeModelCheckbox).not.toBeChecked();
    await expect(confirmGraphButton).toBeDisabled();
    await expect(page.getByTestId('graph-bond-count')).toHaveText('3');

    await page.getByTestId('scanner-image-input').setInputFiles(DEMO_METHANE_IMAGE);
    await expect(page.getByTestId('scanner-bond-review')).not.toBeVisible();
    await expect(page.getByTestId('scanner-candidate-marker')).toHaveCount(5);
    await expect(page.getByTestId('scanner-confirmation-status')).toContainText('0/5');
  });

  test('discards a confirmed graph when an upstream atom changes', async ({ page }) => {
    await completeAtomReviewAndStartBondReview(page);

    const bondMarkers = page.getByTestId('scanner-bond-marker');
    for (let index = 0; index < 4; index += 1) {
      await bondMarkers.nth(index).click();
      await page.getByTestId('scanner-confirm-selected-bond').click();
    }
    await page.getByTestId('scanner-bond-whole-model-checkbox').check();
    await page.getByTestId('scanner-confirm-physical-graph').click();
    await expect(page.getByTestId('scanner-physical-graph-summary')).toBeVisible();

    await page.getByTestId('scanner-back-to-atoms').click();
    await page.getByTestId('scanner-candidate-marker').filter({ hasText: 'C' }).click();
    await page.getByTestId('scanner-selected-candidate-element').selectOption('N');

    await expect(page.getByTestId('scanner-physical-graph-summary')).toHaveCount(0);
    await expect(page.getByTestId('scanner-bond-review')).toHaveCount(0);
    await expect(page.getByTestId('scanner-start-bond-review')).toHaveCount(0);
    await expect(page.getByTestId('scanner-confirmation-status')).toContainText('4/5');
  });

  test('keeps N3 graph controls usable at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await completeAtomReviewAndStartBondReview(page);

    await expect.poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    const firstBond = page.getByTestId('scanner-bond-marker').first();
    await expectTouchTargetAtLeast44(firstBond);
    await firstBond.click();
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-selected-bond-order'));
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-confirm-selected-bond'));
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-delete-selected-bond'));
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-add-bond-button'));
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-bond-whole-model-check'));
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-confirm-physical-graph'));
  });
});

test.describe('Physical molecule scanner chemistry validation', () => {
  test('validates confirmed DEMO methane before presenting a limited-library identity', async ({ page }) => {
    await completeDemoMethanePhysicalGraph(page);
    await startChemistryValidation(page);

    const validationStage = page.getByTestId('scanner-validation-stage');
    await expect(validationStage).toContainText('4/6 구조 확인');
    await expect(page.getByTestId('scanner-validation-connectivity')).toContainText('연결 조각 1개');
    await expect(page.getByTestId('scanner-validation-status')).toHaveAttribute('data-validation-status', 'valid');
    await expect(page.getByTestId('scanner-validation-badge')).toContainText('구조 검증 완료');
    await expect(page.getByTestId('scanner-formula-output')).toHaveText('CH4');
    const identity = page.getByTestId('scanner-identity-panel');
    await expect(identity).toHaveAttribute('data-identity-status', 'single');
    await expect(identity).toContainText(/메테인|methane/i);
    await expect(page.getByTestId('scanner-physical-model-panel')).toContainText('원자 5개');
    await expect(page.getByTestId('scanner-reference-preparation')).toBeVisible();
    await expect(validationStage).not.toContainText(/SMILES|Molfile|RDKit/);
    await expect(page.getByTestId('scanner-n5-readiness')).toHaveAttribute('data-ready', 'true');
    await expectNoN5Outputs(page);
  });

  test('blocks an invalid CH4 bond order with student guidance and a route back to bonds', async ({ page }) => {
    await completeDemoMethanePhysicalGraph(page, { makeFirstBondDouble: true });
    await startChemistryValidation(page);

    const validationStatus = page.getByTestId('scanner-validation-status');
    await expect(validationStatus).toHaveAttribute('data-validation-status', 'invalid');
    await expect(validationStatus).toContainText(/구조.*확인|검증.*실패/);
    const issues = page.getByTestId('scanner-validation-issues');
    await expect(issues).toContainText(/수소|탄소/);
    await expect(issues).toContainText(/결합.*차수|원자가/);
    await expect(page.getByTestId('scanner-formula-output')).toHaveCount(0);
    await expect(page.getByTestId('scanner-identity-panel')).toHaveCount(0);
    await expect(page.getByTestId('scanner-n5-readiness')).toHaveAttribute('data-ready', 'false');
    await expectNoN5Outputs(page);

    await page.getByTestId('scanner-return-to-bonds').click();
    await expect(page.getByTestId('scanner-validation-stage')).not.toBeVisible();
    await expect(page.getByTestId('scanner-bond-review')).toBeVisible();
    await expect(page.getByTestId('scanner-bond-marker').first()).toHaveAttribute('data-bond-order', '2');
  });

  test('keeps a valid structure unknown when the limited identity library has no match', async ({ page }) => {
    await completeUnknownChlorineFluoridePhysicalGraph(page);
    await startChemistryValidation(page);

    await expect(page.getByTestId('scanner-validation-status')).toHaveAttribute('data-validation-status', 'valid');
    await expect(page.getByTestId('scanner-formula-output')).toHaveText('ClF');
    const identity = page.getByTestId('scanner-identity-panel');
    await expect(identity).toHaveAttribute('data-identity-status', 'unknown');
    await expect(identity).toContainText('제한된 분자 목록에서 일치하는 이름을 찾지 못했습니다.');
    await expect(identity).not.toContainText(/메테인|methane|물|암모니아/i);
    await expect(page.getByTestId('scanner-n5-readiness')).toHaveAttribute('data-ready', 'false');
    await expectNoN5Outputs(page);
  });

  test('fails closed for a connected lone carbon with unsatisfied valence', async ({ page }) => {
    await completeLoneCarbonPhysicalGraph(page);
    await startChemistryValidation(page);

    await expect(page.getByTestId('scanner-validation-status')).toHaveAttribute(
      'data-validation-status',
      'invalid',
    );
    await expect(page.getByTestId('scanner-validation-issues')).toContainText(/탄소|원자가|결합/);
    await expect(page.getByTestId('scanner-formula-output')).toHaveCount(0);
    await expect(page.getByTestId('scanner-identity-panel')).toHaveCount(0);
    await expect(page.getByTestId('scanner-n5-readiness')).toHaveAttribute('data-ready', 'false');
    await expect(page.getByTestId('scanner-return-to-bonds')).toBeVisible();
    await expectNoN5Outputs(page);
  });

  test('immediately invalidates validation results after an N3 bond mutation', async ({ page }) => {
    await completeDemoMethanePhysicalGraph(page);
    await startChemistryValidation(page);
    await expect(page.getByTestId('scanner-formula-output')).toHaveText('CH4');
    await expect(page.getByTestId('scanner-identity-panel')).toHaveAttribute(
      'data-identity-status',
      'single',
    );

    await page.getByTestId('scanner-return-to-bonds').click();
    await page.getByTestId('scanner-bond-marker').first().click();
    await page.getByTestId('scanner-selected-bond-order').selectOption('2');

    await expect(page.getByTestId('scanner-validation-stage')).toHaveCount(0);
    await expect(page.getByTestId('scanner-formula-output')).toHaveCount(0);
    await expect(page.getByTestId('scanner-identity-panel')).toHaveCount(0);
    await expect(page.getByTestId('scanner-start-chemistry-validation')).toHaveCount(0);
    await expect(page.getByTestId('scanner-n5-readiness')).toHaveCount(0);
    await expect(page.getByTestId('graph-bond-count')).toHaveText('3');
  });

  test('keeps N4 results and actions usable at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await completeDemoMethanePhysicalGraph(page);
    await startChemistryValidation(page);

    await expect.poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-return-to-bonds'));
    await expect(page.getByTestId('scanner-n5-readiness')).toHaveAttribute('data-ready', 'true');
    await expectNoN5Outputs(page);
  });
});

test.describe('Physical molecule scanner Scientific Reference 3D', () => {
  test('loads a verified PubChem methane SDF and measures only Reference coordinates', async ({ page }) => {
    let sdfRequestCount = 0;
    await page.route(METHANE_PUBCHEM_3D_ENDPOINT, async (route) => {
      expect(route.request().method()).toBe('GET');
      sdfRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'chemical/x-mdl-sdfile',
        body: METHANE_3D_SDF,
      });
    });

    await completeValidatedDemoMethane(page);
    await startScientificReference3D(page);

    const stage = page.getByTestId('scanner-reference-3d-stage');
    await expect(stage).toContainText('5/6 과학적 Reference 3D');
    const loadStatus = page.getByTestId('scanner-reference-load-status');
    await expect(loadStatus).toHaveAttribute('data-status', 'success', { timeout: 90_000 });
    await expect.poll(() => sdfRequestCount).toBe(1);

    const source = page.getByTestId('scanner-reference-source');
    await expect(source).toHaveAttribute('data-source-category', 'external-database');
    await expect(source).toContainText('Scientific Reference');
    await expect(source).toContainText('PubChem CID 297');
    await expect(source).toContainText(/현재.*구조.*일치|구조.*검증.*일치/);

    const viewer = page.getByTestId('scanner-reference-viewer');
    await expect(viewer).toHaveAttribute('data-model-rendered', 'true', { timeout: 30_000 });
    await page.getByTestId('scanner-reference-rotate-left').click();
    await expect(page.getByTestId('scanner-reference-camera-status')).toContainText('회전');
    await page.getByTestId('scanner-reference-zoom-in').click();
    await expect(page.getByTestId('scanner-reference-camera-status')).toContainText('확대');
    await expect(page.getByTestId('scanner-reference-zoom-out')).toBeEnabled();
    await expect(page.getByTestId('scanner-reference-reset-view')).toBeEnabled();

    await page.getByTestId('scanner-reference-distance-mode').click();
    await referenceAtomButton(page, 1).click();
    await referenceAtomButton(page, 2).click();
    const distance = page.getByTestId('scanner-reference-distance-output');
    await expect(distance).toContainText(/1\.09\s*Å/);
    await expect(distance).toHaveAttribute('data-evidence-type', 'reference-coordinate');

    await page.getByTestId('scanner-reference-angle-mode').click();
    await referenceAtomButton(page, 2).click();
    await referenceAtomButton(page, 1).click();
    await referenceAtomButton(page, 3).click();
    const angle = page.getByTestId('scanner-reference-angle-output');
    await expect(angle).toContainText(/109\.5°/);
    await expect(angle).toHaveAttribute('data-evidence-type', 'reference-coordinate');

    const evidence = page.getByTestId('scanner-reference-measurement-evidence');
    await expect(evidence).toContainText('Reference 좌표에서 계산한 값');
    await expect(evidence).toContainText(/실험값이 아닙니다|실험 측정값이 아닙니다/);
    await expect(stage).not.toContainText(/Physical Model[^\n]*\d+(?:\.\d+)?\s*Å/);
    await expect(page.getByTestId('scanner-physical-distance-output')).toHaveCount(0);
    await expect(page.getByTestId('scanner-stick-length-output')).toHaveCount(0);
    await expectNoN6Outputs(page);
  });

  test('keeps camera evidence and N6 blocked until the current Reference model is rendered', async ({ page }) => {
    await page.route(METHANE_PUBCHEM_3D_ENDPOINT, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'chemical/x-mdl-sdfile',
        body: METHANE_3D_SDF,
      });
    });
    await page.addStyleTag({
      content: `
        [data-testid="scanner-reference-viewer"] [data-testid="viewer-3d"] {
          width: 0 !important;
          height: 0 !important;
          min-height: 0 !important;
        }
      `,
    });

    await completeValidatedDemoMethane(page);
    await startScientificReference3D(page);
    await expect(page.getByTestId('scanner-reference-load-status')).toHaveAttribute(
      'data-status',
      'success',
      { timeout: 90_000 },
    );

    await expect(page.getByTestId('scanner-reference-viewer')).toHaveAttribute(
      'data-model-rendered',
      'false',
    );
    await expect(page.getByTestId('scanner-reference-rotate-left')).toBeDisabled();
    await expect(page.getByTestId('scanner-reference-zoom-in')).toBeDisabled();
    await expect(page.getByTestId('scanner-reference-zoom-out')).toBeDisabled();
    await expect(page.getByTestId('scanner-reference-reset-view')).toBeDisabled();
    await expect(page.getByTestId('scanner-start-comparison')).toBeDisabled();
    await expect(page.locator('[data-confirmed-reference-revision]')).toHaveAttribute(
      'data-confirmed-reference-revision',
      '',
    );
    await expectNoN6Outputs(page);
  });

  test('shows a recoverable load failure and succeeds on explicit retry', async ({ page }) => {
    let sdfRequestCount = 0;
    await page.route(METHANE_PUBCHEM_3D_ENDPOINT, async (route) => {
      expect(route.request().method()).toBe('GET');
      sdfRequestCount += 1;
      if (sdfRequestCount === 1) {
        await route.fulfill({ status: 503, contentType: 'text/plain', body: 'temporary outage' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'chemical/x-mdl-sdfile',
        body: METHANE_3D_SDF,
      });
    });

    await completeValidatedDemoMethane(page);
    await startScientificReference3D(page);

    const loadStatus = page.getByTestId('scanner-reference-load-status');
    await expect(loadStatus).toHaveAttribute('data-status', 'error', { timeout: 90_000 });
    await expect(loadStatus).toContainText(/불러오지 못|다시 시도/);
    await expect(page.getByTestId('scanner-reference-viewer')).toHaveAttribute(
      'data-model-rendered',
      'false',
    );
    await expect(page.getByTestId('scanner-reference-retry')).toBeEnabled();
    await page.getByTestId('scanner-reference-retry').click();
    await expect(loadStatus).toHaveAttribute('data-status', 'success', { timeout: 90_000 });
    await expect.poll(() => sdfRequestCount).toBe(2);
    await expect(page.getByTestId('scanner-reference-viewer')).toHaveAttribute(
      'data-model-rendered',
      'true',
      { timeout: 30_000 },
    );
    await expectNoN6Outputs(page);
  });

  test('discards stale Reference data immediately after an N3 mutation', async ({ page }) => {
    await page.route(METHANE_PUBCHEM_3D_ENDPOINT, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'chemical/x-mdl-sdfile',
        body: METHANE_3D_SDF,
      });
    });

    await completeValidatedDemoMethane(page);
    await startScientificReference3D(page);
    await expect(page.getByTestId('scanner-reference-load-status')).toHaveAttribute(
      'data-status',
      'success',
      { timeout: 90_000 },
    );
    await expect(page.getByTestId('scanner-reference-viewer')).toHaveAttribute(
      'data-model-rendered',
      'true',
      { timeout: 30_000 },
    );

    await page.getByTestId('scanner-return-to-validation').click();
    await expect(page.getByTestId('scanner-validation-stage')).toBeVisible();
    await page.getByTestId('scanner-return-to-bonds').click();
    await page.getByTestId('scanner-bond-marker').first().click();
    await page.getByTestId('scanner-selected-bond-order').selectOption('2');

    await expect(page.getByTestId('scanner-reference-3d-stage')).toHaveCount(0);
    await expect(page.getByTestId('scanner-reference-viewer')).toHaveCount(0);
    await expect(page.getByTestId('scanner-reference-source')).toHaveCount(0);
    await expect(page.getByTestId('scanner-validation-stage')).toHaveCount(0);
    await expect(page.getByTestId('scanner-formula-output')).toHaveCount(0);
    await expect(page.getByTestId('scanner-start-reference-3d')).toHaveCount(0);
    await expectNoN6Outputs(page);
  });

  test('keeps N5 viewer and app-owned controls usable at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route(METHANE_PUBCHEM_3D_ENDPOINT, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'chemical/x-mdl-sdfile',
        body: METHANE_3D_SDF,
      });
    });

    await completeValidatedDemoMethane(page);
    await startScientificReference3D(page);
    await expect(page.getByTestId('scanner-reference-load-status')).toHaveAttribute(
      'data-status',
      'success',
      { timeout: 90_000 },
    );

    await expect.poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-return-to-validation'));
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-reference-rotate-left'));
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-reference-zoom-in'));
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-reference-zoom-out'));
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-reference-reset-view'));
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-reference-distance-mode'));
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-reference-angle-mode'));
    await expectTouchTargetAtLeast44(referenceAtomButton(page, 1));
    await expectNoN6Outputs(page);
  });
});

test.describe('Physical molecule scanner model comparison and Structure Coach', () => {
  test('distinguishes Physical and Reference evidence before saving a revised explanation', async ({ page }) => {
    await page.route(METHANE_PUBCHEM_3D_ENDPOINT, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'chemical/x-mdl-sdfile',
        body: METHANE_3D_SDF,
      });
    });

    await completeDemoMethaneReferenceExploration(page);
    await startStructureComparison(page);

    const stage = page.getByTestId('scanner-comparison-stage');
    await expect(stage).toContainText('6/6 구조 비교');
    const physicalPanel = page.getByTestId('scanner-comparison-physical-panel');
    const referencePanel = page.getByTestId('scanner-comparison-reference-panel');
    await expect(physicalPanel).toBeVisible();
    await expect(referencePanel).toBeVisible();
    await expect(physicalPanel).toHaveAttribute('data-source', 'physical-model');
    await expect(referencePanel).toHaveAttribute('data-source', 'scientific-reference');
    await expect(physicalPanel).toContainText(/내가 확인한 모형|Physical Model/);
    await expect(physicalPanel).toContainText('원자 5개');
    await expect(physicalPanel).toContainText('결합 4개');
    await expect(referencePanel).toContainText(/Scientific Reference|과학적 Reference/);
    await expect(referencePanel).toContainText('PubChem CID 297');
    await expect(referencePanel).toContainText(/Reference 좌표|참고 좌표/);
    await expect(physicalPanel).not.toContainText(/\d+(?:\.\d+)?\s*Å/);
    await expect(page.getByTestId('scanner-comparison-physical-distance-output')).toHaveCount(0);
    await expect(page.getByTestId('scanner-comparison-stick-length-output')).toHaveCount(0);

    const coach = page.getByTestId('scanner-structure-coach');
    await expect(coach).toContainText(
      '중심 탄소 주위 네 결합 방향이 서로 가능한 한 멀리 떨어져 있는지 살펴보세요.',
    );
    await expect(coach).not.toContainText(/정답은|정답 보기/);

    const sameInput = page.getByTestId('scanner-same-observation-input');
    const differentInput = page.getByTestId('scanner-different-observation-input');
    const revisedInput = page.getByTestId('scanner-revised-explanation-input');
    const completeButton = page.getByTestId('scanner-comparison-complete');
    await expect(completeButton).toBeDisabled();
    await sameInput.fill('원자 5개와 탄소-수소 결합 4개가 같다.');
    await expect(completeButton).toBeDisabled();
    await differentInput.fill('사진에서는 평면처럼 보이지만 Reference에서는 네 결합 방향이 입체적으로 벌어진다.');
    await expect(completeButton).toBeDisabled();
    await revisedInput.fill('사진 시점과 모형 제약 때문에 평면처럼 보였고, 연결은 같지만 공간 배치는 정사면체 방향으로 이해해야 한다.');
    await expect(completeButton).toBeEnabled();
    await completeButton.click();

    const completion = page.getByTestId('scanner-comparison-completion');
    await expect(completion).toBeVisible();
    await expect(completion).toContainText('원자 5개와 탄소-수소 결합 4개가 같다.');
    await expect(completion).toContainText('사진에서는 평면처럼 보이지만');
    await expect(completion).toContainText('정사면체 방향으로 이해해야 한다.');
    await expect(completion).toContainText(/설명.*저장|관찰.*기록/);
    await expectNoN7Outputs(page);
  });

  test('returns to N5 or bonds and invalidates N6 immediately after a bond mutation', async ({ page }) => {
    await page.route(METHANE_PUBCHEM_3D_ENDPOINT, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'chemical/x-mdl-sdfile',
        body: METHANE_3D_SDF,
      });
    });

    await completeDemoMethaneReferenceExploration(page);
    await startStructureComparison(page);
    await page.getByTestId('scanner-same-observation-input').fill('원자 수와 연결 관계가 같다.');
    await page.getByTestId('scanner-different-observation-input').fill('사진과 Reference의 공간 방향이 다르게 보인다.');
    await page.getByTestId('scanner-revised-explanation-input').fill('사진 시점과 좌표 출처를 구분해 공간 배치를 설명한다.');
    await page.getByTestId('scanner-comparison-complete').click();
    await expect(page.getByTestId('scanner-comparison-completion')).toBeVisible();

    await page.getByTestId('scanner-comparison-return-to-reference').click();
    await expect(page.getByTestId('scanner-reference-3d-stage')).toBeVisible();
    await startStructureComparison(page);
    await expect(page.getByTestId('scanner-comparison-stage')).toBeVisible();
    await expect(page.getByTestId('scanner-comparison-completion')).toBeVisible();
    await expect(page.getByTestId('scanner-same-observation-input')).toHaveValue(
      '원자 수와 연결 관계가 같다.',
    );
    await page.getByTestId('scanner-comparison-return-to-bonds').click();
    await expect(page.getByTestId('scanner-bond-review')).toBeVisible();

    await page.getByTestId('scanner-bond-marker').first().click();
    await page.getByTestId('scanner-selected-bond-order').selectOption('2');
    await expect(page.getByTestId('graph-bond-count')).toHaveText('3');
    await expect(page.getByTestId('scanner-comparison-stage')).toHaveCount(0);
    await expect(page.getByTestId('scanner-comparison-completion')).toHaveCount(0);
    await expect(page.getByTestId('scanner-same-observation-input')).toHaveCount(0);
    await expect(page.getByTestId('scanner-reference-3d-stage')).toHaveCount(0);
    await expect(page.getByTestId('scanner-validation-stage')).toHaveCount(0);
    await expect(page.getByTestId('scanner-start-comparison')).toHaveCount(0);
    await expectNoN7Outputs(page);
  });

  test('uses a single source-labelled panel switch at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route(METHANE_PUBCHEM_3D_ENDPOINT, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'chemical/x-mdl-sdfile',
        body: METHANE_3D_SDF,
      });
    });

    await completeDemoMethaneReferenceExploration(page);
    await startStructureComparison(page);

    await expect.poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await expect(page.getByTestId('scanner-comparison-view-toggle')).toBeVisible();
    const showPhysical = page.getByTestId('scanner-show-physical');
    const showReference = page.getByTestId('scanner-show-reference');
    const activeSource = page.getByTestId('scanner-comparison-active-source');
    await expect(showPhysical).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('scanner-comparison-physical-panel')).toBeVisible();
    await expect(page.getByTestId('scanner-comparison-reference-panel')).not.toBeVisible();
    await expect(activeSource).toContainText(/Physical Model|내가 확인한 모형/);

    await showReference.click();
    await expect(showReference).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('scanner-comparison-reference-panel')).toBeVisible();
    await expect(page.getByTestId('scanner-comparison-physical-panel')).not.toBeVisible();
    await expect(activeSource).toContainText(/Scientific Reference|과학적 Reference/);
    await expect(activeSource).toBeVisible();

    await expectTouchTargetAtLeast44(showPhysical);
    await expectTouchTargetAtLeast44(showReference);
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-comparison-return-to-reference'));
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-comparison-return-to-bonds'));
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-same-observation-input'));
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-different-observation-input'));
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-revised-explanation-input'));
    await expectTouchTargetAtLeast44(page.getByTestId('scanner-comparison-complete'));
    await expectNoN7Outputs(page);
  });
});
