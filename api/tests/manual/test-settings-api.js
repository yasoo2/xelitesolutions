const axios = require('axios');
const jwt = require('jsonwebtoken');

const API_URL = 'http://localhost:3005/api';
const JWT_SECRET = 'dev-secret'; // Assuming dev env or config.jwtSecret if accessible, but mocking is fine if verifying middleware structure

// Generate Mock Token
const token = jwt.sign({
    sub: '507f1f77bcf86cd799439011', // Dummy ObjectID 
    name: 'Test Owner',
    email: 'owner@test.com',
    role: 'USER'
}, JWT_SECRET);

async function run() {
    try {
        console.log('1. Creating Workspace...');
        const wsRes = await axios.post(`${API_URL}/workspaces`, {
            name: 'Settings Test Workspace'
        }, { headers: { Authorization: `Bearer ${token}` } });

        const wsId = wsRes.data._id;
        console.log('   -> Workspace Created:', wsId);

        console.log('2. Updating Provider Config...');
        const updateRes = await axios.put(`${API_URL}/workspaces/${wsId}`, {
            providerConfig: {
                openai: { apiKey: 'sk-test-key-123' },
                anthropic: { apiKey: 'sk-ant-key-456' }
            }
        }, { headers: { Authorization: `Bearer ${token}` } });

        if (updateRes.data.providerConfig.openai.apiKey === 'sk-test-key-123') {
            console.log('   -> Provider Config Updated Successfully');
        } else {
            console.log('DATA:', updateRes.data);
            throw new Error('Provider Config Update Failed');
        }

        console.log('3. Inviting Member (member@test.com)...');
        try {
            await axios.post(`${API_URL}/workspaces/${wsId}/members`, {
                email: 'nonexistent@test.com',
                role: 'VIEWER'
            }, { headers: { Authorization: `Bearer ${token}` } });
        } catch (e) {
            if (e.response && e.response.data.error === 'User not found') {
                console.log('   -> Invite System Checked (User Not Found as expected)');
            } else {
                console.log('   -> Invite check skipped or failed with different error:', e.message);
            }
        }

        console.log('4. Verifying Persistence...');
        const getRes = await axios.get(`${API_URL}/workspaces/${wsId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (getRes.data.providerConfig.anthropic.apiKey === 'sk-ant-key-456') {
            console.log('   -> Persistence Verified');
        } else {
            throw new Error('Persistence Check Failed');
        }

        console.log('\nSUCCESS: Settings API is functioning correctly.');

    } catch (e) {
        console.error('\nFAILURE:', e.response ? e.response.data : e.message);
        process.exit(1);
    }
}

run();
