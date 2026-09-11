import type { VocabularyItem, LearningRecord } from './types';

function createEmptyLearning(): LearningRecord {
  return { totalReviews: 0, correctCount: 0, incorrectCount: 0, unsureCount: 0, lastReviewed: null, lastAnswer: null, consecutiveCorrect: 0, learningLevel: 0, currentInterval: 0, nextReviewDate: null, reviewHistory: [], starred: false };
}

function generateId(): string { return crypto.randomUUID(); }

function cleanLatex(text: string): string {
  if (!text) return '';
  let t = text;
  // Decode common escaped characters before removing commands.
  t = t.replace(/\\&/g, '&');
  t = t.replace(/\\'([eE])/g, (_, c) => c === 'E' ? 'É' : 'é');
  t = t.replace(/\\`([eE])/g, (_, c) => c === 'E' ? 'È' : 'è');
  t = t.replace(/\\"([eE])/g, (_, c) => c === 'E' ? 'Ë' : 'ë');
  t = t.replace(/\\~([nN])/g, (_, c) => c === 'N' ? 'Ñ' : 'ñ');
  t = t.replace(/\\c\{([cC])\}/g, (_, c) => c === 'C' ? 'Ç' : 'ç');
  // Formatting commands used by the vocabulary source. Keep their argument content.
  t = t.replace(/\\(?:small|large)\b/g, '');
  t = t.replace(/\\(?:textbf|textit|emph)\{([^{}]*)\}/g, '$1');
  t = t.replace(/\\[a-zA-Z]+\{([^{}]*)\}/g, '$1');
  t = t.replace(/\\[a-zA-Z]+/g, '');
  t = t.replace(/[{}]/g, '');
  return t.replace(/\s+/g, ' ').trim();
}

/** Extract top-level {...} fields. Handles nested braces such as {Child\\small(children)}. */
function extractBracedFields(line: string, command: string, expected: number): string[] | null {
  const prefix = new RegExp(`^\\\\${command}\\s*`);
  const match = line.match(prefix);
  if (!match) return null;
  let i = match[0].length;
  const fields: string[] = [];
  while (i < line.length && fields.length < expected) {
    while (/\s/.test(line[i] ?? '')) i++;
    if (line[i] !== '{') return null;
    ++i;
    let depth = 1;
    let out = '';
    while (i < line.length && depth > 0) {
      const ch = line[i];
      if (ch === '\\' && i + 1 < line.length) {
        out += ch + line[i + 1];
        i += 2;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { fields.push(out); i++; break; }
      }
      out += ch;
      i++;
    }
    if (depth !== 0) return null;
  }
  while (/\s/.test(line[i] ?? '')) i++;
  return fields.length === expected && i === line.length ? fields : null;
}

function parseEnglishWord(raw: string): { english: string; irregularPlural?: string; v2?: string; v3?: string } {
  const cleaned = cleanLatex(raw);
  const match = cleaned.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!match) return { english: cleaned };
  const base = match[1].trim();
  const inside = match[2].trim();
  if (inside.includes(',')) {
    const parts = inside.split(',').map(p => p.trim());
    if (parts.length >= 2) return { english: base, v2: parts[0], v3: parts[1] };
  }
  return { english: base, irregularPlural: inside };
}

function parsePronunciation(raw: string) {
  const cleaned = cleanLatex(raw);
  const match = cleaned.match(/^(.*?)\(([^)]+)\)(.*?)$/);
  if (!match) return { pronunciation: cleaned, stressed: '' };
  return {
    pronunciation: `${match[1] || ''}${match[2]}${match[3] || ''}`.replace(/\s+/g, ' ').trim(),
    stressed: match[2].trim(),
  };
}

export interface ParsedImport {
  categoryEnglish: string;
  categoryPersian: string;
  words: Omit<VocabularyItem, 'wordId' | 'categoryIds' | 'creationOrder' | 'createdAt' | 'learning'>[];
  errors: string[];
  linesProcessed: number;
}

export function parseImportText(text: string): ParsedImport {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  let categoryEnglish = '';
  let categoryPersian = '';
  const words: ParsedImport['words'] = [];
  const errors: string[] = [];
  let linesProcessed = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    linesProcessed++;

    const cat = extractBracedFields(line, 'voccategory', 2);
    if (cat) { categoryEnglish = cleanLatex(cat[0]); categoryPersian = cleanLatex(cat[1]); continue; }

    const pair = extractBracedFields(line, 'vwordpair', 6);
    if (pair) {
      try {
        const [e1, p1, m1, e2, p2, m2] = pair;
        for (const [e, p, m] of [[e1,p1,m1],[e2,p2,m2]] as string[][]) {
          const eng = parseEnglishWord(e);
          const pron = parsePronunciation(p);
          words.push({ english: eng.english, persianPronunciation: pron.pronunciation, stressedSyllable: pron.stressed, persianMeaning: cleanLatex(m), irregularPlural: eng.irregularPlural, v2: eng.v2, v3: eng.v3 });
        }
      } catch { errors.push(`خط ${i + 1}: خطای پردازش جفت واژه`); }
      continue;
    }

    const single = extractBracedFields(line, 'vword', 3);
    if (single) {
      try {
        const [e, p, m] = single;
        const eng = parseEnglishWord(e);
        const pron = parsePronunciation(p);
        words.push({ english: eng.english, persianPronunciation: pron.pronunciation, stressedSyllable: pron.stressed, persianMeaning: cleanLatex(m), irregularPlural: eng.irregularPlural, v2: eng.v2, v3: eng.v3 });
      } catch { errors.push(`خط ${i + 1}: خطای پردازش واژه`); }
      continue;
    }

    if (line.startsWith('\\')) errors.push(`خط ${i + 1}: دستور ناشناخته یا ناقص`);
  }

  return { categoryEnglish: categoryEnglish || 'دسته‌بندی بدون نام', categoryPersian: categoryPersian || 'بدون نام', words, errors, linesProcessed };
}

export function createVocabularyItems(parsedWords: ParsedImport['words'], categoryId: string, startOrder: number): VocabularyItem[] {
  const now = Date.now();
  return parsedWords.map((w, idx) => ({ ...w, wordId: generateId(), categoryIds: [categoryId], creationOrder: startOrder + idx, createdAt: now + idx, learning: createEmptyLearning() }));
}
