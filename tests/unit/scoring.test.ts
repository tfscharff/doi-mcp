import { describe, it, expect } from 'vitest';
import { calculateMatchScore, findBestMatch } from '../../src/scoring.js';
import type { NormalizedPaper } from '../../src/types.js';

describe('calculateMatchScore', () => {
  it('returns 0 for empty inputs', () => {
    const paper: NormalizedPaper = { source: 'Test' };
    const score = calculateMatchScore(paper, {});
    expect(score).toBe(0);
  });

  it('scores +3 for title match (first 30 chars)', () => {
    const paper: NormalizedPaper = {
      source: 'Test',
      title: 'Deep Learning for Natural Language Processing',
    };
    const score = calculateMatchScore(paper, {
      title: 'Deep Learning for Natural Language',
    });
    expect(score).toBe(3);
  });

  it('is case-insensitive for title matching', () => {
    const paper: NormalizedPaper = {
      source: 'Test',
      title: 'DEEP LEARNING FOR NLP',
    };
    const score = calculateMatchScore(paper, {
      title: 'deep learning for nlp',
    });
    expect(score).toBe(3);
  });

  it('scores +3 for exact year match', () => {
    const paper: NormalizedPaper = {
      source: 'Test',
      year: 2023,
    };
    const score = calculateMatchScore(paper, { year: 2023 });
    expect(score).toBe(3);
  });

  it('scores +1 for year within ±1', () => {
    const paper: NormalizedPaper = {
      source: 'Test',
      year: 2023,
    };
    expect(calculateMatchScore(paper, { year: 2022 })).toBe(1);
    expect(calculateMatchScore(paper, { year: 2024 })).toBe(1);
  });

  it('scores 0 for year difference >1', () => {
    const paper: NormalizedPaper = {
      source: 'Test',
      year: 2023,
    };
    expect(calculateMatchScore(paper, { year: 2020 })).toBe(0);
  });

  it('scores +2 per matched author (by last name)', () => {
    const paper: NormalizedPaper = {
      source: 'Test',
      authors: ['John Smith', 'Jane Doe', 'Bob Johnson'],
    };
    const score = calculateMatchScore(paper, {
      authors: ['Smith', 'Doe'],
    });
    expect(score).toBe(4); // 2 authors matched
  });

  it('handles partial last name matches', () => {
    const paper: NormalizedPaper = {
      source: 'Test',
      authors: ['John Smith-Williams'],
    };
    const score = calculateMatchScore(paper, {
      authors: ['Williams'],
    });
    expect(score).toBe(2);
  });

  it('combines multiple scoring factors', () => {
    const paper: NormalizedPaper = {
      source: 'Test',
      title: 'Machine Learning Advances',
      year: 2023,
      authors: ['John Smith'],
    };
    const score = calculateMatchScore(paper, {
      title: 'Machine Learning Advances',
      year: 2023,
      authors: ['Smith'],
    });
    expect(score).toBe(8); // 3 (title) + 3 (year) + 2 (author)
  });
});

describe('findBestMatch', () => {
  it('returns null match and 0 score for empty array', () => {
    const result = findBestMatch([], { title: 'Test' });
    expect(result.match).toBeNull();
    expect(result.score).toBe(0);
  });

  it('returns the highest scoring paper', () => {
    const papers: NormalizedPaper[] = [
      { source: 'A', title: 'Wrong Paper', year: 2020 },
      { source: 'B', title: 'Machine Learning', year: 2023 },
      { source: 'C', title: 'Another Paper', year: 2021 },
    ];
    const result = findBestMatch(papers, {
      title: 'Machine Learning',
      year: 2023,
    });
    expect(result.match?.source).toBe('B');
    expect(result.score).toBe(6);
  });

  it('returns first match when scores are equal', () => {
    const papers: NormalizedPaper[] = [
      { source: 'First', year: 2023 },
      { source: 'Second', year: 2023 },
    ];
    const result = findBestMatch(papers, { year: 2023 });
    expect(result.match?.source).toBe('First');
  });

  it('performs early exit at score ≥8', () => {
    const papers: NormalizedPaper[] = [
      {
        source: 'Perfect',
        title: 'Test Paper',
        year: 2023,
        authors: ['Smith'],
      },
      {
        source: 'Also Good',
        title: 'Test Paper',
        year: 2023,
        authors: ['Smith', 'Doe'],
      },
    ];
    // First paper scores 8, should exit early and not check second
    const result = findBestMatch(papers, {
      title: 'Test Paper',
      year: 2023,
      authors: ['Smith'],
    });
    expect(result.match?.source).toBe('Perfect');
    expect(result.score).toBe(8);
  });
});
