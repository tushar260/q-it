const puppeteer = require('puppeteer');
const path = require('path');
const http = require('http');
const fs = require('fs');

const extensionPath = path.resolve(__dirname, '../../');
const htmlPath = path.resolve(__dirname, '../test.html');

describe('Q It Extension E2E Tests', () => {
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
    
    await new Promise(resolve => server.listen(3000, resolve));

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

    page = await browser.newPage();
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('should auto-open the popup when "Add to question" context menu is triggered', async () => {
    // We cannot reliably trigger native OS context menus via Puppeteer.
    // Instead, we will evaluate a script on the page that sends the exact same
    // runtime message that the selection bar / context menu would send.
    
    // Set up a listener for new targets (popups)
    const popupTargetPromise = new Promise(resolve => {
      browser.on('targetcreated', async target => {
        if (target.url().includes(`chrome-extension://${extensionId}/popup.html`)) {
          resolve(target);
        }
      });
    });

    // Trigger the question action using native Puppeteer mouse movements to highlight text
    const h1 = await page.$('h1');
    const boundingBox = await h1.boundingBox();
    
    // Simulate dragging mouse over the h1 to select text
    await page.mouse.move(boundingBox.x + 5, boundingBox.y + 5);
    await page.mouse.down();
    await page.mouse.move(boundingBox.x + boundingBox.width - 5, boundingBox.y + boundingBox.height - 5, { steps: 10 });
    await page.mouse.up();

    // Wait for the floating UI bar to appear
    await page.waitForSelector('#qit-selection-host', { timeout: 10000 });

    // Click the "Add to question" button inside the shadow DOM
    await page.evaluate(() => {
      const shadowHost = document.querySelector('#qit-selection-host');
      const btn = shadowHost.shadowRoot.querySelector('button[data-act="question"]');
      btn.click();
    });

    // Wait for the popup to open
    const popupTarget = await popupTargetPromise;
    expect(popupTarget).toBeDefined();

    // Attach to the popup page
    const popupPage = await popupTarget.page();
    
    // Wait for the textarea to be populated
    await popupPage.waitForSelector('#question-input');
    
    // Verify the text was transferred to the popup correctly
    const questionText = await popupPage.$eval('#question-input', el => el.value);
    expect(questionText).toBe('Test Form');
    
    await popupPage.close();
  });
});