
import path from 'path';
import fs from 'fs';
import { glob } from 'glob';

async function debug() {
    console.log('CWD:', process.cwd());
    console.log('__dirname:', __dirname);
    
    const searchPaths = [
        path.join(process.cwd(), '.cache', 'puppeteer'),
        path.join(process.cwd(), 'api', '.cache', 'puppeteer'),
        path.resolve(process.cwd(), 'api/.cache/puppeteer'),
    ];

    console.log('Search paths:', searchPaths);

    for (const basePath of searchPaths) {
        if (!fs.existsSync(basePath)) {
            console.log(`Path does not exist: ${basePath}`);
            continue;
        }
        console.log(`Path exists: ${basePath}`);
        
        const pattern = '**/{Google Chrome for Testing,chrome,chrome.exe}';
        console.log(`Globbing in ${basePath} with pattern ${pattern}`);
        
        const matches = await glob(pattern, { cwd: basePath, absolute: true });
        console.log(`Found ${matches.length} matches:`);
        matches.forEach(m => console.log(' - ' + m));
    }
    
    console.log('Puppeteer is not used in this system.');
}

debug();
