
import { executeTool } from '../services/ToolService';

async function demo() {
    console.log("🗣️ USER TO JOE: 'Open https://www.w3.org, scroll down, and tell me what the main heading is.'");
    console.log("🤖 JOE: 'Understood. Launching my browser...'");

    // Simulating Joe's decision to run the browser tool
    try {
        const result = await executeTool('browser_run', {
            actions: [
                { type: 'goto', url: 'https://www.w3.org' },
                { type: 'wait', ms: 2000 },
                { type: 'scroll', direction: 'down' },
                { type: 'ui_audit' } // This triggers text extraction and analysis
            ]
        }, { sessionId: 'demo-session-123' });

        console.log("\n--- JOE'S BROWSER LOGS ---");
        if (result.logs) result.logs.forEach(l => console.log(l));

        console.log("\n--- JOE'S ANALYSIS RESULT ---");
        if (result.ok) {
            console.log("Status: SUCCESS");
            console.log("Output:", JSON.stringify(result.output, null, 2).slice(0, 500) + "...");
        } else {
            console.log("Status: FAILED");
            console.log("Error:", result.error);
        }

    } catch (e: any) {
        console.error("CRITICAL ERROR:", e.message);
    }
}

demo();
