# RAG System User Guide

## For Non-Technical Users

This guide explains how to use the RAG (Retrieval-Augmented Generation) system in simple terms. RAG allows your AI agents to search through your documents and use that information when responding to questions.

---

## Table of Contents

1. [What is RAG?](#what-is-rag)
2. [Getting Started Overview](#getting-started-overview)
3. [Step 1: Create a Collection](#step-1-create-a-collection)
4. [Step 2: Upload Files](#step-2-upload-files)
5. [Step 3: Choose RAG Strategy](#step-3-choose-rag-strategy)
6. [Step 4: Configure Document Parameters](#step-4-configure-document-parameters)
7. [Step 5: Index Your Documents](#step-5-index-your-documents)
8. [Step 6: Assign RAG to an Agent](#step-6-assign-rag-to-an-agent)
9. [Step 7: Configure Search Settings](#step-7-configure-search-settings)
10. [Understanding Status Messages](#understanding-status-messages)
11. [Troubleshooting](#troubleshooting)

---

## What is RAG?

RAG stands for **Retrieval-Augmented Generation**. It is a technology that allows AI agents to:

1. **Search** through your uploaded documents
2. **Find** relevant information based on questions
3. **Use** that information to provide accurate, context-aware responses

Think of it as giving your AI agent access to a personal library of documents that it can reference when answering questions.

---

## Getting Started Overview

Setting up RAG involves these main steps:

```
Create Collection --> Upload Files --> Choose RAG Strategy --> Set Parameters --> Index --> Assign to Agent --> Set Search Config
```

Each step is explained in detail below.

---

## Step 1: Create a Collection

A **Collection** is like a folder that holds all your related documents together.

### What you need to do:
- Give your collection a meaningful name (e.g., "Product Documentation", "HR Policies", "Technical Manuals")
- The system will create an empty collection ready for your files

### Tips:
- Use descriptive names that help you identify the collection later
- Group related documents in the same collection
- You can create multiple collections for different purposes

### What happens next:
- Your collection starts with an "empty" status
- Once you upload files, the status will change

---

## Step 2: Upload Files

Now you can add documents to your collection.

### Supported file types:
| File Type | Extension | Best For |
|-----------|-----------|----------|
| PDF | .pdf | Reports, manuals, documentation |
| Word | .docx | Business documents |
| Text | .txt | Plain text files |
| CSV | .csv | Data tables, spreadsheets |
| JSON | .json | Structured data |
| HTML | .html | Web pages |
| Markdown | .md | Technical documentation |

### File size limits:
- Maximum file size: **12 MB** per file

### What you need to do:
- Select one or more files from your computer
- Upload them to your collection
- Wait for the upload to complete

### Tips:
- You can upload multiple files at once
- Make sure your files contain readable text (not scanned images)
- Larger files take longer to process

---

## Step 3: Choose RAG Strategy

After uploading files, you need to choose how the system will process them.

### Available RAG Strategies:

#### Naive RAG (Currently Available)
- **What it does**: Splits your documents into smaller pieces (chunks) and searches through them
- **Best for**: Most use cases, general document search
- **How it works**:
  1. Breaks documents into chunks
  2. Converts chunks into searchable format (embeddings)
  3. Finds most similar chunks when you search

#### GraphRag (Coming Soon)
- **What it will do**: Creates a knowledge graph from your documents
- **Best for**: Complex relationships between concepts
- **Status**: Not yet available - coming in a future update

### What you need to do:
- Select **Naive RAG** for your collection
- Choose an **embedder** (the AI model that will process your text)

---

## Step 4: Configure Document Parameters

Before indexing, you can customize how each document is processed.

### Key Parameters:

#### Chunk Size
- **What it is**: How many tokens (roughly words) each piece of text should contain
- **Default**: 1000 tokens
- **Range**: 20 to 8000 tokens
- **Tip**: Larger chunks keep more context but may be less precise

#### Chunk Overlap
- **What it is**: How much text overlaps between consecutive chunks
- **Default**: 150 tokens
- **Range**: 0 to 1000 tokens
- **Tip**: More overlap helps maintain context across chunk boundaries

#### Chunking Strategy
Different file types support different strategies:

| Strategy | Works With | Best For |
|----------|------------|----------|
| Token | All files | General use (default) |
| Character | All files | When you need exact character counts |
| Markdown | .md files | Preserving markdown structure |
| JSON | .json files | Maintaining JSON structure |
| HTML | .html files | Preserving HTML structure |
| CSV | .csv files | Handling tabular data |

### What you need to do:
- Review the default settings
- Adjust if needed based on your document types
- Apply settings to individual documents or in bulk

### Tips:
- Start with default settings - they work well for most cases
- For very long documents, consider larger chunk sizes
- For detailed search, consider smaller chunk sizes with more overlap

---

## Step 5: Index Your Documents

Indexing is the process where the system:
1. Splits documents into chunks
2. Processes each chunk through the embedder
3. Stores everything for fast searching

### What you need to do:
- Make sure all document configurations are set
- Click the "Index" button
- Wait for processing to complete

### Status updates you will see:
| Status | Meaning |
|--------|---------|
| New | Not yet indexed |
| Processing | Currently being indexed |
| Completed | Successfully indexed and ready to use |
| Warning | Some documents had issues but others succeeded |
| Failed | Indexing failed - check error messages |

### Tips:
- Indexing can take time for large collections
- You can monitor progress through status updates
- Do not modify documents while indexing is in progress

---

## Step 6: Assign RAG to an Agent

Once indexing is complete, you can give your AI agent access to the knowledge.

### What you need to do:
1. Open your agent configuration
2. Select the knowledge collection
3. Assign the RAG configuration to the agent
4. Save your changes

### Requirements:
- The agent must have a knowledge collection assigned first
- The RAG must belong to the same collection
- The RAG should be in "Completed" or "Warning" status

### Tips:
- One agent can have one RAG assignment at a time
- You can change the assignment later
- Unassigning RAG removes the agent's access to that knowledge

---

## Step 7: Configure Search Settings

Control how the agent searches through your knowledge.

### Search Limit
- **What it is**: Maximum number of relevant chunks to retrieve
- **Default**: 3
- **Range**: 1 to 1000
- **Tip**: More results give more context but may slow responses

### Similarity Threshold
- **What it is**: Minimum relevance score for a chunk to be included
- **Default**: 0.2 (20%)
- **Range**: 0.0 to 1.0 (0% to 100%)
- **Tip**: Higher values return only highly relevant results

### What you need to do:
- Set the search limit based on your needs
- Adjust the similarity threshold if needed
- Save your settings

### Tips:
- Start with defaults and adjust based on results
- Lower threshold = more results (some may be less relevant)
- Higher threshold = fewer results (but more relevant)

---

## Understanding Status Messages

### Collection Status
| Status | Meaning |
|--------|---------|
| Empty | No documents uploaded |
| Uploading | Files are being uploaded |
| Completed | Documents ready for processing |
| Warning | Some issues occurred |

### RAG Status
| Status | Meaning |
|--------|---------|
| New | Configuration created, not indexed |
| Processing | Indexing in progress |
| Completed | Ready to use with agents |
| Warning | Partially indexed (some documents failed) |
| Failed | Indexing failed |

### Document Status
| Status | Meaning |
|--------|---------|
| New | Not yet processed |
| Chunked | Split into chunks |
| Processing | Being converted to embeddings |
| Completed | Ready for search |
| Warning | Some issues during processing |
| Failed | Processing failed |

---

## Troubleshooting

### Common Issues and Solutions

#### "File type not supported"
- **Problem**: You tried to upload a file type that is not supported
- **Solution**: Convert your file to one of the supported formats (PDF, DOCX, TXT, CSV, JSON, HTML, MD)

#### "File size exceeded"
- **Problem**: Your file is larger than 12 MB
- **Solution**: Split the file into smaller parts or compress it

#### "Collection not found"
- **Problem**: The collection was deleted or does not exist
- **Solution**: Create a new collection

#### "RAG not ready for indexing"
- **Problem**: Missing embedder configuration
- **Solution**: Configure an embedder before indexing

#### "No documents to index"
- **Problem**: Collection is empty
- **Solution**: Upload files before indexing

#### "Agent missing collection"
- **Problem**: Trying to assign RAG to agent without a collection
- **Solution**: Assign a knowledge collection to the agent first

#### "RAG does not belong to agent's collection"
- **Problem**: RAG was created for a different collection
- **Solution**: Use a RAG from the agent's assigned collection

### Getting Help

If you encounter issues not covered here:
1. Check the error message for specific details
2. Verify all requirements are met for your operation
3. Contact your system administrator for technical support

---

## Summary

| Step | Action | Result |
|------|--------|--------|
| 1 | Create Collection | Empty folder for documents |
| 2 | Upload Files | Documents stored in collection |
| 3 | Choose RAG Strategy | Select Naive RAG + embedder |
| 4 | Set Parameters | Configure chunking settings |
| 5 | Index | Documents processed for search |
| 6 | Assign to Agent | Agent can access knowledge |
| 7 | Set Search Config | Fine-tune search behavior |

After completing all steps, your AI agent will be able to search through your documents and use that information when responding to questions.
