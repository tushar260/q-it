const puppeteer = require('puppeteer');
const path = require('path');
const http = require('http');
const fs = require('fs');

const extensionPath = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.resolve(__dirname, 'test.html'), 'utf8');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

server.listen(3000, async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err));

    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
    
    // Check if content script loaded by looking for PAGE_AUTOFILL_FAB_ID
    console.log("Waiting for FAB to verify content script loaded...");
    await page.waitForSelector('#qit-page-autofill-fab', { timeout: 5000 });
    console.log("Content script loaded successfully.");

    console.log("Focusing on the first input...");
    await page.focus('#firstName');
    
    console.log("Waiting for dropdown...");
    await page.waitForSelector('#qit-autofill-dropdown', { timeout: 5000, visible: true });
    
    const dropdownHtml = await page.$eval('#qit-autofill-dropdown', el => el.innerHTML);
    console.log("Dropdown Content:", dropdownHtml);
    
    console.log("Test passed!");
  } catch (e) {
    console.error("Test failed:", e);
  } finally {
    await browser.close();
    server.close();
  }
});