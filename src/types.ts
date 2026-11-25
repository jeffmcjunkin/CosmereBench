export type Question = {
  id: string;
  world: string;
  book: string;
  category: string;
  prompt: string;
  answer: string;
  distractors: string[];
  explanation: string;
  sourceTitle: string;
  sourceUrl: string;
  options: string[];
  key: number;
  witnessModel?: string;
};
export type Card = Pick<
  Question,
  "id" | "world" | "book" | "prompt" | "options"
>;
export type RunAnswer = {
  text: string;
  correct: boolean;
  cost: number;
  promptTokens: number;
  completionTokens: number;
  estimated: boolean;
  finish: string;
  reviewNote?: string;
};
export type Run = {
  id: string;
  name: string;
  answers: Record<string, RunAnswer>;
};
export type Model = {
  id: string;
  name: string;
  correct: number;
  cost: number;
  byQuestion: Record<
    string,
    { right: boolean; cost: number; estimated?: boolean; blank?: boolean }
  >;
  estimated: boolean;
};
export type Source = Pick<
  Question,
  "id" | "book" | "world" | "prompt" | "sourceTitle" | "sourceUrl" | "category"
> & { witness?: { name: string; text: string } };
export type Pair = {
  a: string;
  b: string;
  phi: number | null;
  missed: string[];
  excess: number;
};
export type Analysis = {
  order: string[];
  pairs: Pair[];
  wording: Pair[];
  quotes: { id: string; curly: number; total: number }[];
  shared: {
    id: string;
    words: string[];
    a: string;
    b: string;
    ta: string;
    tb: string;
  }[];
};
export type Total = { answered: number; correct: number };
export type Stats = {
  mine: Record<string, boolean>;
  human: Record<string, Total>;
  readers: number;
  poolReady: boolean;
  qualifiedReaders?: number;
  readerAverage?: number | null;
  minForAverage?: number;
};
export type Reveal = {
  key: number;
  choice: number;
  correct: boolean;
  answer: string;
  explanation: string;
  sourceTitle: string;
  sourceUrl: string;
  category: string;
  models: {
    name: string;
    correct: boolean;
    text: string;
    reviewNote?: string;
  }[];
};
export type Protocol = {
  version: string;
  candidateQuestions?: number;
  firstPassTokens?: number;
  truncationRetryTokens?: number;
  finalTruncationRetryTokens?: number;
  primaryJudge?: string;
  secondaryJudge?: string;
  scoring?: string;
  removedQuestions?: Array<string | { id: string }>;
};
export type Archive = {
  edition: string;
  protocol: Protocol;
  questions: Question[];
  runs: Run[];
};
