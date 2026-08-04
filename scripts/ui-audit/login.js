// Shared login helper for the UI audit scripts. Fills the LoginScreen form
// (selected by placeholder/text, since the screen has no testIDs) and waits
// for the app shell (bottom tab bar / desktop sidebar) to mount.
const DEMO_PASSWORD = 'CafePos#Demo2026';
const demoEmailFor = (role) => `${role.toLowerCase()}@cafepos.local`;

async function loginAs(page, role, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  // SplashScreen briefly shows while restoreSession runs; wait for the Login
  // form's email field instead of a fixed timeout.
  const emailInput = page.getByPlaceholder('manager@cafepos.ai');
  await emailInput.waitFor({ state: 'visible', timeout: 15000 });

  await emailInput.fill(demoEmailFor(role));
  await page.getByPlaceholder('••••••••').fill(DEMO_PASSWORD);
  await page.getByText('Sign In', { exact: true }).click();

  // Post-login lands on MainTabs (POS) for normal roles, or SuperAdminRoot
  // for the platform admin — either way, wait for network to settle once
  // the login screen itself is gone.
  await emailInput.waitFor({ state: 'detached', timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

module.exports = { loginAs, demoEmailFor, DEMO_PASSWORD };
