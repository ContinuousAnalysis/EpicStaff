import { DefaultLlmsSection } from '../interfaces/default-llms-section.interface';

export const DEFAULT_LLMS_SECTIONS: DefaultLlmsSection[] = [
    {
        id: 'agents',
        title: 'For Agents',
        cards: [
            {
                id: 'agent-llm',
                title: 'Agent LLM',
                description:
                    'Assigns the default LLM agent and ensures its operation; if necessary, the model can be customized for each agent individually.',
                selectLabel: 'Select LLM from Library',
                icon: 'llm-agents/agent',
            },
            {
                id: 'agent-fcm-llm',
                title: 'Agent Function Calling LLM',
                description:
                    'The Function Calling LLM handles precise tasks like tool usage and code execution, assigning a recommended model by default.',
                selectLabel: 'Select LLM from Library',
                icon: 'llm-agents/func-calling',
            },
            {
                id: 'voice-llm',
                title: 'Voice LLM',
                description:
                    'Voice LLM enables real-time spoken interaction by generating immediate voice responses.',
                selectLabel: 'Select LLM from Library',
                icon: 'llm-agents/voice',
            },
            {
                id: 'transcription-llm',
                title: 'Transcription LLM',
                description:
                    'Transcription LLM converts spoken language into accurate written text for further processing.',
                selectLabel: 'Select LLM from Library',
                icon: 'llm-agents/transcription',
            },
        ],
    },
    {
        id: 'crew',
        title: 'For Crew',
        cards: [
            {
                id: 'project-manager-llm',
                title: 'Project Manager LLM',
                description:
                    'The Crew Manager LLM coordinates and manages the team workflow within a hierarchical structure.',
                selectLabel: 'Select LLM from Library',
                icon: 'llm-agents/project-manager',
            },
            {
                id: 'planning-llm',
                title: 'Planning LLM',
                description:
                    'Planning LLM guides agents in creating and organizing plans to achieve goals efficiently.',
                selectLabel: 'Select LLM from Library',
                icon: 'llm-agents/planning',
            },
            {
                id: 'memory-embedding-model',
                title: 'Memory Embedding Model',
                description:
                    "The Crew Embedding LLM manages your team's memory by handling short-term, long-term, and entity memory.",
                selectLabel: 'Select LLM from Library',
                icon: 'llm-agents/memory-embedding',
            },
            {
                id: 'memory-llm',
                title: 'Memory LLM',
                description:
                    'Memory LLM manages how your agents store and retrieve information, providing reliable context handling.',
                selectLabel: 'Select LLM from Library',
                icon: 'llm-agents/memory',
            },
        ],
    },
    {
        id: 'tools',
        title: 'For Tools',
        cards: [
            {
                id: 'tools-embedding-model',
                title: 'Tools Embedding Model',
                description:
                    'Assigns a default Embeddings LLM for all tools, ensuring consistent and accurate embedding management.',
                selectLabel: 'Select LLM from Library',
                icon: 'llm-agents/tools-embedding',
            },
            {
                id: 'tools-llm',
                title: 'Tools LLM',
                description:
                    'Assigns the default LLM for all tools to ensure consistent operation.',
                selectLabel: 'Select LLM from Library',
                icon: 'llm-agents/tools',
            },
        ],
    },
    {
        id: 'knowledge',
        title: 'For Knowledge',
        cards: [
            {
                id: 'knowledge-llm',
                title: 'Knowledge LLM',
                description:
                    'The Knowledge LLM powers information retrieval and understanding for accurate, context-aware responses.',
                selectLabel: 'Select LLM from Library',
                icon: 'llm-agents/knowledge',
            },
            {
                id: 'knowledge-embedding-model',
                title: 'Knowledge Embedding Model',
                description:
                    'The Knowledge Embedder LLM transforms information into embeddings for efficient search and retrieval.',
                selectLabel: 'Select LLM from Library',
                icon: 'llm-agents/knowledge-embedding',
            },
        ],
    },
];


