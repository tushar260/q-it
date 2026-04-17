const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function run() {
    console.log("Launching browser for screenshot generation...");
    const extPath = path.resolve(__dirname, '..');
    
    // Temporarily remove minimum_chrome_version for puppeteer
    const manifestPath = path.join(extPath, 'manifest.json');
    const originalManifest = fs.readFileSync(manifestPath, 'utf8');
    const manifestObj = JSON.parse(originalManifest);
    if (manifestObj.minimum_chrome_version) {
        delete manifestObj.minimum_chrome_version;
        fs.writeFileSync(manifestPath, JSON.stringify(manifestObj, null, 2));
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                `--disable-extensions-except=${extPath}`,
                `--load-extension=${extPath}`,
                `--hide-scrollbars`
            ]
        });

        const workerTarget = await browser.waitForTarget(
            target => target.type() === 'service_worker' || target.type() === 'background_page'
        );
        const workerUrl = workerTarget.url();
        const extId = workerUrl.split('/')[2];
        
        const page = await browser.newPage();

        async function takeScreenshot(name, setupFn, width, height) {
            console.log(`Taking screenshot for ${name}...`);
            await page.setViewport({ width, height });
            await page.goto(`chrome-extension://${extId}/popup.html`);
            await new Promise(r => setTimeout(r, 500)); // wait for init
            await page.evaluate(setupFn);
            await new Promise(r => setTimeout(r, 300)); // wait for animations/DOM changes
            await page.screenshot({ path: path.join(__dirname, 'v1.1.1', `${name}.png`) });
        }

        // 1. Context Yellow
        await takeScreenshot('context-yellow', () => {
        document.body.dataset.theme = 'yellow';
        document.getElementById('tab-context').click();
        
        // Show attached file
        document.getElementById('history-container').style.display = 'block';
        document.getElementById('file-history-section').style.display = 'block';
        
        const fileList = document.getElementById('file-list');
        fileList.innerHTML = `
            <li class="history-item">
                <span class="history-item__text" title="Tushar Arora.txt">Tushar Arora.txt</span>
                <button class="icon-btn--small">
                    <svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path></svg>
                </button>
            </li>
        `;
        
        document.querySelector('#file-history-section .label-row').innerHTML = `
            <span class="label">Files<span id="stat-files-detail" style="font-weight: normal; text-transform: none; font-size: 11px; margin-left: 6px; color: var(--text-muted);">(1 total)</span></span>
            <button type="button" class="icon-btn--small"><svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path></svg></button>
        `;
    }, 380, 420);

    // 2. Question Pink
    await takeScreenshot('question-pink', () => {
        document.body.dataset.theme = 'pink';
        document.getElementById('tab-question').click();
        
        document.getElementById('answer-block').hidden = false;
        document.getElementById('asked-question-container').style.display = 'flex';
        document.getElementById('asked-question-text').textContent = 'What is your name?';
        
        const shell = document.querySelector('.answer-shell');
        if (shell) shell.hidden = false;
        
        document.getElementById('answer-text').classList.remove('is-loading');
        document.getElementById('answer-text').innerHTML = '<p style="margin:0;">My name is Tushar Arora. I am a Software Engineer.</p>';
        document.getElementById('copy-btn').style.display = 'inline-flex';
        
        document.getElementById('question').value = 'What should we answer?';
    }, 380, 420);

    // 3. Settings Green
    await takeScreenshot('settings-green', () => {
        document.querySelector('.theme-swatch--green').click();
        document.getElementById('tab-settings').click();
        
        // Turn on Persona mode
        document.getElementById('persona-mode-toggle').checked = true;
        // Turn off auto copy
        document.getElementById('autocopy-toggle').checked = false;
        
        // Ensure checkboxes reflect state visually
        document.querySelectorAll('input[type="checkbox"]').forEach(c => {
            const ev = new Event('change', { bubbles: true });
            c.dispatchEvent(ev);
        });
        
    }, 380, 600);

    // 4. Settings Dark
    await takeScreenshot('settings-dark', () => {
        // Set dark mode instantly without animation
        document.body.dataset.mode = 'dark';
        
        // Select white theme
        document.querySelector('.theme-swatch--white').click();
        
        document.getElementById('tab-settings').click();
        
        // Set toggle states
        document.getElementById('dark-mode-toggle').checked = true;
        document.getElementById('persona-mode-toggle').checked = false;
        document.getElementById('autocopy-toggle').checked = true;
        document.getElementById('autofill-toggle').checked = true;
        document.getElementById('autoclick-toggle').checked = true;

        document.querySelectorAll('input[type="checkbox"]').forEach(c => {
            const ev = new Event('change', { bubbles: true });
            c.dispatchEvent(ev);
        });
        
        // Scroll down to match the user's screenshot where "Theme Color" and "Dark Mode" are visible at the bottom
        document.body.style.overflow = 'auto';
        document.documentElement.style.overflow = 'auto';
        window.scrollTo(0, document.body.scrollHeight);
        
    }, 380, 600);

    } finally {
        if (browser) {
            await browser.close();
        }
        // Restore manifest
        fs.writeFileSync(manifestPath, originalManifest);
    }
    console.log("Raw screenshots captured!");
}

run().catch(console.error);