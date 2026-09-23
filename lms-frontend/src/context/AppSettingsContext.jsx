import { createContext, useContext, useEffect, useState } from "react";

/* ===========================================================================
 * AppSettingsContext
 * ---------------------------------------------------------------------------
 * Lightweight, frontend-only global state for cross-role controls.
 *
 * Currently manages:
 *   - QEC Survey enable/disable flag      (controls visibility for students & teachers)
 *   - QEC Survey feedback release flag    (controls teacher visibility of feedback)
 *   - Per-student survey completion state (controls exam access for students)
 *   - Per-teacher survey completion state (controls final term mark upload by teacher)
 *   - Results-declared flag               (gates teacher's view of feedback)
 *
 * Persists to localStorage so users can toggle and the change survives reloads.
 * ========================================================================= */

const STORAGE_KEY = "aust_app_settings_v1";

const DEFAULT_SETTINGS = {
  // QEC controls
  surveysEnabled: true,            // QEC enables/disables surveys globally
  feedbackReleased: false,         // QEC releases student feedback to teachers
  resultsDeclared: false,          // Exam controller declares results

  // Per-user (mock) survey completion — keyed by name
  studentSurveysCompleted: {
    "FAHAD KHALID": false,
    "HAMZA YOUSAF": false,
  },
  teacherSurveysCompleted: {
    "Dr. Muhammad Naeem": false,
  },
};

const AppSettingsContext = createContext(null);

export const AppSettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch (_) {
      /* ignore corrupt storage */
    }
  }, []);

  // Persist on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  /* ---------- public helpers ---------- */
  const setSurveysEnabled = (val) =>
    setSettings((s) => ({ ...s, surveysEnabled: !!val }));

  const setFeedbackReleased = (val) =>
    setSettings((s) => ({ ...s, feedbackReleased: !!val }));

  const setResultsDeclared = (val) =>
    setSettings((s) => ({ ...s, resultsDeclared: !!val }));

  const markStudentSurveyDone = (name, done = true) =>
    setSettings((s) => ({
      ...s,
      studentSurveysCompleted: {
        ...s.studentSurveysCompleted,
        [name]: done,
      },
    }));

  const markTeacherSurveyDone = (name, done = true) =>
    setSettings((s) => ({
      ...s,
      teacherSurveysCompleted: {
        ...s.teacherSurveysCompleted,
        [name]: done,
      },
    }));

  /* ---------- derived helpers ---------- */
  const isStudentSurveyComplete = (name) =>
    !!settings.studentSurveysCompleted[name];

  const isTeacherSurveyComplete = (name) =>
    !!settings.teacherSurveysCompleted[name];

  // ============================================================
  // Survey restriction removal:
  //   Per latest spec, survey completion must NOT be mandatory for
  //   students attempting exams or teachers uploading results.
  //   The Surveys module itself remains visible & usable — these
  //   helpers simply always return true so callers no longer block
  //   access. We keep them as functions (not removed) so all existing
  //   imports continue to work.
  // ============================================================
  const canStudentTakeExam = (_name) => true;
  const canTeacherUploadFinalResults = (_name) => true;

  // Teacher can view student feedback only after results are declared AND QEC released feedback
  const canTeacherViewFeedback = () =>
    settings.resultsDeclared && settings.feedbackReleased;

  const value = {
    ...settings,
    setSurveysEnabled,
    setFeedbackReleased,
    setResultsDeclared,
    markStudentSurveyDone,
    markTeacherSurveyDone,
    isStudentSurveyComplete,
    isTeacherSurveyComplete,
    canStudentTakeExam,
    canTeacherUploadFinalResults,
    canTeacherViewFeedback,
  };

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
};

export const useAppSettings = () => {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) {
    // Safe default if used outside provider (should not happen in app)
    return {
      surveysEnabled: true,
      feedbackReleased: false,
      resultsDeclared: false,
      isStudentSurveyComplete: () => false,
      isTeacherSurveyComplete: () => false,
      canStudentTakeExam: () => true,
      canTeacherUploadFinalResults: () => true,
      canTeacherViewFeedback: () => false,
      setSurveysEnabled: () => {},
      setFeedbackReleased: () => {},
      setResultsDeclared: () => {},
      markStudentSurveyDone: () => {},
      markTeacherSurveyDone: () => {},
    };
  }
  return ctx;
};

export default AppSettingsContext;
