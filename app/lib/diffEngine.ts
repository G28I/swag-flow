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
  const regex = /([a-zA-Z0-9_$]+|\s+|[^\s\w])/g;
  const matches = text.match(regex);
  return matches || [text];
}

/**
 * Computes Myers / LCS token diff with common prefix/suffix trimming and O(n*m) safety cap
 */
export function computeTokenDiff(oldText: string, newText: string): DiffToken[] {
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);

  let start = 0;
  while (
    start < oldTokens.length &&
    start < newTokens.length &&
    oldTokens[start] === newTokens[start]
  ) {
    start++;
  }

  let oldEnd = oldTokens.length - 1;
  let newEnd = newTokens.length - 1;
  while (
    oldEnd >= start &&
    newEnd >= start &&
    oldTokens[oldEnd] === newTokens[newEnd]
  ) {
    oldEnd--;
    newEnd--;
  }

  const prefixTokens = oldTokens.slice(0, start).map((val) => ({ value: val, type: "unchanged" as DiffType }));
  const suffixTokens = oldTokens.slice(oldEnd + 1).map((val) => ({ value: val, type: "unchanged" as DiffType }));

  const midOld = oldTokens.slice(start, oldEnd + 1);
  const midNew = newTokens.slice(start, newEnd + 1);

  const n = midOld.length;
  const m = midNew.length;

  let midDiff: DiffToken[] = [];

  // Safety cap to prevent unbounded O(n*m) memory matrix construction for huge texts
  if (n * m > 100000) {
    midOld.forEach((val) => midDiff.push({ value: val, type: "deleted" }));
    midNew.forEach((val) => midDiff.push({ value: val, type: "added" }));
  } else if (n > 0 || m > 0) {
    const matrix: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (midOld[i - 1] === midNew[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1] + 1;
        } else {
          matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
        }
      }
    }

    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && midOld[i - 1] === midNew[j - 1]) {
        midDiff.unshift({ value: midOld[i - 1], type: "unchanged" });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
        midDiff.unshift({ value: midNew[j - 1], type: "added" });
        j--;
      } else if (i > 0 && (j === 0 || matrix[i][j - 1] < matrix[i - 1][j])) {
        midDiff.unshift({ value: midOld[i - 1], type: "deleted" });
        i--;
      }
    }
  }

  const rawDiff = [...prefixTokens, ...midDiff, ...suffixTokens];

  // Group contiguous tokens of the same type for DOM efficiency
  const grouped: DiffToken[] = [];
  for (const token of rawDiff) {
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

  const matrix: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

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
 * Calculates diff statistics, allowing reuse of precomputed token diffs
 */
export function calculateDiffStats(
  oldText: string,
  newText: string,
  precomputedTokens?: DiffToken[]
): DiffStats {
  const tokens = precomputedTokens || computeTokenDiff(oldText, newText);
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
