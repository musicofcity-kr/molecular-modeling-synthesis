import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  E2E_CLASS_CODE,
  E2E_JOIN_CODE,
  mockClassroomApis,
} from './fixtures';

type CanvasPoint = {
  x: number;
  y: number;
};

type ChainGesture = {
  start: CanvasPoint;
  end: CanvasPoint;
};

const KETCHER_VERSION_UNDER_TEST = '3.15.0';
const CHAIN_LENGTH_PX = 120;
const MOBILE_CHAIN_LENGTH_PX = 90;
const DEFAULT_BOND_LENGTH_PX = 40;

function visibleKetcherControl(editor: Locator, testId: string): Locator {
  // Ketcher may keep responsive toolbar variants in the DOM. Keep all
  // version-pinned editor-internal selectors isolated in this helper.
  return editor.locator(`[data-testid="${testId}"]:visible`).last();
}

async function enterStudentWorkbench(
  page: Page,
  activityTemplateIds?: string[],
) {
  await mockClassroomApis(page);
  if (activityTemplateIds) {
    await page.route('**/api/join-classroom', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          status: 'joined',
          classCode: E2E_CLASS_CODE,
          activityTemplateIds,
          studentMessage:
            '수업코드 확인이 완료되었습니다. 활동 결과를 서버 제출함에 보낼 수 있습니다.',
          developerMessage:
            'Direct construction E2E joinClassroom mock joined.',
        }),
      });
    });
  }
  await page.goto('/');
  await page.getByTestId('ethics-guide-confirm-checkbox').check();
  await page.getByTestId('ethics-guide-start-button').click();
  await page.getByTestId('open-student-entry-button').click();
  await page.getByTestId('student-class-code-input').fill(E2E_CLASS_CODE);
  await page.getByTestId('student-join-code-input').fill(E2E_JOIN_CODE);
  await page.getByTestId('student-nickname-input').fill('직접그리기-QA');
  await page.getByTestId('student-entry-submit-button').click();
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page).toHaveURL(/\/student\/workbench$/);

  const mobileDrawingStep = page.getByTestId('mobile-learning-step-2');
  if (await mobileDrawingStep.isVisible()) {
    await mobileDrawingStep.tap();
  }

  await expect(page.getByTestId('chemical-editor-status')).toHaveAttribute(
    'data-ready',
    'true',
    { timeout: 90_000 },
  );
}

async function getCanvas(page: Page): Promise<{
  canvas: Locator;
  box: NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>;
}> {
  const canvas = page
    .getByTestId('chemical-editor')
    .getByTestId('canvas');

  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();

  expect(
    box,
    `Ketcher ${KETCHER_VERSION_UNDER_TEST} canvas must have a bounding box`,
  ).not.toBeNull();

  if (!box) {
    throw new Error('Ketcher canvas bounding box is unavailable.');
  }

  return { canvas, box };
}

function getChainStart(box: {
  width: number;
  height: number;
}): CanvasPoint {
  const x = Math.min(
    Math.max(box.width * 0.3, 60),
    box.width - CHAIN_LENGTH_PX - 20,
  );

  return {
    x,
    y: Math.min(Math.max(box.height * 0.52, 80), box.height - 80),
  };
}

async function selectKetcherTool(
  page: Page,
  testId: 'C-button' | 'H-button' | 'bonds' | 'chain',
  inputMethod: 'mouse' | 'touch' = 'mouse',
) {
  const editor = page.getByTestId('chemical-editor');
  const control = visibleKetcherControl(editor, testId);

  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();

  if (inputMethod === 'touch') {
    await control.tap();
  } else {
    await control.click();
  }
}

async function placeCarbon(
  page: Page,
  point: CanvasPoint,
  inputMethod: 'mouse' | 'touch' = 'mouse',
) {
  const { canvas } = await getCanvas(page);
  await selectKetcherTool(page, 'C-button', inputMethod);

  if (inputMethod === 'touch') {
    await canvas.tap({ position: point });
  } else {
    await canvas.click({ position: point });
  }
}

async function drawExplicitHydrogenMethaneWithMouse(page: Page) {
  const { canvas, box } = await getCanvas(page);
  const center = {
    x: box.width * 0.5,
    y: box.height * 0.5,
  };
  const hydrogens = [
    { x: center.x - 80, y: center.y },
    { x: center.x + 80, y: center.y },
    { x: center.x, y: center.y - 80 },
    { x: center.x, y: center.y + 80 },
  ];

  await selectKetcherTool(page, 'C-button');
  await canvas.click({ position: center });
  await selectKetcherTool(page, 'H-button');

  for (const hydrogen of hydrogens) {
    await canvas.click({ position: hydrogen });
  }

  await selectKetcherTool(page, 'bonds');

  for (const hydrogen of hydrogens) {
    await page.mouse.move(box.x + center.x, box.y + center.y);
    await page.mouse.down();
    await page.mouse.move(box.x + hydrogen.x, box.y + hydrogen.y, {
      steps: 8,
    });
    await page.mouse.up();
  }
}

