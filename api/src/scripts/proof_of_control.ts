
import axios from 'axios';
import fs from 'fs';
import path from 'path';

async function proveControl() {
    console.log('🕵️‍♀️ Starting Deep Audit: Proof of Control...');
    const proofFile = path.resolve(process.cwd(), 'proof_of_control.txt');

    // 1. Clean up previous proof
    if (fs.existsSync(proofFile)) fs.unlinkSync(proofFile);

    const prompt = "I need you to prove you have control over this system. Please create a file named 'proof_of_control.txt' in the current directory with the content: 'I AM IN CONTROL AND I HAVE WRITE ACCESS'. Do it now.";

    console.log(`1. Sending Challenge to AI: "${prompt}"`);

    try {
        const sessionId = `audit_${Date.now()}`;
        // Start run
        const res = await axios.post('http://localhost:3000/runs/start', {
            text: prompt,
            sessionId: sessionId,
            userId: 'auditor',
            sessionKind: 'chat',
            provider: 'pollinations'
        });

        console.log('   (AI is thinking and executing...)');
        console.log('   [DEBUG Response]:', JSON.stringify(res.data, null, 2));

        // Wait for execution (give it 60 seconds)
        await new Promise(r => setTimeout(r, 60000));

        // Fetch Messages to see what Joe said
        try {
            const msgRes = await axios.get(`http://localhost:3000/sessions/${sessionId}/messages`);
            console.log('   [Joe Messages]:', JSON.stringify(msgRes.data, null, 2));
        } catch (e: any) {
            console.log('   [Fetch Msg Error]:', e.message);
        }

        // 2. Check for File
        if (fs.existsSync(proofFile)) {
            const content = fs.readFileSync(proofFile, 'utf8');
            console.log('---------------------------------------------------');
            console.log('✅ PROOF FOUND!');
            console.log('   File: proof_of_control.txt');
            console.log('   Content:', content.trim());
            console.log('---------------------------------------------------');
            console.log('🎉 CONCLUSION: The AI has REAL control. It can modify the filesystem.');
        } else {
            console.error('❌ FAILURE: Proof file was NOT created.');
            console.error('   The AI might have failed to execute the tool or lacks permissions.');
        }

    } catch (err: any) {
        console.error('❌ Audit Error:', err.message);
    }
}

proveControl();
