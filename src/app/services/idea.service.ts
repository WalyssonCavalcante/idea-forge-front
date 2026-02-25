import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type ExperienceLevelApi = 'Beginner' | 'Intermediate' | 'Advanced';

export interface GenerateIdeaRequest {
  stacks: string[];
  experienceLevel: ExperienceLevelApi;
  focusAreas: string[];
}

export type GenerateIdeaResponse = unknown;

@Injectable({
  providedIn: 'root',
})
export class IdeaService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = 'http://localhost:8080/api/v1/ideas/generate';

  generateIdea(payload: GenerateIdeaRequest): Observable<GenerateIdeaResponse> {
    return this.http.post<GenerateIdeaResponse>(this.endpoint, payload);
  }
}
