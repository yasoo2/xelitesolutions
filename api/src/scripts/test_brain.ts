
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function checkIntelligence() {
    console.log('🧠 Checking System Intelligence...');

    const key = process.env.OPENAI_API_KEY;
    if (!key) {
        console.error('❌ FATAL: OPENAI_API_KEY is missing in server environment!');
        console.error('   The system is lobotomized. It cannot think or build.');
        return false;
    }

    console.log('   ✅ API Key found (starts with ' + key.substring(0, 7) + '...)');

    try {
        const openai = new OpenAI({ apiKey: key });
        console.log('   💭 Testing Brain (Simple Completion)...');
        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: "Say 'System Online' if you can hear me." }],
            model: "gpt-4o",
        });

        const response = completion.choices[0].message.content;
        console.log(`   🤖 Brain Response: "${response}"`);

        if (response?.includes('Online')) {
            console.log('   ✅ Intelligence Confirmed.');
            return true;
        } else {
            console.warn('   ⚠️ Brain responded but not as expected.');
            return true; // Still passed technical check
        }
    } catch (error: any) {
        console.error(`❌ Brain Failure: ${error.message}`);
        return false;
    }
}

checkIntelligence().then((ok) => process.exit(ok ? 0 : 1));
