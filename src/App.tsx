import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApp } from './AppContext';
import type { VocabularyItem, StudySession, AnswerType, Category } from './types';
import { getGlobalStats, getCategoryStats, shuffleArray, speakEnglish, getStressedParts, formatDate } from './utils';
import { isDue, isWeak, isLearned, isLearning, getAccuracy, prioritizeForSmartReview } from './srs';
import { parseImportText } from './parser';

type Screen = 'home' | 'categories' | 'import' | 'studySetup' | 'study' | 'sessionEnd' | 'backup' | 'settings' | 'search' | 'wordDetail' | 'quiz';

export default function App() {
  const { data, loading, error, storageWarning, importCategory, createCategory, updateCategory, deleteCategory, updateSettings, answerCard, toggleStar, startSession, endSession, resetProgress, restoreBackup, getBackupJson } = useApp();
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [studyMode, setStudyMode] = useState('smart');
  const [direction, setDirection] = useState<'en-fa' | 'fa-en' | 'random'>('en-fa');
  const [cardOrder, setCardOrder] = useState<'sequential' | 'shuffled'>('shuffled');
  const [flipped, setFlipped] = useState(false);
  const [currentDir, setCurrentDir] = useState<'en-fa' | 'fa-en'>('en-fa');
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState<ReturnType<typeof parseImportText> | null>(null);
  const [importEnName, setImportEnName] = useState('');
  const [importFaName, setImportFaName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [backupText, setBackupText] = useState('');
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [detailWord, setDetailWord] = useState<VocabularyItem | null>(null);
  const [filter, setFilter] = useState('all');
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatEn, setNewCatEn] = useState('');
  const [newCatFa, setNewCatFa] = useState('');
  const [quizMode, setQuizMode] = useState<'mc' | 'type'>('mc');
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizDeck, setQuizDeck] = useState<string[]>([]);
  const [quizOptions, setQuizOptions] = useState<string[]>([]);
  const [quizSelected, setQuizSelected] = useState<string | null>(null);
  const [quizTyped, setQuizTyped] = useState('');
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [quizCorrectCount, setQuizCorrectCount] = useState(0);
  const spokenRef = useRef<string | null>(null);
  const [showResume, setShowResume] = useState(false);

  useEffect(() => { if (data?.currentSession?.isActive) setShowResume(true); }, [data?.currentSession?.isActive]);

  const stats = useMemo(() => data ? getGlobalStats(data) : null, [data]);
  const showMsg = (type: string, text: string) => { setMessage({ type, text }); setTimeout(() => setMessage(null), 4000); };

  const buildDeck = useCallback((catIds: string[], mode: string, order: string) => {
    if (!data) return [];
    let words = data.vocabulary.filter(v => v.categoryIds.some(id => catIds.includes(id)));
    if (mode === 'unknown') words = words.filter(w => w.learning.lastAnswer === 'unknown' || w.learning.incorrectCount > 0);
    else if (mode === 'weak') words = words.filter(isWeak);
    else if (mode === 'due') words = words.filter(w => isDue(w));
    else if (mode === 'starred') words = words.filter(w => w.learning.starred);
    else if (mode === 'smart') { words = prioritizeForSmartReview(words); return words.map(w => w.wordId); }
    let ids = words.map(w => w.wordId);
    if (order === 'shuffled') ids = shuffleArray(ids);
    else ids = words.sort((a,b) => a.creationOrder - b.creationOrder).map(w => w.wordId);
    return ids;
  }, [data]);

  const startStudy = async () => {
    if (!selectedCats.length) { showMsg('error', 'دسته انتخاب کنید'); return; }
    const deck = buildDeck(selectedCats, studyMode, cardOrder);
    if (!deck.length) { showMsg('warning', 'واژه‌ای نیست'); return; }
    const session: StudySession = { sessionId: crypto.randomUUID(), selectedCategoryIds: selectedCats, mode: studyMode, direction, cardOrder, deck, currentIndex: 0, answers: {}, correct: 0, unsure: 0, incorrect: 0, startTime: Date.now(), lastUpdated: Date.now(), isActive: true };
    await startSession(session);
    setFlipped(false); spokenRef.current = null;
    setCurrentDir(direction === 'random' ? (Math.random()>0.5?'en-fa':'fa-en') : direction);
    setScreen('study');
  };

  const handleAnswer = async (answer: AnswerType) => {
    if (!data?.currentSession) return;
    const wordId = data.currentSession.deck[data.currentSession.currentIndex];
    const isLastCard = data.currentSession.currentIndex + 1 >= data.currentSession.deck.length;
    await answerCard(wordId, answer);
    setFlipped(false); spokenRef.current = null;
    if (isLastCard) { setScreen('sessionEnd'); }
    else if (direction === 'random') setCurrentDir(Math.random()>0.5?'en-fa':'fa-en');
  };

  const startQuiz = () => {
    if (!selectedCats.length) { showMsg('error', 'دسته انتخاب کنید'); return; }
    const deck = buildDeck(selectedCats, studyMode, cardOrder);
    if (!deck.length) { showMsg('warning', 'واژه‌ای نیست'); return; }
    setQuizDeck(deck);
    setQuizIndex(0);
    setQuizCorrectCount(0);
    setQuizSelected(null);
    setQuizTyped('');
    setQuizAnswered(false);
    setScreen('quiz');
  };

  useEffect(() => {
    if (screen !== 'quiz' || quizMode !== 'mc' || !data) return;
    const wordId = quizDeck[quizIndex];
    if (!wordId) return;
    const correct = data.vocabulary.find(v => v.wordId === wordId);
    if (!correct) return;
    const pool = data.vocabulary.filter(v => v.wordId !== wordId && v.categoryIds.some(id => selectedCats.includes(id)));
    const distractors = shuffleArray(pool.map(v => v.persianMeaning)).slice(0, 3);
    setQuizOptions(shuffleArray([correct.persianMeaning, ...distractors]));
  }, [screen, quizMode, quizIndex, quizDeck, data, selectedCats]);

  const quizWord = useMemo(() => {
    if (screen !== 'quiz' || !data) return null;
    return data.vocabulary.find(v => v.wordId === quizDeck[quizIndex]) || null;
  }, [screen, data, quizDeck, quizIndex]);

  const submitMcAnswer = async (choice: string) => {
    if (quizAnswered || !quizWord) return;
    setQuizSelected(choice);
    setQuizAnswered(true);
    const isCorrect = choice === quizWord.persianMeaning;
    if (isCorrect) setQuizCorrectCount(c => c + 1);
    await answerCard(quizWord.wordId, isCorrect ? 'known' : 'unknown');
  };

  const submitTypeAnswer = async () => {
    if (quizAnswered || !quizWord) return;
    setQuizAnswered(true);
    const isCorrect = quizTyped.trim() === quizWord.persianMeaning.trim();
    if (isCorrect) setQuizCorrectCount(c => c + 1);
    await answerCard(quizWord.wordId, isCorrect ? 'known' : 'unknown');
  };

  const nextQuizWord = () => {
    setQuizIndex(i => i + 1);
    setQuizSelected(null);
    setQuizTyped('');
    setQuizAnswered(false);
  };

  const onFlip = () => {
    if (flipped) return;
    setFlipped(true);
    if (data?.settings.autoPronounce && data.currentSession) {
      const wordId = data.currentSession.deck[data.currentSession.currentIndex];
      const word = data.vocabulary.find(v => v.wordId === wordId);
      if (word && spokenRef.current !== wordId) { speakEnglish(word.english); spokenRef.current = wordId; }
    }
  };

  const currentWord = useMemo(() => {
    if (!data?.currentSession || screen !== 'study') return null;
    return data.vocabulary.find(v => v.wordId === data.currentSession!.deck[data.currentSession!.currentIndex]) || null;
  }, [data, screen]);

  const searchResults = useMemo(() => {
    if (!data || !searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return data.vocabulary.filter(v => {
      if (filter === 'learned' && !isLearned(v)) return false;
      if (filter === 'weak' && !isWeak(v)) return false;
      if (filter === 'starred' && !v.learning.starred) return false;
      return v.english.toLowerCase().includes(q) || v.persianMeaning.includes(q);
    }).slice(0, 80);
  }, [data, searchQuery, filter]);

  if (loading) return <div className="app-container"><div className="loading-screen"><div className="spinner"/><div>بارگذاری...</div></div></div>;
  if (error && !data) return <div className="app-container"><div className="error-box">{error}</div></div>;
  if (showResume && data?.currentSession?.isActive) return (
    <div className="app-container"><div className="card" style={{marginTop:40}}>
      <h2 className="card-title">ادامه مطالعه؟</h2>
      <p>{data.currentSession.currentIndex} از {data.currentSession.deck.length}</p>
      <div className="btn-row">
        <button className="btn btn-primary" onClick={() => { setShowResume(false); setScreen('study'); }}>ادامه</button>
        <button className="btn btn-ghost" onClick={async () => { setShowResume(false); await endSession(); }}>جدید</button>
      </div>
    </div></div>
  );

  const showNav = ['home','categories','search','settings'].includes(screen);

  return (
    <div className={`app-container ${showNav ? 'has-bottom-nav' : ''}`}>
      {message && <div className={`${message.type}-box`}>{message.text}</div>}
      {screen === 'home' && <>
        <div className="app-header"><div className="app-title">دفتر واژگان</div></div>
        {storageWarning && <div className="warning-box">{storageWarning}</div>}
        {stats && <div className="stats-grid">
          <div className="stat-box"><div className="stat-value">{stats.dueToday}</div><div className="stat-label">مرور امروز</div></div>
          <div className="stat-box"><div className="stat-value">{stats.learned}</div><div className="stat-label">یادگرفته</div></div>
          <div className="stat-box"><div className="stat-value">{stats.learning}</div><div className="stat-label">یادگیری</div></div>
          <div className="stat-box"><div className="stat-value">{stats.weak}</div><div className="stat-label">ضعیف</div></div>
          <div className="stat-box"><div className="stat-value">{stats.accuracy}%</div><div className="stat-label">دقت</div></div>
          <div className="stat-box"><div className="stat-value">{stats.streak}</div><div className="stat-label">رشته</div></div>
        </div>}
        <button className="btn btn-primary mb-2" onClick={() => { setStudyMode('due'); setSelectedCats(data?.categories.map(c=>c.categoryId)||[]); setScreen('studySetup'); }}>مرور امروز</button>
        <button className="btn btn-secondary mb-1" onClick={() => setScreen('categories')}>شروع مطالعه</button>
        <button className="btn btn-ghost mb-1" onClick={() => setScreen('import')}>ورود دسته</button>
        <button className="btn btn-ghost mb-1" onClick={() => setScreen('backup')}>پشتیبان</button>
        <button className="btn btn-ghost" onClick={() => setScreen('settings')}>تنظیمات</button>
      </>}
      {screen === 'categories' && <>
        <div className="app-header">
          <button className="btn btn-ghost" style={{width:'auto'}} onClick={() => setScreen('home')}>←</button>
          <div className="app-title">دسته‌ها</div>
        </div>
        {data?.categories.map(cat => {
          const s = getCategoryStats(cat, data.vocabulary);
          return (
            <div key={cat.categoryId} className="category-item">
              <input type="checkbox" checked={selectedCats.includes(cat.categoryId)} onChange={() => setSelectedCats(p => p.includes(cat.categoryId) ? p.filter(id=>id!==cat.categoryId) : [...p, cat.categoryId])} />
              <div className="category-info" onClick={() => setEditingCat(cat)}>
                <div className="category-name-fa">{cat.persianName}</div>
                <div className="category-name-en">{cat.englishName}</div>
                <div className="category-meta"><span className="badge">{s.total}</span><span className="badge">{s.learned} یادگرفته</span>{s.due>0 && <span className="badge badge-due">{s.due}</span>}</div>
              </div>
            </div>
          );
        })}
        {selectedCats.length > 0 && <button className="btn btn-primary" onClick={() => setScreen('studySetup')}>مطالعه</button>}
        <button className="btn btn-ghost mt-1" onClick={() => { setNewCatEn(''); setNewCatFa(''); setNewCatOpen(true); }}>+ دسته جدید</button>
        {newCatOpen && <div className="modal-overlay" onClick={() => setNewCatOpen(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
          <input className="form-input mb-1" placeholder="نام فارسی" value={newCatFa} onChange={e => setNewCatFa(e.target.value)} />
          <input className="form-input ltr mb-1" placeholder="English name" value={newCatEn} onChange={e => setNewCatEn(e.target.value)} />
          <button className="btn btn-primary" onClick={async () => {
            if (!newCatEn.trim() || !newCatFa.trim()) { showMsg('error', 'هر دو نام را وارد کنید'); return; }
            await createCategory(newCatEn.trim(), newCatFa.trim());
            setNewCatOpen(false);
            showMsg('success', 'دسته ایجاد شد');
          }}>ایجاد</button>
        </div></div>}
        {editingCat && <div className="modal-overlay" onClick={() => setEditingCat(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
          <input className="form-input mb-1" value={editingCat.persianName} onChange={e => setEditingCat({...editingCat, persianName: e.target.value})} />
          <input className="form-input ltr mb-1" value={editingCat.englishName} onChange={e => setEditingCat({...editingCat, englishName: e.target.value})} />
          <button className="btn btn-primary" onClick={async () => { await updateCategory(editingCat.categoryId, editingCat.englishName, editingCat.persianName); setEditingCat(null); }}>ذخیره</button>
          <button className="btn btn-danger mt-1" onClick={() => { setConfirmDelete(editingCat.categoryId); setEditingCat(null); }}>حذف</button>
        </div></div>}
        {confirmDelete && <div className="modal-overlay"><div className="modal"><p>حذف؟</p><button className="btn btn-danger" onClick={async () => { await deleteCategory(confirmDelete); setConfirmDelete(null); }}>بله</button><button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>خیر</button></div></div>}
      </>}
      {screen === 'import' && <>
        <div className="app-header"><button className="btn btn-ghost" style={{width:'auto'}} onClick={() => setScreen('home')}>←</button><div className="app-title">ورود</div></div>
        <textarea className="form-textarea" value={importText} onChange={e => setImportText(e.target.value)} />
        <button className="btn btn-secondary" onClick={() => { const p = parseImportText(importText); setImportPreview(p); setImportEnName(p.categoryEnglish); setImportFaName(p.categoryPersian); }}>پیش‌نمایش</button>
        {importPreview && <div className="card">
          <input className="form-input mb-1" value={importFaName} onChange={e => setImportFaName(e.target.value)} />
          <input className="form-input ltr mb-1" value={importEnName} onChange={e => setImportEnName(e.target.value)} />
          <p>{importPreview.words.length} واژه</p>
          <button className="btn btn-primary" onClick={async () => { const r = await importCategory(importText, {en: importEnName, fa: importFaName}); showMsg(r.success?'success':'error', r.message); if(r.success){ setImportPreview(null); setScreen('categories'); } }}>ورود</button>
        </div>}
      </>}
      {screen === 'studySetup' && <>
        <div className="app-header"><button className="btn btn-ghost" style={{width:'auto'}} onClick={() => setScreen('categories')}>←</button><div className="app-title">مطالعه</div></div>
        <select className="form-select mb-1" value={studyMode} onChange={e => setStudyMode(e.target.value)}>
          <option value="all">همه</option><option value="due">امروز</option><option value="weak">ضعیف</option><option value="starred">ستاره</option><option value="smart">هوشمند</option><option value="unknown">بلد نبودم</option>
        </select>
        <select className="form-select mb-1" value={direction} onChange={e => setDirection(e.target.value as any)}>
          <option value="en-fa">EN→FA</option><option value="fa-en">FA→EN</option><option value="random">تصادفی</option>
        </select>
        <select className="form-select mb-1" value={cardOrder} onChange={e => setCardOrder(e.target.value as any)}>
          <option value="shuffled">تصادفی</option><option value="sequential">ترتیبی</option>
        </select>
        <button className="btn btn-primary" onClick={startStudy}>شروع</button>
        <button className="btn btn-secondary mt-1" onClick={startQuiz}>شروع کوییز</button>
      </>}
      {screen === 'study' && currentWord && data?.currentSession && <>
        <div className="session-stats"><span>{data.currentSession.currentIndex+1}/{data.currentSession.deck.length}</span><span>✓{data.currentSession.correct} ~{data.currentSession.unsure} ✗{data.currentSession.incorrect}</span></div>
        <div className="progress-bar-outer"><div className="progress-bar-inner" style={{width: `${(data.currentSession.currentIndex/data.currentSession.deck.length)*100}%`}}/></div>
        <div className="flashcard-wrapper">
          <div className={`flashcard ${flipped?'flipped':''}`} onClick={onFlip}>
            <div className="flashcard-face front">
              {currentDir==='en-fa' ? <div className="flashcard-word">{currentWord.english}</div> : <div className="flashcard-meaning" style={{fontSize:'1.5rem'}}>{currentWord.persianMeaning}</div>}
              <div className="flashcard-hint">ضربه بزنید</div>
            </div>
            <div className="flashcard-face back">
              <button className="speaker-btn" onClick={e => { e.stopPropagation(); speakEnglish(currentWord.english); }}>🔊</button>
              <button className="star-btn" onClick={async e => { e.stopPropagation(); await toggleStar(currentWord.wordId); }}>{currentWord.learning.starred?'⭐':'☆'}</button>
              <div className="flashcard-word">{currentWord.english}</div>
              <div className="flashcard-pron">{(() => { const p=getStressedParts(currentWord.persianPronunciation, currentWord.stressedSyllable); return <>{p.before}{p.stress&&<span className="stress">{p.stress}</span>}{p.after}</>; })()}</div>
              <div className="flashcard-meaning">{currentWord.persianMeaning}</div>
              {(currentWord.v2||currentWord.irregularPlural) && <div className="flashcard-irregular">{currentWord.irregularPlural&&<div>جمع: {currentWord.irregularPlural}</div>}{currentWord.v2&&<div>V2: {currentWord.v2}</div>}{currentWord.v3&&<div>V3: {currentWord.v3}</div>}</div>}
            </div>
          </div>
        </div>
        {flipped && <div className="answer-row">
          <button className="answer-btn answer-unknown" onClick={() => handleAnswer('unknown')}>❌ بلد نبودم</button>
          <button className="answer-btn answer-unsure" onClick={() => handleAnswer('unsure')}>~ مطمئن نبودم</button>
          <button className="answer-btn answer-known" onClick={() => handleAnswer('known')}>✓ بلد بودم</button>
        </div>}
        <button className="btn btn-ghost mt-2" onClick={async () => { await endSession(); setScreen('home'); }}>خروج</button>
      </>}
      {screen === 'quiz' && <>
        <div className="app-header"><button className="btn btn-ghost" style={{width:'auto'}} onClick={() => setScreen('home')}>←</button><div className="app-title">کوییز</div></div>
        <select className="form-select mb-1" value={quizMode} onChange={e => { setQuizMode(e.target.value as 'mc' | 'type'); setQuizSelected(null); setQuizTyped(''); setQuizAnswered(false); }}>
          <option value="mc">چهارگزینه‌ای</option>
          <option value="type">تایپی</option>
        </select>
        {quizWord ? <>
          <div className="session-stats"><span>{quizIndex+1}/{quizDeck.length}</span><span>✓{quizCorrectCount}</span></div>
          <div className="progress-bar-outer"><div className="progress-bar-inner" style={{width: `${(quizIndex/quizDeck.length)*100}%`}}/></div>
          <div className="card">
            <div className="flashcard-word">{quizWord.english}</div>
            <button className="speaker-btn" onClick={() => speakEnglish(quizWord.english)}>🔊</button>
          </div>
          {quizMode === 'mc' ? <div className="btn-row" style={{flexDirection:'column'}}>
            {quizOptions.map(opt => {
              const isCorrectOpt = opt === quizWord.persianMeaning;
              const cls = !quizAnswered ? 'btn btn-secondary mb-1' : (isCorrectOpt ? 'btn btn-primary mb-1' : (opt === quizSelected ? 'btn btn-danger mb-1' : 'btn btn-secondary mb-1'));
              return <button key={opt} className={cls} disabled={quizAnswered} onClick={() => submitMcAnswer(opt)}>{opt}</button>;
            })}
          </div> : <>
            <input className="form-input mb-1" value={quizTyped} onChange={e => setQuizTyped(e.target.value)} disabled={quizAnswered} placeholder="معنی فارسی را بنویسید" />
            {!quizAnswered && <button className="btn btn-primary mb-1" onClick={submitTypeAnswer}>ثبت</button>}
            {quizAnswered && <p className={quizTyped.trim() === quizWord.persianMeaning.trim() ? 'success-box' : 'error-box'}>پاسخ درست: {quizWord.persianMeaning}</p>}
          </>}
          {quizAnswered && <button className="btn btn-secondary mt-1" onClick={nextQuizWord}>بعدی</button>}
        </> : <div className="card" style={{marginTop:40}}>
          <h2 className="card-title">پایان کوییز</h2>
          <p>{quizCorrectCount} از {quizDeck.length} درست</p>
          <button className="btn btn-primary mt-1" onClick={() => setScreen('home')}>خانه</button>
        </div>}
      </>}
      {screen === 'sessionEnd' && data?.currentSession && <>
        <div className="app-header"><div className="app-title">خلاصه</div></div>
        <div className="stats-grid">
          <div className="stat-box"><div className="stat-value">{data.currentSession.correct}</div><div className="stat-label">صحیح</div></div>
          <div className="stat-box"><div className="stat-value">{data.currentSession.incorrect}</div><div className="stat-label">غلط</div></div>
        </div>
        <button className="btn btn-primary" onClick={() => setScreen('home')}>خانه</button>
      </>}
      {screen === 'backup' && <>
        <div className="app-header"><button className="btn btn-ghost" style={{width:'auto'}} onClick={() => setScreen('home')}>←</button><div className="app-title">پشتیبان</div></div>
        <button className="btn btn-secondary mb-1" onClick={() => setBackupText(getBackupJson())}>تولید</button>
        <textarea className="form-textarea" value={backupText} onChange={e => setBackupText(e.target.value)} />
        <button className="btn btn-primary mb-1" onClick={async () => { try { await navigator.clipboard.writeText(backupText||getBackupJson()); showMsg('success','کپی شد'); } catch { showMsg('error','خطا'); } }}>کپی</button>
        <select className="form-select" value={restoreMode} onChange={e => setRestoreMode(e.target.value as any)}><option value="merge">ادغام</option><option value="replace">جایگزینی</option></select>
        <button className="btn btn-warning mt-1" onClick={async () => {
          if (restoreMode==='replace' && !confirmReplace) { setConfirmReplace(true); return; }
          const r = await restoreBackup(backupText, restoreMode); setConfirmReplace(false); showMsg(r.success?'success':'error', r.message); if(r.success) setScreen('home');
        }}>بازیابی</button>
        {confirmReplace && <div className="modal-overlay"><div className="modal"><p>جایگزینی کامل؟</p><button className="btn btn-danger" onClick={async () => { setConfirmReplace(false); const r=await restoreBackup(backupText,'replace'); showMsg(r.success?'success':'error',r.message); if(r.success) setScreen('home'); }}>بله</button><button className="btn btn-ghost" onClick={() => setConfirmReplace(false)}>خیر</button></div></div>}
      </>}
      {screen === 'settings' && data && <>
        <div className="app-header"><button className="btn btn-ghost" style={{width:'auto'}} onClick={() => setScreen('home')}>←</button><div className="app-title">تنظیمات</div></div>
        <div className="card">
          <div className="toggle-row"><span>تلفظ خودکار</span><div className={`toggle ${data.settings.autoPronounce?'on':''}`} onClick={() => updateSettings({autoPronounce: !data.settings.autoPronounce})} /></div>
          <div className="toggle-row"><span>تکرار دشوار</span><div className={`toggle ${data.settings.repeatDifficult?'on':''}`} onClick={() => updateSettings({repeatDifficult: !data.settings.repeatDifficult})} /></div>
        </div>
        <button className="btn btn-danger mt-2" onClick={() => setConfirmReset(true)}>بازنشانی پیشرفت</button>
        {confirmReset && <div className="modal-overlay"><div className="modal"><p>بازنشانی؟</p><button className="btn btn-danger" onClick={async () => { await resetProgress('all'); setConfirmReset(false); showMsg('success','شد'); }}>بله</button><button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>خیر</button></div></div>}
      </>}
      {screen === 'search' && <>
        <div className="app-header"><button className="btn btn-ghost" style={{width:'auto'}} onClick={() => setScreen('home')}>←</button><div className="app-title">جستجو</div></div>
        <input className="search-input" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="جستجو..." />
        <div className="btn-row mb-1">
          {(['all','learned','weak','starred'] as const).map(f => (
            <button key={f} className={`btn ${filter===f?'btn-primary':'btn-ghost'}`} onClick={() => setFilter(f)}>
              {f==='all'?'همه':f==='learned'?'یادگرفته':f==='weak'?'ضعیف':'ستاره'}
            </button>
          ))}
        </div>
        {searchResults.map(w => <div key={w.wordId} className="category-item" onClick={() => { setDetailWord(w); setScreen('wordDetail'); }}><div className="category-info"><div className="category-name-fa ltr" style={{textAlign:'left'}}>{w.english}</div><div className="category-name-en">{w.persianMeaning}</div></div></div>)}
      </>}
      {screen === 'wordDetail' && detailWord && <>
        <div className="app-header"><button className="btn btn-ghost" style={{width:'auto'}} onClick={() => setScreen('search')}>←</button><div className="app-title">جزئیات</div></div>
        <div className="card">
          <div className="flashcard-word">{detailWord.english}</div>
          <div className="flashcard-meaning">{detailWord.persianMeaning}</div>
          <div className="detail-row"><span>مرور</span><span>{detailWord.learning.totalReviews}</span></div>
          <div className="detail-row"><span>سطح</span><span>{detailWord.learning.learningLevel}</span></div>
          <div className="detail-row"><span>دقت</span><span>{getAccuracy(detailWord)}%</span></div>
          <div className="detail-row"><span>آخرین مرور</span><span>{formatDate(detailWord.learning.lastReviewed)}</span></div>
          <div className="detail-row"><span>وضعیت</span><span>{isLearned(detailWord) ? 'یادگرفته' : isLearning(detailWord) ? 'در حال یادگیری' : 'جدید'}</span></div>
          <button className="btn btn-secondary" onClick={async () => { await toggleStar(detailWord.wordId); setDetailWord({...detailWord, learning:{...detailWord.learning, starred:!detailWord.learning.starred}}); }}>{detailWord.learning.starred?'حذف ستاره':'ستاره'}</button>
        </div>
      </>}
      {showNav && <nav className="bottom-nav">
        <button className={`nav-item ${screen==='home'?'active':''}`} onClick={() => setScreen('home')}><span className="icon">🏠</span>خانه</button>
        <button className={`nav-item ${screen==='categories'?'active':''}`} onClick={() => setScreen('categories')}><span className="icon">📚</span>دسته‌ها</button>
        <button className={`nav-item ${screen==='search'?'active':''}`} onClick={() => setScreen('search')}><span className="icon">🔍</span>جستجو</button>
        <button className={`nav-item ${screen==='settings'?'active':''}`} onClick={() => setScreen('settings')}><span className="icon">⚙️</span>تنظیمات</button>
      </nav>}
    </div>
  );
}
