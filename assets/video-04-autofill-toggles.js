const puppeteer = require('puppeteer');
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');
const path = require('path');
const fs = require('fs');

async function run() {
    console.log("Launching browser for Autofill Toggles video...");
    const extPath = path.resolve(__dirname, '..');
    
    const manifestPath = path.join(extPath, 'manifest.json');
    const originalManifest = fs.readFileSync(manifestPath, 'utf8');
    const manifestObj = JSON.parse(originalManifest);
    if (manifestObj.minimum_chrome_version) {
        delete manifestObj.minimum_chrome_version;
    }
    manifestObj.web_accessible_resources = [
        { resources: ["*"], matches: ["<all_urls>"] }
    ];
    fs.writeFileSync(manifestPath, JSON.stringify(manifestObj, null, 2));

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: [
                `--disable-extensions-except=${extPath}`,
                `--load-extension=${extPath}`,
                `--window-size=1280,800`
            ]
        });

        await new Promise(r => setTimeout(r, 2000));

        const jobPage = await browser.newPage();
        await jobPage.setViewport({ width: 1024, height: 768, deviceScaleFactor: 2 });
        
        const popupRecorder = new PuppeteerScreenRecorder(jobPage, {
            fps: 30,
            videoFrame: { width: 1024, height: 768 },
            videoCrf: 18,
            videoCodec: 'libx264',
            videoPreset: 'ultrafast',
            videoBitrate: 2000,
            autopad: { color: 'white' }
        });

        const fakeJobUrl = `file://${path.join(__dirname, 'fake-job-board.html')}`;
        await jobPage.goto(fakeJobUrl);
        
        const popupVideoPath = path.join(__dirname, 'v1.1.1', 'demo-04-autofill-toggles.mp4');
        await popupRecorder.start(popupVideoPath);

        await new Promise(r => setTimeout(r, 1000));
        
        // 1. Inline Autofill Demo
        await jobPage.evaluate(`window.showTooltip('Click on fields to use Inline Autofill')`);
        
        const firstNameRect = await jobPage.evaluate(() => {
            const el = document.getElementById('first-name');
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width/2, y: r.top + r.height/2 };
        });
        
        await jobPage.evaluate(`window.moveCursor(${firstNameRect.x}, ${firstNameRect.y})`);
        await new Promise(r => setTimeout(r, 800));
        await jobPage.evaluate(`window.clickCursor()`);
        await jobPage.click('#first-name');
        
        // Wait for inline dropdown to appear and animation
        await new Promise(r => setTimeout(r, 1500));
        
        // Click the dropdown suggestion
        const dropdownRect = await jobPage.evaluate(() => {
            const dropdown = document.getElementById('qit-autofill-dropdown');
            if (dropdown && dropdown.shadowRoot) {
                const el = dropdown.shadowRoot.querySelector('.qit-apply-btn');
                if (el) {
                    const r = el.getBoundingClientRect();
                    return { x: r.left + r.width/2, y: r.top + r.height/2 };
                }
            }
            return { x: 500, y: 500 };
        });
        
        if (dropdownRect.x !== 500) {
            await jobPage.evaluate(`window.moveCursor(${dropdownRect.x}, ${dropdownRect.y})`);
            await new Promise(r => setTimeout(r, 600));
            await jobPage.evaluate(`window.clickCursor()`);
            await jobPage.evaluate(() => {
                const dropdown = document.getElementById('qit-autofill-dropdown');
                if (dropdown && dropdown.shadowRoot) {
                    const btn = dropdown.shadowRoot.querySelector('.qit-apply-btn');
                    if (btn) btn.click();
                }
            });
            await new Promise(r => setTimeout(r, 1000));
        }
        
        await jobPage.evaluate(`window.hideTooltip()`);
        await new Promise(r => setTimeout(r, 500));
        
        // 2. Page Autofill Demo
        await jobPage.evaluate(`window.showTooltip('Or click the Q to autofill the ENTIRE page autonomously!')`);
        await new Promise(r => setTimeout(r, 1500));
        
        const fabRect = await jobPage.evaluate(() => {
            const el = document.getElementById('qit-page-autofill-fab');
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width/2, y: r.top + r.height/2 };
        });
        
        await jobPage.evaluate(`window.moveCursor(${fabRect.x}, ${fabRect.y})`);
        await new Promise(r => setTimeout(r, 800));
        await jobPage.evaluate(`window.clickCursor()`);
        await jobPage.click('#qit-page-autofill-fab');
        
        // Wait for modal to load, click Add, then fill
        await new Promise(r => setTimeout(r, 4500));
        
        // Modal Apply Button
        const applyRect = await jobPage.evaluate(() => {
            const modal = document.getElementById('qit-page-autofill-modal');
            if (modal && modal.shadowRoot) {
                const el = modal.shadowRoot.querySelector('.btn-apply');
                if (el) {
                    const r = el.getBoundingClientRect();
                    return { x: r.left + r.width/2, y: r.top + r.height/2 };
                }
            }
            return { x: 500, y: 500 };
        });
        
        if (applyRect.x !== 500) {
            await jobPage.evaluate(`window.showTooltip('Review the changes and Apply')`);
            await jobPage.evaluate(`window.moveCursor(${applyRect.x}, ${applyRect.y})`);
            await new Promise(r => setTimeout(r, 1000));
            await jobPage.evaluate(`window.clickCursor()`);
            await jobPage.evaluate(() => {
                const modal = document.getElementById('qit-page-autofill-modal');
                if (modal && modal.shadowRoot) {
                    const btn = modal.shadowRoot.querySelector('.btn-apply');
                    if (btn) btn.click();
                }
            });
        }
        
        await new Promise(r => setTimeout(r, 2000));
        
        await jobPage.evaluate(`window.showTooltip('Auto-click handled the "Add Experience" button for you!')`);
        await new Promise(r => setTimeout(r, 4000));
        
        await jobPage.evaluate(`window.hideTooltip()`);
        await popupRecorder.stop();
        await jobPage.close();
        console.log("Autofill Toggles video saved to", popupVideoPath);

    } finally {
        if (browser) await browser.close();
        fs.writeFileSync(manifestPath, originalManifest);
    }
}

run().catch(console.error);