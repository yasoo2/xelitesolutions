import { callLLM } from '../llm';

interface Expert {
  role: string;
  name: string;
  focus: string;
  color: string;
}

const EXPERTS: Expert[] = [
  { role: 'Architect', name: 'Dr. Arch', focus: 'Scalability, Clean Architecture, Design Patterns', color: '#2563eb' }, // Blue-600
  { role: 'Security', name: 'SecOps Sam', focus: 'Vulnerabilities, Auth, Data Protection', color: '#dc2626' }, // Red-600
  { role: 'UX/UI', name: 'Designer Dani', focus: 'User Experience, Accessibility, Visuals', color: '#db2777' } // Pink-600
];

export class CouncilService {
  static async consult(topic: string): Promise<any[]> {
    const discussion: any[] = [];
    
    // Round 1: Parallel Expert Consultation
    const expertPromises = EXPERTS.map(async (expert) => {
      const prompt = `
        You are ${expert.name}, a world-class ${expert.role} expert.
        Focus ONLY on: ${expert.focus}.
        
        Topic: "${topic}"
        
        Provide your expert analysis and recommendations. Be concise (max 3 sentences).
        Do not be polite, be direct and technical.
      `;
      
      try {
        const response = await callLLM(prompt, []);
        return {
          expert: expert,
          content: response
        };
      } catch (e) {
        console.error(`Expert ${expert.name} failed to respond`, e);
        return null;
      }
    });

    const results = await Promise.all(expertPromises);
    results.forEach(r => {
      if (r) discussion.push(r);
    });

    // Round 2: Synthesis (The Lead Engineer - Joe)
    if (discussion.length > 0) {
      const synthesisPrompt = `
        You are the Lead Engineer. Review the feedback from your team:
        
        ${discussion.map(d => `${d.expert.role}: ${d.content}`).join('\n\n')}
        
        Synthesize a final execution plan that balances all these concerns.
      `;
      
      try {
        const conclusion = await callLLM(synthesisPrompt, []);
        discussion.push({
          expert: { role: 'Lead', name: 'Joe', focus: 'Execution', color: '#4f46e5' }, // Indigo-600
          content: conclusion
        });
      } catch (e) {
        console.error('Synthesis failed', e);
        discussion.push({
            expert: { role: 'System', name: 'Error', focus: 'Recovery', color: '#ff0000' },
            content: 'Failed to synthesize a conclusion due to an internal error.'
        });
      }
    } else {
        discussion.push({
            expert: { role: 'System', name: 'Error', focus: 'Availability', color: '#ff0000' },
            content: 'The council is currently unavailable.'
        });
    }

    return discussion;
  }
}
