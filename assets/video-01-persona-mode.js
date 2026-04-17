const puppeteer = require('puppeteer');
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');
const path = require('path');
const fs = require('fs');

async function run() {
    console.log("Launching browser for Persona Toggle video...");
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

        // 1. Initial Mock for Persona ON
        await frame.evaluate(() => {
            window.answerPersonaOn = async function* () {
                const answer = "Based on your context, you haven't mentioned France! I can only answer using the information you provide.";
                for (let word of answer.split(' ')) {
                    yield word + ' ';
                    await new Promise(r => setTimeout(r, 60));
                }
            };
            window.answerPersonaOff = async function* () {
                const answer = "The capital of France is Paris. It is known for its cafe culture and landmarks like the Eiffel Tower.";
                for (let word of answer.split(' ')) {
                    yield word + ' ';
                    await new Promise(r => setTimeout(r, 60));
                }
            };
            window.isPersonaOn = true;

            globalThis.LanguageModel = {
                availability: async () => 'readily',
                params: async () => ({}),
                create: async () => {
                    return {
                        promptStreaming: window.isPersonaOn ? window.answerPersonaOn : window.answerPersonaOff,
                        destroy: async () => {}
                    };
                }
            };
        });

        await frame.evaluate(() => {
            document.body.dataset.theme = 'green';
            document.querySelector('.theme-swatch--green')?.click();
        });

        const popupVideoPath = path.join(__dirname, 'v1.1.1', 'demo-03-persona-mode.mp4');
        await popupRecorder.start(popupVideoPath);

        await new Promise(r => setTimeout(r, 1000));
        await popupPage.evaluate(`window.showTooltip('Opening Q It extension...')`);
        
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
        
        await popupPage.evaluate(`window.showTooltip('Persona Mode is ON. It STRICTLY uses context.')`);
        await new Promise(r => setTimeout(r, 2500));
        
        // Ask out of context question
        await frame.click('#tab-question');
        await new Promise(r => setTimeout(r, 500));
        await frame.type('#question', 'What is the capital of France?', { delay: 40 });
        await new Promise(r => setTimeout(r, 500));
        await popupPage.keyboard.press('Enter');
        
        await popupPage.evaluate(`window.hideTooltip()`);
        
        // Wait for streaming to finish
        await new Promise(r => setTimeout(r, 4500));
        
        await popupPage.evaluate(`window.showTooltip('AI refused because the answer is not in context!')`);
        await new Promise(r => setTimeout(r, 3500));
        await popupPage.evaluate(`window.hideTooltip()`);

        // Go to settings and toggle
        await frame.click('#tab-settings');
        await new Promise(r => setTimeout(r, 800));

        const toggleRect = await frame.evaluate(() => {
            const el = document.getElementById('persona-mode-toggle').nextElementSibling; // the visual toggle slider
            const r = el.getBoundingClientRect();
            return { x: 632 + r.left + r.width/2, y: 54 + r.top + r.height/2 };
        });
        
        await popupPage.evaluate(`window.moveCursor(${toggleRect.x}, ${toggleRect.y})`);
        await new Promise(r => setTimeout(r, 1000));
        
        await popupPage.evaluate(`window.showTooltip('Disabling Persona Mode allows General AI Knowledge.')`);
        await popupPage.evaluate(`window.clickCursor()`);
        await frame.evaluate(() => {
            document.getElementById('persona-mode-toggle').click();
            window.isPersonaOn = false; // toggle mock
        });
        await new Promise(r => setTimeout(r, 2000));
        await popupPage.evaluate(`window.hideTooltip()`);

        // Go back to question and ask again
        await frame.click('#tab-question');
        await new Promise(r => setTimeout(r, 800));

        await popupPage.evaluate(`window.showTooltip('Asking the exact same question again...')`);
        
        // Need to hit submit again. Clear and re-type to make it obvious and ensure focus.
        const inputRect = await frame.evaluate(() => {
            const el = document.getElementById('question');
            const r = el.getBoundingClientRect();
            return { x: 632 + r.left + r.width/2, y: 54 + r.top + r.height/2 };
        });
        await popupPage.evaluate(`window.moveCursor(${inputRect.x}, ${inputRect.y})`);
        await new Promise(r => setTimeout(r, 800));
        await popupPage.evaluate(`window.clickCursor()`);
        
        await frame.focus('#question');
        await frame.evaluate(() => { document.getElementById('question').value = ''; });
        await frame.type('#question', 'What is the capital of France?', { delay: 40 });
        await new Promise(r => setTimeout(r, 500));
        await popupPage.keyboard.press('Enter');

        await new Promise(r => setTimeout(r, 4500)); // streaming wait

        await popupPage.evaluate(`window.showTooltip('Now it works! AI uses its general knowledge.')`);
        await new Promise(r => setTimeout(r, 3500));
        await popupPage.evaluate(`window.hideTooltip()`);

        await popupRecorder.stop();
        await popupPage.close();
        console.log("Persona toggle video saved to", popupVideoPath);

    } finally {
        if (browser) await browser.close();
        fs.writeFileSync(manifestPath, originalManifest);
    }
}

run().catch(console.error);