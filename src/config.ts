/** Product identity. Rename the app by changing this single constant. */
export const APP = {
  name: "GridCast",
  tagline: "Upload once. Cast everywhere.",
} as const;

export const AI_MODELS = {
  fast: "claude-haiku-5-5", // titles, hashtags, repetitive tasks
  planner: "claude-sonnet-5-5", // planning agent
} as const;

/** Retry policy for failed publishes. */
export const PUBLISH_RETRY = { maxAttempts: 3, backoffMinutes: [5, 20, 60] } as const;

/** How far ahead the automatic queue fills slots. */
export const QUEUE_HORIZON_DAYS = 60;
