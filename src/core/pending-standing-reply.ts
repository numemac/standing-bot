import { redis, scheduler } from '@devvit/web/server';

export const STANDING_REPLY_POLL_TASK = 'pollStandingReply';
export const STANDING_REPLY_POLL_INTERVAL_MS = 10_000;
export const STANDING_REPLY_MAX_AGE_MS = 8 * 60_000;

const STANDING_REPLY_RECORD_TTL_MS = 12 * 60_000;
const REDIS_KEY_PREFIX = 'standing-framework:pending:';

export type PendingStandingReply = {
  responseId: string;
  postId: `t3_${string}`;
  createdAt: number;
  pollAttempts: number;
};

function pendingReplyKey(responseId: string): string {
  return `${REDIS_KEY_PREFIX}${responseId}`;
}

function isPendingStandingReply(value: unknown): value is PendingStandingReply {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Partial<PendingStandingReply>;
  return (
    typeof record.responseId === 'string' &&
    typeof record.postId === 'string' &&
    record.postId.startsWith('t3_') &&
    typeof record.createdAt === 'number' &&
    Number.isFinite(record.createdAt) &&
    typeof record.pollAttempts === 'number' &&
    Number.isInteger(record.pollAttempts) &&
    record.pollAttempts >= 0
  );
}

export async function savePendingStandingReply(record: PendingStandingReply): Promise<void> {
  await redis.set(pendingReplyKey(record.responseId), JSON.stringify(record), {
    expiration: new Date(record.createdAt + STANDING_REPLY_RECORD_TTL_MS),
  });
}

export async function getPendingStandingReply(
  responseId: string
): Promise<PendingStandingReply | undefined> {
  const serialized = await redis.get(pendingReplyKey(responseId));
  if (!serialized) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (isPendingStandingReply(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.error('[standing-framework] Could not parse pending reply state.', {
      responseId,
      error,
    });
  }

  await deletePendingStandingReply(responseId);
  return undefined;
}

export async function deletePendingStandingReply(responseId: string): Promise<void> {
  await redis.del(pendingReplyKey(responseId));
}

export async function scheduleStandingReplyPoll(
  responseId: string,
  delayMs = STANDING_REPLY_POLL_INTERVAL_MS
): Promise<{ jobId: string; runAt: Date }> {
  const runAt = new Date(Date.now() + delayMs);
  const jobId = await scheduler.runJob({
    name: STANDING_REPLY_POLL_TASK,
    data: { responseId },
    runAt,
  });

  return { jobId, runAt };
}
