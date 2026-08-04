const { chromium } = require('playwright');
const path = require('path');
const { loginAs } = require('./login');

const BASE_URL = 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, 'shots');
const MOBILE = { width: 390, height: 844 };

const openSettings = async (page) => {
  await page.getByText('More', { exact: true }).last().click();
  await page.waitForTimeout(300);
  await page.getByText('Cafe Settings', { exact: true }).click();
  await page.waitForTimeout(500);
};

const cases = [
  { key: 'Settings_QR', label: 'QR Ordering' },
];

(async () => {
  const browser = await chromium.launch();
  for (const c of cases) {
    const context = await browser.newContext({ viewport: MOBILE });
    const page = await context.newPage();
    try {
      await loginAs(page, 'Owner', BASE_URL);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(800);
      await openSettings(page);
      await page.getByText(c.label, { exact: true }).last().click();
      await page.waitForTimeout(600);
      const file = path.join(OUT_DIR, `popup_${c.key}_mobile_Owner.png`);
      await page.screenshot({ path: file });
      console.log(`OK   ${c.key} -> ${path.basename(file)}`);
    } catch (e) {
      console.log(`FAIL ${c.key} -> ${e.message.split('\n')[0]}`);
    } finally {
      await context.close();
    }
  }
  await browser.close();
})();
