import type { BossView, WrapUpResponse } from "@/lib/contracts/api";
import type { LevelInfo, UserSettings } from "@/lib/contracts/engine";
import type { MomentView } from "@/lib/contracts/moment";
import type { SessionSummary, StoryChapter } from "@/lib/contracts/session";
import type { XpAward } from "@/lib/contracts/stream";

export const LEVEL: LevelInfo = { level: 2, xp: 160, levelStartXp: 100, nextLevelXp: 250 };

export const SETTINGS: UserSettings = {
  sound: true,
  volume: 0.4,
  theme: "frost",
  soundPack: "soft-chimes",
  guardrails: { enabled: false, mode: "balanced" },
};

export const UNLOCKS = { themes: ["frost", "sunset"], soundPacks: ["soft-chimes", "marimba"] };

export const SESSIONS: SessionSummary[] = [
  { id: "s1", title: "Churn model", createdAt: Date.UTC(2026, 9, 17), status: "active" },
  { id: "s0", title: "Signup funnel SQL", createdAt: Date.UTC(2026, 9, 15), status: "wrapped" },
];

export const OPTIONS = [
  "Accuracy: it's the most common metric",
  "Recall: catch as many churners as we can",
  "Precision: only flag customers we're sure about",
  "F1: balance precision and recall",
];

const m = (over: Partial<MomentView>): MomentView => ({
  id: "m-decide",
  sessionId: "s1",
  type: "decide",
  concept: "metric choice",
  conceptCard: "With **15% churners**, a model can look accurate by predicting *nobody* churns. Other metrics focus on the minority class.",
  question: "Missing a churner costs more than a false alarm. Which metric should we optimize, and why?",
  status: "awaiting_answer",
  ...over,
});

export const XP10: XpAward = { amount: 10, reason: "correct", level: LEVEL };

export const MOMENT_STATES: { label: string; moment: MomentView; grading?: boolean; xp?: XpAward }[] = [
  { label: "Awaiting answer (with concept card)", moment: m({}) },
  { label: "Grading", moment: m({ conceptCard: undefined }), grading: true },
  { label: "Show options (no verdict yet)", moment: m({ id: "m2", conceptCard: undefined, mcOptions: OPTIONS }) },
  {
    label: "Not quite → options",
    moment: m({ id: "m3", conceptCard: undefined, answer: "accuracy, it's simplest", verdict: "incorrect", why: "Accuracy rewards the majority class, so it can look great while missing every churner.", mcOptions: OPTIONS }),
  },
  {
    label: "MC answered (picked a different option)",
    moment: m({ id: "m4", conceptCard: undefined, status: "answered", mcOptions: OPTIONS, mcChoice: 3, correctIndex: 1, verdict: "partial", why: "F1 is reasonable, but when misses are costly, recall says it most directly.", xp: 5 }),
  },
  {
    label: "MC answered (best option)",
    moment: m({ id: "m5", conceptCard: undefined, status: "answered", mcOptions: OPTIONS, mcChoice: 1, correctIndex: 1, verdict: "correct", why: "Recall measures how many churners we catch.", xp: 5 }),
  },
  {
    label: "Answered: correct",
    moment: m({ id: "m6", type: "explain_back", concept: "feature scaling", conceptCard: undefined, question: "In one sentence: why did we scale the features?", status: "answered", answer: "So features with big ranges don't dominate the model.", verdict: "correct", why: "Exactly. Logistic regression's penalty treats every coefficient the same, so scale matters." }),
    xp: XP10,
  },
  {
    label: "Answered: partial",
    moment: m({ id: "m7", type: "spot_issue", concept: "data leakage", conceptCard: undefined, question: "One of these columns would make the model look amazing but fail in production. Which, and why?", status: "answered", answer: "total_charges?", verdict: "partial", why: "Good instinct to look at billing, but `cancellation_request_date` is only filled in *after* a customer decides to leave.", xp: 5 }),
  },
  {
    label: "Answered: incorrect (no MC left)",
    moment: m({ id: "m8", type: "fill_gap", concept: "train/test split", conceptCard: undefined, question: "What value would you set for `test_size`?", status: "answered", answer: "0.9", verdict: "incorrect", why: "That leaves too little data to learn from. 0.2–0.3 is typical." }),
  },
  {
    label: "Predict: locked in",
    moment: m({ id: "m9", type: "predict", concept: "class imbalance", conceptCard: undefined, question: "If a model predicts *nobody* churns, what accuracy would it get?", status: "awaiting_prediction_result", answer: "about 85%" }),
  },
  { label: "Skipped", moment: m({ id: "m10", status: "skipped" }) },
  { label: "Deferred", moment: m({ id: "m11", status: "deferred" }) },
  { label: "Reported", moment: m({ id: "m12", status: "reported" }) },
];

