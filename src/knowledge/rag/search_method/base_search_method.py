from abc import ABC, abstractmethod


class BaseSearchMethod(ABC):
    """Base interface for all graph search methods."""

    @abstractmethod
    def search(self, collection_id: int, query: str, uuid: str, **kwargs):
        """Perform search for a collection."""
        pass