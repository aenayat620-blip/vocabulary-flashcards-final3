import type { AnswerType, LearningRecord, VocabularyItem } from './types';
import { INTERVALS } from './types';

function daysToMs(days: number): number {
  return days * 24 * 60 * 60 * 1000;
}

export function applyAnswer(
  learning: LearningRecord,
  answer: AnswerType
): LearningRecord {
  const now = Date.now();
  const history = [
    ...learning.reviewHistory,
    { timestamp: now, answer, interval: learning.currentInterval },
  ].slice(-50); // keep last 50

  let {
    totalReviews,
    correctCount,
    incorrectCount,
    unsureCount,
    consecutiveCorrect,
    learningLevel,
    currentInterval,
  } = learning;

  totalReviews += 1;

  if (answer === 'known') {
    correctCount += 1;
    consecutiveCorrect += 1;
    learningLevel = Math.min(learningLevel + 1, INTERVALS.length);
    // First successful recall = 1 day; subsequent levels advance through the interval ladder.
    const idx = Math.min(Math.max(learningLevel - 1, 0), INTERVALS.length - 1);
    currentInterval = INTERVALS[idx];
  } else if (answer === 'unsure') {
    unsureCount += 1;
    consecutiveCorrect = Math.max(0, consecutiveCorrect - 1);
    // slight increase or stay
    if (learningLevel < 1) learningLevel = 1;
    currentInterval = Math.max(1, Math.floor(currentInterval * 0.6) || 1);
  } else {
    // unknown
    incorrectCount += 1;
    consecutiveCorrect = 0;
    learningLevel = Math.max(0, learningLevel - 2);
    currentInterval = 1; // review soon
  }

  const nextReviewDate = now + daysToMs(currentInterval);

  return {
    totalReviews,
    correctCount,
    incorrectCount,
    unsureCount,
    lastReviewed: now,
    lastAnswer: answer,
    consecutiveCorrect,
    learningLevel,
    currentInterval,
    nextReviewDate,
    reviewHistory: history,
    starred: learning.starred,
  };
}

export function isDue(item: VocabularyItem, now = Date.now()): boolean {
  if (!item.learning.nextReviewDate) return true; // never reviewed
  return item.learning.nextReviewDate <= now;
}

export function isWeak(item: VocabularyItem): boolean {
  const l = item.learning;
  if (l.totalReviews === 0) return false;
  const accuracy = l.correctCount / l.totalReviews;
  return accuracy < 0.55 || l.learningLevel <= 1 || l.incorrectCount >= 3;
}

export function isLearned(item: VocabularyItem): boolean {
  return item.learning.learningLevel >= 4 && item.learning.consecutiveCorrect >= 2;
}

export function isLearning(item: VocabularyItem): boolean {
  return item.learning.totalReviews > 0 && !isLearned(item) && !isWeak(item);
}

export function getAccuracy(item: VocabularyItem): number {
  if (item.learning.totalReviews === 0) return 0;
  return Math.round((item.learning.correctCount / item.learning.totalReviews) * 100);
}

export function prioritizeForSmartReview(items: VocabularyItem[]): VocabularyItem[] {
  const now = Date.now();
  return [...items].sort((a, b) => {
    // Higher priority (lower score) first
    const score = (it: VocabularyItem) => {
      let s = 0;
      if (isDue(it, now)) s -= 100;
      if (it.learning.lastAnswer === 'unknown') s -= 80;
      if (isWeak(it)) s -= 60;
      if (it.learning.consecutiveCorrect === 0 && it.learning.totalReviews > 0) s -= 40;
      s -= it.learning.learningLevel * 5;
      // prefer less recently reviewed
      if (it.learning.lastReviewed) {
        s -= Math.min(30, (now - it.learning.lastReviewed) / (1000 * 60 * 60 * 24));
      }
      return s;
    };
    return score(a) - score(b);
  });
}
