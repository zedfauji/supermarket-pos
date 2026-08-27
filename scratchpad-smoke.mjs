import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

await page.goto('http://localhost:1520/', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(1500);

const rootHtml = await page.$eval('#root', (el) => el.innerHTML.length);
const title = await page.title();
console.log('TITLE:', title);
console.log('ROOT_HTML_LEN:', rootHtml);
console.log('URL:', page.url());
console.log('CONSOLE_ERRORS:', JSON.stringify(errors, null, 2));

await browser.close();
