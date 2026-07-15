import { Hono } from 'hono';
import type { TaskRequest, TaskResponse } from '@devvit/web/server';
import { reddit } from '@devvit/web/server';
import {
  deletePendingStandingReply,
  getPendingStandingReply,
  savePendingStandingReply,
  scheduleStandingReplyPoll,
  STANDING_REPLY_MAX_AGE_MS,
  STANDING_REPLY_POLL_TASK,
  type PendingStandingReply,
} from '../core/pending-standing-reply';
import { retrieveStandingReply } from '../core/standing-framework';

export const tasks = new Hono();

type StandingReplyPollData = {
  responseId: string;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function reschedulePoll(record: PendingStandingReply): Promise<void> {
  await savePendingStandingReply(record);
  const scheduled = await scheduleStandingReplyPoll(record.responseId);

  console.info('[standing-framework] Scheduled another response poll.', {
    responseId: record.responseId,
    postId: record.postId,
    pollAttempt: record.pollAttempts,
    jobId: scheduled.jobId,
    runAt: scheduled.runAt.toISOString(),
  });
}

async function abandonExpiredReply(record: PendingStandingReply): Promise<void> {
  await deletePendingStandingReply(record.responseId);
  console.error('[standing-framework] Background response polling expired.', {
    responseId: record.responseId,
    postId: record.postId,
    pollAttempts: record.pollAttempts,
    ageMs: Date.now() - record.createdAt,
  });
}

async function pollStandingReply(responseId: string): Promise<void> {
  const record = await getPendingStandingReply(responseId);
  if (!record) {
    console.warn('[standing-framework] Ignoring a poll with no pending state.', { responseId });
    return;
  }

  const ageMs = Date.now() - record.createdAt;
  if (ageMs >= STANDING_REPLY_MAX_AGE_MS) {
    await abandonExpiredReply(record);
    return;
  }

  const nextRecord: PendingStandingReply = {
    ...record,
    pollAttempts: record.pollAttempts + 1,
  };

  console.info('[standing-framework] Polling background response.', {
    responseId,
    postId: record.postId,
    pollAttempt: nextRecord.pollAttempts,
    ageMs,
  });

  let result;
  try {
    result = await retrieveStandingReply(responseId);
  } catch (error) {
    console.error('[standing-framework] Response retrieval failed; it will be retried.', {
      responseId,
      postId: record.postId,
      pollAttempt: nextRecord.pollAttempts,
      error: getErrorMessage(error),
    });
    await reschedulePoll(nextRecord);
    return;
  }

  console.info('[standing-framework] Background response status received.', {
    responseId,
    postId: record.postId,
    pollAttempt: nextRecord.pollAttempts,
    status: result.status,
  });

  if (result.status === 'queued' || result.status === 'in_progress') {
    await reschedulePoll(nextRecord);
    return;
  }

  if (result.status !== 'completed') {
    await deletePendingStandingReply(responseId);
    console.error('[standing-framework] Background response did not complete.', {
      responseId,
      postId: record.postId,
      status: result.status,
      error: 'error' in result ? result.error : 'Response stopped before completion.',
    });
    return;
  }

  console.info('[standing-framework] Background response completed.', {
    responseId,
    postId: record.postId,
    commentCharacters: result.reply.length,
  });

  try {
    const comment = await reddit.submitComment({
      id: record.postId,
      text: result.reply,
      runAs: 'APP',
    });

    // Delete the pending record as soon as Reddit accepts the comment. If a later
    // distinguish request fails, retrying the whole job could create a duplicate.
    await deletePendingStandingReply(responseId);
    console.info('[standing-framework] Standing Framework comment posted.', {
      responseId,
      postId: record.postId,
      commentId: comment.id,
    });

    try {
      await comment.distinguish(false);
      console.info('[standing-framework] Standing Framework comment distinguished.', {
        responseId,
        postId: record.postId,
        commentId: comment.id,
      });
    } catch (error) {
      console.warn('[standing-framework] Comment posted but could not be distinguished.', {
        responseId,
        postId: record.postId,
        commentId: comment.id,
        error: getErrorMessage(error),
      });
    }
  } catch (error) {
    // Do not automatically retry an ambiguous Reddit write: if Reddit accepted the
    // first request before the connection failed, a retry could create a duplicate.
    await deletePendingStandingReply(responseId);
    console.error('[standing-framework] Could not post the completed response.', {
      responseId,
      postId: record.postId,
      error: getErrorMessage(error),
    });
  }
}

tasks.post('/poll-standing-reply', async (c) => {
  const request = await c.req.json<TaskRequest<StandingReplyPollData>>();
  const responseId = request.data?.responseId;

  if (request.name !== STANDING_REPLY_POLL_TASK || !responseId) {
    console.error('[standing-framework] Received an invalid scheduled task.', {
      taskName: request.name,
      hasResponseId: Boolean(responseId),
    });
    return c.json<TaskResponse>({}, 200);
  }

  await pollStandingReply(responseId);
  return c.json<TaskResponse>({}, 200);
});
