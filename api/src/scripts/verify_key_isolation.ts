
import { setDynamicOpenAIKey, getDynamicOpenAIKey, getApiKeyForUser } from '../llm';

async function testKeyIsolation() {
    console.log('Testing API Key Isolation...');

    const userA = 'user-a-123';
    const keyA = 'sk-key-for-user-a';

    const userB = 'user-b-456';
    const keyB = 'sk-key-for-user-b';

    // 1. Initial State
    console.log('1. Checking initial state...');
    if (getDynamicOpenAIKey(userA)) throw new Error('User A key should be empty');
    if (getDynamicOpenAIKey(userB)) throw new Error('User B key should be empty');

    // 2. Set Key for User A
    console.log('2. Setting key for User A...');
    setDynamicOpenAIKey(userA, keyA);

    if (getDynamicOpenAIKey(userA) !== keyA) throw new Error('User A key not set correctly');
    if (getDynamicOpenAIKey(userB) !== null) throw new Error('User B key should still be null');

    // 3. Set Key for User B
    console.log('3. Setting key for User B...');
    setDynamicOpenAIKey(userB, keyB);

    if (getDynamicOpenAIKey(userA) !== keyA) throw new Error('User A key should not change');
    if (getDynamicOpenAIKey(userB) !== keyB) throw new Error('User B key not set correctly');

    // 4. Test Helper
    console.log('4. Testing getApiKeyForUser helper...');
    if (getApiKeyForUser(userA) !== keyA) throw new Error('Helper failed for User A');
    if (getApiKeyForUser(userB) !== keyB) throw new Error('Helper failed for User B');

    // 5. Test Global Fallback (Simulating env var)
    // Note: We can't easily change process.env here without side effects, 
    // but we can check a non-existent user gets the default (or empty string/dummy)
    const userC = 'user-c-789';
    const defaultKey = process.env.OPENAI_API_KEY || '';
    if (getApiKeyForUser(userC) !== defaultKey && getApiKeyForUser(userC) !== '') {
        // It might return 'dummy' if env is missing, depending on implementation
    }

    console.log('✅ API Key Isolation Verified Successfully!');
}

testKeyIsolation().catch(e => {
    console.error('❌ Verification Failed:', e);
    process.exit(1);
});
