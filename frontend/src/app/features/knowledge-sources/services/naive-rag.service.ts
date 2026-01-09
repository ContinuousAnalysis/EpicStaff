import {inject, Injectable} from "@angular/core";
import {HttpClient, HttpHeaders} from "@angular/common/http";
import {ConfigService} from "../../../services/config/config.service";
import {Observable} from "rxjs";
import {
    BulkDeleteNaiveRagDocumentDtoRequest, BulkDeleteNaiveRagDocumentDtoResponse,
    BulkUpdateNaiveRagDocumentDtoRequest, BulkUpdateNaiveRagDocumentDtoResponse,
    CreateRagForCollectionResponse, GetNaiveRagDocumentConfigsResponse,
    StartIndexingDtoRequest, StartIndexingDtoResponse,
    UpdateNaiveRagDocumentDtoRequest, UpdateNaiveRagDocumentResponse,
} from "../models/rag.model";

@Injectable({
    providedIn: 'root'
})
export class NaiveRagService {
    private http = inject(HttpClient);
    private configService = inject(ConfigService);

    private readonly httpHeaders = new HttpHeaders({
        'Content-Type': 'application/json',
    });

    private get apiUrl(): string {
        return `${this.configService.apiUrl}naive-rag/`;
    }

    createRagForCollection(
        collectionId: number,
        embedderId: number
    ): Observable<CreateRagForCollectionResponse> {
        const body = {embedder_id: embedderId};

        return this.http.post<CreateRagForCollectionResponse>(
            `${this.apiUrl}collections/${collectionId}/naive-rag/`,
            body
        )
    }

    getDocumentConfigs(naiveRagId: number): Observable<GetNaiveRagDocumentConfigsResponse> {
        return this.http.get<GetNaiveRagDocumentConfigsResponse>(`${this.apiUrl}${naiveRagId}/document-configs/`);
    }

    updateDocumentConfigById(
        ragId: number,
        documentId: number,
        dto: UpdateNaiveRagDocumentDtoRequest
    ): Observable<UpdateNaiveRagDocumentResponse> {
        return this.http.put<UpdateNaiveRagDocumentResponse>(
            `${this.apiUrl}${ragId}/document-configs/${documentId}/`,
            dto
        );
    }

    bulkUpdateDocumentConfigs(
        ragId: number,
        dto: BulkUpdateNaiveRagDocumentDtoRequest
    ): Observable<BulkUpdateNaiveRagDocumentDtoResponse> {
        return this.http.put<BulkUpdateNaiveRagDocumentDtoResponse>(
            `${this.apiUrl}${ragId}/document-configs/bulk-update/`,
            dto
        );
    }

    bulkDeleteDocumentConfigs(
        ragId: number,
        dto: BulkDeleteNaiveRagDocumentDtoRequest
    ): Observable<BulkDeleteNaiveRagDocumentDtoResponse> {
        return this.http.post<BulkDeleteNaiveRagDocumentDtoResponse>(
            `${this.apiUrl}${ragId}/document-configs/bulk-delete/`,
            dto
        );
    }

    startIndexing(dto: StartIndexingDtoRequest): Observable<StartIndexingDtoResponse> {
        return this.http.post<StartIndexingDtoResponse>(`${this.configService.apiUrl}process-rag-indexing/`, dto)
    }
}
