"""
Comprehensive tests for NaiveRag and Document Configuration operations

Tests cover:
- NaiveRag CRUD operations
- Document config initialization (with defaults, idempotency)
- Single config updates
- Bulk config updates
- Single config deletion
- Bulk config deletion
- Security: naive_rag_id validation for all operations
- Edge cases: empty collections, incompatible strategies, etc.
"""

import pytest
from django.urls import reverse
from rest_framework import status

from tables.models.knowledge_models import (
    NaiveRag,
    NaiveRagDocumentConfig,
    BaseRagType,
    DocumentMetadata,
    DocumentContent,
    SourceCollection,
)


# ============================================================================
# FIXTURES
# ============================================================================


@pytest.fixture
def another_collection():
    """Create another collection for security tests."""
    return SourceCollection.objects.create(
        collection_name="Another Collection", user_id="test_user"
    )


@pytest.fixture
def another_naive_rag(another_collection, test_embedding_config):
    """Create another NaiveRag for security tests."""
    base_rag = BaseRagType.objects.create(
        source_collection=another_collection, rag_type=BaseRagType.RagType.NAIVE
    )
    return NaiveRag.objects.create(
        base_rag_type=base_rag,
        embedder=test_embedding_config,
        rag_status=NaiveRag.NaiveRagStatus.NEW,
    )


@pytest.fixture
def another_document(another_collection):
    """Create a document in another collection."""
    content = DocumentContent.objects.create(content=b"Another doc content")
    return DocumentMetadata.objects.create(
        source_collection=another_collection,
        document_content=content,
        file_name="another_doc.pdf",
        file_type="pdf",
        file_size=1024,
    )


@pytest.fixture
def another_config(another_naive_rag, another_document):
    """Create a config in another NaiveRag."""
    return NaiveRagDocumentConfig.objects.create(
        naive_rag=another_naive_rag,
        document=another_document,
        chunk_strategy="token",
        chunk_size=1000,
        chunk_overlap=150,
        status=NaiveRagDocumentConfig.NaiveRagDocumentStatus.NEW,
    )


# ============================================================================
# NAIVERAG CRUD TESTS
# ============================================================================


