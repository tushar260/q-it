const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const images = [
    { file: 'v1.1.1/context-yellow.png', outFile: 'v1.1.1/mockup-context-yellow.png', bgColor: '#e0cc3a', extraCss: 'width: 100%; margin: 0;', height: '560px', pattern: false },
    { file: 'v1.1.1/question-pink.png', outFile: 'v1.1.1/mockup-question-pink.png', bgColor: '#e8b0d0', extraCss: 'width: 100%; margin: 0;', height: '560px', pattern: false },
    { file: 'v1.1.1/settings-green.png', outFile: 'v1.1.1/mockup-settings-green.png', bgColor: '#9dd4a8', extraCss: 'width: 100%; margin: 0;', height: '760px', pattern: false },
    { file: 'v1.1.1/settings-dark.png', outFile: 'v1.1.1/mockup-settings-dark.png', bgColor: '#555555', extraCss: 'width: 100%; margin: 0;', height: '760px', pattern: false }
];

async function generate() {
    console.log("Launching browser to generate mockups...");
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    for (const img of images) {
        const imagePath = path.join(__dirname, img.file);
        if (!fs.existsSync(imagePath)) {
            console.log(`Skipping ${img.file} (not found)`);
            continue;
        }
        console.log(`Generating mockup for ${img.file}...`);
        
        const imageBase64 = fs.readFileSync(imagePath, 'base64');
        const imgSrc = `data:image/png;base64,${imageBase64}`;
        
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    margin: 0;
                    width: 640px;
                    height: ${img.height};
                    box-sizing: border-box;
                    background-color: ${img.bgColor};
                    /* Pika's "Circles" pattern */
                    ${img.pattern ? `background-image: 
                        radial-gradient(circle at 10% 40%, rgba(0, 0, 0, 0.08) 0%, transparent 50%),
                        radial-gradient(circle at 90% 20%, rgba(0, 0, 0, 0.08) 0%, transparent 40%),
                        radial-gradient(circle at 80% 80%, rgba(0, 0, 0, 0.06) 0%, transparent 40%);` : ''}
                    border-radius: 0px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                }
                
                /* Noise overlay */
                ${img.pattern ? `body::before {
                    content: "";
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background-image: url('data:image/svg+xml,%3Csvg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"%3E%3Cfilter id="noiseFilter"%3E%3CfeTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/%3E%3C/filter%3E%3Crect width="100%25" height="100%25" filter="url(%23noiseFilter)"/%3E%3C/svg%3E');
                    opacity: 0.15;
                    pointer-events: none;
                    z-index: 0;
                }` : ''}

                .stack-container {
                    position: relative;
                    width: 360px; /* Fixed width for uniform scaling */
                    z-index: 1;
                }
                
                /* Stack Light Frame: Stack peeks out from the TOP and BOTTOM */
                .stack-bg-1, .stack-bg-2 {
                    position: absolute;
                    background: #ffffff;
                    border-radius: 15px; /* Roundness 15 */
                }
                
                /* Middle stack layer */
                .stack-bg-1 {
                    top: -12px; left: 12px; right: 12px; bottom: -12px;
                    z-index: 1;
                    opacity: 0.6;
                    box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
                }
                
                /* Back stack layer */
                .stack-bg-2 {
                    top: -24px; left: 24px; right: 24px; bottom: -24px;
                    z-index: 0;
                    opacity: 0.3;
                    box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
                }
                
                .mockup-window {
                    position: relative;
                    z-index: 2;
                    width: 100%;
                    background: #ffffff;
                    border-radius: 15px; /* Roundness 15 */
                    /* Shadow 8: Big drop shadow + a tiny inset border */
                    box-shadow: 0 30px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.2) inset;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }
                
                img {
                    display: block;
                    ${img.extraCss}
                    height: auto;
                    border-radius: 15px; /* Match mockup window */
                }
            </style>
        </head>
        <body>
            <div class="stack-container">
                <div class="stack-bg-2"></div>
                <div class="stack-bg-1"></div>
                <div class="mockup-window">
                    <img src="${imgSrc}" />
                </div>
            </div>
        </body>
        </html>
        `;
        
        await page.setContent(html, { waitUntil: 'load' });
        const element = await page.$('body');
        
        // Wait a tiny bit for rendering
        await new Promise(r => setTimeout(r, 100));
        
        await element.screenshot({ 
            path: path.join(__dirname, img.outFile),
            omitBackground: false
        });
    }
    
    await browser.close();
    console.log("Done!");
}

generate().catch(console.error);