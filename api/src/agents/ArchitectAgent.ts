import intelligentRouter from '../llm/intelligent-router';
import fs from 'fs';
import path from 'path';

export class ArchitectAgent {

    constructor() {
        // No setup needed
    }

    /**
     * Read actual blueprints from knowledge directory
     */
    private readBlueprints(): string {
        let blueprintContext = '';
        const knowledgeDir = path.join(process.cwd(), 'knowledge');
        const blueprintDir = path.join(knowledgeDir, 'blueprints');

        try {
            // Read top-level knowledge files
            if (fs.existsSync(knowledgeDir)) {
                const knowledgeFiles = fs.readdirSync(knowledgeDir)
                    .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
                    .slice(0, 3);
                for (const f of knowledgeFiles) {
                    try {
                        const content = fs.readFileSync(path.join(knowledgeDir, f), 'utf-8');
                        blueprintContext += `\n### Knowledge: ${f}\n${content.slice(0, 800)}\n`;
                    } catch { /* skip unreadable */ }
                }
            }

            // Read blueprint files
            if (fs.existsSync(blueprintDir)) {
                const bpFiles = fs.readdirSync(blueprintDir)
                    .filter(f => f.endsWith('.md') || f.endsWith('.txt') || f.endsWith('.json'))
                    .slice(0, 5);
                for (const f of bpFiles) {
                    try {
                        const content = fs.readFileSync(path.join(blueprintDir, f), 'utf-8');
                        blueprintContext += `\n### Blueprint: ${f}\n${content.slice(0, 500)}\n`;
                    } catch { /* skip unreadable */ }
                }
            }
        } catch (e) {
            console.warn('[Architect] Could not read blueprints:', e);
        }

        return blueprintContext || '\n(No blueprints found in knowledge/ directory)\n';
    }

    async planProject(goal: string, context: string = ''): Promise<string> {
        // Read REAL blueprints from disk
        const blueprints = this.readBlueprints();
        console.log(`[Architect] Loaded ${blueprints.length} chars of blueprint context`);

        const systemPrompt = `You are the Chief Architect AI, a world-class systems designer known for creating "Premium", "Scalable", and "Modern" web applications.
Your goal is to design a robust architecture for a user request that WOWS the user.

REFERENCE BLUEPRINTS (from knowledge/ directory):
${blueprints}

Output a Markdown document containing:

## 1. Project Overview
- Brief description of what will be built
- Target audience and key user flows

## 2. Technology Stack
Choose the best modern tech for the project type:
- **Frontend SPA**: React 18+ with Vite, TypeScript, React Router v6
- **Full-Stack App**: Next.js 14+ with App Router, Server Components
- **Landing Page**: Vanilla HTML/CSS/JS or Astro
- **API Backend**: Express.js + TypeScript, or Fastify
- **Database**: MongoDB (Mongoose) or PostgreSQL (Prisma)
- **Styling**: Tailwind CSS or CSS Modules (prefer Tailwind for speed)
- **Icons**: Lucide React (modern, tree-shakable)
- **Fonts**: Inter or Outfit (via Google Fonts)
- **Animations**: Framer Motion for React, CSS animations for vanilla

## 3. Project Structure
Provide a COMPLETE file tree:
\`\`\`
project-root/
├── src/
│   ├── components/    # Reusable UI components  
│   ├── pages/         # Page-level components
│   ├── hooks/         # Custom React hooks
│   ├── utils/         # Helper functions
│   ├── types/         # TypeScript interfaces
│   ├── styles/        # Global styles, design tokens
│   └── assets/        # Images, fonts, icons
├── public/            # Static assets
├── package.json
├── tsconfig.json
├── vite.config.ts     # or next.config.js
└── README.md
\`\`\`

## 4. Key Components
For each major component, describe:
- **Name**: ComponentName
- **Purpose**: What it does
- **Props**: Key inputs
- **State**: What state it manages
- **Dependencies**: What it imports

## 5. Design System
- **Color Palette**: 5-7 colors (primary, secondary, accent, background, text, muted, border)
- **Typography**: Font family, sizes (h1-h6, body, small)
- **Spacing**: Use 4px grid (4, 8, 12, 16, 24, 32, 48, 64)
- **Border Radius**: sm (4px), md (8px), lg (12px), xl (16px), full (9999px)
- **Shadows**: sm, md, lg for elevation levels
- **Dark Mode**: Specify dark variants for all colors

## 6. Implementation Steps
Ordered list of exact steps for the coding agent:
1. Initialize project with scaffold tool
2. Install dependencies
3. Create design system (colors, typography, spacing)
4. Build layout components (Header, Footer, Sidebar)
5. Build page components
6. Add routing
7. Add interactivity and animations
8. Add responsive breakpoints
9. Test and verify

## 7. Testing Plan
- Build verification command: \`npm run build\`
- Dev server command: \`npm run dev\`
- Key pages to verify visually
- Edge cases to check

**CRITICAL DESIGN GUIDELINES**:
- Focus on "Visual Excellence" and "User Experience" (WOW the user at first glance)
- Use modern UI patterns: **Glassmorphism**, **Micro-interactions**, **Vibrant Gradients**, **Smooth Animations**
- **Mobile-First**: Design for 375px first, then scale up
- Use generous whitespace and visual hierarchy
- Premium typography with proper line-height (1.5-1.7 for body)
- Subtle hover effects on ALL interactive elements
- Smooth page transitions
- DO NOT use placeholder images — describe real image requirements
- EVERY component must have dark mode support

User Goal: ${goal}
Context: ${context}`;

        try {
            const response = await intelligentRouter.routeToModel([
                { role: 'system', content: systemPrompt }
            ]);

            return response || 'Failed to generate plan.';
        } catch (e: any) {
            console.error('[Architect] Planning failed:', e.message);
            return 'Failed to generate plan due to AI provider error.';
        }
    }
}
