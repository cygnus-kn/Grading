const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
    
    await page.goto('http://localhost:3001');
    await page.waitForSelector('.student-cell.clickable');
    
    // Click first student
    await page.click('.student-cell.clickable');
    await page.waitForSelector('.edit-save-btn');
    
    const btnText1 = await page.$eval('.edit-save-btn', el => el.textContent);
    console.log('Button text initially:', btnText1);
    
    // Click edit
    await page.click('.edit-save-btn');
    
    // Wait a bit
    await new Promise(r => setTimeout(r, 500));
    
    const btnText2 = await page.$eval('.edit-save-btn', el => el.textContent);
    console.log('Button text after click:', btnText2);
    
    // Type something
    await page.type('.feedback-input', ' Test typing');
    
    await browser.close();
})();
