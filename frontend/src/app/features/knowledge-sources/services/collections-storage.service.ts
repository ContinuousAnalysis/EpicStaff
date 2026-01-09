import {inject, Injectable, signal} from '@angular/core';
import {catchError, delay, Observable, of, tap} from "rxjs";
import {CollectionsApiService} from "./collections-api.service";
import {CreateCollectionDtoResponse, DeleteCollectionResponse, GetCollectionRequest} from "../models/collection.model";
import {shareReplay} from "rxjs/operators";
import {ToastService} from "../../../services/notifications/toast.service";

@Injectable({
    providedIn: 'root'
})
export class CollectionsStorageService {
    // List of collection preview
    private collectionsSignal = signal<GetCollectionRequest[]>([]);
    private collectionsLoaded = signal<boolean>(false);
    public readonly collections = this.collectionsSignal.asReadonly();
    public readonly isCollectionsLoaded = this.collectionsLoaded.asReadonly();

    // List of collection details
    private fullCollectionsSignal = signal<CreateCollectionDtoResponse[]>([]);
    private fullCollectionsLoaded = signal<boolean>(false);
    public readonly fullCollections = this.fullCollectionsSignal.asReadonly();
    // public readonly isFullCollectionsLoaded = this.fullCollectionsLoaded.asReadonly();

    private readonly collectionsApiService = inject(CollectionsApiService);
    private readonly toastService = inject(ToastService);

    createCollection(): Observable<CreateCollectionDtoResponse | undefined> {
        return this.collectionsApiService.createCollection().pipe(
            tap((newCollection: CreateCollectionDtoResponse) => {
                const { rag_configurations, ...rest } = newCollection;
                this.addCollectionToCache(rest);
            }),
            catchError(() => {
                this.toastService.error('Failed to create collection')
                return of()
            })
        );
    }

    public addCollectionToCache(newCollection: GetCollectionRequest) {
        const currentCollections = this.collectionsSignal();
        if (!currentCollections.some((c) => c.collection_id === newCollection.collection_id)) {
            this.collectionsSignal.set([newCollection, ...currentCollections]);
        }
    }

    getCollections(forceRefresh = false): Observable<GetCollectionRequest[]> {
        if (this.collectionsLoaded() && !forceRefresh) {
            return of(this.collectionsSignal());
        }
        return this.collectionsApiService.getCollections().pipe(
            tap((collections) => {
                this.setCollections(collections);
            }),
            delay(this.collectionsLoaded() ? 0 : 300),
            shareReplay(1),
            catchError(() => {
                this.toastService.error('Failed to get collections');
                this.collectionsLoaded.set(false);
                return of([]);
            })
        );
    }

    setCollections(collections: GetCollectionRequest[]) {
        this.collectionsSignal.set(collections);
        this.collectionsLoaded.set(true);
    }

    getFullCollection(id: number, forceRefresh = false): Observable<CreateCollectionDtoResponse | null> {
        const cachedCollection = this.fullCollectionsSignal().find(
            (c) => c.collection_id === id
        );
        if (cachedCollection && !forceRefresh) {
            return of(cachedCollection);
        }

        return this.collectionsApiService.getCollectionById(id).pipe(
            tap((collection: CreateCollectionDtoResponse) => {
                this.updateOrCreateCollectionInCache(collection);
            }),
            delay(this.fullCollectionsLoaded() ? 0 : 300),
            shareReplay(1),
            catchError(() => of(null))
        );
    }

    updateCollectionById(id: number, body: Partial<CreateCollectionDtoResponse>): Observable<CreateCollectionDtoResponse | undefined> {
        return this.collectionsApiService.updateCollectionById(id, body).pipe(
            tap(updated => {
                this.toastService.success('Collection updated');
                this.updateOrCreateCollectionInCache(updated);
            }),
            catchError(() => {
                this.toastService.error('Failed to update collection');
                return of()
            })
        );
    }

    deleteCollectionById(id: number): Observable<DeleteCollectionResponse | undefined> {
        return this.collectionsApiService.deleteCollectionById(id).pipe(
            tap(() => {
                this.toastService.success('Collection deleted');
                this.deleteCollectionFromCache(id)
            }),
            catchError(() => {
                this.toastService.error('Collection delete failed')
                return of()
            })
        );
    }

    private updateOrCreateCollectionInCache(updated: CreateCollectionDtoResponse): void {
        const { rag_configurations, ...rest } = updated;

        this.collectionsSignal.update(collections => {
            const index = collections.findIndex(c => c.collection_id === rest.collection_id);
            if (index >= 0) {
                collections[index] = rest;
            } else {
                collections.push(rest);
            }
            return [...collections];
        });

        this.fullCollectionsSignal.update(collections => {
            const index = collections.findIndex(c => c.collection_id === updated.collection_id);
            if (index >= 0) {
                collections[index] = updated;
            } else {
                collections.push(updated);
            }
            return [...collections];
        });
    }

    private deleteCollectionFromCache(id: number) {
        const currentCollections = this.collectionsSignal();
        const updatedCollections = currentCollections.filter(
            (p) => p.collection_id !== id
        );
        this.collectionsSignal.set(updatedCollections);

        const currentFullCollections = this.fullCollectionsSignal();
        const updatedFullCollections = currentFullCollections.filter(
            (p) => p.collection_id !== id
        );
        this.fullCollectionsSignal.set(updatedFullCollections);
    }
}
