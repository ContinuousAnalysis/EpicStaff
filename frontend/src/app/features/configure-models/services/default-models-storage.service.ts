import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { DefaultModelsService } from './default-models.service';
import { GetDefaultModelsResponse, UpdateDefaultModelsRequest } from '../models/default-models.model';

@Injectable({ providedIn: 'root' })
export class DefaultModelsStorageService {
    private readonly defaultModelsApiService = inject(DefaultModelsService);

    private readonly defaultModelsSignal = signal<GetDefaultModelsResponse | null>(null);
    public readonly defaultModels = this.defaultModelsSignal.asReadonly();

    loadDefaultModels(): Observable<GetDefaultModelsResponse> {
        return this.defaultModelsApiService.getDefaultModels().pipe(
            tap(models => this.updateModelsInStorage(models))
        );
    }

    updateDefaultModels(data: UpdateDefaultModelsRequest): Observable<GetDefaultModelsResponse> {
        return this.defaultModelsApiService.updateDefaultModels(data).pipe(
            tap(updated => this.updateModelsInStorage(updated))
        );
    }

    updateModelsInStorage(updated: GetDefaultModelsResponse): void {
        this.defaultModelsSignal.set(updated);
    }
}
