export type AnswerType = 'known' | 'unsure' | 'unknown';

export interface ReviewHistoryEntry {
  timestamp: number;
  answer: AnswerType;
  interval: number;
}

export interface LearningRecord {
  totalReviews: number;
  correctCount: number;
  incorrectCount: number;
  unsureCount: number;
  lastReviewed: number | null;
  lastAnswer: AnswerType | null;
  consecutiveCorrect: number;
  learningLevel: number; // 0-6+
  currentInterval: number; // days
  nextReviewDate: number | null; // timestamp
  reviewHistory: ReviewHistoryEntry[];
  starred: boolean;
}

export interface VocabularyItem {
  wordId: string;
  english: string;
  persianPronunciation: string; // without parentheses
  stressedSyllable: string; // the part that was in ()
  persianMeaning: string;
  irregularPlural?: string;
  v2?: string;
  v3?: string;
  categoryIds: string[];
  creationOrder: number;
  createdAt: number;
  learning: LearningRecord;
}

export interface Category {
  categoryId: string;
  englishName: string;
  persianName: string;
  createdAt: number;
  modifiedAt: number;
  wordIds: string[]; // ordered
}

export interface AppSettings {
  studyDirection: 'en-fa' | 'fa-en' | 'random';
  defaultCardOrder: 'sequential' | 'shuffled';
  autoPronounce: boolean;
  repeatDifficult: boolean;
  preferredReviewMode: string;
  dailyReviewTarget: number;
  theme: 'notebook';
}

export interface StudySession {
  sessionId: string;
  selectedCategoryIds: string[];
  mode: string;
  direction: 'en-fa' | 'fa-en' | 'random';
  cardOrder: 'sequential' | 'shuffled';
  deck: string[]; // wordIds
  currentIndex: number;
  answers: Record<string, AnswerType>; // wordId -> answer
  correct: number;
  unsure: number;
  incorrect: number;
  startTime: number;
  lastUpdated: number;
  isActive: boolean;
}

export interface AppStats {
  totalWordsStudied: number;
  totalReviews: number;
  totalCorrect: number;
  totalIncorrect: number;
  totalUnsure: number;
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string | null; // YYYY-MM-DD
}

export interface AppData {
  categories: Category[];
  vocabulary: VocabularyItem[];
  settings: AppSettings;
  currentSession: StudySession | null;
  stats: AppStats;
  backupVersion: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  studyDirection: 'en-fa',
  defaultCardOrder: 'shuffled',
  autoPronounce: true,
  repeatDifficult: true,
  preferredReviewMode: 'smart',
  dailyReviewTarget: 20,
  theme: 'notebook',
};

export const DEFAULT_STATS: AppStats = {
  totalWordsStudied: 0,
  totalReviews: 0,
  totalCorrect: 0,
  totalIncorrect: 0,
  totalUnsure: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastStudyDate: null,
};

export const INTERVALS = [1, 3, 7, 14, 30, 60, 120]; // days
