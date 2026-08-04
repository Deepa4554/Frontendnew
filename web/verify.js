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
  page.on('console', (msg) => console.log('PAGE:', msg.text()));
  page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 3200)); // let SplashScreen's 2.5s timer fire
  await page.screenshot({ path: 'C:\\CafePOS\\web\\shot_1_login.png' });

  // Click "Sign In" — find the deepest element with that exact text, then click its
  // nearest clickable ancestor (react-native-web Pressable renders as a plain div).
  const signInClicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const textEl = els.find((e) => e.textContent.trim() === 'Sign In' && e.children.length === 0);
    let target = textEl;
    while (target && target.getAttribute('role') !== 'button' && target.tagName !== 'BUTTON') {
      target = target.parentElement;
    }
    target = target || textEl;
    if (target) {
      target.click();
      return true;
    }
    return false;
  });
  console.log('signInClicked:', signInClicked);
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: 'C:\\CafePOS\\web\\shot_2_after_signin.png' });

  const clickByText = async (text) => {
    return page.evaluate((t) => {
      const els = Array.from(document.querySelectorAll('div,span,button'));
      const textEl = els.find((e) => e.textContent.trim() === t && e.children.length === 0);
      let target = textEl;
      while (target && target.getAttribute('role') !== 'button' && target.tagName !== 'BUTTON') {
        target = target.parentElement;
      }
      target = target || textEl;
      if (target) {
        target.click();
        return true;
      }
      return false;
    }, text);
  };

  for (let i = 0; i < 4; i++) {
    const clicked = await clickByText('Continue');
    console.log(`continue click ${i}:`, clicked);
    await new Promise((r) => setTimeout(r, 700));
  }
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: 'C:\\CafePOS\\web\\shot_3_pos.png' });

  await browser.close();
})().catch((e) => {
  console.error('SCRIPT_ERROR:', e);
  process.exit(1);
});
