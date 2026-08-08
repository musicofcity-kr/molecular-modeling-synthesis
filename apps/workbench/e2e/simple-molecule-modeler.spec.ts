import { expect, test, type Locator, type Page } from '@playwright/test';

const SIMPLE_ENTRY = '/?entry=simple';

const AMMONIA_3D_SDF = `ammonia external 3D
  PubChem  073026

  4  3  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.1173 N   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.9377   -0.2738 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.8121   -0.4689   -0.2738 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.8121   -0.4689   -0.2738 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  1  3  1  0
  1  4  1  0
M  END
$$$$`;

const BUTANE_3D_SDF = `butane external 3D
  PubChem  073026

  4  3  0  0  0  0  0  0  0  0999 V2000
   -2.2500    0.0000    0.3000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7500    0.0000   -0.3000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.7500    0.0000    0.3000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.2500    0.0000   -0.3000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  2  3  1  0
  3  4  1  0
M  END
$$$$`;

const tools = [
  {
    tabId: 'simple-tool-2d',
    panelId: 'simple-tool-panel-2d',
  },
  {
    tabId: 'simple-tool-vsepr',
    panelId: 'simple-tool-panel-vsepr',
  },
  {
    tabId: 'simple-tool-3d',
    panelId: 'simple-tool-panel-3d',
  },
] as const;

async function openSimpleModeler(page: Page) {
  await page.goto(SIMPLE_ENTRY);
  await expect(page.getByTestId('simple-modeler-shell')).toBeVisible();
}

function visibleKetcherControl(editor: Locator, testId: string): Locator {
  return editor.locator(`[data-testid="${testId}"]:visible`).last();
}

async function placeSingleCarbonOnKetcherCanvas(page: Page) {
  const editor = page.getByTestId('chemical-editor');
  const carbonTool = visibleKetcherControl(editor, 'C-button');
  const canvas = editor.getByTestId('canvas');

  await carbonTool.scrollIntoViewIfNeeded();
  await expect(carbonTool).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();

  const box = await canvas.boundingBox();
  expect(box, 'Ketcher canvas must have a bounding box').not.toBeNull();

  if (!box) {
    throw new Error('Ketcher canvas bounding box is unavailable.');
  }

  await carbonTool.click();
  await canvas.click({
    position: {
      x: box.width * 0.5,
      y: box.height * 0.5,
    },
  });
}

async function drawFourCarbonChainOnKetcherCanvas(page: Page) {
  const editor = page.getByTestId('chemical-editor');
  const chainTool = visibleKetcherControl(editor, 'chain');
  const canvas = editor.getByTestId('canvas');

  await chainTool.scrollIntoViewIfNeeded();
  await expect(chainTool).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();

  const box = await canvas.boundingBox();
  expect(box, 'Ketcher canvas must have a bounding box').not.toBeNull();

  if (!box) {
    throw new Error('Ketcher canvas bounding box is unavailable.');
  }

  const start = {
    x: Math.min(Math.max(box.width * 0.3, 60), box.width - 140),
    y: Math.min(Math.max(box.height * 0.52, 80), box.height - 80),
  };

  await chainTool.click();
  await page.mouse.move(box.x + start.x, box.y + start.y);
  await page.mouse.down();
  await page.mouse.move(box.x + start.x + 120, box.y + start.y, {
    steps: 12,
  });
  await page.mouse.up();
}

async function loadAndAnalyzeWater(page: Page) {
  await expect(page.getByTestId('chemical-editor-status')).toHaveAttribute(
    'data-ready',
    'true',
    { timeout: 90_000 },
  );

  await page.getByTestId('simple-example-select').selectOption('water');
  await page.getByTestId('simple-load-example-button').click();
  await expect(page.getByTestId('simple-analyze-button')).toBeEnabled();
  await page.getByTestId('simple-analyze-button').click();

  await expect(page.getByTestId('simple-validation-status')).toContainText(
    'H2O 구조 검증을 완료했습니다.',
    { timeout: 90_000 },
  );
  await expect(page.getByTestId('simple-formula-output')).toHaveText('H2O', {
    timeout: 90_000,
  });
  await expect(page.getByTestId('simple-graph-output')).toContainText(
    /연결|단일|성분/,
  );
}

