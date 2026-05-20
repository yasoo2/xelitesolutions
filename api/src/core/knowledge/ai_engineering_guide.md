# AI Engineering: Building the Brain

## 1. LLM Integration Patterns
- **Prompt Engineering**:
    - **CoT (Chain of Thought)**: "Think step by step." increases reasoning fidelity.
    - **Few-Shot**: Provide 3 examples of Input->Output to guide format.
    - **System Prompts**: Define persona and constraints strictly at the start.
- **Context Window**: Token management is key. Summarize history if conversation > limit.

## 2. RAG (Retrieval Augmented Generation) pipeline
- **Ingestion**: Chunk documents (Markdown/PDF) -> Embedding Model (OpenAI `text-embedding-3-small` or HuggingFace `all-MiniLM-L6-v2`).
- **Storage**: Vector Database (Pinecone, Weaviate, Pgvector). Index using HNSW algorithm for approximate nearest neighbor search.
- **Retrieval**: Query -> Embed -> Cosine Similarity Search -> Top K chunks.
- **Generation**: LLM Context = `Question + Retrieved Chunks`.

## 3. Agents & Tool Use (ReAct)
- **Concept**: Model loops through [Thought -> Action -> Observation].
- **Function Calling**: Define robust JSON schemas for tools using Zod.
- **Memory**: Short-term (Array) vs Long-term (Vector Store/Redis).

## 4. Evaluation (Evals)
- Don't guess. Use "LLM-as-a-Judge" frameworks to score outputs on:
    - **Faithfulness**: Did it hallucinate?
    - **Relevance**: Did it answer the user?
    - **Format**: Is the JSON valid?
