const puppeteer = require('puppeteer-core');

const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const fs = require('fs');
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

  // Real mouse click at the element's center — react-native-web Pressables
  // need genuine pointer events, synthetic .click() is often ignored.
  const clickByText = async (text, exact = true) => {
    const rect = await page.evaluate(
      (t, ex) => {
        // Native-stack keeps previous screens mounted — the active screen is
        // last in the DOM, so always take the LAST visible match.
        const els = Array.from(document.querySelectorAll('div,span,button'));
        const matches = els.filter((e) => {
          const s = e.textContent.trim();
          if (!((ex ? s === t : s.includes(t)) && e.children.length === 0)) return false;
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        const textEl = matches[matches.length - 1];
        if (!textEl) return null;
        textEl.scrollIntoView({ block: 'center' }); // may be below the fold
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

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 3200));

  console.log('signIn:', await clickByText('Sign In'));
  await new Promise((r) => setTimeout(r, 2200));
  for (let i = 0; i < 10; i++) {
    const c =
      (await clickByText('Continue')) ||
      (await clickByText('Finish Setup')) ||
      (await clickByText('Finish')) ||
      (await clickByText('Get Started')) ||
      (await clickByText('Done')) ||
      (await clickByText('Launch Dashboard'));
    console.log(`advance ${i}:`, c);
    await new Promise((r) => setTimeout(r, 1000));
    const onboardingDone = await page.evaluate(() => !document.body.textContent.includes('Step '));
    if (onboardingDone) break;
  }
  await new Promise((r) => setTimeout(r, 1500));

  // 1. POS must NOT trap you in the table picker anymore.
  const pickerAutoOpened = await page.evaluate(() =>
    document.body.textContent.includes('Choose which table this order is for'),
  );
  console.log('NO_AUTO_PICKER (want true):', !pickerAutoOpened);
  await page.screenshot({ path: 'C:\\CafePOS\\web\\shot_g1_pos.png' });

  // 2. Set guest name (chip reachable immediately now).
  console.log('guestChip:', await clickByText('Guest: Walk-in', false));
  await new Promise((r) => setTimeout(r, 800));
  const typed = await page.evaluate(() => {
    const input = document.querySelector('input[placeholder="e.g. Sarah"]');
    if (!input) return false;
    input.focus();
    return true;
  });
  console.log('inputFocused:', typed);
  if (typed) await page.keyboard.type('Rahul Verma', { delay: 30 });
  await new Promise((r) => setTimeout(r, 300));
  console.log('save:', await clickByText('Save'));
  await new Promise((r) => setTimeout(r, 800));
  console.log(
    'GUEST_NAME_VISIBLE:',
    await page.evaluate(() => document.body.textContent.includes('Guest: Rahul Verma')),
  );

  // 3. Fire to kitchen with no table selected → picker opens on demand.
  console.log('fire1:', await clickByText('Fire to Kitchen (KDS)'));
  await new Promise((r) => setTimeout(r, 800));
  const pickerOnDemand = await page.evaluate(() =>
    document.body.textContent.includes('Choose which table this order is for'),
  );
  console.log('PICKER_ON_DEMAND (want true):', pickerOnDemand);
  await page.screenshot({ path: 'C:\\CafePOS\\web\\shot_g2_picker.png' });

  // 4. Pick T2 → order must fire IMMEDIATELY (one-tap flow, no second Fire click).
  console.log('pickT2:', await clickByText('T2'));
  await new Promise((r) => setTimeout(r, 1000));
  console.log(
    'FIRED_ON_TABLE_PICK (want true):',
    await page.evaluate(() => document.body.textContent.includes('Sent to Kitchen (KDS)')),
  );
  await page.screenshot({ path: 'C:\\CafePOS\\web\\shot_g3_receipt.png' });
  console.log(
    'RECEIPT_HAS_GUEST_TITLE (want true):',
    await page.evaluate(() => document.body.textContent.includes('Table #T2 – Rahul Verma')),
  );

  // 5. Close the receipt with the new X button (mdi "close" glyph U+F0156).
  console.log('closeX:', await clickByText('\u{F0156}'));
  await new Promise((r) => setTimeout(r, 800));
  console.log(
    'RECEIPT_CLOSED (want true):',
    await page.evaluate(() => !document.body.textContent.includes('Sent to Kitchen (KDS)')),
  );
  await page.screenshot({ path: 'C:\\CafePOS\\web\\shot_g4_closed.png' });

  await browser.close();
})().catch((e) => {
  console.error('SCRIPT_ERROR:', e);
  process.exit(1);
});
