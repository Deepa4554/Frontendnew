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
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 3200));

  // sign in
  const rect = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const el = els.find((e) => e.textContent.trim() === 'Sign In' && e.children.length === 0);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (rect) await page.mouse.click(rect.x, rect.y);
  await new Promise((r) => setTimeout(r, 2500));

  const info = await page.evaluate(() => {
    const leaves = Array.from(document.querySelectorAll('div,span,button')).filter(
      (e) => e.textContent.trim() === 'Continue' && e.children.length === 0,
    );
    return leaves.map((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        visible: r.width > 0 && r.height > 0,
        topIsSelfOrAncestor: top ? el.contains(top) || top.contains(el) || top === el : false,
        topTag: top ? top.tagName + '.' + (top.className || '').toString().slice(0, 60) : null,
      };
    });
  });
  console.log(JSON.stringify(info, null, 2));

  // Try clicking the LAST visible Continue (topmost screen is mounted last in DOM)
  const r2 = await page.evaluate(() => {
    const leaves = Array.from(document.querySelectorAll('div,span,button')).filter(
      (e) => e.textContent.trim() === 'Continue' && e.children.length === 0,
    );
    const vis = leaves.filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const el = vis[vis.length - 1];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  console.log('clicking last visible at', r2);
  if (r2) await page.mouse.click(r2.x, r2.y);
  await new Promise((r) => setTimeout(r, 1500));
  const step = await page.evaluate(() => {
    const m = document.body.textContent.match(/Step \d of \d/g);
    return m;
  });
  console.log('steps in DOM after click:', step);
  await page.screenshot({ path: 'C:\\CafePOS\\web\\shot_debug.png' });
  await browser.close();
})().catch((e) => {
  console.error('SCRIPT_ERROR:', e);
  process.exit(1);
});
