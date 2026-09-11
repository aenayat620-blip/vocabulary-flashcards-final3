import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import type {
  AppData,
  Category,
  AppSettings,
  StudySession,
  AppStats,
  AnswerType,
} from './types';
import { loadAppData, saveAppData, requestPersistentStorage } from './db';
import { applyAnswer } from './srs';
import { parseImportText, createVocabularyItems } from './parser';

interface AppContextValue {
  data: AppData | null;
  loading: boolean;
  error: string | null;
  storageWarning: string | null;
  // actions
  refresh: () => Promise<void>;
  save: (newData: AppData) => Promise<void>;
  importCategory: (
    text: string,
    overrideNames?: { en: string; fa: string }
  ) => Promise<{ success: boolean; message: string; wordCount?: number; errors?: string[] }>;
  createCategory: (en: string, fa: string) => Promise<string>;
  updateCategory: (id: string, en: string, fa: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  updateSettings: (s: Partial<AppSettings>) => Promise<void>;
  answerCard: (wordId: string, answer: AnswerType) => Promise<void>;
  toggleStar: (wordId: string) => Promise<void>;
  startSession: (session: StudySession) => Promise<void>;
  updateSession: (session: StudySession) => Promise<void>;
  endSession: () => Promise<void>;
  resetProgress: (scope: 'all' | 'categories', categoryIds?: string[]) => Promise<void>;
  restoreBackup: (json: string, mode: 'merge' | 'replace') => Promise<{ success: boolean; message: string }>;
  getBackupJson: () => string;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const saveQueueRef = useRef(Promise.resolve());

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const d = await loadAppData();
      setData(d);
      // request persistence
      const persisted = await requestPersistentStorage();
      if (!persisted && navigator.storage) {
        setStorageWarning(
          'حافظه دائمی درخواست شد اما تأیید نشد. ممکن است داده‌ها در برخی شرایط پاک شوند.'
        );
      }
    } catch (e: any) {
      setError(e.message || 'خطا در بارگذاری داده‌ها');
      setStorageWarning('دسترسی به IndexedDB ممکن نیست. داده‌ها فقط در حافظه موقت نگه داشته می‌شوند.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(async (newData: AppData) => {
    const job = saveQueueRef.current.then(async () => {
      try {
        await saveAppData(newData);
        setData(newData);
        setError(null);
      } catch (e: any) {
        setError(e.message || 'ذخیره ناموفق بود');
        throw e;
      }
    });
    // Keep the queue alive after a failed write so a later action can still save.
    saveQueueRef.current = job.catch(() => undefined);
    return job;
  }, []);

  const importCategory = useCallback(
    async (text: string, overrideNames?: { en: string; fa: string }) => {
      if (!data) return { success: false, message: 'داده‌ها هنوز بارگذاری نشده‌اند' };
      const parsed = parseImportText(text);
      if (parsed.words.length === 0) {
        return {
          success: false,
          message: 'هیچ واژه‌ای پیدا نشد.',
          errors: parsed.errors,
        };
      }
      const catId = crypto.randomUUID();
      const now = Date.now();
      const enName = overrideNames?.en || parsed.categoryEnglish;
      const faName = overrideNames?.fa || parsed.categoryPersian;

      const newWords = createVocabularyItems(parsed.words, catId, data.vocabulary.length);
      const newCategory: Category = {
        categoryId: catId,
        englishName: enName,
        persianName: faName,
        createdAt: now,
        modifiedAt: now,
        wordIds: newWords.map((w) => w.wordId),
      };

      const newData: AppData = {
        ...data,
        categories: [...data.categories, newCategory],
        vocabulary: [...data.vocabulary, ...newWords],
      };
      await save(newData);
      return {
        success: true,
        message: `${newWords.length} واژه با موفقیت وارد شد.`,
        wordCount: newWords.length,
        errors: parsed.errors,
      };
    },
    [data, save]
  );

