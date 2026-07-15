import { Hono } from 'hono';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';

export const menu = new Hono();

function createApplyForm(postId: string) {
  return {
    fields: [
      {
        type: 'string' as const,
        name: 'postId',
        label: 'Selected post',
        defaultValue: postId,
        disabled: true,
      },
    ],
    title: 'Apply Standing Framework',
    description:
      'Generate a Standing and Answerability Ethics analysis of this post and publish it as a reply.',
    acceptLabel: 'Apply',
    cancelLabel: 'Cancel',
  };
}

menu.post('/apply-standing-framework', async (c) => {
  const request = await c.req.json<MenuItemRequest>();

  if (request.location !== 'post' || !request.targetId.startsWith('t3_')) {
    return c.json<UiResponse>({ showToast: 'This action is only available on posts.' }, 200);
  }

  return c.json<UiResponse>(
    {
      showForm: {
        name: 'applyStandingFramework',
        form: createApplyForm(request.targetId),
      },
    },
    200
  );
});
