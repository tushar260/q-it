const puppeteer = require('puppeteer');
const path = require('path');
const http = require('http');
const fs = require('fs');

const extensionPath = path.resolve(__dirname, '../../');
const htmlPath = path.resolve(__dirname, '../test.html');

describe('Q It Extension E2E Tests - Page Autofill', () => {
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
    
    await new Promise(resolve => server.listen(3001, resolve));

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
              // Return a JSON string for page autofill
              return JSON.stringify({ "action": "fill", "fields": { "firstName": "John", "jobTitle": "Engineer" } });
            },
            destroy: () => {}
          }),
          availability: async () => 'readily'
        }
      };
    });

    page = await browser.newPage();
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle0' });
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('should display the floating FAB and open the page autofill modal when clicked', async () => {
    // 1. Verify the FAB is injected and visible
    await page.waitForSelector('#qit-page-autofill-fab', { visible: true, timeout: 5000 });
    const fabText = await page.$eval('#qit-page-autofill-fab span', el => el.innerText);
    expect(fabText).toBe('Q');

    // 2. Click the FAB
    await page.click('#qit-page-autofill-fab');

    // 3. Wait for the modal to appear
    await page.waitForSelector('#qit-page-autofill-modal', { visible: true, timeout: 5000 });
    
    // 4. Check if the modal contains the title "Review Autofill Suggestions"
    const modalHtml = await page.$eval('#qit-page-autofill-modal', el => el.innerHTML);
    expect(modalHtml).toContain('Review Autofill Suggestions');

    // 5. The modal should show the suggestion from the simulated AI response
    await page.waitForSelector('.qit-suggestion-input', { visible: true, timeout: 5000 });
    const suggestionValue = await page.$eval('.qit-suggestion-input', el => el.value);
    expect(suggestionValue).toBe('John');
    
    // 6. Close the modal by clicking the Cancel button
    await page.click('#qit-page-autofill-modal .btn-cancel');

    // 7. Verify the modal is removed
    const modalExists = await page.$('#qit-page-autofill-modal');
    expect(modalExists).toBeNull();
  });
});
