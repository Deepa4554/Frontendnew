// Proof-of-concept: log in as Owner and screenshot the default POS screen
// (MainTabs landing tab) at every defined breakpoint. Validates the
// login+capture pipeline before scaling out to the full screen inventory.
const { chromium } = require('playwright');
const path = require('path');
const breakpoints = require('./breakpoints');
const { loginAs } = require('./login');

const BASE_URL = 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, 'shots');

(async () => {
  const browser = await chromium.launch();
  for (const bp of breakpoints) {
    const context = await browser.newContext({ viewport: { width: bp.width, height: bp.height } });
    const page = await context.newPage();
    await loginAs(page, 'Owner', BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500); // let post-login animations/queries settle
    const file = path.join(OUT_DIR, `POS_${bp.name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`saved ${file}`);
    await context.close();
  }
  await browser.close();
})();
