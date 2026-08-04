// Nested screens (reached by an action inside a top-level screen, not a
// direct nav-item click). Each entry describes how to get there from a
// fresh login: which top-level screen to open first (mobile vs desktop nav,
// same as screens.js), then a sequence of in-page click steps.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const breakpoints = require('./breakpoints');
const { loginAs } = require('./login');

const BASE_URL = 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, 'shots');
const ROLE = process.argv[2] || 'Owner';
const ONLY = process.argv[3];

// step types: { click: 'text' } clicks exact text; { icon: n } clicks the
// nth icon-only header button (mobile inventory header); { moreThenClick }
// goes via bottom-tab More first (mobile only).
const targets = [
  {
    key: 'InventoryLedger',
    openMobile: [{ click: 'More', exact: true, last: true }, { click: 'Inventory', exact: true }, { icon: 'format-list-bulleted' }],
    openDesktop: [{ click: 'Inventory', exact: true }, { click: 'Ledger', exact: true }],
  },
  {
    key: 'PurchaseOrders',
    openMobile: [{ click: 'More', exact: true, last: true }, { click: 'Inventory', exact: true }, { icon: 'cart-plus' }],
    openDesktop: [{ click: 'Inventory', exact: true }, { click: 'Purchase Orders', exact: true }],
  },
  {
    key: 'Vendors',
    openMobile: [{ click: 'More', exact: true, last: true }, { click: 'Inventory', exact: true }, { icon: 'truck-outline' }],
    openDesktop: [{ click: 'Inventory', exact: true }, { click: 'Vendors', exact: true }],
  },
  {
    key: 'StockTakes',
    openMobile: [{ click: 'More', exact: true, last: true }, { click: 'Inventory', exact: true }, { icon: 'clipboard-list-outline' }],
    openDesktop: [{ click: 'Inventory', exact: true }, { click: 'Stock Takes', exact: true }],
  },
  {
    key: 'VarianceReport',
    openMobile: [{ click: 'More', exact: true, last: true }, { click: 'Inventory', exact: true }, { icon: 'chart-line' }],
    openDesktop: [{ click: 'Inventory', exact: true }, { click: 'Variance', exact: true }],
  },
  {
    key: 'ExpiringBatches',
    openMobile: [{ click: 'More', exact: true, last: true }, { click: 'Inventory', exact: true }, { icon: 'clock-alert-outline' }],
    openDesktop: [{ click: 'Inventory', exact: true }, { click: 'Expiring', exact: false }],
  },
  {
    key: 'FoodCostReport',
    // No mobile entry point exists today (desktop-header-only button) — capture desktop layouts only.
    openMobile: null,
    openDesktop: [{ click: 'Inventory', exact: true }, { click: 'Food Cost', exact: true }],
  },
  {
    key: 'PrinterSettings',
    openMobile: [{ click: 'More', exact: true, last: true }, { click: 'Cafe Settings', exact: true }, { click: 'Printer Settings', exact: true }],
    openDesktop: [{ click: 'Settings', exact: true, footer: true }, { click: 'Printer Settings', exact: true }],
  },
  {
    key: 'CafeProfileDetail',
    // "CafePOS" text is ambiguous (also the sidebar brand logo) — the profile
    // card's role/tier line is unique on the page.
    openMobile: [{ click: 'More', exact: true, last: true }, { click: 'Cafe Settings', exact: true }, { click: 'Owner · Premium Tier', exact: true }],
    openDesktop: [{ click: 'Settings', exact: true, footer: true }, { click: 'Owner · Premium Tier', exact: true }],
  },
  {
    key: 'HelpArticle',
    openMobile: [{ click: 'More', exact: true, last: true }, { click: 'Help Center', exact: true }, { click: 'Connecting your first printer', exact: true }],
    openDesktop: [{ click: 'Support', exact: true, footer: true }, { click: 'Connecting your first printer', exact: true }],
  },
];