  const createCategory = useCallback(
    async (en: string, fa: string) => {
      if (!data) throw new Error('no data');
      const id = crypto.randomUUID();
      const now = Date.now();
      const cat: Category = {
        categoryId: id,
        englishName: en,
        persianName: fa,
        createdAt: now,
        modifiedAt: now,
        wordIds: [],
      };
      await save({ ...data, categories: [...data.categories, cat] });
      return id;
    },
    [data, save]
  );

  const updateCategory = useCallback(
    async (id: string, en: string, fa: string) => {
      if (!data) return;
      const cats = data.categories.map((c) =>
        c.categoryId === id
          ? { ...c, englishName: en, persianName: fa, modifiedAt: Date.now() }
          : c
      );
      await save({ ...data, categories: cats });
    },
    [data, save]
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      if (!data) return;
      // Remove category, but keep words that belong to other categories
      const cats = data.categories.filter((c) => c.categoryId !== id);
      const allVocab = data.vocabulary.map((v) => ({
        ...v,
        categoryIds: v.categoryIds.filter((cid) => cid !== id),
      }));
      await save({ ...data, categories: cats, vocabulary: allVocab });
    },
    [data, save]
  );

  const updateSettings = useCallback(
    async (s: Partial<AppSettings>) => {
      if (!data) return;
      await save({ ...data, settings: { ...data.settings, ...s } });
    },
    [data, save]
  );

  const answerCard = useCallback(
    async (wordId: string, answer: AnswerType) => {
      if (!data) return;
      const vocab = data.vocabulary.map((v) => {
        if (v.wordId !== wordId) return v;
        return { ...v, learning: applyAnswer(v.learning, answer) };
      });
      // update stats
      const stats = { ...data.stats };
      stats.totalReviews += 1;
      if (answer === 'known') stats.totalCorrect += 1;
      else if (answer === 'unsure') stats.totalUnsure += 1;
      else stats.totalIncorrect += 1;

      // streak
      const today = new Date().toISOString().slice(0, 10);
      if (stats.lastStudyDate !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        if (stats.lastStudyDate === yesterday) {
          stats.currentStreak += 1;
        } else {
          stats.currentStreak = 1;
        }
        stats.lastStudyDate = today;
        if (stats.currentStreak > stats.longestStreak) {
          stats.longestStreak = stats.currentStreak;
        }
      }

      let session = data.currentSession;
      if (session && session.isActive) {
        session = {
          ...session,
          answers: { ...session.answers, [wordId]: answer },
          currentIndex: session.currentIndex + 1,
          correct: session.correct + (answer === 'known' ? 1 : 0),
          unsure: session.unsure + (answer === 'unsure' ? 1 : 0),
          incorrect: session.incorrect + (answer === 'unknown' ? 1 : 0),
          lastUpdated: Date.now(),
          isActive: session.currentIndex + 1 < session.deck.length,
        };
      }

      await save({ ...data, vocabulary: vocab, stats, currentSession: session });
    },
    [data, save]
  );

  const toggleStar = useCallback(
    async (wordId: string) => {
      if (!data) return;
      const vocab = data.vocabulary.map((v) =>
        v.wordId === wordId
          ? { ...v, learning: { ...v.learning, starred: !v.learning.starred } }
          : v
      );
      await save({ ...data, vocabulary: vocab });
    },
    [data, save]
  );

  const startSession = useCallback(
    async (session: StudySession) => {
      if (!data) return;
      await save({ ...data, currentSession: { ...session, isActive: true } });
    },
    [data, save]
  );

  const updateSession = useCallback(
    async (session: StudySession) => {
      if (!data) return;
      await save({ ...data, currentSession: session });
    },
    [data, save]
  );

  const endSession = useCallback(async () => {
    if (!data) return;
    await save({
      ...data,
      currentSession: data.currentSession
        ? { ...data.currentSession, isActive: false }
        : null,
    });
  }, [data, save]);

  const resetProgress = useCallback(
    async (scope: 'all' | 'categories', categoryIds?: string[]) => {
      if (!data) return;
      const emptyLearning = () => ({
        totalReviews: 0,
        correctCount: 0,
        incorrectCount: 0,
        unsureCount: 0,
        lastReviewed: null,
        lastAnswer: null,
        consecutiveCorrect: 0,
        learningLevel: 0,
        currentInterval: 0,
        nextReviewDate: null,
        reviewHistory: [],
        starred: false, // keep star? Spec says reset progress, keep starred maybe
      });
      let vocab = data.vocabulary;
      if (scope === 'all') {
        vocab = vocab.map((v) => ({
          ...v,
          learning: { ...emptyLearning(), starred: v.learning.starred },
        }));
      } else if (categoryIds) {
        vocab = vocab.map((v) => {
          if (v.categoryIds.some((id) => categoryIds.includes(id))) {
            return {
              ...v,
              learning: { ...emptyLearning(), starred: v.learning.starred },
            };
          }
          return v;
        });
      }
      const reviewed = vocab.filter(v => v.learning.totalReviews > 0);
      const recalculatedStats: AppStats = {
        ...data.stats,
        totalWordsStudied: reviewed.length,
        totalReviews: vocab.reduce((n, v) => n + v.learning.totalReviews, 0),
        totalCorrect: vocab.reduce((n, v) => n + v.learning.correctCount, 0),
        totalIncorrect: vocab.reduce((n, v) => n + v.learning.incorrectCount, 0),
        totalUnsure: vocab.reduce((n, v) => n + v.learning.unsureCount, 0),
      };
      if (scope === 'all') {
        recalculatedStats.totalWordsStudied = 0;
        recalculatedStats.totalReviews = 0;
        recalculatedStats.totalCorrect = 0;
        recalculatedStats.totalIncorrect = 0;
        recalculatedStats.totalUnsure = 0;
      }
      await save({ ...data, vocabulary: vocab, stats: recalculatedStats });
    },
    [data, save]
  );

  const getBackupJson = useCallback(() => {
    if (!data) return '{}';
    return JSON.stringify(data, null, 2);
  }, [data]);

  const restoreBackup = useCallback(
    async (json: string, mode: 'merge' | 'replace') => {
      try {
        const parsed = JSON.parse(json) as AppData;
        if (!parsed.backupVersion || !Array.isArray(parsed.categories) || !Array.isArray(parsed.vocabulary)) {
          return { success: false, message: 'فایل پشتیبان معتبر نیست.' };
        }
        if (mode === 'replace') {
          await save({ ...parsed, backupVersion: 1 });
          return { success: true, message: 'داده‌ها با موفقیت جایگزین شدند.' };
        }
        // merge
        if (!data) return { success: false, message: 'داده‌های فعلی موجود نیست' };
        const existingCatIds = new Set(data.categories.map((c) => c.categoryId));
        const existingWordIds = new Set(data.vocabulary.map((v) => v.wordId));
        const newCats = parsed.categories.filter((c) => !existingCatIds.has(c.categoryId));
        const newWords = parsed.vocabulary.filter((v) => !existingWordIds.has(v.wordId));
        // for existing words, optionally merge learning? keep existing for safety
        const merged: AppData = {
          ...data,
          categories: [...data.categories, ...newCats],
          vocabulary: [...data.vocabulary, ...newWords],
          settings: { ...data.settings, ...parsed.settings },
          stats: data.stats, // keep current stats or merge carefully
          backupVersion: 1,
        };
        await save(merged);
        return {
          success: true,
          message: `ادغام انجام شد: ${newCats.length} دسته و ${newWords.length} واژه جدید اضافه شد.`,
        };
      } catch {
        return { success: false, message: 'فایل پشتیبان معتبر نیست.' };
      }
    },
    [data, save]
  );

  const value: AppContextValue = {
    data,
    loading,
    error,
    storageWarning,
    refresh,
    save,
    importCategory,
    createCategory,
    updateCategory,
    deleteCategory,
    updateSettings,
    answerCard,
    toggleStar,
    startSession,
    updateSession,
    endSession,
    resetProgress,
    restoreBackup,
    getBackupJson,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
