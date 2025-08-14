import { Injectable, computed, signal } from '@angular/core';
import { EmbeddingConfig } from '../../../features/settings-dialog/models/embeddings/embedding-config.model';
import { GetSourceCollectionRequest } from '../models/source-collection.model';
import { Source } from '../models/source.model';

@Injectable({
  providedIn: 'root',
})
export class KnowledgeSourcesPageService {
  private _collections = signal<GetSourceCollectionRequest[]>([]);
  private _selectedCollection = signal<GetSourceCollectionRequest | null>(null);
  private _selectedEmbeddingConfig = signal<EmbeddingConfig | null>(null);

  private _allSources = signal<Source[]>([]);
  private _searchQuery = signal<string>('');

  private _filteredSources = computed(() => {
    const currentCollection = this._selectedCollection();
    const allSources = this._allSources();
    const searchQuery = this._searchQuery();

    if (!currentCollection) {
      return [];
    }

    const collectionSources = allSources.filter(
      (source) => source.source_collection === currentCollection.collection_id
    );

    if (!searchQuery.trim()) {
      return collectionSources;
    }

    const lowerCaseQuery = searchQuery.toLowerCase();
    return collectionSources.filter((source: Source) => {
      return source.file_name?.toLowerCase().includes(lowerCaseQuery);
    });
  });

  private _isLoaded = signal<boolean>(false);

  constructor() {}

  public get collections() {
    return this._collections;
  }

  public get selectedCollection() {
    return this._selectedCollection;
  }

  public get selectedEmbeddingConfig() {
    return this._selectedEmbeddingConfig;
  }

  public get allSources() {
    return this._allSources;
  }

  public get filteredSources() {
    return this._filteredSources;
  }

  public get searchQuery() {
    return this._searchQuery;
  }

  public setSearchQuery(query: string): void {
    this._searchQuery.set(query);
  }

  public get isLoaded() {
    return this._isLoaded;
  }

  public setLoaded(isLoaded: boolean): void {
    this._isLoaded.set(isLoaded);
  }

  public setCollections(collections: GetSourceCollectionRequest[]): void {
    this._collections.set(collections);
  }

  public setSelectedCollection(
    collection: GetSourceCollectionRequest | null
  ): void {
    this._selectedCollection.set(collection);
    this._searchQuery.set('');
  }

  public setSelectedEmbeddingConfig(config: EmbeddingConfig | null): void {
    this._selectedEmbeddingConfig.set(config);
  }

  public setAllSources(sources: Source[]): void {
    this._allSources.set(sources);
  }

  public addCollection(collection: GetSourceCollectionRequest): void {
    this._collections.update((current) => [...current, collection]);
  }

  public updateCollection(
    collectionId: number,
    updates: Partial<GetSourceCollectionRequest>
  ): void {
    this._collections.update((current) =>
      current.map((collection) =>
        collection.collection_id === collectionId
          ? { ...collection, ...updates }
          : collection
      )
    );

    const selected: GetSourceCollectionRequest | null =
      this._selectedCollection();
    if (selected && selected.collection_id === collectionId) {
      this._selectedCollection.set({ ...selected, ...updates });
    }
  }

  public removeCollection(collectionId: number): void {
    this._collections.update((current) =>
      current.filter((collection) => collection.collection_id !== collectionId)
    );

    const selected = this._selectedCollection();
    if (selected && selected.collection_id === collectionId) {
      const remainingCollections = this._collections();
      this.setSelectedCollection(
        remainingCollections.length > 0 ? remainingCollections[0] : null
      );
    }
  }

  public removeSource(sourceId: number): void {
    this._allSources.update((current) =>
      current.filter((source) => source.document_id !== sourceId)
    );
  }
}
