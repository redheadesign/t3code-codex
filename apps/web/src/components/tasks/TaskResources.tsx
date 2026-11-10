import type {
  EnvironmentId,
  TaskWorkspaceBoardTask,
  TaskWorkspaceCommand,
} from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon, Link2Icon, PaletteIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useUiText } from "~/i18n";

import ChatMarkdown from "../ChatMarkdown";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

type TaskResource = NonNullable<TaskWorkspaceBoardTask["links"]>[number];
type ResourceKind = TaskResource["kind"];

function readWebUrl(value: string) {
  const url = URL.parse(value);
  return url && (url.protocol === "http:" || url.protocol === "https:") ? url.href : null;
}

function readDesignDocument(value: string) {
  const url = URL.parse(value, window.location.href);
  const route = url?.hash.startsWith("#/design?") ? URL.parse(url.hash.slice(1), url.href) : url;
  if (route?.pathname.endsWith("/design")) return route.searchParams.get("documentId");
  return /^[^/?#:\s]+$/.test(value) ? value : null;
}

function TaskResourceTarget({
  entry,
  environmentId,
  workspaceRoot,
}: {
  entry: TaskResource;
  environmentId: EnvironmentId;
  workspaceRoot: string;
}) {
  if (entry.kind === "design") {
    return (
      <Link
        className="inline-flex min-w-0 items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline"
        to="/design"
        search={{ documentId: entry.target }}
      >
        <PaletteIcon aria-hidden className="size-4 shrink-0" />
        <span className="wrap-anywhere">{entry.title}</span>
      </Link>
    );
  }
  if (entry.kind === "file") {
    const label = entry.title
      .replaceAll("\\", "\\\\")
      .replaceAll("[", "\\[")
      .replaceAll("]", "\\]");
    const target = entry.target.split("/").map(encodeURIComponent).join("/");
    return (
      <ChatMarkdown
        text={`[${label}](<./${target}>)`}
        cwd={workspaceRoot}
        environmentId={environmentId}
        inline
      />
    );
  }
  const href = readWebUrl(entry.target);
  return href ? (
    <a
      className="inline-flex min-w-0 items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      <ExternalLinkIcon aria-hidden className="size-4 shrink-0" />
      <span className="wrap-anywhere">{entry.title}</span>
    </a>
  ) : (
    <span className="text-sm wrap-anywhere">{entry.title}</span>
  );
}

export function TaskResources({
  task,
  environmentId,
  workspaceRoot,
  disabled,
  onCommand,
}: {
  task: TaskWorkspaceBoardTask;
  environmentId: EnvironmentId;
  workspaceRoot: string;
  disabled: boolean;
  onCommand: (command: TaskWorkspaceCommand) => Promise<boolean>;
}) {
  const text = useUiText();
  const [draft, setDraft] = useState<{ kind: ResourceKind; title: string; target: string } | null>(
    null,
  );
  const [invalid, setInvalid] = useState(false);
  const labels = {
    design: text("Canvas document", "Документ Canvas"),
    url: text("Web link", "Веб-ссылка"),
    file: text("Project file", "Файл проекта"),
  };
  const links = task.links ?? [];
  return (
    <section
      className="space-y-3 border-t border-border pt-4"
      aria-label={text("Task links", "Ссылки задачи")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{text("References", "Материалы")}</h2>
        {draft === null ? (
          <Button
            size="xs"
            variant="ghost-muted"
            disabled={disabled}
            onClick={() => setDraft({ kind: "design", title: "", target: "" })}
          >
            <PlusIcon />
            {text("Add link", "Добавить ссылку")}
          </Button>
        ) : null}
      </div>
      {links.length > 0 ? (
        <ul className="space-y-2">
          {links.map((entry) => (
            <li key={entry.id} className="flex min-w-0 items-center justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <TaskResourceTarget
                  entry={entry}
                  environmentId={environmentId}
                  workspaceRoot={workspaceRoot}
                />
                <div className="text-xs text-muted-foreground wrap-anywhere">
                  {labels[entry.kind]} · {entry.author}
                </div>
              </div>
              <Button
                size="icon-xs"
                variant="ghost-muted"
                disabled={disabled}
                aria-label={text(`Remove link ${entry.title}`, `Убрать ссылку «${entry.title}»`)}
                onClick={() =>
                  void onCommand({ _tag: "removeLocalTaskLink", taskId: task.id, linkId: entry.id })
                }
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {text("No linked materials yet.", "Пока нет ссылок на материалы.")}
        </p>
      )}
      {draft ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const rawTarget = draft.target.trim();
            const target =
              draft.kind === "design"
                ? readDesignDocument(rawTarget)
                : draft.kind === "url"
                  ? readWebUrl(rawTarget)
                  : rawTarget;
            if (!target) {
              setInvalid(true);
              return;
            }
            void onCommand({
              _tag: "addLocalTaskLink",
              taskId: task.id,
              kind: draft.kind,
              title: draft.title.trim(),
              target,
            }).then((saved) => {
              if (saved) setDraft(null);
            });
          }}
        >
          <Select<ResourceKind>
            value={draft.kind}
            disabled={disabled}
            onValueChange={(kind) => {
              if (kind) {
                setDraft({ ...draft, kind });
                setInvalid(false);
              }
            }}
          >
            <SelectTrigger size="sm" width="fluid" aria-label={text("Link type", "Тип ссылки")}>
              <SelectValue>{labels[draft.kind]}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="design">{labels.design}</SelectItem>
              <SelectItem value="url">{labels.url}</SelectItem>
              <SelectItem value="file">{labels.file}</SelectItem>
            </SelectPopup>
          </Select>
          <Input
            size="sm"
            maxLength={256}
            aria-label={text("Link title", "Название ссылки")}
            placeholder={text("Title", "Название")}
            value={draft.title}
            disabled={disabled}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
          <Input
            size="sm"
            maxLength={2_048}
            aria-label={text("Link target", "Адрес ссылки")}
            placeholder={
              draft.kind === "design"
                ? text("Canvas link or ID", "Ссылка на Canvas или ID")
                : draft.kind === "url"
                  ? "https://example.com"
                  : text("Project-relative path", "Путь в проекте")
            }
            value={draft.target}
            disabled={disabled}
            onChange={(event) => {
              setDraft({ ...draft, target: event.target.value });
              setInvalid(false);
            }}
          />
          {invalid ? (
            <p role="alert" className="text-xs text-destructive-foreground">
              {text(
                "Enter a valid link for this type.",
                "Проверьте адрес для выбранного типа ссылки.",
              )}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={disabled || !draft.title.trim() || !draft.target.trim()}
            >
              <Link2Icon />
              {text("Save link", "Сохранить ссылку")}
            </Button>
            <Button
              size="sm"
              variant="ghost-muted"
              onClick={() => {
                setDraft(null);
                setInvalid(false);
              }}
            >
              {text("Cancel", "Отмена")}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
