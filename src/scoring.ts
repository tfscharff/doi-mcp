// Match scoring algorithm for citation verification

import type { NormalizedPaper, CitationInput } from './types.js';
import { EARLY_EXIT_THRESHOLD } from './types.js';

function titleMatches(result: NormalizedPaper, filters: CitationInput): boolean {
  if (!filters.title || !result.title) return false;
  const filterTitleLower = filters.title.toLowerCase();
  // Use first 30 chars for fuzzy matching to handle slight variations
  const matchLength = Math.min(30, filterTitleLower.length);
  return result.title.toLowerCase().includes(filterTitleLower.substring(0, matchLength));
}

function countAuthorMatches(result: NormalizedPaper, filters: CitationInput): number {
  if (!filters.authors?.length || !result.authors?.length) return 0;
  const resultAuthorsLower = result.authors.map(a => a.toLowerCase());
  return filters.authors.filter(filterAuthor => {
    const lastName = filterAuthor.toLowerCase().split(' ').pop() || '';
    return resultAuthorsLower.some(ra => ra.includes(lastName));
  }).length;
}

export function calculateMatchScore(
  result: NormalizedPaper,
  filters: CitationInput
): number {
  let score = 0;

  // Title matching (3 points)
  if (titleMatches(result, filters)) {
    score += 3;
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
  score += 2 * countAuthorMatches(result, filters);

  return score;
}

// A candidate must match on title or author to count; year alone identifies nothing
export function hasIdentityMatch(result: NormalizedPaper, filters: CitationInput): boolean {
  return titleMatches(result, filters) || countAuthorMatches(result, filters) > 0;
}

export function findBestMatch(
  papers: NormalizedPaper[],
  filters: CitationInput
): { match: NormalizedPaper | null; score: number } {
  let bestMatch: NormalizedPaper | null = null;
  let bestScore = 0;

  for (const paper of papers) {
    if (!hasIdentityMatch(paper, filters)) continue;
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