async function drawLinearCarbonChainWithMouse(
  page: Page,
): Promise<ChainGesture> {
  const { box } = await getCanvas(page);
  const start = getChainStart(box);
  const end = {
    x: start.x + CHAIN_LENGTH_PX,
    y: start.y,
  };

  await selectKetcherTool(page, 'chain');
  await page.mouse.move(box.x + start.x, box.y + start.y);
  await page.mouse.down();
  await page.mouse.move(box.x + end.x, box.y + end.y, { steps: 12 });
  await page.mouse.up();

  return { start, end };
}

async function drawLinearCarbonChainWithTouch(
  page: Page,
): Promise<ChainGesture> {
  const { canvas, box } = await getCanvas(page);
  const start = getChainStart(box);
  const end = {
    // Ketcher's responsive canvas uses a shorter CSS-pixel bond pitch at
    // 390 px. Three 30 px pitches produce the same four-carbon chain.
    x: start.x + MOBILE_CHAIN_LENGTH_PX,
    y: start.y,
  };

  await canvas.evaluate((element) => {
    element.setAttribute('data-direct-touch-start-count', '0');
    element.setAttribute('data-direct-touch-move-count', '0');
    element.setAttribute('data-direct-touch-end-count', '0');

    const increment = (attributeName: string) => {
      const current = Number(element.getAttribute(attributeName) ?? '0');
      element.setAttribute(attributeName, String(current + 1));
    };

    element.addEventListener(
      'touchstart',
      () => increment('data-direct-touch-start-count'),
      { capture: true },
    );
    element.addEventListener(
      'touchmove',
      () => increment('data-direct-touch-move-count'),
      { capture: true },
    );
    element.addEventListener(
      'touchend',
      () => increment('data-direct-touch-end-count'),
      { capture: true },
    );
  });

  await selectKetcherTool(page, 'chain', 'touch');
  const session = await page.context().newCDPSession(page);
  const makeTouchPoint = (point: CanvasPoint) => ({
    x: box.x + point.x,
    y: box.y + point.y,
    id: 1,
    radiusX: 2,
    radiusY: 2,
    force: 1,
  });

  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [makeTouchPoint(start)],
    });

    for (let step = 1; step <= 12; step += 1) {
      const progress = step / 12;
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          makeTouchPoint({
            x: start.x + (end.x - start.x) * progress,
            y: start.y,
          }),
        ],
      });
    }

    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }

  await expect(canvas).toHaveAttribute('data-direct-touch-start-count', '1');
  await expect(canvas).toHaveAttribute('data-direct-touch-end-count', '1');
  await expect
    .poll(async () =>
      Number(await canvas.getAttribute('data-direct-touch-move-count')),
    )
    .toBeGreaterThan(0);

  return { start, end };
}

async function drawBranchFromSecondCarbon(
  page: Page,
  chainGesture: ChainGesture,
) {
  const { box } = await getCanvas(page);
  const secondCarbon = {
    x:
      chainGesture.start.x +
      DEFAULT_BOND_LENGTH_PX * Math.cos(Math.PI / 6),
    y:
      chainGesture.start.y +
      DEFAULT_BOND_LENGTH_PX * Math.sin(Math.PI / 6),
  };

  await selectKetcherTool(page, 'bonds');
  await page.mouse.move(box.x + secondCarbon.x, box.y + secondCarbon.y);
  await page.mouse.down();
  await page.mouse.move(
    box.x + secondCarbon.x,
    box.y + secondCarbon.y - 60,
    { steps: 8 },
  );
  await page.mouse.up();
}

async function clickKetcherHistory(
  page: Page,
  operation: 'undo' | 'redo',
) {
  const editor = page.getByTestId('chemical-editor');
  await visibleKetcherControl(editor, operation).click();
}

async function clearKetcherCanvas(page: Page) {
  const editor = page.getByTestId('chemical-editor');
  await visibleKetcherControl(editor, 'clear-canvas').click();
}

