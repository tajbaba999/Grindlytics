// ── Helper: reconstruct LeetCodeSyncResult from Postgres rows ──
import type { LeetCodeContestHistory, LeetCodeStats } from "@prisma/client";

import Express from "express";

import type { ProcessJobData } from "../../queues/process.queue.js";
import type { LeetCodeSyncResult } from "../../types/coding-profiles.js";

import prisma from "@leetplus/db";
import { chat, chatStream } from "../../services/rag/chat.js";
import type { ChunkQueryFilter } from "../../services/rag/chroma.js";
import { ingestRag } from "../../services/rag/ingest.js";

const router = Express.Router();

// POST /api/v1/rag/ingest
// Reads from Postgres — does not re-fetch LeetCode
router.post("/ingest", async (req, res) => {
  const user = req.user;
  if (!user)
    return res.status(401).json({ message: "Unauthorized" });

  try {
    const [profile, codingProfile, problems, contestHistory] = await Promise.all([
      prisma.leetCodeStats.findUnique({ where: { userId: user.userId } }),
      prisma.codingProfiles.findUnique({ where: { userId: user.userId } }),
      prisma.leetCodeProblem.findMany({ where: { userId: user.userId } }),
      prisma.leetCodeContestHistory.findMany({ where: { userId: user.userId } }),
    ]);

    if (!profile || !codingProfile?.leetcode) {
      return res.status(404).json({ message: "LeetCode profile not synced yet. Run a sync first." });
    }

    // Reconstruct syncResult from Postgres data
    const syncResult = reconstructSyncResult(profile, contestHistory);
    const rawProblems: ProcessJobData["problems"] = problems.map(p => ({
      titleSlug: p.titleSlug,
      title: p.title,
      difficulty: p.difficulty,
      questionStatus: p.questionStatus,
      lastResult: p.lastResult,
      lastSubmittedAt: p.lastSubmittedAt,
      numSubmitted: p.numSubmitted,
      topicTags: p.topicTags as Array<{ name: string; nameTranslated: string; slug: string }>,
    }));

    const result = await ingestRag(user.userId, codingProfile.leetcode, syncResult, rawProblems);
    res.status(200).json({ message: "RAG ingest complete", ...result });
  }
  catch (ex) {
    const msg = ex instanceof Error ? ex.message : String(ex);
    req.log.error({ err: msg }, "RAG ingest failed");
    res.status(500).json({ message: "RAG ingest failed", error: msg });
  }
});

// POST /api/v1/rag/chat
// Body: { question: string, filter?: { type?, difficulty?, tag? } }
router.post("/chat", async (req, res) => {
  const user = req.user;
  if (!user)
    return res.status(401).json({ message: "Unauthorized" });

  const { question, filter } = req.body as { question?: string; filter?: ChunkQueryFilter };
  if (!question?.trim()) {
    return res.status(400).json({ message: "question is required" });
  }

  try {
    const codingProfile = await prisma.codingProfiles.findUnique({ where: { userId: user.userId } });
    if (!codingProfile?.leetcode) {
      return res.status(404).json({ message: "LeetCode profile not linked" });
    }

    const result = await chat(user.userId, codingProfile.leetcode, question, filter);
    res.status(200).json(result);
  }
  catch (ex) {
    const msg = ex instanceof Error ? ex.message : String(ex);
    req.log.error({ err: msg }, "RAG chat failed");
    res.status(500).json({ message: "RAG chat failed", error: msg });
  }
});

// POST /api/v1/rag/chat/stream
// Body: { question: string, filter?: { type?, difficulty?, tag? } } — returns SSE stream
router.post("/chat/stream", async (req, res) => {
  const user = req.user;
  if (!user)
    return res.status(401).json({ message: "Unauthorized" });

  const { question, filter } = req.body as { question?: string; filter?: ChunkQueryFilter };
  if (!question?.trim()) {
    return res.status(400).json({ message: "question is required" });
  }

  try {
    const codingProfile = await prisma.codingProfiles.findUnique({ where: { userId: user.userId } });
    if (!codingProfile?.leetcode) {
      return res.status(404).json({ message: "LeetCode profile not linked" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const stream = chatStream(user.userId, codingProfile.leetcode, question, filter);
    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    res.end();
  }
  catch (ex) {
    const msg = ex instanceof Error ? ex.message : String(ex);
    req.log.error({ err: msg }, "RAG chat stream failed");
    res.write(`data: ${JSON.stringify({ type: "error", content: msg })}\n\n`);
    res.end();
  }
});

function reconstructSyncResult(
  stats: LeetCodeStats,
  contestHistory: LeetCodeContestHistory[],
): LeetCodeSyncResult {
  const skillStats = (stats.skillStats ?? { fundamental: [], intermediate: [], advanced: [] }) as LeetCodeSyncResult["skillStats"];
  const languageStats = (stats.languageStats ?? []) as LeetCodeSyncResult["languageStats"];
  const questionProgress = (stats.questionProgress ?? {
    numAcceptedQuestions: [],
    numFailedQuestions: [],
    numUntouchedQuestions: [],
    userSessionBeatsPercentage: [],
    totalQuestionBeatsPercentage: 0,
  }) as LeetCodeSyncResult["questionProgress"];
  const calendarData = (stats.calendarData ?? {}) as {
    activeYears?: number[];
    totalActiveDays?: number;
    submissionCalendar?: Record<string, number>;
  };
  const sessionProgress = (stats.sessionProgress ?? {
    allQuestionsCount: [],
    acSubmissionNum: [],
    totalSubmissionNum: [],
  }) as LeetCodeSyncResult["sessionProgress"];

  return {
    profile: {
      username: stats.username,
      totalSolved: stats.totalSolved,
      totalQuestions: stats.totalQuestions,
      easySolved: stats.easySolved,
      mediumSolved: stats.mediumSolved,
      hardSolved: stats.hardSolved,
      ranking: stats.ranking,
      acceptanceRate: stats.acceptanceRate,
      streak: stats.streak,
      totalSubmissions: 0,
      recentSubmissions: (stats.recentSubmissions ?? []) as LeetCodeSyncResult["profile"]["recentSubmissions"],
    },
    contest: {
      info: {
        attendedContestsCount: stats.attendedContestsCount,
        rating: stats.contestRating,
        globalRanking: stats.contestGlobalRanking,
        totalParticipants: 0,
        topPercentage: stats.contestTopPercentage,
        badge: null,
      },
      history: contestHistory.map(e => ({
        attended: e.attended,
        rating: e.rating,
        ranking: e.ranking,
        trendDirection: e.trendDirection,
        problemsSolved: e.problemsSolved,
        totalProblems: e.totalProblems,
        finishTimeInSeconds: e.finishTimeInSeconds,
        contest: { title: e.contestTitle, startTime: e.startTime },
      })),
    },
    questionProgress,
    sessionProgress,
    skillStats,
    languageStats,
    calendar: {
      activeYears: calendarData.activeYears ?? [],
      streak: stats.streak,
      totalActiveDays: calendarData.totalActiveDays ?? 0,
      dccBadges: [],
      submissionCalendar: calendarData.submissionCalendar ?? {},
    },
  };
}

export default router;
