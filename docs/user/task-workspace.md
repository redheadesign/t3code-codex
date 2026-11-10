# Task workspace

The Tasks workspace contains a local board for each project and a separate Jira workflow for
projects that use Jira.

## Work with local tasks

Open **Tasks** from the workspace rail and select a project. Its existing chats appear on the
board. Create a backlog card to plan work before starting a conversation. When you are ready,
use **Start chat** from the card; its description, dependencies, comments and activity stay
attached. The chat menu links back to the card.

Move cards between statuses or change a status from the task details. Completing a task archives
its linked chat. Reopening it restores the chat. Use the project **Wiki** to record decisions,
conventions, useful references and how to check the work.

### Turn ideas into tasks

Choose an agent above the board and send your ideas. T3 Code keeps these requests in a separate
project chat. The agent can add backlog cards, update existing tasks and leave comments.

Open a task to link a Canvas document, a project file or a URL. The task keeps its original brief
and shows recorded runs, branch changes and agent handoffs from its linked chat.

New comments from the board can be sent to the task chat. Use the play button to send pending
feedback in a batch. If the chat is working, the message joins its queue. The task shows which
comments have been sent and which the agent or a user has marked as processed.

## Coordinate agents

Ask an agent to review the board, pick an available task and claim it before editing. Claims
prevent two agents from taking the same task. Mark prerequisites as blockers. Use separate Git
worktrees when several agents edit code at the same time.

To hand off a task, comment with what changed, which checks passed and what remains, then release
the claim. The next agent can continue in its linked chat or claim it from another chat. Record
discoveries outside the current scope as backlog cards.

T3 Code tells agents about the board in their startup context. Agents use `t3_task_board` to
read the wiki, current task and other project work, and `t3_task_update` to change the board.
Ask for a project summary to see what's done, what's blocked and what's ready to start.

If the project has Design files, add descriptions and sync them from the editor. The
`t3_project_design_list` tool shows synced packages with their project paths and available
descriptions. Files that only live in the gallery stay on the client.

## Connect Jira

Open **Jira** inside Tasks. If the project has no task source, enter the Jira URL,
optional Jira project key, and a server-side SecretReference. The browser never receives the Jira
token. The server checks that the selected environment and project belong to the connected server.

## Read and edit a task

Tasks are grouped by sprint and searchable by key, title and Jira status. Select a task to see the
source description, fields, comments, processing scenario and generated results. **Edit draft**
saves a local revision; Jira remains unchanged. The draft preview keeps the Jira source available
for comparison, and **Discard draft** requires confirmation.

## Run a scenario

Configure provider/model, prompts, rules, skills, connectors, checks and retry limits in the
scenario panel. Enable **Auto-start matching Jira tasks** when a synchronized task should enter the
scenario without a manual click. **Run scenario** confirms the number of independent variants and the access mode
before creating isolated worktrees. Agent, audit and check workers run on the server; their thread
IDs, variant output, check output/exit codes, audit report and terminal state are persisted locally.
Configured check commands execute in the variant worktree. Agent-backed checks must return an
explicit `CHECK_RESULT: PASS`; completion alone is not treated as a passing check. The page polls
active runs so a tab does not own the worker lifecycle. A configured publish stage stops in an
explicit-action-ready state; it never pushes without the Publish confirmation.

## Publish

Choose a succeeded variant and branch, then confirm the push and prepared Jira comments. The
server verifies that the worktree and selected project resolve to the same Git repository (including
standard T3 worktrees kept in the managed worktree directory), rejects dirty worktrees, and uses a
non-force push. Push and comment phases have separate durable receipts; Jira comment markers make
retries idempotent, and a retry after a comment failure reuses the recorded push receipt.

Storybook artifacts open through the server launcher at their verified URL, or at the local
Storybook `?path=/story/<storyId>` fallback when only a verified story ID is available.
