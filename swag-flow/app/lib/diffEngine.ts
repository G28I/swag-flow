export type DiffType = "added" | "deleted" | "unchanged";

export interface DiffToken {
  value: string;
  type: DiffType;
}

export interface DiffLine {
  lineNumberA?: number;
  lineNumberB?: number;
  type: DiffType;
  tokens: DiffToken[];
  textA?: string;
  textB?: string;
}

export interface DiffStats {
  addedWords: number;
  deletedWords: number;
  unchangedWords: number;
  similarityPercentage: number;
}

/**
 * Tokenize string into semantic tokens (words, code identifiers, whitespace, punctuation)
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  // Tokenize by word characters/code symbols vs whitespace vs punctuation
  const regex = /([a-zA-Z0-9_$]+|\s+|[^\s\w])/g;
  const matches = text.match(regex);
  return matches || [text];
}

/**
 * Computes Myers Longest Common Subsequence (LCS) diff on token arrays
 */
export function computeTokenDiff(oldText: string, newText: string): DiffToken[] {
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);

  const n = oldTokens.length;
  const m = newTokens.length;

  // Build LCS matrix
  const matrix: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0)
  );

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldTokens[i - 1] === newTokens[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
      }
    }
  }

  // Backtrack to construct diff
  let i = n;
  let j = m;
  const result: DiffToken[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      result.unshift({ value: oldTokens[i - 1], type: "unchanged" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
      result.unshift({ value: newTokens[j - 1], type: "added" });
      j--;
    } else if (i > 0 && (j === 0 || matrix[i][j - 1] < matrix[i - 1][j])) {
      result.unshift({ value: oldTokens[i - 1], type: "deleted" });
      i--;
    }
  }

  // Group contiguous tokens of the same type for optimal DOM rendering
  const grouped: DiffToken[] = [];
  for (const token of result) {
    if (grouped.length > 0 && grouped[grouped.length - 1].type === token.type) {
      grouped[grouped.length - 1].value += token.value;
    } else {
      grouped.push({ ...token });
    }
  }

  return grouped;
}

/**
 * Computes line-by-line diff for side-by-side split view
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText ? oldText.split("\n") : [];
  const newLines = newText ? newText.split("\n") : [];

  const n = oldLines.length;
  const m = newLines.length;

  const matrix: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0)
  );

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
      }
    }
  }

  let i = n;
  let j = m;
  let lineA = n;
  let lineB = m;
  const lines: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      lines.unshift({
        lineNumberA: lineA--,
        lineNumberB: lineB--,
        type: "unchanged",
        tokens: [{ value: oldLines[i - 1], type: "unchanged" }],
        textA: oldLines[i - 1],
        textB: newLines[j - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
      lines.unshift({
        lineNumberB: lineB--,
        type: "added",
        tokens: computeTokenDiff("", newLines[j - 1]),
        textB: newLines[j - 1],
      });
      j--;
    } else if (i > 0 && (j === 0 || matrix[i][j - 1] < matrix[i - 1][j])) {
      lines.unshift({
        lineNumberA: lineA--,
        type: "deleted",
        tokens: computeTokenDiff(oldLines[i - 1], ""),
        textA: oldLines[i - 1],
      });
      i--;
    }
  }

  return lines;
}

/**
 * Calculates diff statistics and semantic similarity percentage
 */
export function calculateDiffStats(oldText: string, newText: string): DiffStats {
  const tokens = computeTokenDiff(oldText, newText);
  let addedWords = 0;
  let deletedWords = 0;
  let unchangedWords = 0;

  for (const token of tokens) {
    const wordCount = (token.value.match(/\w+/g) || []).length;
    if (token.type === "added") {
      addedWords += wordCount;
    } else if (token.type === "deleted") {
      deletedWords += wordCount;
    } else {
      unchangedWords += wordCount;
    }
  }

  const totalWords = unchangedWords + Math.max(addedWords, deletedWords);
  const similarityPercentage =
    totalWords > 0 ? Math.round((unchangedWords / totalWords) * 100) : 100;

  return {
    addedWords,
    deletedWords,
    unchangedWords,
    similarityPercentage,
  };
}
