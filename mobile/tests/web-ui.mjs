// End-to-end test of the browser preview. The native adapter path is tested
// separately with a fake socket; this preview can never connect to a car.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, path === '/' ? 'index.html' : '.' + path);
    if (!file.startsWith(root + sep)) throw new Error('Invalid path');
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
    res.end(content);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  args: ['--no-sandbox'] });
try {
  await mkdir('browser-artifacts', { recursive: true });
  for (const [name, width, height] of [['iphone', 390, 844], ['android', 360, 800]]) {
    const context = await browser.newContext({ viewport: { width, height }, permissions: ['clipboard-read', 'clipboard-write'] });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.getByTestId('try-demo').waitFor();
      assert.equal(await page.getByText('まずは、車なしで体験').count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `browser-artifacts/${name}-home.png`, fullPage: true });
      const requests = [];
      page.on('request', request => requests.push(request.url()));
      await page.getByTestId('try-demo').click();
      await page.getByText('読み取り結果').waitFor();
      assert((await page.getByText('P0420', { exact: true }).count()) >= 1);
      assert.equal(await page.getByText('【サンプル・実車の記録ではありません】').count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `browser-artifacts/${name}-result.png`, fullPage: true });
      await page.getByTestId('share-note').click();
      await page.getByText('相談メモをコピーしました。').waitFor();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      assert(copied.includes('サンプル') && copied.includes('P0420') && copied.includes('2,210 rpm'));
      assert(!copied.includes('1HGFC2F59GA000042'));
      assert.deepEqual(requests, [], 'Sample reading and copying must not send network requests');
      await page.getByRole('button', { name: '別の方法を選ぶ' }).click();
      await page.getByTestId('prepare-device').click();
      assert.equal(await page.getByTestId('connect-device').getAttribute('aria-disabled'), 'true');
      assert.equal(await page.getByText('このブラウザー版はサンプル専用です。実車接続にはスマホアプリの開発ビルドが必要です。').count(), 1);
      await page.getByRole('button', { name: '戻る' }).click();
      await page.getByRole('button', { name: 'Switch to English' }).click();
      assert.equal(await page.getByText('Try it without a car').count(), 1);
      await page.getByTestId('try-demo').click();
      await page.getByText('Your results').waitFor();
      assert.equal(await page.getByText('[SAMPLE — NOT A REAL VEHICLE RECORD]').count(), 1);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
    console.log(`${name}: sample, privacy, connection limits and language switching passed`);
  }
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