async function analyzeStructure(
  page: Page,
  expectedStatus: 'valid' | 'invalid',
) {
  await page.getByTestId('student-confirm-structure-button').click();
  await expect(page.getByTestId('student-activity-shell')).toHaveAttribute(
    'data-validation-status',
    expectedStatus,
    { timeout: 90_000 },
  );
}

async function expectGraphSummary(
  page: Page,
  expected: {
    atoms: number;
    bonds: number;
    components: number;
    status: string;
  },
) {
  const summary = page.getByTestId('molecule-graph-summary');

  await expect(summary).toHaveAttribute(
    'data-connectivity-status',
    expected.status,
  );
  await expect(page.getByTestId('graph-atom-count')).toHaveText(
    `${expected.atoms}개`,
  );
  await expect(page.getByTestId('graph-bond-count')).toHaveText(
    `${expected.bonds}개`,
  );
  await expect(page.getByTestId('graph-component-count')).toHaveText(
    `${expected.components}개`,
  );
}

test.describe('Ketcher direct molecule construction', () => {
  test('mouse analyzes explicit-hydrogen methane without a false MOL/SMILES mismatch', async ({
    page,
  }) => {
    await enterStudentWorkbench(page, ['draw-methane']);
    await page.getByTestId('activity-template-draw-methane').click();
    await expect(page.getByTestId('student-example-select')).toHaveValue(
      'methane',
    );
    await drawExplicitHydrogenMethaneWithMouse(page);
    await analyzeStructure(page, 'valid');
    await expectGraphSummary(page, {
      atoms: 5,
      bonds: 4,
      components: 1,
      status: 'single-component',
    });
    await expect(page.getByTestId('student-formula-output')).toHaveText('CH4');
    await expect(page.getByTestId('student-molecular-weight-output')).toHaveText(
      '16.043',
    );
    await expect(page.getByTestId('student-central-atom-output')).toHaveText(
      'C1',
    );
    await expect(
      page.getByTestId('student-electron-domain-count-output'),
    ).toHaveText('4개');
    await expect(page.getByTestId('student-electron-geometry-output')).toHaveText(
      '정사면체',
    );
    await expect(page.getByTestId('student-molecular-shape-output')).toHaveText(
      '정사면체',
    );
    await expect(
      page.getByText(
        '편집기에서 가져온 두 구조 데이터가 서로 일치하지 않아 구조 검토가 필요합니다. 구조를 다시 불러오거나 다시 그린 뒤 확인해 주세요.',
        { exact: true },
      ),
    ).toHaveCount(0);

    await page.getByTestId('show-vsepr-model-button').click();
    await expect(page.getByTestId('student-activity-shell')).toHaveAttribute(
      'data-active-step',
      '4',
    );

    const vseprModelViewer = page.getByTestId('vsepr-3d-model-viewer');
    const molecule3DViewer = page.getByTestId('molecule-3d-viewer');

    await expect(vseprModelViewer).toHaveAttribute(
      'data-viewer-status',
      'ready',
    );
    await expect(vseprModelViewer).toHaveAttribute(
      'data-model-rendered',
      'true',
    );
    await expect(molecule3DViewer).toHaveAttribute(
      'data-viewer-status',
      'ready',
    );
    await expect(molecule3DViewer).toHaveAttribute(
      'data-model-rendered',
      'true',
    );

    for (const hostTestId of ['vsepr-3d-host', 'viewer-3d']) {
      const canvas = page.getByTestId(hostTestId).locator('canvas');

      await expect(canvas).toHaveCount(1);
      await expect
        .poll(async () => {
          const [box, dimensions] = await Promise.all([
            canvas.boundingBox(),
            canvas.evaluate((element) => {
              const renderedCanvas = element as HTMLCanvasElement;
              return {
                width: renderedCanvas.width,
                height: renderedCanvas.height,
              };
            }),
          ]);

          return Boolean(
            box &&
              box.width > 0 &&
              box.height > 0 &&
              dimensions.width > 0 &&
              dimensions.height > 0,
          );
        })
        .toBe(true);
    }
  });

  test('mouse constructs carbon, C4, a branch, undo/redo, and clear with graph evidence', async ({
    page,
  }) => {
    await enterStudentWorkbench(page);
    const { box } = await getCanvas(page);

    await placeCarbon(page, {
      x: box.width * 0.48,
      y: box.height * 0.5,
    });
    await analyzeStructure(page, 'valid');
    await expectGraphSummary(page, {
      atoms: 1,
      bonds: 0,
      components: 1,
      status: 'single-component',
    });
    await expect(page.getByTestId('student-formula-output')).toHaveText('CH4');

    await clearKetcherCanvas(page);
    await expect(page.getByTestId('student-activity-shell')).toHaveAttribute(
      'data-validation-status',
      'not_requested',
    );

    const chainGesture = await drawLinearCarbonChainWithMouse(page);
    await analyzeStructure(page, 'valid');
    await expectGraphSummary(page, {
      atoms: 4,
      bonds: 3,
      components: 1,
      status: 'single-component',
    });
    await expect(page.getByTestId('student-formula-output')).toHaveText('C4H10');

    await drawBranchFromSecondCarbon(page, chainGesture);
    await expect(page.getByTestId('student-activity-shell')).toHaveAttribute(
      'data-validation-status',
      'not_requested',
    );
    await analyzeStructure(page, 'valid');
    await expectGraphSummary(page, {
      atoms: 5,
      bonds: 4,
      components: 1,
      status: 'single-component',
    });
    await expect(page.getByTestId('student-formula-output')).toHaveText('C5H12');

    await clickKetcherHistory(page, 'undo');
    await analyzeStructure(page, 'valid');
    await expectGraphSummary(page, {
      atoms: 4,
      bonds: 3,
      components: 1,
      status: 'single-component',
    });

    await clickKetcherHistory(page, 'redo');
    await analyzeStructure(page, 'valid');
    await expectGraphSummary(page, {
      atoms: 5,
      bonds: 4,
      components: 1,
      status: 'single-component',
    });

    await clearKetcherCanvas(page);
    await expect(page.getByTestId('student-activity-shell')).toHaveAttribute(
      'data-validation-status',
      'not_requested',
    );
    await expect(page.getByTestId('molecule-graph-summary')).toHaveCount(0);
    await expect(page.getByTestId('student-formula-output')).toHaveText(
      '구조 분석 후 표시',
    );
  });

  test('mouse keeps four separately placed carbons disconnected and blocks single-molecule results', async ({
    page,
  }) => {
    await enterStudentWorkbench(page);
    const { box } = await getCanvas(page);
    const points = [
      { x: box.width * 0.3, y: box.height * 0.35 },
      { x: box.width * 0.62, y: box.height * 0.35 },
      { x: box.width * 0.3, y: box.height * 0.7 },
      { x: box.width * 0.62, y: box.height * 0.7 },
    ];

    await selectKetcherTool(page, 'C-button');
    const canvas = page.getByTestId('chemical-editor').getByTestId('canvas');
    for (const point of points) {
      await canvas.click({ position: point });
    }

    await analyzeStructure(page, 'invalid');
    await expectGraphSummary(page, {
      atoms: 4,
      bonds: 0,
      components: 4,
      status: 'multiple-components-blocked',
    });
    await expect(page.getByTestId('student-formula-output')).toHaveText(
      '구조 분석 후 표시',
    );
    await expect(page.getByTestId('molecule-graph-summary')).toContainText(
      '원자 사이를 결합으로 연결해 주세요',
    );
  });
});

