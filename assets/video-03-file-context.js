const puppeteer = require('puppeteer');
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');
const path = require('path');
const fs = require('fs');

async function run() {
    console.log("Launching browser for File Upload video...");
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
        
        // Inject tooltip
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
                            const answer = "Scrut Automation is a risk observability platform that helps companies streamline compliance and simplify information security audits.";
                            for (let word of answer.split(' ')) {
                                yield word + ' ';
                                await new Promise(r => setTimeout(r, 60));
                            }
                        },
                        destroy: async () => {}
                    };
                }
            };
        });

        // Set pink theme initially
        await frame.evaluate(() => {
            document.body.dataset.theme = 'pink';
            document.querySelector('.theme-swatch--pink')?.click();
        });

        const popupVideoPath = path.join(__dirname, 'v1.1.1', 'demo-03-file-context.mp4');
        await popupRecorder.start(popupVideoPath);

        await new Promise(r => setTimeout(r, 1000));
        
        // 1. Open extension
        await popupPage.evaluate(`window.clickCursor()`);
        await popupPage.click('#q-it-icon');
        await new Promise(r => setTimeout(r, 1000));
        
        // Ensure we are on the context tab to start
        await frame.click('#tab-context');
        await new Promise(r => setTimeout(r, 300));

        await popupPage.evaluate(`window.showTooltip('Upload local files to give AI context')`);
        
        // 2. Upload file
        const attachRect = await frame.evaluate(() => {
            const el = document.getElementById('attach-btn');
            const r = el.getBoundingClientRect();
            return { x: 632 + r.left + r.width/2, y: 54 + r.top + r.height/2 };
        });
        
        await popupPage.evaluate(`window.moveCursor(${attachRect.x}, ${attachRect.y})`);
        await new Promise(r => setTimeout(r, 800));
        await popupPage.evaluate(`window.clickCursor()`);
        
        // --- START FAKE MAC FILE PICKER ---
        await popupPage.evaluate(`window.showTooltip('Selecting file from macOS picker...')`);
        await popupPage.evaluate(() => {
            const picker = document.createElement('div');
            picker.id = 'fake-mac-picker';
            picker.style.position = 'absolute';
            picker.style.top = '120px';
            picker.style.left = '50%';
            picker.style.transform = 'translateX(-50%)';
            picker.style.width = '600px';
            picker.style.height = '400px';
            picker.style.backgroundColor = '#ececec';
            picker.style.borderRadius = '10px';
            picker.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)';
            picker.style.zIndex = '99999';
            picker.style.display = 'flex';
            picker.style.flexDirection = 'column';
            picker.style.overflow = 'hidden';
            picker.style.border = '1px solid #bfbfbf';
            picker.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

            // Top Bar
            const topBar = document.createElement('div');
            topBar.style.height = '40px';
            topBar.style.backgroundColor = '#dfdfdf';
            topBar.style.borderBottom = '1px solid #c9c9c9';
            topBar.style.display = 'flex';
            topBar.style.alignItems = 'center';
            topBar.style.justifyContent = 'center';
            topBar.style.position = 'relative';
            
            const title = document.createElement('div');
            title.textContent = 'Open';
            title.style.fontWeight = '600';
            title.style.fontSize = '13px';
            title.style.color = '#333';
            topBar.appendChild(title);

            // Body
            const body = document.createElement('div');
            body.style.flex = '1';
            body.style.backgroundColor = '#fff';
            body.style.display = 'flex';

            // Sidebar
            const sidebar = document.createElement('div');
            sidebar.style.width = '140px';
            sidebar.style.backgroundColor = '#f2f2f2';
            sidebar.style.borderRight = '1px solid #d9d9d9';
            sidebar.style.padding = '10px';
            sidebar.innerHTML = '<div style="color: #666; font-size: 11px; font-weight: bold; margin-bottom: 5px;">Favorites</div><div style="font-size: 13px; padding: 4px; background: #dcdcdc; border-radius: 4px; margin-bottom: 2px;">📄 Documents</div><div style="font-size: 13px; padding: 4px; margin-bottom: 2px;">⬇️ Downloads</div><div style="font-size: 13px; padding: 4px;">💻 Desktop</div>';
            body.appendChild(sidebar);

            // File List
            const fileList = document.createElement('div');
            fileList.style.flex = '1';
            fileList.style.padding = '10px';
            
            const fileItem = document.createElement('div');
            fileItem.id = 'fake-file-item';
            fileItem.style.display = 'flex';
            fileItem.style.alignItems = 'center';
            fileItem.style.padding = '4px 8px';
            fileItem.style.borderRadius = '4px';
            fileItem.style.cursor = 'default';
            fileItem.innerHTML = '<span style="font-size: 16px; margin-right: 8px;">📝</span><span style="font-size: 13px;">dummy-context.txt</span>';
            fileList.appendChild(fileItem);

            const otherFile = document.createElement('div');
            otherFile.style.display = 'flex';
            otherFile.style.alignItems = 'center';
            otherFile.style.padding = '4px 8px';
            otherFile.style.borderRadius = '4px';
            otherFile.innerHTML = '<span style="font-size: 16px; margin-right: 8px;">📊</span><span style="font-size: 13px;">financial-report.csv</span>';
            fileList.appendChild(otherFile);
            
            body.appendChild(fileList);

            // Bottom Bar
            const bottomBar = document.createElement('div');
            bottomBar.style.height = '50px';
            bottomBar.style.backgroundColor = '#dfdfdf';
            bottomBar.style.borderTop = '1px solid #c9c9c9';
            bottomBar.style.display = 'flex';
            bottomBar.style.alignItems = 'center';
            bottomBar.style.justifyContent = 'flex-end';
            bottomBar.style.padding = '0 16px';
            bottomBar.style.gap = '8px';

            const cancelBtn = document.createElement('div');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.padding = '4px 12px';
            cancelBtn.style.backgroundColor = '#fff';
            cancelBtn.style.border = '1px solid #d0d0d0';
            cancelBtn.style.borderRadius = '4px';
            cancelBtn.style.fontSize = '13px';
            cancelBtn.style.color = '#333';
            bottomBar.appendChild(cancelBtn);

            const openBtn = document.createElement('div');
            openBtn.id = 'fake-open-btn';
            openBtn.textContent = 'Open';
            openBtn.style.padding = '4px 12px';
            openBtn.style.backgroundColor = '#007aff';
            openBtn.style.border = '1px solid #0060cc';
            openBtn.style.borderRadius = '4px';
            openBtn.style.fontSize = '13px';
            openBtn.style.color = '#fff';
            openBtn.style.fontWeight = '500';
            openBtn.style.opacity = '0.5'; // disabled state until selected
            bottomBar.appendChild(openBtn);

            picker.appendChild(topBar);
            picker.appendChild(body);
            picker.appendChild(bottomBar);

            document.body.appendChild(picker);
        });

        await new Promise(r => setTimeout(r, 1000));

        // Click the file
        const fileItemRect = await popupPage.evaluate(() => {
            const el = document.getElementById('fake-file-item');
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width/2, y: r.top + r.height/2 };
        });
        await popupPage.evaluate(`window.moveCursor(${fileItemRect.x}, ${fileItemRect.y})`);
        await new Promise(r => setTimeout(r, 600));
        await popupPage.evaluate(`window.clickCursor()`);
        await popupPage.evaluate(() => {
            const fileItem = document.getElementById('fake-file-item');
            fileItem.style.backgroundColor = '#0061e0';
            fileItem.style.color = '#fff';
            const openBtn = document.getElementById('fake-open-btn');
            openBtn.style.opacity = '1';
        });

        await new Promise(r => setTimeout(r, 800));

        // Click Open
        const openBtnRect = await popupPage.evaluate(() => {
            const el = document.getElementById('fake-open-btn');
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width/2, y: r.top + r.height/2 };
        });
        await popupPage.evaluate(`window.moveCursor(${openBtnRect.x}, ${openBtnRect.y})`);
        await new Promise(r => setTimeout(r, 600));
        await popupPage.evaluate(`window.clickCursor()`);

        // Close picker
        await popupPage.evaluate(() => {
            const picker = document.getElementById('fake-mac-picker');
            if (picker) picker.remove();
        });
        // --- END FAKE MAC FILE PICKER ---

        // We bypass the actual OS file picker by using Puppeteer's uploadFile directly on the hidden input
        const fileInput = await frame.$('#file-input');
        const dummyFilePath = path.join(__dirname, 'dummy-context.txt');
        await fileInput.uploadFile(dummyFilePath);
        
        // Dispatch change event just in case
        await frame.evaluate(() => {
            document.getElementById('file-input').dispatchEvent(new Event('change', { bubbles: true }));
        });
        
        // Wait for upload animation (spinner -> checkmark)
        await new Promise(r => setTimeout(r, 3000));
        
        // Navigate to context tab to see the ingested file
        await popupPage.evaluate(`window.showTooltip('The file is instantly parsed and saved to Context')`);
        await frame.click('#tab-context');
        await new Promise(r => setTimeout(r, 2000));
        
        await popupPage.evaluate(`window.hideTooltip()`);
        
        // 3. Ask question
        await frame.click('#tab-question');
        await new Promise(r => setTimeout(r, 500));
        
        await popupPage.evaluate(`window.showTooltip('Asking about the uploaded document')`);
        await frame.type('#question', 'What does Scrut Automation do?', { delay: 40 });
        await new Promise(r => setTimeout(r, 500));
        await popupPage.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 2000));
        await popupPage.evaluate(`window.hideTooltip()`);
        
        // Wait for streaming to finish
        await new Promise(r => setTimeout(r, 4500));
        
        await popupRecorder.stop();
        await popupPage.close();
        console.log("File Upload video saved to", popupVideoPath);

    } finally {
        if (browser) await browser.close();
        fs.writeFileSync(manifestPath, originalManifest);
    }
}

run().catch(console.error);