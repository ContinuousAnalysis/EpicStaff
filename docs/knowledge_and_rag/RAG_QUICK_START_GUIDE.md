# RAG Quick Start Guide

## Developer Tutorial: Get Your Agent Using Knowledge

This guide walks you through the complete process of setting up a RAG-enabled agent, from creating a collection to making your first knowledge-enhanced query.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 1: Create a Collection](#step-1-create-a-collection)
3. [Step 2: Upload Documents](#step-2-upload-documents)
4. [Step 3: Configure Naive RAG](#step-3-configure-naive-rag)
5. [Step 4: Initialize Document Configs](#step-4-initialize-document-configs)
6. [Step 5: Customize Configs (Optional)](#step-5-customize-configs-optional)
7. [Step 6: Trigger Indexing](#step-6-trigger-indexing)
8. [Step 7: Monitor Indexing Status](#step-7-monitor-indexing-status)
9. [Step 8: Assign RAG to Agent](#step-8-assign-rag-to-agent)
10. [Step 9: Configure Search Settings](#step-9-configure-search-settings)
11. [Complete Example](#complete-example)
12. [Common Patterns](#common-patterns)
13. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:

- At least one EmbeddingConfig configured in the system
- An Agent that you want to enhance with knowledge
- Documents to upload (PDF, DOCX, TXT, CSV, JSON, HTML, or MD)

---

## Step 1: Create a Collection

First, create a collection to hold your documents.

**Endpoint:** `POST /api/source-collections/`

**Request:**
```json
{
    "collection_name": "Product Knowledge Base",
    "user_id": "dev_user"
}
```

**Response:**
```json
{
    "collection_id": 29,
    "collection_name": "Product Knowledge Base",
    "status": "empty",
    "document_count": 0,
    "rag_configurations": []
}
```

**Note:** Save the `collection_id` (29) - you will need it for subsequent steps.

---

## Step 2: Upload Documents

Upload your documents to the collection.

**Endpoint:** `POST /api/documents/source-collection/{collection_id}/upload/`

**Request:** Use `multipart/form-data` with a `files` field containing your documents.

**Response:**
```json
{
    "message": "Successfully uploaded 3 file(s)",
    "documents": [
        {
            "document_id": 101,
            "file_name": "product_manual.pdf",
            "file_type": "pdf",
            "file_size": 2097152,
            "source_collection": 29
        },
        {
            "document_id": 102,
            "file_name": "faq.md",
            "file_type": "md",
            "file_size": 51200,
            "source_collection": 29
        },
        {
            "document_id": 103,
            "file_name": "pricing.csv",
            "file_type": "csv",
            "file_size": 10240,
            "source_collection": 29
        }
    ]
}
```

**File Requirements:**
- Maximum size: 12 MB per file
- Supported types: pdf, docx, txt, csv, json, html, md

---

## Step 3: Configure Naive RAG

Create a Naive RAG configuration for your collection.

**Endpoint:** `POST /api/naive-rag/collections/{collection_id}/naive-rag/`

**Request:**
```json
{
    "embedder_id": 1
}
```

**Response:**
```json
{
	"message": "NaiveRag configured successfully",
	"naive_rag": {
		"naive_rag_id": 9,
		"base_rag_type": {
			"rag_type_id": 9,
			"rag_type": "naive",
			"source_collection": 29
		},
		"embedder": 1,
		"rag_status": "new",
		"collection_id": 29
	}
}
```



**Note:** Save the `naive_rag_id` (9) for the next steps.

---

## Step 4: Initialize Document Configs (Optional)

Create configuration records for each document with default parameters. Idempodent.

**Endpoint:** `POST /api/naive-rag/{naive_rag_id}/document-configs/initialize/`

**Request:** No body required.

**Response:**
```json
{
    "message": "Initialized 3 new document config(s)",
    "configs_created": 3,
    "configs_existing": 0,
    "new_configs": [
        {
            "config_id": 20,
            "document_id": 101,
            "file_name": "product_manual.pdf",
            "chunk_strategy": "token"
        },
        {
            "config_id": 21,
            "document_id": 102,
            "file_name": "faq.md",
            "chunk_strategy": "token"
        },
        {
            "config_id": 22,
            "document_id": 103,
            "file_name": "pricing.csv",
            "chunk_strategy": "token"
        }
    ]
}
```

**Default Parameters Applied:**
- `chunk_size`: 1000 tokens
- `chunk_overlap`: 150 tokens
- `chunk_strategy`: token


**Note:** This steps executes automatically with signals

---

## Step 5: Customize Configs (Optional)

Optionally adjust chunking parameters for specific documents or all documents.

### Option A: Update Individual Config

**Endpoint:** `PUT /api/naive-rag/{naive_rag_id}/document-configs/{config_id}/`

**Request:**
```json
{
    "chunk_size": 800,
    "chunk_overlap": 125,
    "chunk_strategy": "character",
    "additional_params": {}
}
```

### Option B: Bulk Update

**Endpoint:** `PUT /api/naive-rag/{naive_rag_id}/document-configs/bulk-update/`

**Request:**
```json
{
    "config_ids": [20, 21, 22],
    "chunk_size": 8000,
    "chunk_overlap": 0,
    "chunk_strategy": "character",
    "additional_params": {
        "character": {
            "regex": "###CHUNK_SEPARATOR###"
        }
    }
}
```

**Note:** Consider text in uploaded files separated by substring "###CHUNK_SEPARATOR###". 

---

## Step 6: Trigger Indexing

Start the indexing process (chunking + embedding generation).

**Endpoint:** `POST /api/process-rag-indexing/`

**Request:**
```json
{
    "rag_id": 9,
    "rag_type": "naive"
}
```

**Response:**
```json
{
    "detail": "Indexing process accepted",
    "rag_id": 9,
    "rag_type": "naive",
    "collection_id": 29
}
```

**Note:** Indexing happens asynchronously. The 202 response means the job was queued successfully.

---

## Step 7: Monitor Indexing Status

Poll the RAG status until indexing completes.

**Endpoint:** `GET /api/naive-rag/{naive_rag_id}/`

**Response (in progress):**
```json
{
    "naive_rag_id": 9,
    "rag_status": "processing",
    "document_configs": [
        {
            "naive_rag_document_id": 20,
            "file_name": "product_manual.pdf",
            "status": "processing",
            "total_chunks": 45,
            "total_embeddings": 30
        }
    ]
}
```

**Response (completed):**
```json
{
    "naive_rag_id": 9,
    "rag_status": "completed",
    "indexed_at": "2025-12-17T15:30:00.123456Z",
    "document_configs": [
        {
            "naive_rag_document_id": 20,
            "file_name": "product_manual.pdf",
            "status": "completed",
            "total_chunks": 45,
            "total_embeddings": 45
        },
        {
            "naive_rag_document_id": 21,
            "file_name": "faq.md",
            "status": "completed",
            "total_chunks": 12,
            "total_embeddings": 12
        },
        {
            "naive_rag_document_id": 22,
            "file_name": "pricing.csv",
            "status": "completed",
            "total_chunks": 8,
            "total_embeddings": 8
        }
    ]
}
```

### Status Values

| Status | Meaning | Action |
|--------|---------|--------|
| new | Not started | Wait or trigger indexing |
| processing | In progress | Wait |
| completed | Ready to use | Proceed to assign |
| warning | Partial success | Review failed docs |
| failed | All failed | Check errors |

---

## Step 8: Assign RAG to Agent

First, ensure your agent has the knowledge collection assigned, then assign the RAG.

### Step 8a: Assign Collection to Agent (if not already assigned)

**Endpoint:** `PATCH /api/agents/{agent_id}/`

**Request:**
```json
{
    "knowledge_collection": 29
}
```

### Step 8b: Assign RAG to Agent

**Endpoint:** `PATCH /api/agents/{agent_id}/`

**Request:**
```json
{
    "knowledge_collection": 29,
    "rag": {
        "rag_type": "naive",
        "rag_id": 9
    }
    "search_configs": {
        "naive": {
            "search_limit": 3,
            "similarity_threshold": 0.2
        }
    }
}
```

**Response:**
```json
{
    "id": 15,
    "role": "Product Support Agent",
    "knowledge_collection": 29,
    "rag": {
        "rag_type": "naive",
        "rag_id": 9,
        "rag_status": "completed"
    },
    "search_configs": {
        "naive": {
            "search_limit": 3,
            "similarity_threshold": 0.2
        }
    }
}
```

---

## Step 9: Configure Search Settings

Optionally adjust how the agent searches through knowledge.

**Endpoint:** `PATCH /api/agents/{agent_id}/`

**Request:**
```json
{
    "search_configs": {
        "naive": {
            "search_limit": 5,
            "similarity_threshold": 0.25
        }
    }
}
```

**Lower threshold** = More results, potentially less relevant

**Higher threshold** = Fewer results, more relevant

---

## Common Patterns

### Pattern 1: Adding New Documents to Existing Collection

When you add new files to a collection that already has a RAG configured:

```
# 1. Upload new documents
POST /api/documents/source-collection/29/upload/

# 2. Initialize configs for new documents only
POST /api/naive-rag/9/document-configs/initialize/
# This creates configs only for documents without existing configs

# 3. Re-index
POST /api/process-rag-indexing/
Body: {"rag_id": 9, "rag_type": "naive"}
```

### Pattern 2: Changing Embedder

To use a different embedding model:

```
# Update the NaiveRag with new embedder
POST /api/naive-rag/collections/29/naive-rag/
Body: {"embedder_id": 2}

# Re-index all documents
POST /api/process-rag-indexing/
Body: {"rag_id": 9, "rag_type": "naive"}
```

### Pattern 3: Copying a Knowledge Base

To create a copy of an existing collection (shares binary content, separate configs):

```
# Copy collection
POST /api/source-collections/29/copy/
Body: {"new_collection_name": "Product KB - Testing"}

# The new collection needs its own RAG config
POST /api/naive-rag/collections/30/naive-rag/
Body: {"embedder_id": 1}

# Initialize and index
POST /api/naive-rag/10/document-configs/initialize/
POST /api/process-rag-indexing/
Body: {"rag_id": 10, "rag_type": "naive"}
```

### Pattern 4: Removing Knowledge from Agent

```
# Unassign RAG (keeps search config for future use)
PATCH /api/agents/15/
Body: {"rag": null}

# Or also remove collection reference
PATCH /api/agents/15/
Body: {"knowledge_collection": null, "rag": null}
```

---

## Troubleshooting

### Issue: "Agent must have a knowledge_collection to assign RAG"

**Cause:** Trying to assign RAG before setting knowledge_collection

**Solution:**
```json
// First assign collection, then RAG
PATCH /api/agents/15/
Body: {
    "knowledge_collection": 29,
    "rag": {"rag_type": "naive", "rag_id": 9}
}
```

### Issue: "NaiveRag does not belong to agent's knowledge_collection"

**Cause:** The RAG was created for a different collection

**Solution:** Either:
1. Change agent's knowledge_collection to match the RAG's collection
2. Create a new RAG for the agent's current collection

### Issue: "NaiveRag has no embedder configured"

**Cause:** Trying to index without an embedder

**Solution:**
```json
// Configure embedder first
POST /api/naive-rag/collections/29/naive-rag/
Body: {"embedder_id": 1}
```

### Issue: "Collection has no documents to index"

**Cause:** Trying to index an empty collection

**Solution:** Upload documents before indexing

### Issue: "chunk_strategy 'markdown' is not valid for file type 'pdf'"

**Cause:** File type does not support the chosen strategy

**Solution:** Use a compatible strategy:
- PDF: token, character
- Markdown: token, character, markdown
- JSON: token, character, json
- etc.

### Issue: "chunk_overlap must be less than chunk_size"

**Cause:** Invalid chunk parameters

**Solution:** Ensure overlap < size (e.g., chunk_size=1000, chunk_overlap=150)

### Issue: Indexing stuck in "processing"

**Possible Causes:**
1. Knowledge service not running
2. Redis connection issues
3. Large documents taking time

**Solution:**
1. Check knowledge service logs
2. Verify Redis connectivity
3. Wait longer for large collections

---

## Next Steps

After completing this quickstart:

1. **Test your agent** - Run queries that require knowledge from your documents
2. **Fine-tune search settings** - Adjust search_limit and similarity_threshold based on results
3. **Monitor performance** - Check chunk counts and embedding counts
4. **Add more documents** - Expand your knowledge base as needed

For detailed API documentation, see [RAG_API_REFERENCE.md](RAG_API_REFERENCE.md).

For system architecture details, see [RAG_SYSTEM_DOCUMENTATION.md](RAG_SYSTEM_DOCUMENTATION.md).

---

## GraphRag (Coming Soon)

GraphRag is a future RAG strategy that will provide knowledge graph-based retrieval. It will follow a similar workflow:

1. Create collection
2. Upload documents
3. Configure GraphRag (instead of NaiveRag)
4. Initialize graph building
5. Index (entity extraction + relationship mapping)
6. Assign to agent
7. Configure graph-specific search settings

Stay tuned for updates on GraphRag availability.
