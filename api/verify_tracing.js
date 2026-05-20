const axios = require('axios');

async function verifyTracing() {
    const API_URL = 'http://localhost:8080/api/agent';
    
    console.log('--- Testing Flow Trace Observability ---');
    
    try {
        const response = await axios.post(`${API_URL}?debug=true`, {
            goal: 'Say hello and check the current directory',
            sessionId: 'test-trace-session'
        });

        console.log('Status:', response.status);
        console.log('TraceId:', response.data.traceId);
        
        if (response.data.trace) {
            console.log('✅ Trace object received');
            console.log('Events Count:', response.data.trace.timeline.length);
            
            const kinds = new Set(response.data.trace.timeline.map(e => e.kind));
            console.log('Event Kinds Captured:', Array.from(kinds).join(', '));
            
            if (kinds.has('orchestrator') && kinds.has('planning') && kinds.has('tool') && kinds.has('execution')) {
                console.log('✅ Full layer propagation verified!');
            } else {
                console.warn('❌ Some layers are missing in the trace timeline.');
            }
        } else {
            console.error('❌ No trace object in response.');
        }

    } catch (error) {
        console.error('Execution failed:', error.message);
        if (error.response) {
            console.error('Response Data:', error.response.data);
        }
    }
}

verifyTracing();
