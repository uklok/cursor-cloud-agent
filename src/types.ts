export type EnvType = "cloud" | "pool" | "machine";
export type AuthScheme = "basic" | "bearer";
export type ConversationMode = "agent" | "plan";

export type EnvRecord = {
  type: EnvType;
  name: string;
  allowRepos?: string[];
  workdirRule?: string;
  skillsPath?: string;
  note?: string;
};

export type WatchConfig = {
  pollIntervalMs: number;
  timeoutMs: number;
  maxPollIntervalMs: number;
  notifyCommand?: string;
};

export type PluginConfig = {
  apiBaseUrl?: string;
  authScheme?: AuthScheme;
  apiKeyEnv?: string;
  defaultEnv?: string;
  envs?: Record<string, EnvRecord>;
  allowReposOnLaunch?: boolean;
  watch?: Partial<WatchConfig>;
  ledgerPath?: string;
};

export type ResolvedConfig = {
  apiBaseUrl: string;
  authScheme: AuthScheme;
  apiKeyEnv: string;
  defaultEnv?: string;
  envs: Record<string, EnvRecord>;
  allowReposOnLaunch: boolean;
  watch: WatchConfig;
  ledgerPath?: string;
};

export type PromptImage = {
  data?: string;
  url?: string;
  mimeType?: string;
};

export type CreateAgentRequest = {
  prompt: { text: string; images?: PromptImage[] };
  model?: { id: string; params?: Array<{ id: string; value: string }> };
  name?: string;
  env?: { type: EnvType; name?: string };
  repos?: Array<{ url: string; startingRef?: string; prUrl?: string }>;
  workOnCurrentBranch?: boolean;
  autoCreatePR?: boolean;
  skipReviewerRequest?: boolean;
  mode?: ConversationMode;
  agentId?: string;
};

export type CreateRunRequest = {
  prompt: { text: string; images?: PromptImage[] };
  mode?: ConversationMode;
};

export type AgentRecord = {
  id: string;
  name?: string;
  status?: string;
  env?: { type?: string; name?: string };
  url?: string;
  createdAt?: string;
  updatedAt?: string;
  latestRunId?: string;
  repos?: Array<{ url?: string; startingRef?: string; prUrl?: string }>;
};

export type GitBranch = {
  repoUrl?: string;
  branch?: string;
  prUrl?: string;
};

export type RunRecord = {
  id: string;
  agentId?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  durationMs?: number;
  result?: string;
  git?: { branches?: GitBranch[] };
};

export type CreateAgentResponse = {
  agent: AgentRecord & { latestRunId?: string };
  run: RunRecord;
};

export type CreateRunResponse = {
  run: RunRecord;
};

export const TERMINAL_RUN_STATUSES = Object.freeze([
  "FINISHED",
  "ERROR",
  "CANCELLED",
  "EXPIRED",
] as const);

export type TerminalRunStatus = (typeof TERMINAL_RUN_STATUSES)[number];

export function isTerminalRunStatus(value: string | undefined): value is TerminalRunStatus {
  return value !== undefined && (TERMINAL_RUN_STATUSES as readonly string[]).includes(value);
}