test.describe('Ketcher direct molecule construction on touch', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test('touch drag constructs a connected C4 chain', async ({ page }) => {
    await enterStudentWorkbench(page);
    await drawLinearCarbonChainWithTouch(page);
    await analyzeStructure(page, 'valid');
    await expectGraphSummary(page, {
      atoms: 4,
      bonds: 3,
      components: 1,
      status: 'single-component',
    });
    await expect(page.getByTestId('student-formula-output')).toHaveText('C4H10');
  });

  test('touch keeps four separately placed carbons visible in mobile analysis and blocks formula', async ({
    page,
  }) => {
    await enterStudentWorkbench(page);
    const { canvas, box } = await getCanvas(page);
    const points = [
      { x: box.width * 0.25, y: box.height * 0.32 },
      { x: box.width * 0.7, y: box.height * 0.32 },
      { x: box.width * 0.25, y: box.height * 0.68 },
      { x: box.width * 0.7, y: box.height * 0.68 },
    ];

    await selectKetcherTool(page, 'C-button', 'touch');
    for (const point of points) {
      await canvas.tap({ position: point });
    }

    await analyzeStructure(page, 'invalid');
    await expect(page.getByTestId('student-activity-shell')).toHaveAttribute(
      'data-active-step',
      '3',
    );
    await expect(page.getByTestId('mobile-learning-step-3')).toHaveAttribute(
      'aria-current',
      'step',
    );
    await expectGraphSummary(page, {
      atoms: 4,
      bonds: 0,
      components: 4,
      status: 'multiple-components-blocked',
    });
    await expect(page.getByTestId('student-formula-output')).toHaveText(
      '구조 분석 후 표시',
    );
  });
});
