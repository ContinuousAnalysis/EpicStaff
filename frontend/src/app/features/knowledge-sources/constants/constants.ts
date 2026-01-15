import {RagName, RagTypeLevel, Rag} from "../models/rag.model";

export const FILE_TYPES = ['pdf', 'csv', 'docx', 'txt', 'json', 'html'] as const;

export const MIME_TYPES: Record<string, (typeof FILE_TYPES)[number]> = {
    'application/pdf': 'pdf',
    'text/csv': 'csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/plain': 'txt',
    'application/json': 'json',
    'text/html': 'html'
};

export const CHUNK_STRATEGIES = ['character', 'csv', 'markdown', 'HTML', 'token', 'JSON'];

export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10 MB

export const RAG_TYPES: Rag[] = [
    {
        name: RagName.NAIVE_RAG,
        value: "naive",
        description: "The document is broken down into chunks, indexed, and the most relevant content for the user's query is searched for.",
        tip: "Recommended for small collections. Minimal settings.",
        icon: "ui/mouse",
        level: RagTypeLevel.BASIC,
        stars: 1
    },
    {
        name: RagName.GRAPH_RAG,
        value: "graph",
        description: "A graph of entities and their relationships is created, which allows for a better understanding of the context and connections.",
        tip: "For more complex queries and a broader context.",
        icon: "ui/tab-group",
        level: RagTypeLevel.ADVANCED,
        stars: 2,
        disabled: true,
    },
    {
        name: RagName.HYBRID_RAG,
        value: "hybrid",
        description: "Combines multiple data sources with different search strategies. Allows you to configure different approaches for different types of documents.",
        tip: "Recommended for multi-source projects.",
        icon: "ui/tab-group",
        level: RagTypeLevel.EXPERT,
        stars: 3,
        disabled: true,
    },
];
