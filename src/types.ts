// Core types for doi-mcp

export interface NormalizedPaper {
  source: string;
  title?: string;
  authors?: string[];
  year?: number;
  doi?: string;
  journal?: string;
  abstract?: string;
}

// Project scope: only papers with a DOI can be returned or verified
export type DoiPaper = NormalizedPaper & { doi: string };

export interface DatabaseError {
  database: string;
  code: 'TIMEOUT' | 'PARSE_ERROR' | 'API_ERROR' | 'NETWORK' | 'ABORTED';
  message: string;
}

export interface SearchResults {
  results: DoiPaper[];
  errors: DatabaseError[];
  sources: string[];
}

export interface VerificationResult {
  verified: boolean;
  confidence: 'high' | 'medium' | 'low' | 'none';
  score: number;
  match: NormalizedPaper | null;
  alternatives: NormalizedPaper[];
  errors: DatabaseError[];
  sourcesQueried: string[];
}

export interface DatabaseConfig {
  name: string;
  displayName: string;
  baseUrl: string;
  coverage: string;
}

// Tool input types
export interface CitationInput {
  title?: string;
  authors?: string[];
  year?: number;
  doi?: string;
  journal?: string;
}

export interface BatchCitationInput {
  id?: string;
  title?: string;
  authors?: string[];
  year?: number;
  doi?: string;
  journal?: string;
}

export interface SearchInput {
  query: string;
  limit?: number;
  yearFrom?: number;
  yearTo?: number;
  source?: string;
}

// Scoring constants
export const MATCH_THRESHOLD = 3;
export const HIGH_CONFIDENCE_THRESHOLD = 5;
export const EARLY_EXIT_THRESHOLD = 8;
