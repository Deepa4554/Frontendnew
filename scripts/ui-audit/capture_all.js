// Captures every top-level screen (screens.js) at every breakpoint
// (breakpoints.js). Fresh login per (breakpoint, screen) pair — the access
// token is memory-only on web (see tokenStore.ts), so a reload always
// requires re-login anyway; this keeps each capture fully independent and
// avoids compounding navigation-state bugs across screens.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const breakpoints = require('./breakpoints');
const screens = require('./screens');
const { loginAs } = require('./login');

const BASE_URL = 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, 'shots');
const ROLE = process.argv[2] || 'Owner';
const ONLY = process.argv[3]; // optional: comma-separated screen keys to limit this run

async function gotoScreen(page, screen, isDesktop) {
  if (!screen.mobile && !screen.desktop) return true; // POS: already the landing screen

  const nav = isDesktop ? screen.desktop : screen.mobile;
  if (!nav) return false;

  if (nav.tab) {
    if (isDesktop) {
      // Desktop sidebar's tab items (POS/Kitchen/AI Assistant) still say the
      // NAV_GROUPS label, not the raw tab name — screens.js already stores
      // the right sidebar label under desktop.sidebar for these.
      return false; // handled via sidebar branch below (desktop.sidebar is set instead)
    }
    await page.getByText(nav.tab, { exact: true }).click();
    return true;
  }
  if (nav.more) {
    await page.getByText('More', { exact: true }).last().click();
    await page.waitForTimeout(300);
    await page.getByText(nav.more, { exact: true }).click();
    return true;
  }
  if (nav.sidebar) {
    await page.getByText(nav.sidebar, { exact: true }).first().click();
    return true;
  }
  if (nav.sidebarFooter) {
    await page.getByText(nav.sidebarFooter, { exact: true }).click();
    return true;
  }
  return false;
}

(async () => {
  const browser = await chromium.launch();
  const onlyKeys = ONLY ? ONLY.split(',') : null;
  const results = [];

  for (const bp of breakpoints) {
    const isDesktop = bp.width >= 768;
    for (const screen of screens) {
      if (onlyKeys && !onlyKeys.includes(screen.key)) continue;
      const context = await browser.newContext({ viewport: { width: bp.width, height: bp.height } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      try {
        await loginAs(page, ROLE, BASE_URL);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1200);
        const navigated = await gotoScreen(page, screen, isDesktop);
        if (navigated === false && (screen.mobile || screen.desktop)) {
          results.push({ screen: screen.key, bp: bp.name, status: 'NO_NAV_PATH' });
          await context.close();
          continue;
        }
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
        const file = path.join(OUT_DIR, `${screen.key}_${bp.name}_${ROLE}.png`);
        await page.screenshot({ path: file });
        results.push({ screen: screen.key, bp: bp.name, status: 'OK', file, errors });
        console.log(`OK   ${screen.key.padEnd(16)} ${bp.name.padEnd(8)} -> ${path.basename(file)}${errors.length ? '  [console errors: ' + errors.length + ']' : ''}`);
      } catch (e) {
        results.push({ screen: screen.key, bp: bp.name, status: 'FAIL', error: e.message });
        console.log(`FAIL ${screen.key.padEnd(16)} ${bp.name.padEnd(8)} -> ${e.message.split('\n')[0]}`);
      } finally {
        await context.close();
      }
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, '_results.json'), JSON.stringify(results, null, 2));
  await browser.close();
})();
