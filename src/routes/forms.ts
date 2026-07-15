import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, reddit } from '@devvit/web/server';
import {
  deletePendingStandingReply,
  savePendingStandingReply,
  scheduleStandingReplyPoll,
} from '../core/pending-standing-reply';
import { queueStandingReply } from '../core/standing-framework';

export const forms = new Hono();

function isPostId(value: string | undefined): value is `t3_${string}` {
  return value?.startsWith('t3_') ?? false;
}

forms.post('/apply-standing-framework', async (c) => {
  const formValues = await c.req.json<{ postId?: string }>();

  const postId = formValues.postId || context.postId;
  if (!isPostId(postId)) {
    return c.json<UiResponse>(
      { showToast: 'Could not identify the selected post.' },
      200
    );
  }

  try {
    console.info(
      '[standing-framework] Moderator requested a framework reply.',
      { postId }
    );

    const [post, subreddit] = await Promise.all([
      reddit.getPostById(postId),
      reddit.getCurrentSubreddit(),
    ]);
    const communityDescription = subreddit.description?.trim();
    console.info(
      '[standing-framework] Selected post loaded; creating background response.',
      {
        postId,
        hasCommunityDescription: Boolean(communityDescription),
      }
    );

    const queued = await queueStandingReply({
      title: post.title,
      body: post.body ?? '',
      subredditName: subreddit.name,
      ...(communityDescription ? { communityDescription } : {}),
    });
    console.info('[standing-framework] OpenAI background response created.', {
      responseId: queued.responseId,
      postId,
      model: queued.model,
      status: queued.status,
    });

    await savePendingStandingReply({
      responseId: queued.responseId,
      postId,
      createdAt: Date.now(),
      pollAttempts: 0,
    });
    console.info('[standing-framework] Pending response state stored.', {
      responseId: queued.responseId,
      postId,
    });

    try {
      const scheduled = await scheduleStandingReplyPoll(
        queued.responseId,
        queued.status === 'completed' ? 1_000 : undefined
      );
      console.info('[standing-framework] Initial response poll scheduled.', {
        responseId: queued.responseId,
        postId,
        jobId: scheduled.jobId,
        runAt: scheduled.runAt.toISOString(),
      });
    } catch (error) {
      await deletePendingStandingReply(queued.responseId);
      throw error;
    }

    return c.json<UiResponse>(
      {
        showToast: {
          text: 'Standing Framework reply queued. It will be posted when ready.',
          appearance: 'success',
        },
      },
      200
    );
  } catch (error) {
    console.error('Could not apply the Standing Framework.', error);
    return c.json<UiResponse>(
      {
        showToast:
          'Could not queue the Standing Framework reply. Please try again.',
      },
      200
    );
  }
});
