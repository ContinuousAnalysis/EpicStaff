# RAG System Documentation

## Comprehensive Technical Documentation for Developers

This document provides detailed technical documentation for the RAG (Retrieval-Augmented Generation) system, including architecture, data models, services, and integration patterns.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Data Models](#data-models)
4. [RAG Strategies](#rag-strategies)
5. [Services Layer](#services-layer)
6. [Document Processing Pipeline](#document-processing-pipeline)
7. [Agent Integration](#agent-integration)
8. [Search Configuration](#search-configuration)
9. [Redis Integration](#redis-integration)
10. [Error Handling](#error-handling)
11. [Configuration Reference](#configuration-reference)
12. [Business Logic Rules](#business-logic-rules)

---

## System Overview

The RAG system enables AI agents to retrieve relevant information from document collections during conversations. It implements a modular architecture supporting multiple RAG strategies.

### Key Components

| Component | Purpose |
|-----------|---------|
| Source Collections | Organize and store documents |
| Document Management | Handle file uploads, storage, and metadata |
| RAG Configurations | Define processing strategies (Naive, Graph) |
| Document Configs | Per-document chunking parameters |
| Indexing Service | Process documents into searchable embeddings |
| Agent Assignment | Link RAG knowledge to AI agents |
| Search Config | Control retrieval behavior per agent |

### Supported Workflow

```
Collection Creation
       |
       v
Document Upload --> Binary Storage (DocumentContent)
       |
       v
RAG Configuration (Select Strategy + Embedder)
       |
       v
Document Config Initialization (Per-doc parameters)
       |
       v
Indexing (Chunking + Embedding)
       |
       v
Agent Assignment + Search Config
       |
       v
Using in Flow / Realtime (Agent queries knowledge)
```

---

## Architecture

### Module Structure

```
django_app/tables/
|-- models/
|   |-- knowledge_models/
|   |   |-- collection_models.py    # SourceCollection, DocumentMetadata, BaseRagType
|   |   |-- naive_rag_models.py     # NaiveRag, NaiveRagDocumentConfig, Chunks, Embeddings
|   |-- crew_models.py              # Agent model with knowledge integration
|
|-- views/
|   |-- knowledge_views/
|   |   |-- collection_management_views.py  # Collection CRUD
|   |   |-- document_management_views.py    # Document upload/delete
|   |   |-- naive_rag_views.py              # NaiveRag configuration
|   |-- views.py                            # ProcessRagIndexingView
|
|-- services/
|   |-- knowledge_services/
|   |   |-- collection_management_service.py
|   |   |-- document_management_service.py
|   |   |-- naive_rag_service.py
|   |   |-- indexing_service.py
|   |-- rag_assignment_service.py
|   |-- redis_service.py
|
|-- serializers/
|   |-- knowledge_serializers.py
|   |-- naive_rag_serializers.py
|
|-- constants/
|   |-- knowledge_constants.py
|
|-- exceptions.py
```

### Design Patterns

1. **Service Layer Pattern**: Business logic separated from views
2. **Polymorphic RAG Types**: BaseRagType enables multiple RAG strategies
3. **Configuration Hierarchy**: Collection -> RAG -> Document Config
4. **Event-Driven Processing**: Redis pub/sub for async operations

---

## Data Models

### SourceCollection

Represents a container for documents belonging to a user.

```python
class SourceCollection(models.Model):
    collection_id = AutoField(primary_key=True)
    collection_name = CharField(max_length=255)
    collection_origin = CharField(choices=['user', 'node', 'tool'])
    user_id = CharField(max_length=120)
    status = CharField(choices=['empty', 'uploading', 'completed', 'warning'])
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
```

**Constraints:**
- Unique `(user_id, collection_name)` per user
- Auto-generates unique names on conflict

**Status Values:**
| Status | Condition |
|--------|-----------|
| empty | No documents |
| uploading | Files being uploaded |
| completed | Documents ready |
| warning | Some issues occurred |

---

### DocumentMetadata

Stores file metadata with reference to binary content.

```python
class DocumentMetadata(models.Model):
    document_id = AutoField(primary_key=True)
    file_name = CharField(max_length=255)
    file_type = CharField(choices=['pdf', 'csv', 'docx', 'txt', 'json', 'html', 'md'])
    file_size = PositiveIntegerField()  # bytes
    source_collection = ForeignKey(SourceCollection)
    document_content = ForeignKey(DocumentContent)
```

**Supported File Types:**
| Type | Extension | Description |
|------|-----------|-------------|
| pdf | .pdf | PDF documents |
| csv | .csv | Comma-separated values |
| docx | .docx | Microsoft Word |
| txt | .txt | Plain text |
| json | .json | JSON files |
| html | .html | HTML pages |
| md | .md | Markdown |

---

### DocumentContent

Binary storage for file contents (shared across metadata records).

```python
class DocumentContent(models.Model):
    content = BinaryField()  # max 12MB
```

**Design Note:** Multiple DocumentMetadata can reference the same DocumentContent (copy-on-reference for collection copies).

---

### BaseRagType

Polymorphic base for RAG implementations.

```python
class BaseRagType(models.Model):
    rag_type_id = AutoField(primary_key=True)
    rag_type = CharField(choices=['naive', 'graph'])
    source_collection = ForeignKey(SourceCollection)
```

**Purpose:** Enables type-specific RAG implementations while maintaining common collection relationship.

---

### NaiveRag

Naive RAG strategy implementation.

```python
class NaiveRag(models.Model):
    naive_rag_id = AutoField(primary_key=True)
    base_rag_type = ForeignKey(BaseRagType)
    embedder = ForeignKey(EmbeddingConfig)
    agents = ManyToManyField(Agent, through='AgentNaiveRag')
    rag_status = CharField(choices=['new', 'processing', 'completed', 'warning', 'failed'])
    error_message = TextField(nullable=True)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
    indexed_at = DateTimeField(nullable=True)
```

**Status Transitions:**
```
new --> processing --> completed
                  \--> warning (partial success)
                  \--> failed
```

---

### NaiveRagDocumentConfig

Per-document chunking configuration.

```python
class NaiveRagDocumentConfig(models.Model):
    naive_rag_document_id = AutoField(primary_key=True)
    naive_rag = ForeignKey(NaiveRag)
    document = ForeignKey(DocumentMetadata)

    chunk_strategy = CharField(choices=['token', 'character', 'markdown', 'json', 'html', 'csv'])
    chunk_size = PositiveIntegerField(default=1000)
    chunk_overlap = PositiveIntegerField(default=150)
    additional_params = JSONField(default=dict)

    status = CharField(choices=['new', 'chunked', 'processing', 'completed', 'warning', 'failed'])
    created_at = DateTimeField(auto_now_add=True)
    processed_at = DateTimeField(nullable=True)
```

**Constraints:**
- Unique `(naive_rag, document)` - one config per document per RAG
- `chunk_overlap < chunk_size`

**Properties:**
- `total_chunks`: Count of generated chunks
- `total_embeddings`: Count of generated embeddings

---

### NaiveRagChunk

Text chunks generated from documents.

```python
class NaiveRagChunk(models.Model):
    chunk_id = AutoField(primary_key=True)
    naive_rag_document_config = ForeignKey(NaiveRagDocumentConfig)
    text = TextField()
    chunk_index = PositiveIntegerField()
    token_count = PositiveIntegerField(nullable=True)
    metadata = JSONField(default=dict)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
```

**Ordering:** By `chunk_index` (sequential order within document)

---

### NaiveRagEmbedding

Vector embeddings for chunks.

```python
class NaiveRagEmbedding(models.Model):
    embedding_id = UUIDField(primary_key=True)
    naive_rag_document_config = ForeignKey(NaiveRagDocumentConfig)
    chunk = OneToOneField(NaiveRagChunk)
    vector = VectorField(dimensions=None)  # pgvector
    created_at = DateTimeField(auto_now_add=True)
```

**Note:** Uses PostgreSQL pgvector extension for efficient similarity search.

---

### AgentNaiveRag

Many-to-many relationship between agents and NaiveRag.

```python
class AgentNaiveRag(models.Model):
    agent = ForeignKey(Agent, unique=True)  # Currently 1:1, future M:M
    naive_rag = ForeignKey(NaiveRag)
```

**Current Restriction:** One NaiveRag per Agent (unique constraint on agent). This may be relaxed in future versions.

---

### NaiveRagSearchConfig

Per-agent search parameters.

```python
class NaiveRagSearchConfig(models.Model):
    agent = OneToOneField(Agent)
    search_limit = PositiveIntegerField(default=3)  # 1-1000
    similarity_threshold = DecimalField(default=0.2)  # 0.00-1.00
```

---

## RAG Strategies

### Naive RAG (Available)

Standard chunk-based retrieval approach.

**Process:**
1. Documents split into overlapping chunks
2. Chunks converted to vector embeddings
3. Queries converted to embeddings at runtime
4. Cosine similarity finds relevant chunks
5. Top-k chunks returned to agent

**Chunking Strategies:**

| Strategy | File Types | Description |
|----------|------------|-------------|
| token | All | Split by token count (default) |
| character | All | Split by character count |
| markdown | .md | Preserve markdown structure |
| json | .json | Maintain JSON hierarchy |
| html | .html | Respect HTML structure |
| csv | .csv | Handle tabular data |

**Strategy-File Type Matrix:**

```python
UNIVERSAL_STRATEGIES = {"token", "character"}

FILE_TYPE_SPECIFIC_STRATEGIES = {
    "pdf": set(),           # Only universal
    "csv": {"csv"},         # Universal + csv
    "docx": set(),          # Only universal
    "txt": set(),           # Only universal
    "json": {"json"},       # Universal + json
    "html": {"html"},       # Universal + html
    "md": {"markdown"},     # Universal + markdown
}
```

### GraphRag (Coming Soon)

Knowledge graph-based retrieval (not yet implemented).

**Planned Features:**
- Entity extraction from documents
- Relationship mapping between concepts
- Graph-based traversal for queries
- Support for complex reasoning chains

**Current Status:** `GraphRagNotImplementedException` raised when attempting to use.

---

## Services Layer

### CollectionManagementService

Handles collection lifecycle operations.

**Key Methods:**
- `create_collection(name, user_id, origin)` - Create new collection
- `update_collection(collection_id, name)` - Update collection name
- `delete_collection(collection_id)` - Delete with content cleanup
- `bulk_delete_collections(ids)` - Batch deletion
- `copy_collection(source_id, new_name)` - Copy without duplicating content
- `get_rag_configurations(collection_id)` - Get all RAG configs for collection

---

### DocumentManagementService

Handles document upload and management.

**Key Methods:**
- `upload_files_batch(collection_id, files)` - Upload multiple files
- `delete_document(document_id)` - Delete single document
- `delete_documents_batch(document_ids)` - Batch deletion
- `get_collection(collection_id)` - Retrieve collection

**Upload Validation:**
- File type validation against `ALLOWED_FILE_TYPES`
- File size validation against `MAX_FILE_SIZE` (12MB)

---

### NaiveRagService

Core business logic for Naive RAG operations.

**Key Methods:**

```python
# RAG Configuration
create_or_update_naive_rag(collection_id, embedder_id)
get_naive_rag(naive_rag_id)
get_or_none_naive_rag_by_collection(collection_id)
delete_naive_rag(naive_rag_id)

# Document Configs
init_document_configs(naive_rag_id)  # Initialize with defaults
update_document_config(config_id, naive_rag_id, **params)
get_document_configs_for_naive_rag(naive_rag_id)
delete_document_config(config_id, naive_rag_id)

# Bulk Operations
bulk_update_document_configs_with_partial_errors(naive_rag_id, config_ids, **params)
bulk_delete_document_configs(naive_rag_id, config_ids)

# Validation
validate_chunk_parameters(chunk_size, chunk_overlap, chunk_strategy)
validate_strategy_for_file_type(chunk_strategy, file_type, file_name)
```

**Validation Rules:**
- `chunk_size`: 20 - 8000
- `chunk_overlap`: 0 - 1000
- `chunk_overlap < chunk_size`
- Strategy must be allowed for file type

---

### IndexingService

Validates and prepares RAG configurations for indexing.

**Key Methods:**
```python
validate_and_prepare_indexing(rag_id, rag_type)
get_rag_status(rag_id, rag_type)
```

**Validation Checks:**
1. RAG exists
2. Collection exists and has documents
3. Embedder is configured

---

### RagAssignmentService

Manages RAG assignment to agents.

**Key Methods:**
```python
# Assignment
assign_rag_to_agent(agent, rag_type, rag_id)
unassign_all_rags_from_agent(agent)

# Queries
get_assigned_rag_info(agent)  # Returns {rag_type, rag_id, rag_status}
get_available_naive_rags_for_agent(agent)
get_agent_naive_rag(agent)

# Validation
validate_rag_assignment(agent, rag_type, rag_id)
```

**Assignment Rules:**
1. Agent must have `knowledge_collection` assigned
2. RAG must belong to agent's collection
3. Previous assignment is removed before new assignment

---

### SearchConfigService

Manages search configuration for agents.

**Key Methods:**
```python
create_default_search_config(agent)
get_config_for_agent(agent)
update_search_config(agent, search_limit=None, similarity_threshold=None)
```

---

## Document Processing Pipeline

### Upload Flow

```
1. Request with files (multipart/form-data)
       |
       v
2. Serializer validation (file count)
       |
       v
3. DocumentManagementService.upload_files_batch()
   |-- Validate collection exists
   |-- For each file:
   |   |-- Validate file type
   |   |-- Validate file size (max 12MB)
   |   |-- Create DocumentContent (binary)
   |   |-- Create DocumentMetadata
       |
       v
4. Return created document metadata
```

### RAG Configuration Flow

```
1. Create/Update NaiveRag
   |-- Validate collection exists
   |-- Validate embedder exists
   |-- Create BaseRagType (if new)
   |-- Create/Update NaiveRag
       |
       v
2. Initialize Document Configs (signal or separate call)
   |-- Get all documents in collection
   |-- Create NaiveRagDocumentConfig for each
   |-- Apply default parameters
       |
       v
3. Optional: Customize configs
   |-- Update individual configs
   |-- Or bulk update
```

### Indexing Flow

```
1. POST /process-rag-indexing/
       |
       v
2. IndexingService.validate_and_prepare_indexing()
   |-- Validate RAG exists
   |-- Validate collection has documents
   |-- Validate embedder configured
       |
       v
3. RedisService.publish_rag_indexing()
   |-- Publish to KNOWLEDGE_INDEXING_CHANNEL
       |
       v
4. Knowledge Service (async worker)
   |-- Receive message
   |-- For each document config:
   |   |-- Chunk document
   |   |-- Generate embeddings
   |   |-- Store in database
   |-- Update RAG status
```

---

## Agent Integration

### Assigning RAG to Agent

**Requirements:**
1. Agent has `knowledge_collection` set
2. RAG belongs to that collection
3. RAG status allows usage (completed/warning recommended)

**Assignment Process:**
```python
# In agent create/update serializer
rag_data = {
    "rag_type": "naive",
    "rag_id": 9
}

# Service call
RagAssignmentService.assign_rag_to_agent(
    agent=agent,
    rag_type=rag_data["rag_type"],
    rag_id=rag_data["rag_id"]
)
```

### Search Configuration

**Parameters:**
| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| search_limit | int | 3 | 1-1000 | Max chunks to retrieve |
| similarity_threshold | float | 0.2 | 0.0-1.0 | Min similarity score |

**Configuration via nested serializer:**
```python
search_configs = {
    "naive": {
        "search_limit": 5,
        "similarity_threshold": 0.3
    }
    # Future: "graph": {...}
}
```

---

## Search Configuration

### NaiveRagSearchConfig Parameters

| Parameter | Type | Default | Min | Max | Description |
|-----------|------|---------|-----|-----|-------------|
| search_limit | Integer | 3 | 1 | 1000 | Maximum number of chunks to retrieve |
| similarity_threshold | Decimal | 0.20 | 0.00 | 1.00 | Minimum cosine similarity score |

### Search Behavior

- **search_limit**: Controls how many relevant chunks are returned
  - Lower values = faster, more focused results
  - Higher values = more context, less precision, potentially slower

- **similarity_threshold**: Filters out irrelevant results
  - 0.0 = Return all results up to limit
  - 1.0 = Only exact matches (rarely useful)
  - 0.2-0.8 = Typical range for good results

---

## Redis Integration

The system uses Redis pub/sub for asynchronous processing operations.

### Channels

| Channel | Purpose | Message Type |
|---------|---------|--------------|
| `KNOWLEDGE_INDEXING_CHANNEL` | RAG indexing requests | ProcessRagIndexingMessage |
| `KNOWLEDGE_DOCUMENT_CHUNK_CHANNEL` | Document chunking requests | ChunkDocumentMessage |

### Message Formats

#### ProcessRagIndexingMessage

Published when triggering RAG indexing.

```python
class ProcessRagIndexingMessage(BaseModel):
    rag_id: int         # NaiveRag or GraphRag ID
    rag_type: str       # "naive" or "graph"
    collection_id: int  # Source collection ID
```

**Example:**
```json
{
    "rag_id": 9,
    "rag_type": "naive",
    "collection_id": 29
}
```

#### ChunkDocumentMessage

Published for individual document chunking.

```python
class ChunkDocumentMessage(BaseModel):
    naive_rag_document_id: int  # Document config ID
```

**Example:**
```json
{
    "naive_rag_document_id": 15
}
```

### Publishing Methods

```python
# RedisService methods
redis_service.publish_rag_indexing(rag_id, rag_type, collection_id)
redis_service.publish_process_document_chunking(naive_rag_document_id)
```

---

## Error Handling

### Exception Hierarchy

```
CustomAPIException (base)
|
|-- DocumentUploadException
|   |-- FileSizeExceededException
|   |-- InvalidFileTypeException
|   |-- CollectionNotFoundException
|   |-- NoFilesProvidedException
|   |-- DocumentNotFoundException
|
|-- RagException
    |-- RagTypeNotFoundException
    |-- NaiveRagNotFoundException
    |-- DocumentConfigNotFoundException
    |-- EmbedderNotFoundException
    |-- InvalidChunkParametersException
    |-- DocumentsNotFoundException
    |-- NaiveRagAlreadyExistsException
    |-- RagNotReadyForIndexingException
    |-- GraphRagNotImplementedException
    |-- AgentMissingCollectionException
    |-- RagCollectionMismatchException
    |-- UnknownRagTypeException
```

### Exception Details

| Exception | HTTP Status | When Raised |
|-----------|-------------|-------------|
| FileSizeExceededException | 400 | File > 12MB |
| InvalidFileTypeException | 400 | Unsupported extension |
| CollectionNotFoundException | 404 | Collection ID not found |
| NaiveRagNotFoundException | 404 | NaiveRag ID not found |
| DocumentConfigNotFoundException | 404 | Config ID not found |
| EmbedderNotFoundException | 404 | Embedder ID not found |
| InvalidChunkParametersException | 400 | Invalid chunk settings |
| RagNotReadyForIndexingException | 400 | Missing embedder |
| GraphRagNotImplementedException | 400 | GraphRag used |
| AgentMissingCollectionException | 400 | Agent has no collection |
| RagCollectionMismatchException | 400 | RAG from wrong collection |

---

## Configuration Reference

### Constants (knowledge_constants.py)

```python
# File Limits
MAX_FILE_SIZE = 12 * 1024 * 1024  # 12 MB

# Default RAG Parameters
DEFAULT_CHUNK_SIZE = 1000
DEFAULT_CHUNK_OVERLAP = 150
DEFAULT_CHUNK_STRATEGY = "token"

# Validation Limits
MIN_CHUNK_SIZE = 20
MAX_CHUNK_SIZE = 8000
MIN_CHUNK_OVERLAP = 0
MAX_CHUNK_OVERLAP = 1000

# Chunking Strategies
UNIVERSAL_STRATEGIES = {"token", "character"}
FILE_TYPE_SPECIFIC_STRATEGIES = {
    "pdf": set(),
    "csv": {"csv"},
    "docx": set(),
    "txt": set(),
    "json": {"json"},
    "html": {"html"},
    "md": {"markdown"},
}
```

### Allowed File Types

```python
ALLOWED_FILE_TYPES = {"pdf", "csv", "docx", "txt", "json", "html", "md"}
```

---

## Business Logic Rules

### Collection Rules

1. Collection names auto-increment if duplicate: "Name" -> "Name (1)" -> "Name (2)"
2. Deleting collection cascades to documents, RAG configs, chunks and embeddings
3. Copying collection shares DocumentContent (no binary duplication)

### Document Rules

1. File type determined by extension
2. Maximum 12MB per file
3. Deleting document cascades to configs, chunks and embeddings

### RAG Configuration Rules

1. One NaiveRag per collection (create_or_update pattern)
2. Embedder required before indexing
3. Document configs auto-initialize with defaults
4. Re-indexing requires status reset

### Document Config Rules

1. One config per document per RAG
2. Strategy must match file type (see matrix above)
3. Overlap must be less than chunk size
4. Updating config resets status to "new"

### Agent Assignment Rules

1. Agent must have knowledge_collection
2. RAG must belong to agent's collection
3. One RAG assignment per agent (currently)
4. Unassigning keeps search config intact

### Search Config Rules

1. Created automatically on first access
2. Persists across RAG reassignment
3. Independent per agent
