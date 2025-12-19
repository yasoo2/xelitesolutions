import { callLLM } from '../llm';

interface Expert {
  role: string;
  name: string;
  focus: string;
  color: string;
}

const EXPERTS: Expert[] = [
  { role: 'Architect', name: 'Dr. Arch', focus: 'Scalability, Clean Architecture, Design Patterns', color: '#3b82f6' },
  { role: 'Security', name: 'SecOps Sam', focus: 'Vulnerabilities, Auth, Data Protection', color: '#ef4444' },
  { role: 'UX/UI', name: 'Designer Dani', focus: 'User Experience, Accessibility, Visuals', color: '#eab308' }
];

export class CouncilService {
  static async consult(topic: string): Promise<any[]> {
    const discussion = [];
    
    // Round 1: Each expert gives their initial take
    for (const expert of EXPERTS) {
      const prompt = `
        You are ${expert.name}, a world-class ${expert.role} expert.
        Focus ONLY on: ${expert.focus}.
        
        Topic: "${topic}"
        
        Provide your expert analysis and recommendations. Be concise (max 3 sentences).
        Do not be polite, be direct and technical.
      `;
      
      try {
        const response = await callLLM(prompt, []);
        discussion.push({
          expert: expert,
          content: response
        });
      } catch (e) {
        console.error(`Expert ${expert.name} failed to respond`, e);
      }
    }

    // Round 2: Synthesis (The Lead Engineer - Joe)
    const synthesisPrompt = `
      You are the Lead Engineer. Review the feedback from your team:
      
      ${discussion.map(d => `${d.expert.role}: ${d.content}`).join('\n\n')}
      
      Synthesize a final execution plan that balances all these concerns.
    `;
    
    try {
      const conclusion = await callLLM(synthesisPrompt, []);
      discussion.push({
        expert: { role: 'Lead', name: 'Joe', focus: 'Execution', color: '#ffffff' },
        content: conclusion
      });
    } catch (e) {}

    return discussion;
  }
}