test.describe('Simple molecule modeler prototype', () => {
  test('enables one-click 3D output as soon as Ketcher is ready', async ({
    page,
  }) => {
    await openSimpleModeler(page);
    await expect(page.getByTestId('chemical-editor-status')).toHaveAttribute(
      'data-ready',
      'true',
      { timeout: 90_000 },
    );

    await expect(page.getByTestId('simple-formula-output')).toHaveText(
      '검증 후 표시',
    );
    await expect(page.getByTestId('simple-output-3d-button')).toBeEnabled();
    await expect(page.getByTestId('simple-output-3d-button')).toHaveText(
      '분석하고 3D 구조 출력',
    );
  });

  test('analyzes one directly drawn carbon and renders methane 3D with one output click', async ({
    page,
  }) => {
    await openSimpleModeler(page);
    await expect(page.getByTestId('chemical-editor-status')).toHaveAttribute(
      'data-ready',
      'true',
      { timeout: 90_000 },
    );
    await placeSingleCarbonOnKetcherCanvas(page);

    await expect(page.getByTestId('simple-validation-status')).toContainText(
      '2D 구조가 바뀌어',
      { timeout: 30_000 },
    );
    await expect(page.getByTestId('simple-formula-output')).toHaveText(
      '검증 후 표시',
    );

    await page.getByTestId('simple-output-3d-button').click();

    await expect(page.getByTestId('simple-formula-output')).toHaveText('CH4', {
      timeout: 90_000,
    });
    await expect(page.getByTestId('simple-validation-status')).toContainText(
      'CH4 구조 검증을 완료했습니다.',
    );
    await expect(page.getByTestId('simple-3d-load-status')).toHaveAttribute(
      'data-status',
      'success',
    );
    await expect(page.getByTestId('simple-tool-3d')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('simple-tool-panel-3d')).toBeVisible();
    await expect(page.getByTestId('molecule-3d-viewer')).toHaveAttribute(
      'data-model-rendered',
      'true',
      { timeout: 30_000 },
    );
  });

  test('connects the 2D, VSEPR, and 3D tools through one validated water workflow', async ({
    page,
  }) => {
    await openSimpleModeler(page);

    const tabList = page.getByTestId('simple-tool-tabs');
    await expect(tabList).toHaveAttribute('role', 'tablist');

    for (const [index, tool] of tools.entries()) {
      const tab = page.getByTestId(tool.tabId);
      const panel = page.getByTestId(tool.panelId);

      await expect(tab).toHaveAttribute('role', 'tab');
      await expect(tab).toHaveAttribute('aria-controls', tool.panelId);
      await expect(panel).toHaveAttribute('role', 'tabpanel');
      await expect(panel).toHaveAttribute('aria-labelledby', tool.tabId);

      if (index === 0) {
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        await expect(panel).toBeVisible();
      }
    }

    await loadAndAnalyzeWater(page);

    await page.getByTestId('simple-tool-vsepr').click();
    await expect(page.getByTestId('simple-tool-vsepr')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('simple-tool-panel-vsepr')).toBeVisible();

    const vseprPanel = page.getByTestId('vsepr-panel');
    await expect(vseprPanel).toBeVisible();
    await expect(vseprPanel).toContainText('예측 가능');
    await expect(page.getByTestId('vsepr-bond-angle-output')).toContainText(
      '109.5',
    );
    await expect(page.getByTestId('vsepr-center-select')).toBeVisible();
    await expect(page.getByTestId('show-vsepr-model-button')).toBeEnabled();
    await page.getByTestId('show-vsepr-model-button').click();
    await expect(page.getByTestId('vsepr-3d-model-viewer')).toHaveAttribute(
      'data-model-rendered',
      'true',
      { timeout: 30_000 },
    );

    await page.getByTestId('simple-tool-3d').click();
    await expect(page.getByTestId('simple-tool-3d')).toHaveAttribute(
      'aria-selected',
      'true',
    );

    const threeDimensionalPanel = page.getByTestId('simple-tool-panel-3d');
    await expect(threeDimensionalPanel).toBeVisible();
    await expect(threeDimensionalPanel).toContainText('교육용 정적 좌표');
    await expect(threeDimensionalPanel).toContainText(
      '실험으로 측정한 결합길이·결합각이 아닙니다',
    );
    await expect(page.getByTestId('molecule-3d-viewer')).toHaveAttribute(
      'data-model-rendered',
      'true',
      { timeout: 30_000 },
    );
    await expect(page.getByTestId('geometry-measurement-panel')).toBeVisible();
    await expect(page.getByTestId('bond-length-mode-button')).toBeEnabled();
    await expect(page.getByTestId('bond-angle-mode-button')).toBeEnabled();

    await page.getByTestId('simple-clear-button').click();
    await expect(page.getByTestId('simple-validation-status')).toContainText(
      '분자 구조를 비웠습니다.',
    );
    await expect(page.getByTestId('simple-formula-output')).not.toHaveText(
      'H2O',
    );

    await page.getByTestId('simple-tool-vsepr').click();
    await expect(page.getByTestId('vsepr-3d-model-viewer')).toHaveAttribute(
      'data-model-rendered',
      'false',
    );

    await page.getByTestId('simple-tool-3d').click();
    await expect(page.getByTestId('molecule-3d-viewer')).toHaveAttribute(
      'data-model-rendered',
      'false',
    );
  });

  test('outputs a verified external 3D structure for ammonia without built-in coordinates', async ({
    page,
  }) => {
    let external3DRequestCount = 0;

    await page.route(
      /\/rest\/pug\/compound\/cid\/222\/record\/SDF\?record_type=3d$/,
      async (route) => {
        expect(route.request().method()).toBe('GET');
        external3DRequestCount += 1;
        await route.fulfill({
          status: 200,
          contentType: 'chemical/x-mdl-sdfile',
          body: AMMONIA_3D_SDF,
        });
      },
    );

    await openSimpleModeler(page);
    await expect(page.getByTestId('chemical-editor-status')).toHaveAttribute(
      'data-ready',
      'true',
      { timeout: 90_000 },
    );

    await page.getByTestId('simple-example-select').selectOption('ammonia');
    await page.getByTestId('simple-load-example-button').click();
    await expect(page.getByTestId('simple-formula-output')).toHaveText('H3N', {
      timeout: 90_000,
    });
    await expect(page.getByTestId('simple-output-3d-button')).toBeEnabled();

    await page.getByTestId('simple-output-3d-button').click();

    const loadStatus = page.getByTestId('simple-3d-load-status');
    await expect(loadStatus).toHaveAttribute('data-status', 'success', {
      timeout: 90_000,
    });
    await expect(loadStatus).toContainText(
      '암모니아의 검증된 외부 교육용 3D 좌표를 출력했습니다.',
    );
    await expect.poll(() => external3DRequestCount).toBe(1);

    await page.getByTestId('simple-tool-3d').click();
    await expect(page.getByTestId('simple-tool-3d')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('simple-tool-panel-3d')).toBeVisible();
    await expect(page.getByTestId('molecule-3d-viewer')).toHaveAttribute(
      'data-model-rendered',
      'true',
      { timeout: 30_000 },
    );
    await expect(page.getByTestId('bond-length-mode-button')).toBeEnabled();
    await expect(page.getByTestId('bond-angle-mode-button')).toBeEnabled();
  });

  test('searches a directly drawn complex structure and loads 3D only after manual candidate selection', async ({
    page,
  }) => {
    let candidateSearchCount = 0;
    let external3DRequestCount = 0;
    let releaseCandidateSearch!: () => void;
    const candidateSearchGate = new Promise<void>((resolve) => {
      releaseCandidateSearch = resolve;
    });

    await page.route(
      /\/rest\/pug\/compound\/smiles\/property\/.+\/JSON$/,
      async (route) => {
        expect(route.request().method()).toBe('POST');
        expect(route.request().postData()).toContain('smiles=CCCC');
        candidateSearchCount += 1;
        await candidateSearchGate;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            PropertyTable: {
              Properties: [
                {
                  CID: 7843,
                  Title: 'Butane',
                  MolecularFormula: 'C4H10',
                  MolecularWeight: '58.124',
                  CanonicalSMILES: 'CCCC',
                  IsomericSMILES: 'CCCC',
                },
              ],
            },
          }),
        });
      },
    );
    await page.route(
      /\/rest\/pug\/compound\/cid\/7843\/record\/SDF\?record_type=3d$/,
      async (route) => {
        expect(route.request().method()).toBe('GET');
        external3DRequestCount += 1;
        await route.fulfill({
          status: 200,
          contentType: 'chemical/x-mdl-sdfile',
          body: BUTANE_3D_SDF,
        });
      },
    );

    await openSimpleModeler(page);
    await expect(page.getByTestId('chemical-editor-status')).toHaveAttribute(
      'data-ready',
      'true',
      { timeout: 90_000 },
    );
    await drawFourCarbonChainOnKetcherCanvas(page);
    await expect(page.getByTestId('simple-validation-status')).toContainText(
      '2D 구조가 바뀌어',
      { timeout: 30_000 },
    );

    await page.getByTestId('simple-output-3d-button').click();

    await expect.poll(() => candidateSearchCount).toBe(1);
    await expect(page.getByTestId('simple-tool-3d')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByTestId('simple-tool-2d').click();
    const outputButton = page.getByTestId('simple-output-3d-button');
    await expect(outputButton).toBeDisabled();
    await expect(outputButton).toHaveText('후보 검색 중…');
    await outputButton.evaluate((element) => {
      (element as HTMLButtonElement).click();
    });
    await expect.poll(() => candidateSearchCount).toBe(1);

    releaseCandidateSearch();
    await expect(page.getByTestId('simple-formula-output')).toHaveText(
      'C4H10',
      { timeout: 90_000 },
    );
    await page.getByTestId('simple-tool-3d').click();
    await expect(page.getByTestId('pubchem-candidate-panel')).toBeVisible();
    await expect(
      page.getByTestId('select-pubchem-candidate-7843'),
    ).toBeEnabled();
    await expect.poll(() => external3DRequestCount).toBe(0);

    await page.getByTestId('select-pubchem-candidate-7843').click();

    await expect.poll(() => external3DRequestCount).toBe(1);
    await expect(page.getByTestId('simple-3d-load-status')).toHaveAttribute(
      'data-status',
      'success',
      { timeout: 90_000 },
    );
    await expect(page.getByTestId('molecule-3d-viewer')).toHaveAttribute(
      'data-model-rendered',
      'true',
      { timeout: 30_000 },
    );
    await expect(page.getByTestId('bond-length-mode-button')).toBeEnabled();
    await expect(page.getByTestId('bond-angle-mode-button')).toBeEnabled();
  });

  test('keeps the three tools usable without horizontal overflow at 390 by 844', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSimpleModeler(page);

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
      )
      .toBe(true);

    for (const tool of tools) {
      const tab = page.getByTestId(tool.tabId);
      await expect(tab).toBeVisible();

      const box = await tab.boundingBox();
      expect(box, `${tool.tabId} should have a measurable touch target`).not.toBeNull();
      expect(
        box?.height,
        `${tool.tabId} should be at least 44 CSS pixels high`,
      ).toBeGreaterThanOrEqual(44);
    }

    await page.getByTestId('simple-tool-vsepr').click();
    await expect(page.getByTestId('simple-tool-panel-vsepr')).toBeVisible();
    await page.getByTestId('simple-tool-3d').click();
    await expect(page.getByTestId('simple-tool-panel-3d')).toBeVisible();
  });
});
