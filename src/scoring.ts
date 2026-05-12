// Match scoring algorithm for citation verification

import type { NormalizedPaper, CitationInput } from './types.js';
import { EARLY_EXIT_THRESHOLD } from './types.js';

export function calculateMatchScore(
  result: NormalizedPaper,
  filters: CitationInput
): number {
  let score = 0;

  // Title matching (3 points)
  if (filters.title && result.title) {
    const filterTitleLower = filters.title.toLowerCase();
    const resultTitleLower = result.title.toLowerCase();
    // Use first 30 chars for fuzzy matching to handle slight variations
    const matchLength = Math.min(30, filterTitleLower.length);
    if (resultTitleLower.includes(filterTitleLower.substring(0, matchLength))) {
      score += 3;
    }
  }

  // Year matching (3 points exact, 1 point within ±1 year)
  if (filters.year && result.year) {
    if (result.year === filters.year) {
      score += 3;
    } else if (Math.abs(result.year - filters.year) <= 1) {
      score += 1;
    }
  }

  // Author matching (2 points per matched author)
  if (filters.authors?.length && result.authors?.length) {
    const resultAuthorsLower = result.authors.map(a => a.toLowerCase());
    for (const filterAuthor of filters.authors) {
      const lastName = filterAuthor.toLowerCase().split(' ').pop() || '';
      if (resultAuthorsLower.some(ra => ra.includes(lastName))) {
        score += 2;
      }
    }
  }

  return score;
}

export function findBestMatch(
  papers: NormalizedPaper[],
  filters: CitationInput
): { match: NormalizedPaper | null; score: number } {
  let bestMatch: NormalizedPaper | null = null;
  let bestScore = 0;

  for (const paper of papers) {
    const score = calculateMatchScore(paper, filters);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = paper;
      // Early exit for high confidence match
      if (bestScore >= EARLY_EXIT_THRESHOLD) {
        break;
      }
    }
  }

  return { match: bestMatch, score: bestScore };
}
