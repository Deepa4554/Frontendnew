// Highest-value popups (busiest screens first), mobile breakpoint — where
// modal layout bugs are most likely. One fresh login per popup.
const { chromium } = require('playwright');
const path = require('path');
const { loginAs } = require('./login');

const BASE_URL = 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, 'shots');
const MOBILE = { width: 390, height: 844 };

// Table Picker / Discount / Guest Edit all live inside the cart-expand
// bottom sheet (renderCartBody()) — invisible until the cart has an item
// (which shows the collapsed cart bar) and that bar is tapped open.
const openExpandedCart = async (page) => {
  await page.getByText('ADD', { exact: true }).first().click();
  await page.waitForTimeout(400);
  await page.getByText('Tap to view order', { exact: true }).click();
  await page.waitForTimeout(400);
};

const cases = [
  {
    key: 'POS_ItemOptions',
    steps: async (page) => {
      await page.getByText('ADD', { exact: true }).first().click();
    },
  },
  {
    key: 'POS_TablePicker',
    steps: async (page) => {
      await openExpandedCart(page);
      await page.getByText('Select Table', { exact: true }).click();
    },
  },
  {
    key: 'POS_Discount',
    steps: async (page) => {
      await openExpandedCart(page);
      await page.getByText('Discount', { exact: true }).click();
    },
  },
  {
    key: 'POS_GuestEdit',
    steps: async (page) => {
      await openExpandedCart(page);
      await page.getByText('Guest:', { exact: false }).click();
    },
  },
  {
    key: 'POS_CartExpanded',
    steps: async (page) => {
      await openExpandedCart(page);
    },
  },
];

(async () => {
  const browser = await chromium.launch();
  for (const c of cases) {
    const context = await browser.newContext({ viewport: MOBILE });
    const page = await context.newPage();
    try {
      await loginAs(page, 'Owner', BASE_URL);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await c.steps(page);
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
