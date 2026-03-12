import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfigService } from '../../../services/config/config.service';
import { ApiGetRequest } from '../../../core/models/api-request.model';
import {
  GraphDto,
  CreateGraphDtoRequest,
  UpdateGraphDtoRequest,
} from '../models/graph.model';

@Injectable({
  providedIn: 'root',
})
export class FlowsApiService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly httpHeaders = new HttpHeaders({
    'Content-Type': 'application/json',
  });

  private get apiUrl(): string {
    return `${this.configService.apiUrl}graphs/`;
  }

  getGraphs(): Observable<GraphDto[]> {
    return this.http
      .get<ApiGetRequest<GraphDto>>(this.apiUrl)
      .pipe(map((response) => response.results.sort((a, b) => b.id - a.id)));
  }

  getGraphsLight(): Observable<GraphDto[]> {
    return this.http
      .get<ApiGetRequest<GraphDto>>(`${this.configService.apiUrl}graph-light/`)
      .pipe(map((response) => response.results.sort((a, b) => b.id - a.id)));
  }

  getEpicChatEnabledFlows(): Observable<GraphDto[]> {
    const params = new HttpParams().set('epicchat_enabled', 'true');
    return this.http
      .get<ApiGetRequest<GraphDto>>(`${this.configService.apiUrl}graph-light/`, { params })
      .pipe(map((response) => response.results));
  }

  getGraphById(id: number, forceRefresh = false): Observable<GraphDto> {
    const params = forceRefresh
      ? new HttpParams().set('_ts', Date.now().toString())
      : undefined;
    return this.http.get<GraphDto>(`${this.apiUrl}${id}/`, { params });
  }

  createGraph(graph: CreateGraphDtoRequest): Observable<GraphDto> {
    return this.http.post<GraphDto>(this.apiUrl, graph, {
      headers: this.httpHeaders,
    });
  }

  updateGraph(id: number, graph: UpdateGraphDtoRequest): Observable<GraphDto> {
    return this.http.put<GraphDto>(`${this.apiUrl}${id}/`, graph, {
      headers: this.httpHeaders,
    });
  }

  patchGraph(id: number, fields: Partial<GraphDto>): Observable<GraphDto> {
    return this.http.patch<GraphDto>(`${this.apiUrl}${id}/`, fields, {
      headers: this.httpHeaders,
    });
  }

  deleteGraph(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}${id}/`);
  }

  copyGraph(graph: GraphDto): Observable<GraphDto> {
    return this.http.post<GraphDto>(`${this.apiUrl}${graph.id}/copy/`, graph, {
      headers: this.httpHeaders,
    });
  }

  getGraphStatus(runId: string): Observable<any> {
    return this.http.get<any>(
      `${this.configService.apiUrl}graph_runs/${runId}/status/`
    );
  }
}
