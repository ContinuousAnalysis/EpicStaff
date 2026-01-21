# RAG API Reference

## Complete API Endpoint Documentation

This document provides a comprehensive reference for all RAG-related API endpoints with minimalistic request/response examples.

---

## Table of Contents

1. [Collection Management](#collection-management)
2. [Document Management](#document-management)
3. [Naive RAG Configuration](#naive-rag-configuration)
4. [Document Config Management](#document-config-management)
5. [RAG Indexing](#rag-indexing)
6. [Agent RAG Assignment](#agent-rag-assignment)
7. [Search Configuration](#search-configuration)
8. [GraphRag (Coming Soon)](#graphrag-coming-soon)

---

## Collection Management

### List Collections

**GET** `/api/source-collections/`

Lists all source collections.

**Response:**
```json
[
    {
        "collection_id": 29,
        "collection_name": "Product Documentation",
        "user_id": "user123",
        "status": "completed",
        "document_count": 5,
        "created_at": "2025-12-17T14:17:01.594229Z",
        "updated_at": "2025-12-17T15:30:00.123456Z"
    }
]
```

---

### Get Collection Details

**GET** `/api/source-collections/{collection_id}/`

Retrieves detailed information about a collection including RAG configurations.

**Response:**
```json
{
    "collection_id": 29,
    "collection_name": "Product Documentation",
    "user_id": "user123",
    "status": "completed",
    "document_count": 5,
    "rag_configurations": [
        {
            "rag_id": 9,
            "rag_type": "naive",
            "status": "completed",
            "is_ready_for_indexing": true,
            "embedder_name": "text-embedding-3-small",
            "embedder_id": 1,
            "document_configs_count": 5,
            "chunks_count": 150,
            "embeddings_count": 150,
            "message": null,
            "created_at": "2025-12-17T14:17:01.594229Z",
            "updated_at": "2025-12-17T15:30:00.123456Z"
        }
    ],
    "created_at": "2025-12-17T14:17:01.594229Z",
    "updated_at": "2025-12-17T15:30:00.123456Z"
}
```

---

### Create Collection

**POST** `/api/source-collections/`

Creates a new empty collection.

**Request:**
```json
{
    "collection_name": "My New Collection",
    "user_id": "user123"
}
```

**Response:** `201 Created`
```json
{
    "collection_id": 30,
    "collection_name": "My New Collection",
    "user_id": "user123",
    "status": "empty",
    "document_count": 0,
    "rag_configurations": [],
    "created_at": "2025-12-18T10:00:00.000000Z",
    "updated_at": "2025-12-18T10:00:00.000000Z"
}
```

---

### Update Collection

**PATCH** `/api/source-collections/{collection_id}/`

Updates collection name.

**Request:**
```json
{
    "collection_name": "Updated Collection Name"
}
```

**Response:** `200 OK`
```json
{
    "collection_id": 29,
    "collection_name": "Updated Collection Name",
    "user_id": "user123",
    "status": "completed",
    "document_count": 5,
    "rag_configurations": [...],
    "created_at": "2025-12-17T14:17:01.594229Z",
    "updated_at": "2025-12-18T10:05:00.000000Z"
}
```

---

### Delete Collection

**DELETE** `/api/source-collections/{collection_id}/`

Deletes collection and all associated documents and RAG configurations.

**Response:** `200 OK`
```json
{
    "message": "Collection deleted successfully",
    "collection_id": 29,
    "deleted_documents": 5,
    "deleted_rags": 1
}
```

---

### Bulk Delete Collections

**POST** `/api/source-collections/bulk-delete/`

Deletes multiple collections at once.

**Request:**
```json
{
    "collection_ids": [25, 26, 27]
}
```

**Response:** `200 OK`
```json
{
  "message": "Successfully deleted 1 collection(s)",
  "deleted_count": 1,
  "collections": [
    {
      "collection_id": 20,
      "collection_name": "Legal docs"
    }
  ],
  "deleted_documents": 4,
  "deleted_content": 4
}
```

---

### Copy Collection

**POST** `/api/source-collections/{collection_id}/copy/`

Copies a collection without duplicating binary content.

**Request:**
```json
{
    "new_collection_name": "My Collection Copy"
}
```

**Response:** `201 Created`
```json
{
    "message": "Collection copied successfully",
    "collection": {
        "collection_id": 31,
        "collection_name": "My Collection Copy",
        "user_id": "user123",
        "status": "completed",
        "document_count": 5,
        "rag_configurations": [],
        "created_at": "2025-12-18T10:10:00.000000Z",
        "updated_at": "2025-12-18T10:10:00.000000Z"
    }
}
```

---

### Get Available RAGs

**GET** `/api/source-collections/{collection_id}/available-rags/`

Gets all RAG configurations available for a collection.

**Query Parameters:**
- `status` (optional): Filter by status, comma-separated. Default: `completed,warning,new`

**Response:** `200 OK`
```json
[
    {
        "rag_id": 9,
        "rag_type": "naive",
        "rag_status": "completed",
        "collection_id": 29,
        "created_at": "2025-12-17T14:17:01.594229Z",
        "updated_at": "2025-12-17T15:30:00.000000Z"
    }
]
```

---

## Document Management

### Upload Documents

**POST** `/api/documents/source-collection/{collection_id}/upload/`

Uploads one or multiple files to a collection. Uses `multipart/form-data`.

**Request:**
- Content-Type: `multipart/form-data`
- Field: `files` (multiple files allowed)

**Response:** `201 Created`
```json
{
    "message": "Successfully uploaded 2 file(s)",
    "documents": [
        {
            "document_id": 101,
            "file_name": "manual.pdf",
            "file_type": "pdf",
            "file_size": 1048576,
            "source_collection": 29
        },
        {
            "document_id": 102,
            "file_name": "data.csv",
            "file_type": "csv",
            "file_size": 524288,
            "source_collection": 29
        }
    ]
}
```

**Error Response:** `400 Bad Request`
```json
{
    "error": "File 'large_file.pdf' exceeds the maximum allowed size of 12MB"
}
```

---

### List Documents

**GET** `/api/documents/`

Lists all documents. Optionally filter by collection.

**Query Parameters:**
- `collection_id` (optional): Filter by collection ID

**Response:** `200 OK`
```json
[
    {
        "document_id": 101,
        "file_name": "manual.pdf",
        "file_type": "pdf",
        "file_size": 1048576
    },
    {
        "document_id": 102,
        "file_name": "data.csv",
        "file_type": "csv",
        "file_size": 524288
    }
]
```

---

### List Collection Documents

**GET** `/api/source-collections/{collection_id}/documents/`

Lists all documents in a specific collection.

**Response:** `200 OK`
```json
{
    "collection_id": 29,
    "collection_name": "Product Documentation",
    "document_count": 2,
    "documents": [
        {
            "document_id": 101,
            "file_name": "manual.pdf",
            "file_type": "pdf",
            "file_size": 1048576
        },
        {
            "document_id": 102,
            "file_name": "data.csv",
            "file_type": "csv",
            "file_size": 524288
        }
    ]
}
```

---

### Get Document

**GET** `/api/documents/{document_id}/`

Retrieves a single document.

**Response:** `200 OK`
```json
{
    "document_id": 101,
    "file_name": "manual.pdf",
    "file_type": "pdf",
    "file_size": 1048576,
    "source_collection": 29,
    "collection_name": "Product Documentation"
}
```

---

### Delete Document

**DELETE** `/api/documents/{document_id}/`

Deletes a single document.

**Response:** `200 OK`
```json
{
    "message": "Document deleted successfully",
    "document_id": 101,
    "file_name": "manual.pdf"
}
```

---

### Bulk Delete Documents

**POST** `/api/documents/bulk-delete/`

Deletes multiple documents at once.

**Request:**
```json
{
    "document_ids": [101, 102, 103]
}
```

**Response:** `200 OK`
```json
{
    "message": "Successfully deleted 3 document(s)",
    "deleted_documents": [
        {"document_id": 101, "file_name": "manual.pdf", "collection_id": 22},
        {"document_id": 102, "file_name": "data_1.csv", "collection_id": 22},
        {"document_id": 103, "file_name": "sample.txt", "collection_id": 22}
    ]
}
```

---

## Naive RAG Configuration

### Create or Update Naive RAG

**POST** `/api/naive-rag/collections/{collection_id}/naive-rag/`

Creates a new NaiveRag or updates existing one for a collection.

**Request:**
```json
{
    "embedder_id": 1
}
```

**Response:** `200 OK`
```json
{
    "message": "NaiveRag configured successfully",
    "naive_rag": {
        "naive_rag_id": 9,
        "base_rag_type": {
            "rag_type_id": 15,
            "rag_type": "naive",
            "source_collection": 29
        },
        "embedder": 1,
        "embedder_name": "text-embedding-3-small",
        "rag_status": "new",
        "collection_id": 29,
        "error_message": null,
        "created_at": "2025-12-17T14:17:01.594229Z",
        "updated_at": "2025-12-17T14:17:01.594229Z",
        "indexed_at": null
    }
}
```

---

### Get Naive RAG by Collection

**GET** `/api/naive-rag/collections/{collection_id}/naive-rag/`

Gets the NaiveRag configuration for a collection.

**Response:** `200 OK`
```json
{
    "naive_rag_id": 9,
    "base_rag_type": {
        "rag_type_id": 15,
        "rag_type": "naive",
        "source_collection": 29
    },
    "embedder": 1,
    "embedder_name": "text-embedding-3-small",
    "rag_status": "completed",
    "collection_id": 29,
    "error_message": null,
    "created_at": "2025-12-17T14:17:01.594229Z",
    "updated_at": "2025-12-17T15:30:00.123456Z",
    "indexed_at": "2025-12-17T15:30:00.123456Z"
}
```

---

### Get Naive RAG Details

**GET** `/api/naive-rag/{naive_rag_id}/`

Gets detailed NaiveRag information including all document configs.

**Response:** `200 OK`
```json
{
    "naive_rag_id": 9,
    "base_rag_type": {
        "rag_type_id": 15,
        "rag_type": "naive",
        "source_collection": 29
    },
    "embedder": 1,
    "embedder_name": "text-embedding-3-small",
    "rag_status": "completed",
    "collection_id": 29,
    "collection_name": "Product Documentation",
    "total_documents": 5,
    "configured_documents": 5,
    "document_configs": [
        {
            "naive_rag_document_id": 20,
            "document_id": 101,
            "file_name": "manual.pdf",
            "chunk_strategy": "token",
            "chunk_size": 1000,
            "chunk_overlap": 150,
            "additional_params": {},
            "status": "completed",
            "total_chunks": 45,
            "total_embeddings": 45,
            "created_at": "2025-12-17T14:20:00.000000Z",
            "processed_at": "2025-12-17T15:25:00.000000Z"
        }
    ],
    "error_message": null,
    "created_at": "2025-12-17T14:17:01.594229Z",
    "updated_at": "2025-12-17T15:30:00.123456Z",
    "indexed_at": "2025-12-17T15:30:00.123456Z"
}
```

---

### Delete Naive RAG

**DELETE** `/api/naive-rag/{naive_rag_id}/`

Deletes NaiveRag and all its configurations.

**Response:** `200 OK`
```json
{
    "message": "NaiveRag deleted successfully",
    "naive_rag_id": 9,
    "collection_id": 29,
    "deleted_config_count": 5
}
```

---

### Initialize Document Configs

**POST** `/api/naive-rag/{naive_rag_id}/document-configs/initialize/`

Initializes document configs with default parameters for documents that do not have configs.

**Request:** No body required

**Response:** `201 Created`
```json
{
    "message": "Initialized 5 new document config(s)",
    "configs_created": 5,
    "configs_existing": 0,
    "new_configs": [
        {
            "config_id": 20,
            "document_id": 101,
            "file_name": "manual.pdf",
            "file_type": "pdf",
            "chunk_strategy": "token"
        },
        {
            "config_id": 21,
            "document_id": 102,
            "file_name": "data.csv",
            "file_type": "csv",
            "chunk_strategy": "token"
        }
    ]
}
```

**Response (no new configs):** `200 OK`
```json
{
    "message": "All documents already have configs",
    "configs_created": 0,
    "configs_existing": 5,
    "new_configs": []
}
```

---

## Document Config Management

### List Document Configs

**GET** `/api/naive-rag/{naive_rag_id}/document-configs/`

Lists all document configs for a NaiveRag.

**Response:** `200 OK`
```json
{
    "naive_rag_id": 9,
    "total_configs": 2,
    "configs": [
        {
            "naive_rag_document_id": 20,
            "document_id": 101,
            "file_name": "manual.pdf",
            "chunk_strategy": "token",
            "chunk_size": 1000,
            "chunk_overlap": 150,
            "additional_params": {},
            "status": "new",
            "total_chunks": 0,
            "total_embeddings": 0,
            "created_at": "2025-12-17T14:20:00.000000Z",
            "processed_at": null
        },
        {
            "naive_rag_document_id": 21,
            "document_id": 102,
            "file_name": "data.csv",
            "chunk_strategy": "csv",
            "chunk_size": 500,
            "chunk_overlap": 50,
            "additional_params": {},
            "status": "new",
            "total_chunks": 0,
            "total_embeddings": 0,
            "created_at": "2025-12-17T14:20:00.000000Z",
            "processed_at": null
        }
    ]
}
```

---

### Get Document Config

**GET** `/api/naive-rag/{naive_rag_id}/document-configs/{config_id}/`

Gets a single document config.

**Response:** `200 OK`
```json
{
    "naive_rag_document_id": 20,
    "document_id": 101,
    "file_name": "manual.pdf",
    "chunk_strategy": "token",
    "chunk_size": 1000,
    "chunk_overlap": 150,
    "additional_params": {},
    "status": "completed",
    "total_chunks": 45,
    "total_embeddings": 45,
    "created_at": "2025-12-17T14:20:00.000000Z",
    "processed_at": "2025-12-17T15:25:00.000000Z"
}
```

---

### Update Document Config

**PUT** `/api/naive-rag/{naive_rag_id}/document-configs/{config_id}/`

Updates a single document config. All fields are optional.

**Request:**
```json
{
    "chunk_size": 1500,
    "chunk_overlap": 200,
    "chunk_strategy": "token",
    "additional_params": {}
}
```

**Response:** `200 OK`
```json
{
    "message": "Document config updated successfully",
    "config": {
        "naive_rag_document_id": 20,
        "document_id": 101,
        "file_name": "manual.pdf",
        "chunk_strategy": "token",
        "chunk_size": 1500,
        "chunk_overlap": 200,
        "additional_params": {},
        "status": "new",
        "total_chunks": 0,
        "total_embeddings": 0,
        "created_at": "2025-12-17T14:20:00.000000Z",
        "processed_at": null
    }
}
```

---

### Delete Document Config

**DELETE** `/api/naive-rag/{naive_rag_id}/document-configs/{config_id}/`

Deletes a single document config.

**Response:** `200 OK`
```json
{
    "message": "Document config deleted successfully",
    "config_id": 20,
    "document_name": "manual.pdf"
}
```

---

### Bulk Update Document Configs

**PUT** `/api/naive-rag/{naive_rag_id}/document-configs/bulk-update/`

Updates multiple document configs at once. Supports partial success.

**Request:**
```json
{
    "config_ids": [20, 21, 22],
    "chunk_size": 1200,
    "chunk_overlap": 100,
    "additional_params": {}
}
```

**Response (all success):** `200 OK`
```json
{
    "message": "Successfully updated 3 config(s)",
    "updated_count": 3,
    "failed_count": 0,
    "configs": [
        {
            "naive_rag_document_id": 20,
            "document_id": 101,
            "file_name": "manual.pdf",
            "chunk_strategy": "token",
            "chunk_size": 1200,
            "chunk_overlap": 100,
            "additional_params": {},
            "status": "new",
            "total_chunks": 0,
            "total_embeddings": 0,
            "created_at": "2025-12-17T14:20:00.000000Z",
            "processed_at": null,
            "errors": []
        }
    ]
}
```

**Response (partial success):** `207 Multi-Status`
```json
{
    "message": "Successfully updated 2 config(s), Failed to update 1 config(s)",
    "updated_count": 2,
    "failed_count": 1,
    "configs": [
        {
            "naive_rag_document_id": 20,
            "document_id": 101,
            "file_name": "manual.pdf",
            "chunk_strategy": "token",
            "chunk_size": 1200,
            "chunk_overlap": 100,
            "additional_params": {},
            "status": "new",
            "errors": []
        },
        {
            "naive_rag_document_id": 22,
            "document_id": 103,
            "file_name": "data.json",
            "chunk_strategy": "json",
            "chunk_size": 500,
            "chunk_overlap": 50,
            "additional_params": {},
            "status": "new",
            "errors": [
                {
                    "field": "chunk_strategy",
                    "value": "markdown",
                    "reason": "chunk_strategy 'markdown' is not valid for file type 'json'. Allowed: character, json, token"
                }
            ]
        }
    ]
}
```

---

### Bulk Delete Document Configs

**POST** `/api/naive-rag/{naive_rag_id}/document-configs/bulk-delete/`

Deletes multiple document configs at once.

**Request:**
```json
{
    "config_ids": [20, 21, 22]
}
```

**Response:** `200 OK`
```json
{
    "message": "Successfully deleted 3 config(s)",
    "deleted_count": 3,
    "deleted_config_ids": [20, 21, 22]
}
```

---

## RAG Indexing

### Trigger RAG Indexing

**POST** `/api/process-rag-indexing/`

Triggers the indexing process (chunking + embedding) for a RAG configuration.

**Request:**
```json
{
    "rag_id": 9,
    "rag_type": "naive"
}
```

**Response:** `202 Accepted`
```json
{
    "detail": "Indexing process accepted",
    "rag_id": 9,
    "rag_type": "naive",
    "collection_id": 29
}
```

**Error Response (not ready):** `400 Bad Request`
```json
{
    "error": "NaiveRag 9 has no embedder configured. Please configure an embedder before indexing."
}
```

**Error Response (no documents):** `400 Bad Request`
```json
{
    "error": "Collection 29 has no documents to index"
}
```

---

### Trigger Document Chunking

**POST** `/api/process-document-chunking/`

Triggers chunking for a single document config.

**Request:**
```json
{
    "naive_rag_document_id": 20
}
```

**Response:** `202 Accepted`

**Error Response:** `404 Not Found`

---

## Agent RAG Assignment

### Assign RAG to Agent

RAG assignment is done through the Agent update endpoint.

**PATCH** `/api/agents/{agent_id}/`

**Request:**
```json
{
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

**Response:** `200 OK`
```json
{
    "id": 15,
    "role": "Research Assistant",
    "goal": "Help users find information",
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

**Error Response (no collection):** `400 Bad Request`
```json
{
    "error": "Agent must have a knowledge_collection to assign RAG"
}
```

**Error Response (wrong collection):** `400 Bad Request`
```json
{
    "error": "NaiveRag 9 does not belong to agent's knowledge_collection (collection_id=30)"
}
```

---

### Unassign collection and RAG from Agent

**PATCH** `/api/agents/{agent_id}/`

**Request:**
```json
{
    "knowledge_collection": null
}
```

**Response:** `200 OK`
```json
{
    "id": 15,
    "role": "Research Assistant",
    "goal": "Help users find information",
    "knowledge_collection": null,
    "rag": null,
    "search_configs": {
        "naive": {
            "search_limit": 3,
            "similarity_threshold": 0.2
        }
    }
}
```

---

## Search Configuration

### Update Search Config

Search configuration is updated through the Agent update endpoint.

**PATCH** `/api/agents/{agent_id}/`

**Request:**
```json
{
    "search_configs": {
        "naive": {
            "search_limit": 5,
            "similarity_threshold": 0.3
        }
    }
}
```

**Response:** `200 OK`
```json
{
    "id": 15,
    "role": "Research Assistant",
    "knowledge_collection": 29,
    "rag": {
        "rag_type": "naive",
        "rag_id": 9,
        "rag_status": "completed"
    },
    "search_configs": {
        "naive": {
            "search_limit": 5,
            "similarity_threshold": 0.3
        }
    }
}
```

---

### Search Config Parameters

| Parameter | Type | Default | Min | Max | Description |
|-----------|------|---------|-----|-----|-------------|
| search_limit | integer | 3 | 1 | 1000 | Max chunks to retrieve |
| similarity_threshold | float | 0.2 | 0.0 | 1.0 | Min similarity score |

---

## GraphRag (Coming Soon)

GraphRag is a planned RAG strategy that will use knowledge graphs for more sophisticated information retrieval.

---

## Error Responses

### Common Error Formats

**Validation Error:** `400 Bad Request`
```json
{
    "error": "chunk_size must be between 20 and 8000; chunk_overlap must be less than chunk_size"
}
```

**Not Found:** `404 Not Found`
```json
{
    "error": "NaiveRag with id 999 not found"
}
```

**Server Error:** `500 Internal Server Error`
```json
{
    "error": "An unexpected error occurred: <details>"
}
```

---

## HTTP Status Codes

| Code | Meaning | Common Use |
|------|---------|------------|
| 200 | OK | Successful GET, PUT, DELETE |
| 201 | Created | Successful POST creating resource |
| 202 | Accepted | Async operation accepted |
| 207 | Multi-Status | Partial success in bulk operations |
| 400 | Bad Request | Validation error, business rule violation |
| 404 | Not Found | Resource not found |
| 500 | Internal Server Error | Unexpected server error |

---

## Chunking Strategy Reference

### Available Strategies

| Strategy | File Types | Description |
|----------|------------|-------------|
| token | All | Split by token count (default) |
| character | All | Split by character count |
| markdown | .md | Preserve markdown structure |
| json | .json | Maintain JSON hierarchy |
| html | .html | Respect HTML structure |
| csv | .csv | Handle tabular data |

### File Type Strategy Matrix

| File Type | Allowed Strategies |
|-----------|-------------------|
| pdf | token, character |
| docx | token, character |
| txt | token, character |
| csv | token, character, csv |
| json | token, character, json |
| html | token, character, html |
| md | token, character, markdown |

---

## Configuration Limits

| Parameter | Min | Max | Default |
|-----------|-----|-----|---------|
| chunk_size | 20 | 8000 | 1000 |
| chunk_overlap | 0 | 1000 | 150 |
| file_size | - | 12 MB | - |
| search_limit | 1 | 1000 | 3 |
| similarity_threshold | 0.0 | 1.0 | 0.2 |