@pytest.mark.django_db
class TestNaiveRagCreation:
    """Tests for creating and updating NaiveRag."""

    def test_create_naive_rag(
        self, api_client, source_collection, test_embedding_config
    ):
        """Test creating a NaiveRag for a collection."""
        url = reverse("naive-rag-collection", args=[source_collection.collection_id])
        data = {"embedder_id": test_embedding_config.pk}

        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        response_data = response.json()
        assert "naive_rag" in response_data
        assert response_data["naive_rag"]["embedder"] == test_embedding_config.pk

        # Verify in database
        base_rag = BaseRagType.objects.get(
            source_collection=source_collection, rag_type=BaseRagType.RagType.NAIVE
        )
        assert base_rag is not None
        naive_rag = NaiveRag.objects.get(base_rag_type=base_rag)
        assert naive_rag.embedder == test_embedding_config

    def test_update_existing_naive_rag(
        self, api_client, source_collection, test_embedding_config, naive_rag
    ):
        """Test updating an existing NaiveRag (changing embedder)."""
        from tables.models import EmbeddingModel, EmbeddingConfig

        # Create another embedder
        embedding_model = EmbeddingModel.objects.create(
            name="text-embedding-ada-002",
            embedding_provider=test_embedding_config.model.embedding_provider,
        )
        new_embedder = EmbeddingConfig.objects.create(
            custom_name="New Embedder",
            model=embedding_model,
            task_type="retrieval_document",
        )

        url = reverse("naive-rag-collection", args=[source_collection.collection_id])
        data = {"embedder_id": new_embedder.pk}

        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK

        # Verify update
        naive_rag.refresh_from_db()
        assert naive_rag.embedder == new_embedder

    def test_create_naive_rag_with_invalid_embedder(
        self, api_client, source_collection
    ):
        """Test creating NaiveRag with nonexistent embedder."""
        url = reverse("naive-rag-collection", args=[source_collection.collection_id])
        data = {"embedder_id": 99999}

        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_create_naive_rag_for_nonexistent_collection(
        self, api_client, test_embedding_config
    ):
        """Test creating NaiveRag for collection that doesn't exist."""
        url = reverse("naive-rag-collection", args=[99999])
        data = {"embedder_id": test_embedding_config.pk}

        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestNaiveRagRetrieval:
    """Tests for retrieving NaiveRag."""

    def test_get_naive_rag_by_collection(
        self, api_client, source_collection, naive_rag
    ):
        """Test retrieving NaiveRag by collection ID."""
        url = reverse("naive-rag-collection", args=[source_collection.collection_id])
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["naive_rag_id"] == naive_rag.naive_rag_id

    def test_get_naive_rag_when_not_exists(self, api_client, empty_collection):
        """Test retrieving NaiveRag for collection without one."""
        url = reverse("naive-rag-collection", args=[empty_collection.collection_id])
        response = api_client.get(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_retrieve_naive_rag_detail(self, api_client, naive_rag):
        """Test retrieving detailed NaiveRag information."""
        url = reverse("naive-rag-detail", args=[naive_rag.naive_rag_id])
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["naive_rag_id"] == naive_rag.naive_rag_id
        assert "base_rag_type" in data
        assert "document_configs" in data


@pytest.mark.django_db
class TestNaiveRagDeletion:
    """Tests for deleting NaiveRag."""

    def test_delete_naive_rag(self, api_client, naive_rag):
        """Test deleting a NaiveRag."""
        naive_rag_id = naive_rag.naive_rag_id
        base_rag_id = naive_rag.base_rag_type.rag_type_id

        url = reverse("naive-rag-detail", args=[naive_rag_id])
        response = api_client.delete(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "message" in data

        # Verify deletion (should cascade to base_rag_type)
        assert not NaiveRag.objects.filter(naive_rag_id=naive_rag_id).exists()
        assert not BaseRagType.objects.filter(rag_type_id=base_rag_id).exists()


# ============================================================================
# DOCUMENT CONFIG INITIALIZATION TESTS
# ============================================================================


@pytest.mark.django_db
class TestDocumentConfigInit:
    """Tests for initializing document configs with defaults."""

    def test_init_creates_configs_with_defaults(
        self, api_client, naive_rag, multiple_documents
    ):
        """Test init creates configs with default values for all documents."""
        url = reverse("document-config-init", args=[naive_rag.naive_rag_id])

        response = api_client.post(url, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["created_count"] == 3
        assert len(data["configs"]) == 3

        # Verify all configs have default values
        for config_data in data["configs"]:
            assert config_data["chunk_size"] == 1000  # DEFAULT
            assert config_data["chunk_overlap"] == 150  # DEFAULT
            assert config_data["chunk_strategy"] == "token"  # DEFAULT

    def test_init_is_idempotent_for_existing_configs(
        self, api_client, naive_rag, multiple_documents
    ):
        """Test init doesn't change existing configs (idempotent)."""
        # Create custom config for first document
        custom_config = NaiveRagDocumentConfig.objects.create(
            naive_rag=naive_rag,
            document=multiple_documents[0],
            chunk_size=2000,  # Custom value
            chunk_overlap=300,  # Custom value
            chunk_strategy="character",  # Custom strategy
            status=NaiveRagDocumentConfig.NaiveRagDocumentStatus.NEW,
        )

        url = reverse("document-config-init", args=[naive_rag.naive_rag_id])
        response = api_client.post(url, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        # Should only create 2 new configs (documents 1 and 2)
        assert data["created_count"] == 2

        # Verify existing config unchanged
        custom_config.refresh_from_db()
        assert custom_config.chunk_size == 2000  # Still custom
        assert custom_config.chunk_overlap == 300  # Still custom
        assert custom_config.chunk_strategy == "character"  # Still custom

    def test_init_only_creates_configs_for_new_documents(
        self, api_client, naive_rag, source_collection, multiple_documents
    ):
        """Test init only creates configs for new documents when called again."""
        # First init - creates configs for all 3 documents
        url = reverse("document-config-init", args=[naive_rag.naive_rag_id])
        response1 = api_client.post(url, format="json")
        assert response1.status_code == status.HTTP_201_CREATED
        assert response1.json()["created_count"] == 3

        # Modify one of the existing configs
        config = NaiveRagDocumentConfig.objects.filter(naive_rag=naive_rag).first()
        config.chunk_size = 5000
        config.save()

        # Add 2 new documents
        for i in range(3, 5):
            content = DocumentContent.objects.create(
                content=f"New content {i}".encode()
            )
            DocumentMetadata.objects.create(
                source_collection=source_collection,
                document_content=content,
                file_name=f"new_doc_{i}.pdf",
                file_type="pdf",
                file_size=2048,
            )

        # Second init - should only create configs for 2 new documents
        response2 = api_client.post(url, format="json")
        assert response2.status_code == status.HTTP_201_CREATED
        assert response2.json()["created_count"] == 2

        # Verify modified config still has custom value
        config.refresh_from_db()
        assert config.chunk_size == 5000

        # Verify total configs
        total_configs = NaiveRagDocumentConfig.objects.filter(
            naive_rag=naive_rag
        ).count()
        assert total_configs == 5

    def test_init_with_empty_collection(self, api_client, naive_rag):
        """Test init with collection that has no documents."""
        # naive_rag's collection has no documents by default in this fixture
        url = reverse("document-config-init", args=[naive_rag.naive_rag_id])

        response = api_client.post(url, format="json")

        assert (
            response.status_code == status.HTTP_200_OK
        )  # Success but no configs created
        data = response.json()
        assert data["created_count"] == 0
        assert len(data["configs"]) == 0

    def test_init_with_nonexistent_naive_rag(self, api_client):
        """Test init with nonexistent NaiveRag."""
        url = reverse("document-config-init", args=[99999])

        response = api_client.post(url, format="json")

        assert response.status_code == status.HTTP_404_NOT_FOUND


# ============================================================================
# SINGLE CONFIG UPDATE TESTS
# ============================================================================


@pytest.mark.django_db
class TestDocumentConfigUpdate:
    """Tests for updating single document config."""

    def test_update_config_all_fields(
        self, api_client, naive_rag, naive_rag_document_config
    ):
        """Test updating all fields of a config."""
        url = reverse(
            "document-config-detail",
            args=[
                naive_rag.naive_rag_id,
                naive_rag_document_config.naive_rag_document_id,
            ],
        )
        data = {
            "chunk_size": 2000,
            "chunk_overlap": 300,
            "chunk_strategy": "character",
            "additional_params": {"custom": "value"},
        }

        response = api_client.put(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        response_data = response.json()
        assert response_data["config"]["chunk_size"] == 2000
        assert response_data["config"]["chunk_overlap"] == 300
        assert response_data["config"]["chunk_strategy"] == "character"

        # Verify in database
        naive_rag_document_config.refresh_from_db()
        assert naive_rag_document_config.chunk_size == 2000
        assert naive_rag_document_config.chunk_overlap == 300

    def test_update_config_partial_fields(
        self, api_client, naive_rag, naive_rag_document_config
    ):
        """Test updating only some fields."""
        original_strategy = naive_rag_document_config.chunk_strategy

        url = reverse(
            "document-config-detail",
            args=[
                naive_rag.naive_rag_id,
                naive_rag_document_config.naive_rag_document_id,
            ],
        )
        data = {"chunk_size": 1500}

        response = api_client.put(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK

        # Verify only chunk_size changed
        naive_rag_document_config.refresh_from_db()
        assert naive_rag_document_config.chunk_size == 1500
        assert (
            naive_rag_document_config.chunk_strategy == original_strategy
        )  # Unchanged

    def test_update_config_with_invalid_params(
        self, api_client, naive_rag, naive_rag_document_config
    ):
        """Test updating config with invalid parameters."""
        url = reverse(
            "document-config-detail",
            args=[
                naive_rag.naive_rag_id,
                naive_rag_document_config.naive_rag_document_id,
            ],
        )
        data = {"chunk_size": 10}  # Too small (min is 20)

        response = api_client.put(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_config_overlap_exceeds_size(
        self, api_client, naive_rag, naive_rag_document_config
    ):
        """Test updating with overlap >= chunk_size."""
        url = reverse(
            "document-config-detail",
            args=[
                naive_rag.naive_rag_id,
                naive_rag_document_config.naive_rag_document_id,
            ],
        )
        data = {"chunk_size": 100, "chunk_overlap": 150}  # Greater than size

        response = api_client.put(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_config_wrong_naive_rag_id(
        self, api_client, naive_rag, another_naive_rag, another_config
    ):
        """SECURITY: Test updating config with wrong naive_rag_id."""
        # Try to update another_config using wrong naive_rag_id
        url = reverse(
            "document-config-detail",
            args=[
                naive_rag.naive_rag_id,  # Wrong NaiveRag
                another_config.naive_rag_document_id,  # Config from another NaiveRag
            ],
        )
        data = {"chunk_size": 3000}

        response = api_client.put(url, data, format="json")

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "does not belong to" in response.json()["error"].lower()

        # Verify config unchanged
        another_config.refresh_from_db()
        assert another_config.chunk_size != 3000

    def test_update_nonexistent_config(self, api_client, naive_rag):
        """Test updating config that doesn't exist."""
        url = reverse("document-config-detail", args=[naive_rag.naive_rag_id, 99999])
        data = {"chunk_size": 2000}

        response = api_client.put(url, data, format="json")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_config_no_fields(
        self, api_client, naive_rag, naive_rag_document_config
    ):
        """Test updating config without providing any fields."""
        url = reverse(
            "document-config-detail",
            args=[
                naive_rag.naive_rag_id,
                naive_rag_document_config.naive_rag_document_id,
            ],
        )
        data = {}

        response = api_client.put(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ============================================================================
# BULK CONFIG UPDATE TESTS
# ============================================================================


@pytest.mark.django_db
class TestDocumentConfigBulkUpdate:
    """Tests for bulk updating document configs."""

    def test_bulk_update_multiple_configs(
        self, api_client, naive_rag, source_collection, multiple_documents
    ):
        """Test bulk updating multiple configs with same params."""
        # Initialize configs
        init_url = reverse("document-config-init", args=[naive_rag.naive_rag_id])
        api_client.post(init_url, format="json")

        configs = list(NaiveRagDocumentConfig.objects.filter(naive_rag=naive_rag))
        config_ids = [c.naive_rag_document_id for c in configs[:2]]

        url = reverse("document-config-bulk-update", args=[naive_rag.naive_rag_id])
        data = {
            "config_ids": config_ids,
            "chunk_size": 2500,
            "chunk_overlap": 400,
        }

        response = api_client.put(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["updated_count"] == 2

        # Verify updates
        for config_id in config_ids:
            config = NaiveRagDocumentConfig.objects.get(naive_rag_document_id=config_id)
            assert config.chunk_size == 2500
            assert config.chunk_overlap == 400

    def test_bulk_update_with_invalid_params(
        self, api_client, naive_rag, source_collection, multiple_documents
    ):
        """Test bulk update with invalid parameters."""
        # Initialize configs
        init_url = reverse("document-config-init", args=[naive_rag.naive_rag_id])
        api_client.post(init_url, format="json")

        configs = list(NaiveRagDocumentConfig.objects.filter(naive_rag=naive_rag))
        config_ids = [c.naive_rag_document_id for c in configs]

        url = reverse("document-config-bulk-update", args=[naive_rag.naive_rag_id])
        data = {
            "config_ids": config_ids,
            "chunk_size": 5,  # Too small
        }

        response = api_client.put(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_bulk_update_wrong_naive_rag_id(
        self, api_client, naive_rag, another_naive_rag, another_config
    ):
        """SECURITY: Test bulk update with configs from different NaiveRag."""
        url = reverse("document-config-bulk-update", args=[naive_rag.naive_rag_id])
        data = {
            "config_ids": [
                another_config.naive_rag_document_id
            ],  # From another NaiveRag
            "chunk_size": 3000,
        }

        response = api_client.put(url, data, format="json")

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "don't belong to" in response.json()["error"].lower()

        # Verify config unchanged
        another_config.refresh_from_db()
        assert another_config.chunk_size != 3000

    def test_bulk_update_with_nonexistent_config_ids(
        self, api_client, naive_rag, naive_rag_document_config
    ):
        """Test bulk update with some nonexistent config IDs."""
        url = reverse("document-config-bulk-update", args=[naive_rag.naive_rag_id])
        data = {
            "config_ids": [naive_rag_document_config.naive_rag_document_id, 99999],
            "chunk_size": 3000,
        }

        response = api_client.put(url, data, format="json")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_bulk_update_empty_config_ids(self, api_client, naive_rag):
        """Test bulk update with empty config_ids list."""
        url = reverse("document-config-bulk-update", args=[naive_rag.naive_rag_id])
        data = {
            "config_ids": [],
            "chunk_size": 3000,
        }

        response = api_client.put(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_bulk_update_no_update_fields(
        self, api_client, naive_rag, naive_rag_document_config
    ):
        """Test bulk update without providing update fields."""
        url = reverse("document-config-bulk-update", args=[naive_rag.naive_rag_id])
        data = {
            "config_ids": [naive_rag_document_config.naive_rag_document_id],
        }

        response = api_client.put(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ============================================================================
# SINGLE CONFIG DELETE TESTS
# ============================================================================


@pytest.mark.django_db
class TestDocumentConfigDelete:
    """Tests for deleting single document config."""

    def test_delete_single_config(
        self, api_client, naive_rag, naive_rag_document_config
    ):
        """Test deleting a single config."""
        config_id = naive_rag_document_config.naive_rag_document_id

        url = reverse(
            "document-config-detail", args=[naive_rag.naive_rag_id, config_id]
        )
        response = api_client.delete(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "message" in data
        assert data["config_id"] == config_id

        # Verify deletion
        assert not NaiveRagDocumentConfig.objects.filter(
            naive_rag_document_id=config_id
        ).exists()

    def test_delete_config_wrong_naive_rag_id(
        self, api_client, naive_rag, another_naive_rag, another_config
    ):
        """SECURITY: Test deleting config with wrong naive_rag_id."""
        url = reverse(
            "document-config-detail",
            args=[
                naive_rag.naive_rag_id,  # Wrong NaiveRag
                another_config.naive_rag_document_id,  # Config from another NaiveRag
            ],
        )

        response = api_client.delete(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "does not belong to" in response.json()["error"].lower()

        # Verify config not deleted
        assert NaiveRagDocumentConfig.objects.filter(
            naive_rag_document_id=another_config.naive_rag_document_id
        ).exists()

    def test_delete_nonexistent_config(self, api_client, naive_rag):
        """Test deleting config that doesn't exist."""
        url = reverse("document-config-detail", args=[naive_rag.naive_rag_id, 99999])

        response = api_client.delete(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND


# ============================================================================
# BULK CONFIG DELETE TESTS
# ============================================================================


@pytest.mark.django_db
class TestDocumentConfigBulkDelete:
    """Tests for bulk deleting document configs."""

    def test_bulk_delete_multiple_configs(
        self, api_client, naive_rag, source_collection, multiple_documents
    ):
        """Test bulk deleting multiple configs."""
        # Initialize configs
        init_url = reverse("document-config-init", args=[naive_rag.naive_rag_id])
        api_client.post(init_url, format="json")

        configs = list(NaiveRagDocumentConfig.objects.filter(naive_rag=naive_rag))
        config_ids = [c.naive_rag_document_id for c in configs[:2]]

        url = reverse("document-config-bulk-delete", args=[naive_rag.naive_rag_id])
        data = {"config_ids": config_ids}

        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["deleted_count"] == 2
        assert set(data["deleted_config_ids"]) == set(config_ids)

        # Verify deletion
        for config_id in config_ids:
            assert not NaiveRagDocumentConfig.objects.filter(
                naive_rag_document_id=config_id
            ).exists()

        # Verify third config still exists
        assert NaiveRagDocumentConfig.objects.filter(
            naive_rag_document_id=configs[2].naive_rag_document_id
        ).exists()

    def test_bulk_delete_wrong_naive_rag_id(
        self, api_client, naive_rag, another_naive_rag, another_config
    ):
        """SECURITY: Test bulk delete with configs from different NaiveRag."""
        url = reverse("document-config-bulk-delete", args=[naive_rag.naive_rag_id])
        data = {"config_ids": [another_config.naive_rag_document_id]}

        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["deleted_count"] == 0

        # Verify config not deleted
        assert NaiveRagDocumentConfig.objects.filter(
            naive_rag_document_id=another_config.naive_rag_document_id
        ).exists()

    def test_bulk_delete_with_nonexistent_config_ids(
        self, api_client, naive_rag, naive_rag_document_config
    ):
        """Test bulk delete with some nonexistent config IDs."""
        url = reverse("document-config-bulk-delete", args=[naive_rag.naive_rag_id])
        data = {"config_ids": [naive_rag_document_config.naive_rag_document_id, 99999]}

        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["deleted_count"] == 1

    def test_bulk_delete_empty_config_ids(self, api_client, naive_rag):
        """Test bulk delete with empty config_ids list."""
        url = reverse("document-config-bulk-delete", args=[naive_rag.naive_rag_id])
        data = {"config_ids": []}

        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ============================================================================
# CONFIG RETRIEVAL TESTS
# ============================================================================


@pytest.mark.django_db
class TestDocumentConfigRetrieval:
    """Tests for retrieving document configs."""

    def test_list_configs_for_naive_rag(
        self, api_client, naive_rag, source_collection, multiple_documents
    ):
        """Test listing all configs for a NaiveRag."""
        # Initialize configs
        init_url = reverse("document-config-init", args=[naive_rag.naive_rag_id])
        api_client.post(init_url, format="json")

        url = reverse("document-config-list", args=[naive_rag.naive_rag_id])
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["naive_rag_id"] == naive_rag.naive_rag_id
        assert data["total_configs"] == 3
        assert len(data["configs"]) == 3

    def test_list_configs_empty(self, api_client, naive_rag):
        """Test listing configs when none exist."""
        url = reverse("document-config-list", args=[naive_rag.naive_rag_id])
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total_configs"] == 0

    def test_retrieve_single_config(
        self, api_client, naive_rag, naive_rag_document_config
    ):
        """Test retrieving a single config."""
        url = reverse(
            "document-config-detail",
            args=[
                naive_rag.naive_rag_id,
                naive_rag_document_config.naive_rag_document_id,
            ],
        )
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert (
            data["naive_rag_document_id"]
            == naive_rag_document_config.naive_rag_document_id
        )
        assert data["chunk_size"] == naive_rag_document_config.chunk_size

    def test_retrieve_nonexistent_config(self, api_client, naive_rag):
        """Test retrieving config that doesn't exist."""
        url = reverse("document-config-detail", args=[naive_rag.naive_rag_id, 99999])
        response = api_client.get(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND
