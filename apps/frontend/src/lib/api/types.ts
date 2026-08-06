// Shapes returned by the LeetPulse backend (apps/backend). Kept permissive where
// the underlying LeetCode data is loosely typed on the server.

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type RefreshResponse = {
  accessToken: string;
};

export type UserProfile = {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type DifficultyCount = {
  difficulty: string;
  count: number;
};

export type SubmissionNum = {
  difficulty: string;
  count: number;
  submissions: number;
};

export type BeatsPercentage = {
  difficulty: string;
  percentage: number;
};

export type LanguageStat = {
  languageName: string;
  problemsSolved: number;
};

export type SkillTag = {
  tagName: string;
  tagSlug?: string;
  problemsSolved: number;
};

export type SkillStats = {
  fundamental: SkillTag[];
  intermediate: SkillTag[];
  advanced: SkillTag[];
};

export type QuestionProgress = {
  numAcceptedQuestions: DifficultyCount[];
  numFailedQuestions: DifficultyCount[];
  numUntouchedQuestions: DifficultyCount[];
  userSessionBeatsPercentage: BeatsPercentage[];
  totalQuestionBeatsPercentage: number;
};

export type SessionProgress = {
  allQuestionsCount: DifficultyCount[];
  acSubmissionNum: SubmissionNum[];
  totalSubmissionNum: SubmissionNum[];
};

export type LeetCodeStats = {
  username: string;
  totalSolved: number;
  totalQuestions: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  ranking: number;
  acceptanceRate: number;
  streak: number;
  attendedContestsCount: number;
  contestRating: number;
  contestGlobalRanking: number;
  contestTopPercentage: number;
  languageStats: LanguageStat[] | null;
  skillStats: SkillStats | null;
  questionProgress: QuestionProgress | null;
  sessionProgress: SessionProgress | null;
  updatedAt?: string;
};

export type CodingProfiles = {
  id: string;
  userId: string;
  leetcode: string | null;
};

export type CodingProfileResponse = {
  profiles: CodingProfiles;
  stats: { leetcode: LeetCodeStats | null };
  counts: { problems: number; contests: number };
};

export type TopicTag = {
  name: string;
  nameTranslated?: string;
  slug: string;
};

export type Question = {
  title: string;
  titleSlug: string;
  difficulty: string;
  lastResult: string | null;
  questionStatus: string | null;
  lastSubmittedAt: string | null;
  numSubmitted: number;
  topicTags: TopicTag[];
};

export type QuestionsResponse = {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  difficulty: string;
  tag: string;
  questions: Question[];
};

export type LeetCodeProgressResponse = {
  totalNum: number;
  skip: number;
  limit: number;
  hasMore: boolean;
  questions: Question[];
};

export type ActivityDay = {
  date: string;
  dayOfWeek: number;
  submissions: number;
  timestamp: number;
};

export type ActivityResponse = {
  username: string;
  activeYears: number[];
  totalActiveDays: number;
  streak: number;
  totalDaysActive: number;
  totalSubmissions: number;
  submissions: ActivityDay[];
};

export type HistorySnapshot = {
  id: string;
  snapshotAt: string;
  totalSolved: number;
  totalQuestions: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  ranking: number;
  acceptanceRate: number;
  streak: number;
  contestRating: number;
  contestGlobalRanking: number;
  contestTopPercentage: number;
  attendedContestsCount: number;
};

export type HistoryResponse = {
  snapshots: HistorySnapshot[];
  total: number;
};

export type SourceRef = {
  chunkId: string;
  label: string;
};

export type GroundingResult = {
  verified: number;
  invalid: number;
  total: number;
  cleanAnswer: string;
  fullyGrounded: boolean;
};

export type ConfidenceLevel = "high" | "medium" | "low" | "unavailable";

export type ConfidenceResult = {
  score: number | null;
  level: ConfidenceLevel;
  lowThreshold: number;
  highThreshold: number;
};

export type ChatResponse = {
  answer: string;
  sources: SourceRef[];
  grounding?: GroundingResult;
  confidence?: ConfidenceResult;
};

// SSE progress event shape emitted by initial-sync / sync.
export type SyncProgress = {
  stage: string;
  pct: number;
  msg: string;
};

export type SyncEvent =
  | { type: "progress"; data: SyncProgress }
  | { type: "completed"; data: SyncProgress }
  | { type: "error"; data: SyncProgress };

// Topic × difficulty matrix (curated topics only).
export type TopicMatrixEntry = { topic: string; easy: number; medium: number; hard: number };
export type TopicMatrix = TopicMatrixEntry[];
