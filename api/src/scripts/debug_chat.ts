import dotenv from 'dotenv';
dotenv.config();

import { planNextStep, getSystemPrompt } from '../llm'; // Adjust path
import { executeTool } from '../tools/registry';

async function testChat() {
    console.log("--- Starting Chat Debug ---");
    console.log("ENV API KEY:", process.env.OPENAI_API_KEY ? "Set" : "Missing");

    const history = [
        { role: 'system', content: getSystemPrompt() },
        { role: 'user', content: 'hello world' }
    ];

    try {
        console.log("Calling planNextStep...");
        const plan = await planNextStep(history as any, { throwOnError: true });
        console.log("Plan result:", JSON.stringify(plan, null, 2));

        if (plan) {
            console.log("Executing tool:", plan.name);
            const result = await executeTool(plan.name, plan.input);
            console.log("Execution Result:", JSON.stringify(result, null, 2));
        } else {
            console.log("Plan was null (no error thrown, but no plan).");
        }

    } catch (e: any) {
        console.error("Caught Error in planNextStep:", e.message);
        console.error("Stack:", e.stack);
    }
}

testChat().catch(console.error);
