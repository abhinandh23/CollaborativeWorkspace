import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SnippetVersion {
  code: string;
  timestamp: string;
}

export interface SnippetHistoryEntry extends SnippetVersion {
  version: number;
}

export interface Snippet {
  _id: string;
  title: string;
  language: string;
  versions: SnippetVersion[];
  latestVersion?: SnippetVersion | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSnippetPayload {
  title: string;
  language: string;
  code: string;
}

export interface UpdateSnippetPayload {
  code: string;
  title?: string;
  language?: string;
}

export interface SnippetHistoryResponse {
  snippetId: string;
  title: string;
  language: string;
  history: SnippetHistoryEntry[];
}

@Injectable({
  providedIn: 'root'
})
export class SnippetService {
  private readonly apiUrl =
    (environment as { apiUrl?: string }).apiUrl ?? 'http://localhost:5000';
  private readonly baseUrl = `${this.apiUrl}/api/snippets`;

  constructor(private readonly http: HttpClient) {}

  createSnippet(payload: CreateSnippetPayload): Observable<Snippet> {
    return this.http.post<Snippet>(this.baseUrl, payload);
  }

  getSnippets(): Observable<Snippet[]> {
    return this.http.get<Snippet[]>(this.baseUrl);
  }

  getSnippet(snippetId: string): Observable<Snippet> {
    return this.http.get<Snippet>(`${this.baseUrl}/${snippetId}`);
  }

  saveNewVersion(snippetId: string, payload: UpdateSnippetPayload): Observable<Snippet> {
    return this.http.put<Snippet>(`${this.baseUrl}/${snippetId}`, payload);
  }

  getHistory(snippetId: string): Observable<SnippetHistoryResponse> {
    return this.http.get<SnippetHistoryResponse>(`${this.baseUrl}/${snippetId}/history`);
  }
}
