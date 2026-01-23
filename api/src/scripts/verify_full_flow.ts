
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:3000';
const TEST_FILE_PATH = path.join(__dirname, 'test_secret.txt');
const SECRET_CODE = `JOE-` + Math.random().toString(36).substring(7);
const TOKEN = 'bypass';

const authHeaders = {
    'Authorization': `Bearer ${TOKEN}`
};

async function verify() {
    console.log('🚀 Starting Verification: File Upload + AI Analysis');

    try {
        // 1. Create a dummy file with a secret
        fs.writeFileSync(TEST_FILE_PATH, `The identifier for this session is ${SECRET_CODE}. If you can see this, the file upload and content extraction is working.`);
        console.log(`✅ Created test file: ${TEST_FILE_PATH}`);

        // 2. Upload the file
        const form = new FormData();
        form.append('file', fs.createReadStream(TEST_FILE_PATH));

        console.log('📤 Uploading file...');
        const uploadRes = await axios.post(`${API_URL}/files/upload`, form, {
            headers: { ...form.getHeaders(), ...authHeaders }
        });

        const fileData = uploadRes.data.file || uploadRes.data;
        const fileId = fileData.id || fileData._id;
        console.log(`✅ File uploaded successfully. ID: ${fileId}`);

        // 3. Start a conversation with the file
        console.log('🤖 Sending message to AI with file attached...');
        const runRes = await axios.post(`${API_URL}/runs/start`, {
            text: "What is the identifier mentioned in the attached file? Just the identifier.",
            attachedFiles: [{ id: fileId, name: 'test_secret.txt' }]
        }, { headers: authHeaders });

        const runId = runRes.data.runId;
        console.log(`✅ Run started. ID: ${runId}`);

        // 4. Poll for result
        console.log('⏳ Polling for AI response...');
        let finished = false;
        let attempts = 0;
        while (!finished && attempts < 20) {
            attempts++;
            const statusRes = await axios.get(`${API_URL}/run/${runId}`, { headers: authHeaders });
            const status = statusRes.data.run?.status;

            if (status === 'completed' || status === 'success' || status === 'done') {
                const response = statusRes.data.run?.response || statusRes.data.run?.output;
                console.log('\n--- AI RESPONSE ---');
                console.log(response);
                console.log('-------------------\n');

                if (response && response.includes(SECRET_CODE)) {
                    console.log('✨ VERIFICATION SUCCESSFUL! AI correctly identified the secret code.');
                } else {
                    console.log('❌ VERIFICATION FAILED: AI did not mention the secret code.');
                }
                finished = true;
            } else if (status === 'failed') {
                console.log('❌ Run failed error:', statusRes.data.run?.error || statusRes.data.run?.message);
                finished = true;
            } else {
                process.stdout.write('.');
                await new Promise(r => setTimeout(r, 3000));
            }
        }

        if (!finished) {
            console.log('❌ Verification timed out.');
        }

    } catch (err: any) {
        console.error('❌ Verification failed with error:', err.response?.data || err.message);
    } finally {
        if (fs.existsSync(TEST_FILE_PATH)) fs.unlinkSync(TEST_FILE_PATH);
    }
}

verify();
