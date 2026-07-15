# Standing Framework Bot

Standing Framework Bot is a moderator-invoked Devvit app that applies [Standing and Answerability Ethics](https://nume.ca/wiki/Standing-and-Answerability-Ethics) to a selected Reddit post. It sends the post title and body, purpose-built response instructions, and the complete local framework corpus to OpenAI, then publishes the resulting Reddit-Markdown analysis as a distinguished app comment.

The app adds **Apply Standing Framework** to the moderator menu on posts. Selecting it opens a confirmation form with **Apply** and **Cancel**. Nothing is generated unless a moderator deliberately chooses **Apply**.

## Why use this bot?

The framework corpus is large—currently about 542 KB—and its conclusions depend on distinctions involving standing, claims, scope, answerability, doctrinal status, and contested premises. Applying it carefully in an active discussion can therefore require substantially more reading and cross-referencing than a moderator can reasonably do for every post.

This bot gives moderators a selective way to:

- introduce the framework through a useful analysis of a question someone actually asked, rather than through a generic advertisement;
- draw on the full corpus while keeping replies organized around the smallest set of concepts relevant to the post;
- explain inferential bridges, limits, disputed premises, and differences between the framework's canonical claims and Nume's optional positions;
- link readers directly to the relevant pages on `nume.ca`; and
- retain human control over where the framework appears. The app does not monitor the feed, choose targets, or comment autonomously.

It is most useful when a post raises a moral, political, relational, or practical question for which the framework offers genuine explanatory leverage. Its purpose is responsible exposure by demonstration: readers should encounter the framework as an inspectable, contestable lens that helps with the issue in front of them, not as moderator policy, community consensus, or a demand for agreement.

## How it works

1. A moderator opens a post's moderation menu and chooses **Apply Standing Framework**.
2. The app displays a native confirmation form. **Cancel** closes it; **Apply** authorizes eventual publication.
3. The app fetches the selected post's title and body along with the current community's public sidebar description.
4. It starts an OpenAI Responses API request in background mode with that discussion material, the response instructions, and `standing-framework-full.txt`.
5. It stores the OpenAI response ID and minimal job metadata in Devvit Redis, then uses scheduled jobs to poll for completion.
6. It validates the completed reply, converts relative Nume wiki links to canonical absolute links, and posts the reply as the app.
7. It attempts to distinguish the posted comment.

Generation is asynchronous so the large request does not have to finish within the original Devvit form request. The moderator receives a toast when the job has been queued; the comment appears later if generation and publication succeed.

## Response design

The prompt is designed to promote the framework through accurate, useful application rather than conversion pressure. Among other things, it instructs the model to:

- answer the poster's actual question first and make the opening understandable without relying on the title for missing referents;
- use definitions and positions supplied by the post or community description as the working conversational baseline without silently narrowing them;
- identify whether the post asks for a connection, distinction, implication, objection, evaluation, explanation, or practical direction;
- explain the requested kind of relationship directly, placing positive relevance before formal non-entailment and analyzing each direction separately when needed;
- introduce the linked full name of the framework naturally, disclose that it is a contestable lens, and explain why it is relevant to this case;
- center the single framework application that best answers the post, adding dependencies or other concepts only when they support a distinct necessary conclusion;
- remove sentences that merely display corpus coverage, repeat the opening, or introduce adjacent causes and domains;
- make important premises and inferential bridges explicit, including what survives when a connecting premise is rejected;
- separate contradiction from tension, shared outcomes from shared justification, and personal choice from relationships, institutions, public policy, and enforcement;
- identify a claim's holder, addressee, relational ground, and scope before describing something as owed;
- distinguish foundational, derived, defended, proposed, optional, open, and empirical claims internally, surfacing that bookkeeping only when it materially affects the answer;
- keep external factual claims separate from what the supplied corpus establishes, qualify uncertainty, and avoid inventing facts about the poster or the world;
- present a relevant objection or refusal point at the same level of detail as the favored analysis, but only when it materially affects the answer;
- apply the framework's advocacy constraints to its own promotion by avoiding shame, purity tests, pressure, capture, manufactured endorsement, and verdicts on people's lives;
- link materially used concepts to canonical `https://nume.ca/wiki/...` pages without inventing pages; and
- prioritize a brief, compassionate safety response over framework promotion if a post indicates imminent self-harm, suicide, or danger to others.

Replies are self-contained, Reddit-compatible Markdown. An ordinary focused answer targets roughly 200–400 words, although shorter answers are welcome and genuinely complex or multipart posts may justify more. The hard prompt limit remains 9,500 characters to leave room below Reddit's 10,000-character comment limit.

## Moderation model and limitations

Choosing **Apply** is approval to publish, not a request for a private draft. There is currently no preview, edit, cancellation, or second approval step after the job is queued. Moderators should review the public comment after it appears and remove it if it is inaccurate, irrelevant, or unsuitable for the discussion.

The model can still make mistakes. It receives the post title and body, the community's public sidebar description, the response instructions, and the bundled corpus; it is not separately given the subreddit name or live web access. The description may itself contain identifying text. It is marked as untrusted context for interpreting local terminology and scope, not as an instruction or proof of community consensus. The prompt requires uncertain external claims to be qualified, but the app should not be treated as a factual authority, a complete moral theory, or a substitute for moderator judgment.

Other current operational limits:

- Applying the action more than once can queue more than one comment; there is no per-post deduplication lock.
- Polling stops eight minutes after a response is created, and pending Redis records expire after twelve minutes.
- OpenAI retrieval failures are retried while the job remains active.
- An ambiguous Reddit comment-write failure is not retried because Reddit may have accepted the first write, and retrying could create a duplicate.
- A comment can be published even if the subsequent distinguish request fails.
- Failures after the initial form request are visible in server logs, not in the original toast.

Use the action selectively. It is a poor fit for posts where the framework has no material bearing, where automated publication would intrude on a sensitive exchange, or where a high-stakes factual or personal judgment requires human review before publication.

## Requirements

- Node.js 22.2 or later
- A Reddit developer account with permission to install the app in the target subreddit
- An OpenAI API key
- An OpenAI model with enough context for the roughly 542 KB corpus; the configured default is `gpt-5.6`

## Setup

Install dependencies and log in to Devvit:

```bash
npm install
npm run login
```

Set the development subreddit in `devvit.json` if needed, then start a playtest:

```bash
npm run dev
```

After the app is installed, open its subreddit installation page:

```text
https://developers.reddit.com/r/SUBREDDIT_NAME/apps/APP_NAME
```

Configure these installation settings:

- **OpenAI API Key** (`openaiApiKey`) — required
- **OpenAI model** (`openaiModel`) — optional; defaults to `gpt-5.6`

These are subreddit-scoped installation settings, so each installed subreddit can use its own key and model. The `devvit settings set` CLI command manages global app-scope settings and should not be used for these two fields.

Open a post's moderator menu, choose **Apply Standing Framework**, and select **Apply** to test the complete flow. Check the playtest console if the queued comment does not appear.

## OpenAI and data handling

The app uses the installed `openai` Node package and the Responses API. It creates responses with background processing enabled, standard reasoning mode, high reasoning effort, medium text verbosity, the default service tier, and a 12,000-token maximum output budget. The character limit is checked before Reddit publication even though the token budget is higher.

For each invocation, the following are transmitted to OpenAI:

- the selected post's title and body;
- the current community's public sidebar description;
- the response instructions; and
- the complete bundled framework corpus.

The subreddit name is not sent as a separate field, although the public description may identify the community. The moderator identity and API key are not included in the model input. Background mode requires OpenAI to retain response data temporarily so it can be retrieved later. Do not deploy the app where this processing is incompatible with the community's expectations or moderation practices.

Devvit Redis stores only the OpenAI response ID, Reddit post ID, creation time, and poll count. It does not store the post content, community description, framework corpus, or generated reply. Reddit and OpenAI may separately handle data according to their respective services and account settings.

Devvit's current subreddit-setting schema does not support secret settings. As a result, `openaiApiKey` cannot be marked secret in this app configuration. Give installation access only to trusted moderators and use a separately scoped, revocable API key for each deployment.

## Console logging

The server emits `[standing-framework]` lifecycle logs for:

- the moderator request and selected post lookup;
- OpenAI background-response creation;
- Redis persistence and scheduled job IDs;
- every poll attempt and response status;
- completion length, Reddit comment ID, and distinguishing; and
- retrieval, generation, publication, and scheduling failures.

Logs deliberately omit the API key, community description, framework corpus, post title and body, and generated comment text. Because the work completes outside the original form request, these logs are the primary way to diagnose a queued reply that never appears.

## Commands

- `npm run dev` — start a Devvit playtest
- `npm run build` — build the server bundle
- `npm run type-check` — type-check the app
- `npm run lint` — lint the TypeScript source
- `npm run deploy` — type-check, lint, and upload the app
- `npm run launch` — deploy and publish the app
- `npm run prettier` — format the project

## Project layout

- `src/routes/menu.ts` — moderator-menu action and Apply/Cancel form
- `src/routes/forms.ts` — selected-post retrieval and background-generation queueing
- `src/routes/tasks.ts` — background-response polling and Reddit publication
- `src/core/pending-standing-reply.ts` — Redis state, expiration, and scheduler helpers
- `src/core/standing-framework.ts` — OpenAI requests, response prompt, validation, and Nume link normalization
- `standing-framework-full.txt` — complete framework corpus included with every generation request
- `devvit.json` — menu, form, scheduled task, subreddit settings, and permissions
