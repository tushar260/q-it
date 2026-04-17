const puppeteer = require('puppeteer');
const path = require('path');
const http = require('http');
const fs = require('fs');

const extensionPath = path.resolve(__dirname, '../../');
const htmlPath = path.resolve(__dirname, '../test.html');

describe('Q It Extension E2E Tests - Inline Autofill', () => {
  let browser;
  let server;
  let page;
  let extensionId;

  beforeAll(async () => {
    // Start local server to host test.html
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(htmlPath, 'utf8'));
    });
    
    await new Promise(resolve => server.listen(3002, resolve));

    // Launch Puppeteer with extension
    browser = await puppeteer.launch({
      headless: false, // Extensions only work in headful mode
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });

    // Find the extension ID
    const workerTarget = await browser.waitForTarget(
      target => target.type() === 'service_worker' && target.url().endsWith('background.js')
    );
    extensionId = workerTarget.url().split('/')[2];

    // Mock Chrome's Prompt API directly inside the background service worker
    const worker = await workerTarget.worker();
    await worker.evaluate(() => {
      self.ai = {
        languageModel: {
          create: async () => ({
            prompt: async (payload) => {
              return "John Doe";
            },
            destroy: () => {}
          }),
          capabilities: async () => ({ available: 'readily' })
        }
      };
    });

    page = await browser.newPage();
    await page.goto('http://localhost:3002', { waitUntil: 'networkidle0' });
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('should trigger inline autofill dropdown on job related fields', async () => {
    // 1. Focus on the First Name input
    await page.focus('#firstName');

    // 3. Wait for the visible dropdown and click Apply
    await page.waitForSelector('#qit-autofill-dropdown', { visible: true, timeout: 5000 });
    await page.click('#qit-autofill-dropdown .qit-apply-btn');

    // 4. Verify input was updated
    const inputValue = await page.$eval('#firstName', el => el.value);
    expect(inputValue).toBe('John Doe');

    // 5. Verify dropdown is gone
    const dropdownExists = await page.$('#qit-autofill-dropdown');
    expect(dropdownExists).toBeNull();
  });
});
