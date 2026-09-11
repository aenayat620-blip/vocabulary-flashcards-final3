import type { VocabularyItem, Category, AppData } from './types';
import { isDue, isWeak, isLearned, isLearning } from './srs';

export function formatDate(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('fa-IR');
}

export function getCategoryStats(cat: Category, vocab: VocabularyItem[]) {
  const words = vocab.filter((v) => cat.wordIds.includes(v.wordId) || v.categoryIds.includes(cat.categoryId));
  const total = words.length;
  const learned = words.filter(isLearned).length;
  const learning = words.filter(isLearning).length;
  const weak = words.filter(isWeak).length;
  const due = words.filter((w) => isDue(w)).length;
  const reviewed = words.filter((w) => w.learning.totalReviews > 0);
  const accuracy =
    reviewed.length === 0
      ? 0
      : Math.round(
          (reviewed.reduce((s, w) => s + w.learning.correctCount, 0) /
            reviewed.reduce((s, w) => s + w.learning.totalReviews, 0)) *
            100
        );
  return { total, learned, learning, weak, due, accuracy };
}

export function getGlobalStats(data: AppData) {
  const words = data.vocabulary;
  const dueToday = words.filter((w) => isDue(w)).length;
  const learned = words.filter(isLearned).length;
  const learning = words.filter(isLearning).length;
  const weak = words.filter(isWeak).length;
  const totalReviews = data.stats.totalReviews;
  const accuracy =
    totalReviews === 0
      ? 0
      : Math.round((data.stats.totalCorrect / totalReviews) * 100);
  return {
    dueToday,
    learned,
    learning,
    weak,
    accuracy,
    streak: data.stats.currentStreak,
    totalWords: words.length,
  };
}

export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function speakEnglish(text: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(
    (v) => v.lang.startsWith('en-US') || v.lang.startsWith('en')
  );
  if (preferred) u.voice = preferred;
  window.speechSynthesis.speak(u);
}

export function getStressedParts(
  full: string,
  stressed: string
): { before: string; stress: string; after: string } {
  if (!stressed || !full.includes(stressed)) {
    return { before: full, stress: '', after: '' };
  }
  const idx = full.indexOf(stressed);
  return {
    before: full.slice(0, idx),
    stress: stressed,
    after: full.slice(idx + stressed.length),
  };
}