const INVENTORY_ICON_ORDER = ['cart-plus', 'truck-outline', 'format-list-bulleted', 'clipboard-list-outline', 'chart-line', 'clock-alert-outline'];

async function runStep(page, step) {
  if (step.icon) {
    // MaterialCommunityIcons renders as a custom-font glyph <div> (tabindex=0,
    // ~36x36) — no text/aria-label to select by. Click by coordinates instead:
    // find every 36x36 tabindex=0 element in the header strip (y<80), sort by
    // x (matches JSX order), and click the target's center directly — this
    // works even when the icon is scrolled out of the visible maxWidth:140
    // strip, since it bypasses Playwright's visibility-based actionability
    // checks that a normal .click() would fail on.
    const idx = INVENTORY_ICON_ORDER.indexOf(step.icon);
    // The icon row is horizontally scrollable and only ~3.8 of 6 icons fit in
    // its maxWidth:140 viewport. Icons 0-3 (Purchase Orders/Vendors/Ledger/
    // Stock Takes) are visible at rest; the last two (Variance, Expiring)
    // need a scroll first — but scrolling unconditionally would just clip
    // the *first* icons out the other side instead, since the container
    // only shows ~4 at a time. mouse.wheel actually moves RN-web's
    // ScrollView (DOM scrollIntoView does not, confirmed against this same
    // ScrollView earlier), so only reach for it when the target needs it.
    if (idx >= 4) {
      await page.mouse.move(300, 30);
      await page.mouse.wheel(300, 0);
      await page.waitForTimeout(300);
    }
    const boxes = await page.evaluate(() => {
      return [...document.querySelectorAll('div[tabindex="0"]')]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.top < 80 && r.top > 0 && r.width >= 30 && r.width <= 40 && r.height >= 30 && r.height <= 40)
        .map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height }))
        .sort((a, b) => a.x - b.x);
    });
    // First box (x smallest) is the back button — icons start at index 1.
    const target = boxes[idx + 1];
    if (!target) throw new Error(`icon ${step.icon} not found among ${boxes.length} header buttons`);
    await page.mouse.click(target.x + target.w / 2, target.y + target.h / 2);
    await page.waitForTimeout(400);
    return;
  }
  const locator = step.footer || step.last
    ? page.getByText(step.click, { exact: step.exact !== false }).last()
    : page.getByText(step.click, { exact: step.exact !== false }).first();
  await locator.click();
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch();
  const onlyKeys = ONLY ? ONLY.split(',') : null;
  const results = [];

  for (const bp of breakpoints) {
    const isDesktop = bp.width >= 768;
    for (const target of targets) {
      if (onlyKeys && !onlyKeys.includes(target.key)) continue;
      const steps = isDesktop ? target.openDesktop : target.openMobile;
      if (!steps) { results.push({ screen: target.key, bp: bp.name, status: 'NO_ENTRY_POINT' }); continue; }
      const context = await browser.newContext({ viewport: { width: bp.width, height: bp.height } });
      const page = await context.newPage();
      try {
        await loginAs(page, ROLE, BASE_URL);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
        for (const step of steps) await runStep(page, step);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(800);
        const file = path.join(OUT_DIR, `nested_${target.key}_${bp.name}_${ROLE}.png`);
        await page.screenshot({ path: file });
        results.push({ screen: target.key, bp: bp.name, status: 'OK', file });
        console.log(`OK   ${target.key.padEnd(18)} ${bp.name.padEnd(8)} -> ${path.basename(file)}`);
      } catch (e) {
        results.push({ screen: target.key, bp: bp.name, status: 'FAIL', error: e.message });
        console.log(`FAIL ${target.key.padEnd(18)} ${bp.name.padEnd(8)} -> ${e.message.split('\n')[0]}`);
      } finally {
        await context.close();
      }
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, '_nested_results.json'), JSON.stringify(results, null, 2));
  await browser.close();
})();
