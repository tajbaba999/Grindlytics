import type { RawProblem } from "../../queues/process.queue.js";
import type { LeetCodeSyncResult } from "../../types/coding-profiles.js";

export type ChunkMetadata = {
  difficulty?: string;
  tags?: string[];
  lastSubmittedAt?: string;
};

export type Chunk = {
  id: string;
  text: string;
  type: "summary" | "problem";
  label: string;
  metadata: ChunkMetadata;
};

export function buildChunks(
  username: string,
  syncResult: LeetCodeSyncResult,
  problems: RawProblem[],
): Chunk[] {
  const chunks: Chunk[] = [];
  const { profile, contest, questionProgress, sessionProgress, skillStats, languageStats, calendar } = syncResult;

  // ── overall-summary ──
  const totalPct = profile.totalQuestions > 0
    ? ((profile.totalSolved / profile.totalQuestions) * 100).toFixed(1)
    : "0";
  chunks.push({
    id: "overall-summary",
    type: "summary",
    label: "Overall Profile Summary",
    metadata: {},
    text: [
      `LeetCode profile summary for ${username}:`,
      `Total solved: ${profile.totalSolved}/${profile.totalQuestions} (${totalPct}%)`,
      `Easy: ${profile.easySolved} solved`,
      `Medium: ${profile.mediumSolved} solved`,
      `Hard: ${profile.hardSolved} solved`,
      `Global ranking: #${profile.ranking}`,
      `Acceptance rate: ${profile.acceptanceRate.toFixed(1)}%`,
      `Current streak: ${calendar.streak} days`,
      `Total submissions: ${profile.totalSubmissions}`,
    ].join("\n"),
  });

  // ── skill chunks ──
  for (const level of ["advanced", "intermediate", "fundamental"] as const) {
    const tags = skillStats[level];
    const sorted = [...tags].sort((a, b) => a.problemsSolved - b.problemsSolved);
    const lines = tags.length === 0
      ? ["No problems solved in this category yet."]
      : sorted.map(t =>
          `- ${t.tagName}: ${t.problemsSolved} problems${t.problemsSolved <= 5 ? " ⚠ WEAK" : t.problemsSolved >= 50 ? " ✓ STRONG" : ""}`,
        );
    chunks.push({
      id: `skill-${level}`,
      type: "summary",
      label: `${level.charAt(0).toUpperCase() + level.slice(1)} Skill Topics`,
      metadata: {},
      text: [`${level.charAt(0).toUpperCase() + level.slice(1)} skill topics for ${username}:`, ...lines].join("\n"),
    });
  }

  // ── weakness-analysis ──
  const allTags = [
    ...skillStats.advanced.map(t => ({ ...t, level: "advanced" })),
    ...skillStats.intermediate.map(t => ({ ...t, level: "intermediate" })),
    ...skillStats.fundamental.map(t => ({ ...t, level: "fundamental" })),
  ].sort((a, b) => a.problemsSolved - b.problemsSolved);

  const weakest = allTags.slice(0, 10);
  const strongest = [...allTags].sort((a, b) => b.problemsSolved - a.problemsSolved).slice(0, 5);

  chunks.push({
    id: "weakness-analysis",
    type: "summary",
    label: "Weakness Analysis",
    metadata: {},
    text: [
      `Weakness analysis for ${username}:`,
      "",
      "PRIORITY FOCUS AREAS (fewest problems solved):",
      ...weakest.map(t => `- ${t.tagName} (${t.level}): ${t.problemsSolved} problems`),
      "",
      "STRONGEST AREAS:",
      ...strongest.map(t => `- ${t.tagName} (${t.level}): ${t.problemsSolved} problems`),
      "",
      `Recommendation: Focus on ${weakest.slice(0, 3).map(t => t.tagName).join(", ")} first.`,
    ].join("\n"),
  });

  // ── complete topic breakdown (all topics in one chunk for "each topic" queries) ──
  const totalByLevel = { advanced: 0, intermediate: 0, fundamental: 0 };
  for (const t of skillStats.advanced) totalByLevel.advanced += t.problemsSolved;
  for (const t of skillStats.intermediate) totalByLevel.intermediate += t.problemsSolved;
  for (const t of skillStats.fundamental) totalByLevel.fundamental += t.problemsSolved;
  const totalAllTopics = totalByLevel.advanced + totalByLevel.intermediate + totalByLevel.fundamental;

  chunks.push({
    id: "topic-complete-analysis",
    type: "summary",
    label: "Complete Topic Analysis",
    metadata: {},
    text: [
      `Complete topic-by-topic analysis for ${username}:`,
      `Total topics with problems: ${allTags.length} out of ${skillStats.advanced.length + skillStats.intermediate.length + skillStats.fundamental.length}`,
      `Total problems across all topics: ${totalAllTopics}`,
      "",
      `=== ADVANCED (${skillStats.advanced.length} topics, ${totalByLevel.advanced} total problems) ===`,
      ...[...skillStats.advanced].sort((a, b) => b.problemsSolved - a.problemsSolved).map(t => `  ${t.tagName}: ${t.problemsSolved}`),
      "",
      `=== INTERMEDIATE (${skillStats.intermediate.length} topics, ${totalByLevel.intermediate} total problems) ===`,
      ...[...skillStats.intermediate].sort((a, b) => b.problemsSolved - a.problemsSolved).map(t => `  ${t.tagName}: ${t.problemsSolved}`),
      "",
      `=== FUNDAMENTAL (${skillStats.fundamental.length} topics, ${totalByLevel.fundamental} total problems) ===`,
      ...[...skillStats.fundamental].sort((a, b) => b.problemsSolved - a.problemsSolved).map(t => `  ${t.tagName}: ${t.problemsSolved}`),
    ].join("\n"),
  });

  // ── language-stats ──
  const sortedLangs = [...languageStats].sort((a, b) => b.problemsSolved - a.problemsSolved);
  chunks.push({
    id: "language-stats",
    type: "summary",
    label: "Programming Languages",
    metadata: {},
    text: [
      `Programming languages used by ${username}:`,
      ...sortedLangs.map(l => `- ${l.languageName}: ${l.problemsSolved} problems`),
      `Primary language: ${sortedLangs[0]?.languageName ?? "unknown"}`,
    ].join("\n"),
  });

  // ── contest-summary ──
  chunks.push({
    id: "contest-summary",
    type: "summary",
    label: "Contest Summary",
    metadata: {},
    text: [
      `Contest statistics for ${username}:`,
      `Rating: ${contest.info.rating.toFixed(0)}`,
      `Global ranking: #${contest.info.globalRanking}/${contest.info.totalParticipants} (top ${contest.info.topPercentage}%)`,
      `Total contests attended: ${contest.info.attendedContestsCount}`,
      `Badge: ${contest.info.badge ?? "none"}`,
    ].join("\n"),
  });

  // ── contest-history ──
  const historyLines = contest.history.map((e) => {
    const date = new Date(e.contest.startTime * 1000).toISOString().split("T")[0];
    return `- ${e.contest.title} (${date}): solved ${e.problemsSolved}/${e.totalProblems}, rank #${e.ranking}, rating ${e.rating.toFixed(0)} (${e.trendDirection})`;
  });
  chunks.push({
    id: "contest-history",
    type: "summary",
    label: "Contest History",
    metadata: {},
    text: [
      `Contest history for ${username} (${contest.history.length} contests):`,
      ...historyLines,
    ].join("\n"),
  });

  // ── question-progress ──
  const acc = questionProgress.numAcceptedQuestions;
  const fail = questionProgress.numFailedQuestions;
  const untouched = questionProgress.numUntouchedQuestions;
  const beats = questionProgress.userSessionBeatsPercentage;
  chunks.push({
    id: "question-progress",
    type: "summary",
    label: "Question Progress",
    metadata: {},
    text: [
      `Question progress for ${username}:`,
      `Accepted — Easy: ${acc.find(x => x.difficulty === "EASY")?.count ?? 0} | Medium: ${acc.find(x => x.difficulty === "MEDIUM")?.count ?? 0} | Hard: ${acc.find(x => x.difficulty === "HARD")?.count ?? 0}`,
      `Failed   — Easy: ${fail.find(x => x.difficulty === "EASY")?.count ?? 0} | Medium: ${fail.find(x => x.difficulty === "MEDIUM")?.count ?? 0} | Hard: ${fail.find(x => x.difficulty === "HARD")?.count ?? 0}`,
      `Untouched — Easy: ${untouched.find(x => x.difficulty === "EASY")?.count ?? 0} | Medium: ${untouched.find(x => x.difficulty === "MEDIUM")?.count ?? 0} | Hard: ${untouched.find(x => x.difficulty === "HARD")?.count ?? 0}`,
      `Beats — Easy: ${beats.find(x => x.difficulty === "EASY")?.percentage ?? 0}% | Medium: ${beats.find(x => x.difficulty === "MEDIUM")?.percentage ?? 0}% | Hard: ${beats.find(x => x.difficulty === "HARD")?.percentage ?? 0}%`,
      `Overall beats: ${questionProgress.totalQuestionBeatsPercentage}%`,
    ].join("\n"),
  });

  // ── session-progress ──
  const allQ = sessionProgress.allQuestionsCount;
  const acSub = sessionProgress.acSubmissionNum;
  const totSub = sessionProgress.totalSubmissionNum;
  chunks.push({
    id: "session-progress",
    type: "summary",
    label: "Submission Statistics",
    metadata: {},
    text: [
      `Submission statistics for ${username}:`,
      `Total questions on LeetCode — All: ${allQ.find(x => x.difficulty === "All")?.count ?? 0} | Easy: ${allQ.find(x => x.difficulty === "Easy")?.count ?? 0} | Medium: ${allQ.find(x => x.difficulty === "Medium")?.count ?? 0} | Hard: ${allQ.find(x => x.difficulty === "Hard")?.count ?? 0}`,
      `Accepted (unique) — All: ${acSub.find(x => x.difficulty === "All")?.count ?? 0} | Easy: ${acSub.find(x => x.difficulty === "Easy")?.count ?? 0} | Medium: ${acSub.find(x => x.difficulty === "Medium")?.count ?? 0} | Hard: ${acSub.find(x => x.difficulty === "Hard")?.count ?? 0}`,
      `Total submissions — All: ${totSub.find(x => x.difficulty === "All")?.submissions ?? 0} | Easy: ${totSub.find(x => x.difficulty === "Easy")?.submissions ?? 0} | Medium: ${totSub.find(x => x.difficulty === "Medium")?.submissions ?? 0} | Hard: ${totSub.find(x => x.difficulty === "Hard")?.submissions ?? 0}`,
    ].join("\n"),
  });

  // ── calendar-activity ──
  const dccNames = calendar.dccBadges.map(b => b.badge.name).join(", ") || "none";

  // Compute per-year active days from submissionCalendar
  const yearActiveDays: Record<number, Set<string>> = {};
  for (const [ts, count] of Object.entries(calendar.submissionCalendar)) {
    if (count > 0) {
      const d = new Date(Number(ts) * 1000);
      const year = d.getFullYear();
      const dayStr = d.toISOString().split("T")[0];
      if (!yearActiveDays[year]) yearActiveDays[year] = new Set();
      yearActiveDays[year].add(dayStr);
    }
  }
  const perYearLines = Object.keys(yearActiveDays)
    .sort()
    .map(year => `  ${year}: ${yearActiveDays[Number(year)].size} active days`);

  chunks.push({
    id: "calendar-activity",
    type: "summary",
    label: "Activity Calendar",
    metadata: {},
    text: [
      `Activity calendar for ${username}:`,
      `Current streak: ${calendar.streak} days`,
      `Total active days (all time): ${calendar.totalActiveDays}`,
      `Active years: ${calendar.activeYears.join(", ")}`,
      `DCC badges earned: ${calendar.dccBadges.length} (${dccNames})`,
      "",
      "Active days per year:",
      ...perYearLines,
    ].join("\n"),
  });

  // ── recent-submissions ──
  if (profile.recentSubmissions.length > 0) {
    const recentLines = profile.recentSubmissions.map((s) => {
      const date = s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString().split("T")[0] : "unknown";
      return `- ${s.title} (${s.lang}) — ${s.statusDisplay} on ${date}`;
    });
    chunks.push({
      id: "recent-submissions",
      type: "summary",
      label: "Recent Submissions",
      metadata: {},
      text: [
        `Recent submissions for ${username} (last ${profile.recentSubmissions.length}):`,
        ...recentLines,
      ].join("\n"),
    });
  }

  // ── one chunk per solved problem ──
  for (const p of problems) {
    const tags = Array.isArray(p.topicTags)
      ? p.topicTags.map((t: { name: string }) => t.name).join(", ")
      : "";
    chunks.push({
      id: `problem-${p.titleSlug}`,
      type: "problem",
      label: `Problem: ${p.title}`,
      metadata: {
        difficulty: p.difficulty,
        tags: Array.isArray(p.topicTags) ? p.topicTags.map((t: { name: string }) => t.name) : [],
        lastSubmittedAt: p.lastSubmittedAt,
      },
      text: [
        `Problem: ${p.title}`,
        `Difficulty: ${p.difficulty}`,
        `Status: ${p.questionStatus} (${p.lastResult})`,
        `Topic tags: ${tags || "none"}`,
        `Last submitted: ${p.lastSubmittedAt}`,
        `Total attempts: ${p.numSubmitted}`,
        `Solved by: ${username}`,
      ].join("\n"),
    });
  }

  return chunks;
}
