const puppeteer = require('puppeteer');
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');
const path = require('path');
const fs = require('fs');

async function run() {
    console.log("Launching browser for Popup Flow video...");
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

        const workerTarget = await browser.waitForTarget(
            target => target.type() === 'service_worker' || target.type() === 'background_page'
        );
        const extId = workerTarget.url().split('/')[2];
    
        const popupPage = await browser.newPage();
        await popupPage.setViewport({ width: 1024, height: 768, deviceScaleFactor: 2 });
        
        const popupRecorder = new PuppeteerScreenRecorder(popupPage, {
            fps: 30,
            videoFrame: { width: 1024, height: 768 },
            videoCrf: 18,
            videoCodec: 'libx264',
            videoPreset: 'ultrafast',
            videoBitrate: 2000,
            autopad: { color: 'white' }
        });

        const fakeBrowserUrl = `file://${path.join(__dirname, 'fake-browser.html')}?extId=${extId}`;
        await popupPage.goto(fakeBrowserUrl);
        
        // Inject floating tooltip helper into the fake browser page
        await popupPage.evaluate(() => {
            const tooltip = document.createElement('div');
            tooltip.id = 'video-tooltip';
            tooltip.style.position = 'absolute';
            tooltip.style.bottom = '40px';
            tooltip.style.left = '50%';
            tooltip.style.transform = 'translateX(-50%) translateY(20px)';
            tooltip.style.background = 'rgba(0,0,0,0.85)';
            tooltip.style.color = '#fff';
            tooltip.style.padding = '12px 24px';
            tooltip.style.borderRadius = '30px';
            tooltip.style.fontFamily = 'system-ui, sans-serif';
            tooltip.style.fontSize = '16px';
            tooltip.style.fontWeight = '500';
            tooltip.style.zIndex = '100000';
            tooltip.style.opacity = '0';
            tooltip.style.transition = 'all 0.4s ease';
            tooltip.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
            document.body.appendChild(tooltip);

            window.showTooltip = (text) => {
                tooltip.textContent = text;
                tooltip.style.opacity = '1';
                tooltip.style.transform = 'translateX(-50%) translateY(0)';
            };
            window.hideTooltip = () => {
                tooltip.style.opacity = '0';
                tooltip.style.transform = 'translateX(-50%) translateY(20px)';
            };
        });

        const iframeElement = await popupPage.$('#ext-iframe');
        const frame = await iframeElement.contentFrame();

        await frame.evaluate(() => {
            Object.defineProperty(navigator, 'clipboard', {
                value: { writeText: async () => { return Promise.resolve(); } },
                writable: true, configurable: true
            });

            globalThis.LanguageModel = {
                availability: async () => 'readily',
                params: async () => ({}),
                create: async () => {
                    return {
                        promptStreaming: async function* (q) {
                            let answer = "";
                            if (q.includes('Who am I')) {
                                answer = "My name is Tushar Arora. I am a Tech Lead at Scrut Automation. I love building delightful user experiences!";
                            } else {
                                answer = "You are a Tech Lead at Scrut Automation.";
                            }
                            const words = answer.split(' ');
                            let current = '';
                            for (let word of words) {
                                current += word + ' ';
                                yield current;
                                await new Promise(r => setTimeout(r, 60));
                            }
                        },
                        destroy: async () => {}
                    };
                }
            };
        });

        await frame.evaluate(() => {
            document.body.dataset.theme = 'yellow';
            document.querySelector('.theme-swatch--yellow')?.click();
        });

        const popupVideoPath = path.join(__dirname, 'v1.1.1', 'demo-02-core-flow.mp4');
        await popupRecorder.start(popupVideoPath);

        await new Promise(r => setTimeout(r, 1000));
        await popupPage.evaluate(`window.showTooltip('Open the Q It extension')`);
        
        const iconRect = await popupPage.evaluate(() => {
            const el = document.getElementById('q-it-icon');
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width/2, y: r.top + r.height/2 };
        });
        
        await popupPage.evaluate(`window.moveCursor(${iconRect.x}, ${iconRect.y})`);
        await new Promise(r => setTimeout(r, 800));
        
        await popupPage.evaluate(`window.clickCursor()`);
        await popupPage.click('#q-it-icon');
        
        await new Promise(r => setTimeout(r, 1000));

        // First, briefly show settings to verify Persona Mode is ON
        await popupPage.evaluate(`window.showTooltip('Notice: Persona Mode is ON')`);
        await frame.click('#tab-settings');
        await new Promise(r => setTimeout(r, 1000));
        
        const personaToggleRect = await frame.evaluate(() => {
            const el = document.getElementById('persona-mode-toggle').nextElementSibling;
            const r = el.getBoundingClientRect();
            return { x: 632 + r.left + r.width/2, y: 54 + r.top + r.height/2 };
        });
        await popupPage.evaluate(`window.moveCursor(${personaToggleRect.x}, ${personaToggleRect.y})`);
        await new Promise(r => setTimeout(r, 2000));
        await popupPage.evaluate(`window.hideTooltip()`);
        
        // Now proceed to Context
        await popupPage.evaluate(`window.showTooltip('Provide your context')`);
        
        await frame.click('#tab-context');
        await new Promise(r => setTimeout(r, 300));
        await frame.type('#context-text', 'My name is Tushar Arora. I am a Tech Lead at Scrut Automation.', { delay: 40 });
        await new Promise(r => setTimeout(r, 500));
        
        await popupPage.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 1000));
        
        await popupPage.evaluate(`window.showTooltip('Ask a question (Persona Mode is ON, answering ONLY from context)')`);
        await frame.click('#tab-question');
        await new Promise(r => setTimeout(r, 500));
        
        await frame.type('#question', 'Who am I and what do I do?', { delay: 40 });
        await new Promise(r => setTimeout(r, 500));
        await popupPage.keyboard.press('Enter');
        
        await popupPage.evaluate(`window.hideTooltip()`);
        await new Promise(r => setTimeout(r, 4500));
        
        await popupPage.evaluate(`window.showTooltip('Copy the answer')`);
        const copyRect = await frame.evaluate(() => {
            const el = document.getElementById('copy-btn');
            const r = el.getBoundingClientRect();
            return { x: 632 + r.left + r.width/2, y: 54 + r.top + r.height/2 };
        });
        
        await popupPage.evaluate(`window.moveCursor(${copyRect.x}, ${copyRect.y})`);
        await new Promise(r => setTimeout(r, 800));
        
        await popupPage.evaluate(`window.clickCursor()`);
        await frame.click('#copy-btn');
        await new Promise(r => setTimeout(r, 1500));
        await popupPage.evaluate(`window.hideTooltip()`);

        await popupRecorder.stop();
        await popupPage.close();
        console.log("Popup video saved to", popupVideoPath);

    } finally {
        if (browser) await browser.close();
        fs.writeFileSync(manifestPath, originalManifest);
    }
}

run().catch(console.error);