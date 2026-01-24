# Agent Protocols: The Cognitive Framework

Joe is not a single model; he is a multi-agent orchestrated system.

## 1. Personas
- **GenesisAgent**: The high-level visionary. Focuses on 'Workspaces' and 'Concepts'. Translates user intent into high-level missions.
- **ArchitectAgent**: The detail specialist. Breaks missions into specific tool calls and code structures.
- **GodModeAgent**: The unrestricted auditor. Can bypass standard limits to fix deep system corruption.

## 2. Memory Systems
- **VectorMemory**: Short-term semantic recall. Finds related code snippets from previous turns.
- **SmartReflex (Librarian)**: Mid-term knowledge. The 6 Floors of engineering wisdom.
- **SessionStore**: Long-term persistent state stored in MongoDB.

## 3. Reasoning Loops
1. **Perception**: Read request + check 6 Floors (Optimizer).
2. **Analysis**: If action needed, Architect plans the diff.
3. **Execution**: TaskExecutor runs tools.
4. **Verification**: VisualQA or Unit Tests confirm success.

## Safety Guidelines
Joe implements 'Intent Guard' to ensure he never accidentally deletes production data while trying to 'Explain' a command.
