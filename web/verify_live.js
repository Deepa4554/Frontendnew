const puppeteer = require('puppeteer-core');
const fs = require('fs');
const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const edgePath = EDGE_PATHS.find((p) => fs.existsSync(p));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=430,932'],
    defaultViewport: { width: 430, height: 932 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));
  page.on('dialog', (d) => {
    console.log('DIALOG:', d.message().split('\n')[0]);
    d.accept();
  });

  const clickByText = async (text, exact = true) => {
    const rect = await page.evaluate(
      (t, ex) => {
        const els = Array.from(document.querySelectorAll('div,span,button'));
        const matches = els.filter((e) => {
          const s = e.textContent.trim();
          if (!((ex ? s === t : s.includes(t)) && e.children.length === 0)) return false;
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        const textEl = matches[matches.length - 1];
        if (!textEl) return null;
        textEl.scrollIntoView({ block: 'center' });
        const r = textEl.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      },
      text,
      exact,
    );
    if (!rect) return false;
    await page.mouse.click(rect.x, rect.y);
    return true;
  };

  const typeInto = async (placeholder, value) => {
    const ok = await page.evaluate((p) => {
      const input = document.querySelector(`input[placeholder="${p}"]`);
      if (!input) return false;
      input.focus();
      return true;
    }, placeholder);
    if (ok) await page.keyboard.type(value, { delay: 20 });
    return ok;
  };

  const bodyHas = (t) => page.evaluate((s) => document.body.textContent.includes(s), t);

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 3200));
  console.log('signIn:', await clickByText('Sign In'));
  await new Promise((r) => setTimeout(r, 2200));
  for (let i = 0; i < 10; i++) {
    const c = (await clickByText('Continue')) || (await clickByText('Finish Setup'));
    await new Promise((r) => setTimeout(r, 1000));
    if (!c) break;
  }
  await new Promise((r) => setTimeout(r, 1500));

  // --- POS: cart must start EMPTY ---
  console.log('CART_EMPTY (want true):', await bodyHas('Cart is empty'));
  await page.screenshot({ path: 'C:\\CafePOS\\web\\live_1_pos_empty.png' });

  // Add two items from the menu grid.
  console.log('addEspresso:', await clickByText('Double Espresso'));
  await new Promise((r) => setTimeout(r, 500));
  console.log('addCroissant:', await clickByText('Almond Croissant'));
  await new Promise((r) => setTimeout(r, 500));

  // Guest name.
  console.log('guestChip:', await clickByText('Guest: Walk-in', false));
  await new Promise((r) => setTimeout(r, 600));
  console.log('typeName:', await typeInto('e.g. Sarah', 'Priya'));
  console.log('save:', await clickByText('Save'));
  await new Promise((r) => setTimeout(r, 600));

  // Fire → picker → T3 → auto-fires.
  console.log('fire:', await clickByText('Fire to Kitchen (KDS)'));
  await new Promise((r) => setTimeout(r, 800));
  console.log('pickT3:', await clickByText('T3'));
  await new Promise((r) => setTimeout(r, 1000));
  console.log('RECEIPT_1001 (want true):', await bodyHas('Order #1001'));
  console.log('RECEIPT_TITLE (want true):', await bodyHas('Table #T3 – Priya'));
  await page.screenshot({ path: 'C:\\CafePOS\\web\\live_2_receipt.png' });
  console.log('closeX:', await clickByText('\u{F0156}'));
  await new Promise((r) => setTimeout(r, 600));

  // --- Orders tab: T3 occupied by live order, others available ---
  console.log('ordersTab:', await clickByText('Orders'));
  await new Promise((r) => setTimeout(r, 1200));
  console.log('T3_LIVE (want true):', await bodyHas('#1001 · NEW'));
  await page.screenshot({ path: 'C:\\CafePOS\\web\\live_3_tables.png' });

  // --- KDS: ticket visible ---
  console.log('kdsTab:', await clickByText('KDS'));
  await new Promise((r) => setTimeout(r, 1200));
  console.log('KDS_TICKET (want true):', await bodyHas('Table #T3 – Priya'));
  await page.screenshot({ path: 'C:\\CafePOS\\web\\live_4_kds.png' });

  // --- Inventory: Add Item flow ---
  console.log('moreTab:', await clickByText('More'));
  await new Promise((r) => setTimeout(r, 1000));
  console.log('inventoryNav:', await clickByText('Inventory'));
  await new Promise((r) => setTimeout(r, 1500));
  console.log('addItemBtn:', await clickByText('Add Item'));
  await new Promise((r) => setTimeout(r, 800));
  console.log('typeItemName:', await typeInto('e.g. Almond Milk', 'Almond Milk'));
  console.log('typeCategory:', await typeInto('e.g. Dairy Alternatives', 'Dairy Alternatives'));
  console.log('typeMax:', await typeInto('e.g. 24', '24'));
  console.log('typeUnit:', await typeInto('L / kg / pcs', 'L'));
  console.log('saveItem:', await clickByText('Add to Inventory'));
  await new Promise((r) => setTimeout(r, 1000));
  console.log('ITEM_ADDED (want true):', await bodyHas('Almond Milk'));
  await page.screenshot({ path: 'C:\\CafePOS\\web\\live_5_inventory.png' });

  await browser.close();
})().catch((e) => {
  console.error('SCRIPT_ERROR:', e);
  process.exit(1);
});
