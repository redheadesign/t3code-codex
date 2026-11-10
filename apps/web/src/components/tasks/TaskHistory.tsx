import type { EnvironmentId, TaskWorkspaceBoardTask } from "@t3tools/contracts";
import { BotIcon, GitBranchIcon, PlayIcon } from "lucide-react";
import { useUiText } from "~/i18n";

import ChatMarkdown from "../ChatMarkdown";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";

const dates = {
  en: new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }),
  ru: new Intl.DateTimeFormat("ru", { dateStyle: "medium", timeStyle: "short" }),
};

export function TaskTimestamp({ value }: { value: string }) {
  const text = useUiText();
  const date = new Date(value);
  return (
    <time dateTime={value}>
      {Number.isNaN(date.getTime())
        ? value
        : dates[text("en", "ru") === "ru" ? "ru" : "en"].format(date)}
    </time>
  );
}

export function TaskHistory({
  task,
  environmentId,
  workspaceRoot,
}: {
  task: TaskWorkspaceBoardTask;
  environmentId: EnvironmentId;
  workspaceRoot: string;
}) {
  const text = useUiText();
  const entries = task.threadHistory ?? [];
  if (!task.initialBrief && entries.length === 0) return null;
  const lanes = [
    ...new Set(
      entries.flatMap((entry) =>
        entry.previousBranch === undefined
          ? [entry.branch ?? null]
          : [entry.previousBranch, entry.branch ?? null],
      ),
    ),
  ];
  const laneByBranch = new Map(lanes.map((branch, index) => [branch, index + 1]));
  const kinds = {
    run: { label: text("Agent run", "Запуск агента"), Icon: PlayIcon },
    branch: { label: text("Git branch", "Ветка Git"), Icon: GitBranchIcon },
    provider: { label: text("Agent handoff", "Передача агенту"), Icon: BotIcon },
  };
  return (
    <section className="space-y-3 border-t border-border pt-4">
      <h2 className="text-sm font-semibold">{text("Work history", "История работы")}</h2>
      {task.initialBrief ? (
        <details className="min-w-0 space-y-2">
          <summary className="w-fit cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
            {text("Original brief", "Исходное задание")}
          </summary>
          <ChatMarkdown
            text={task.initialBrief}
            cwd={workspaceRoot}
            environmentId={environmentId}
            headingLevelOffset={2}
          />
        </details>
      ) : null}
      {entries.length > 0 ? (
        <div
          className="max-h-64 overflow-auto rounded-md focus-visible:outline-2 focus-visible:outline-ring"
          tabIndex={0}
          aria-label={text("Scroll work history", "Прокрутка истории работы")}
        >
          <ol
            className="grid min-w-max gap-y-3 pb-2"
            aria-label={text("Task work history", "Хронология работы над задачей")}
            style={{ gridTemplateColumns: `8rem repeat(${entries.length}, minmax(9rem, 1fr))` }}
          >
            {lanes.map((branch, index) => (
              <li
                key={branch === null ? "unassigned" : `branch:${branch}`}
                aria-hidden
                className="relative col-span-full"
                style={{ gridRow: index + 1 }}
              >
                <div className="absolute start-32 end-0 top-2.5 border-t border-border" />
                <span className="sticky start-0 z-20 inline-block w-32 bg-background pe-2 text-xs font-medium text-muted-foreground wrap-anywhere">
                  {branch ?? text("Chat", "Чат")}
                </span>
              </li>
            ))}
            {entries.map((entry, index) => {
              const { label, Icon } = kinds[entry.kind];
              const lane = laneByBranch.get(entry.branch ?? null) ?? 1;
              const previousLane =
                entry.previousBranch === undefined
                  ? undefined
                  : laneByBranch.get(entry.previousBranch);
              const connector = previousLane !== undefined && previousLane !== lane;
              return (
                <li
                  key={entry.id}
                  className="relative z-10 w-36 space-y-1 pe-3"
                  style={{ gridColumn: index + 2, gridRow: lane }}
                >
                  <span className="flex size-5 items-center justify-center rounded-full bg-background text-muted-foreground">
                    {entry.provider ? (
                      <ProviderInstanceIcon
                        driverKind={entry.provider}
                        displayName={entry.provider}
                        size="compact"
                      />
                    ) : (
                      <Icon className="size-3.5" aria-hidden />
                    )}
                  </span>
                  <div className="grid gap-0.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{label}</span>
                    {entry.branch ? <span className="sr-only">{entry.branch}</span> : null}
                    <TaskTimestamp value={entry.createdAt} />
                  </div>
                  <p className="text-xs text-muted-foreground wrap-anywhere">{entry.description}</p>
                  {connector ? (
                    <span className="sr-only">{text("Changed branch", "Ветка изменилась")}</span>
                  ) : null}
                </li>
              );
            })}
            {entries.map((entry, index) => {
              if (entry.previousBranch === undefined) return null;
              const from = laneByBranch.get(entry.previousBranch);
              const to = laneByBranch.get(entry.branch ?? null);
              if (from === undefined || to === undefined || from === to) return null;
              return (
                <li
                  key={`${entry.id}:branch-connection`}
                  aria-hidden
                  className="pointer-events-none relative ms-2.5 translate-y-2.5 border-s border-border"
                  style={{
                    gridColumn: index + 2,
                    gridRow: `${Math.min(from, to)} / ${Math.max(from, to)}`,
                  }}
                />
              );
            })}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