export const BOSS: BossView = {
  id: "b1",
  name: "The Overfit Bug",
  ascii: "bug",
  intro: "It feeds on memorized training data. Answer well to shrink it!",
  hp: 3,
  maxHp: 3,
  momentIds: ["bq1", "bq2", "bq3"],
  currentMomentId: "bq1",
};

export const BOSS_MOMENT: MomentView = {
  id: "bq1",
  sessionId: "s1",
  type: "boss",
  bossId: "b1",
  concept: "overfitting",
  question: "Train recall is 0.98 and test recall is 0.52. What's happening, and what's your first fix?",
  status: "awaiting_answer",
};

export const CHAPTER: StoryChapter = {
  id: "c1",
  trigger: "boss:b1",
  title: "Chapter 2: The Lighthouse Ledger",
  text: "The lighthouse keeper squinted at the ledger. Fifteen ships in a hundred never came back, and for years she had simply written *all safe* at the bottom of each page.\n\nTonight was different. With the Overfit Bug driven back into the fog, the numbers finally told the truth: the ships most likely to vanish were the newest ones, on the shortest contracts.",
  summary: "The keeper learns to read the ledger honestly.",
  createdAt: Date.UTC(2026, 9, 17),
};

export const WRAPUP: WrapUpResponse = {
  deferred: [
    {
      id: "d1",
      sessionId: "s1",
      type: "explain_back",
      concept: "precision vs. recall",
      question: "In your own words: when would you prefer precision over recall?",
      status: "deferred",
    },
  ],
  codex: [
    { concept: "class imbalance", summary: "Accuracy hides a 15% minority class.", result: "strong" },
    { concept: "metric choice", summary: "Recall when missing a positive is costly.", result: "growing" },
    { concept: "data leakage", summary: "Columns filled after the outcome leak the answer.", result: "review" },
  ],
  sessionXp: 165,
  user: { xp: 265, level: { level: 3, xp: 265, levelStartXp: 250, nextLevelXp: 450 }, unlocks: UNLOCKS, settings: SETTINGS },
  chapter: CHAPTER,
  suggestions: ["Tune the decision threshold for recall", "Try a gradient-boosted model", "Explain the model to a stakeholder"],
  levelUps: [{ from: 2, to: 3, rewards: [{ level: 3, kind: "sound_pack", id: "marimba", label: "Marimba sound pack" }] }],
};

export const ASSISTANT_MD = `Loaded **churn.csv**: 5,000 rows and 12 columns. About **15%** of customers churned.

| column | type | missing |
|---|---|---|
| tenure_months | int | 0 |
| total_charges | float | 52 |

Next I'll split the data with \`train_test_split\`:

\`\`\`python
X_train, X_test, y_train, y_test = train_test_split(X, y, stratify=y, test_size=0.2)
\`\`\`

<script>alert("raw HTML is skipped")</script>`;

export const CODE = `import pandas as pd
df = pd.read_csv("/files/churn.csv")
print(df.shape)
print(df["churned"].mean())
for c in df.columns:
    print(c, df[c].dtype)`;

export const STDOUT = ["(5000, 12)", "0.1514", ...Array.from({ length: 14 }, (_, i) => `col_${i} int64`)].join("\n");
