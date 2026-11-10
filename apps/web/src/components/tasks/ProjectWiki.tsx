import {
  TASK_WORKSPACE_WIKI_MAX_PAGES,
  TASK_WORKSPACE_WIKI_PAGE_MAX_CHARS,
  type EnvironmentId,
  type ProjectId,
  type TaskWorkspaceCommand,
  type TaskWorkspaceProjectWiki,
} from "@t3tools/contracts";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import {
  ArchiveIcon,
  BoldIcon,
  BookOpenIcon,
  FileTextIcon,
  Heading2Icon,
  Link2Icon,
  ListIcon,
  PencilIcon,
  PlusIcon,
} from "lucide-react";
import { fromMarkdown } from "mdast-util-from-markdown";
import { useRef, useState } from "react";
import { useUiText } from "~/i18n";
import { randomUUID } from "~/lib/utils";

import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import ChatMarkdown from "../ChatMarkdown";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { TASK_TEXT_LIMIT, TASK_TITLE_LIMIT } from "./LocalTaskDetails";
import { TaskTimestamp } from "./TaskHistory";

const EMPTY_PAGES: NonNullable<TaskWorkspaceProjectWiki["pages"]> = [];

type MarkdownTree = ReturnType<typeof fromMarkdown>;
type MarkdownHeading = Extract<MarkdownTree["children"][number], { type: "heading" }>;
type MarkdownInline = MarkdownHeading["children"][number];

function headingText(nodes: ReadonlyArray<MarkdownInline>): string {
  return nodes
    .map((node) => {
      if ("value" in node) return node.value;
      if ("alt" in node) return node.alt ?? "";
      if ("children" in node) return headingText(node.children);
      return " ";
    })
    .join("");
}

function wikiHeadings(tree: MarkdownTree) {
  return tree.children
    .filter((node): node is MarkdownHeading => node.type === "heading")
    .map((node, index) => ({ node, id: `wiki-heading-${index + 1}` }));
}

const WIKI_MARKDOWN_PLUGINS = [
  () => (tree: MarkdownTree) => {
    for (const { node, id } of wikiHeadings(tree)) {
      node.data = { ...node.data, hProperties: { id, tabIndex: -1 } };
    }
  },
];

type Draft = {
  id: string | undefined;
  title: string;
  content: string;
  originalTitle: string;
  originalContent: string;
  isNew: boolean;
};

export function ProjectWiki({
  wiki,
  environmentId,
  projectId,
  pageId,
  workspaceRoot,
  disabled,
  error,
  onCommand,
}: {
  wiki: TaskWorkspaceProjectWiki;
  environmentId: EnvironmentId;
  projectId: ProjectId;
  pageId: string | undefined;
  workspaceRoot: string;
  disabled: boolean;
  error: string | null;
  onCommand: (command: TaskWorkspaceCommand) => Promise<boolean>;
}) {
  const text = useUiText();
  const router = useRouter();
  const navigate = useNavigate();
  const contentRoot = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState(false);
  const overview = text("Overview", "Обзор");
  const pages = wiki.pages ?? EMPTY_PAGES;
  const page = pages.find(({ id }) => id === pageId);
  const title = page?.title ?? overview;
  const content = page?.content ?? wiki.content;
  const updatedAt = page?.updatedAt ?? wiki.updatedAt;
  const archived = page?.archivedAt != null;
  const unavailable = pageId !== undefined && page === undefined;
  const searchText = query.trim().toLocaleLowerCase();
  const matchingPages = pages.filter(
    ({ title, content, archivedAt }) =>
      (showArchived ? archivedAt !== null : archivedAt === null) &&
      (searchText === "" ||
        title.toLocaleLowerCase().includes(searchText) ||
        content.toLocaleLowerCase().includes(searchText)),
  );
  const matchesOverview =
    !showArchived &&
    (searchText === "" ||
      overview.toLocaleLowerCase().includes(searchText) ||
      wiki.content.toLocaleLowerCase().includes(searchText));
  const editStale =
    draft !== null &&
    !draft.isNew &&
    (draft.id !== pageId ||
      archived ||
      unavailable ||
      draft.originalTitle !== title ||
      draft.originalContent !== content);
  const draftChanged =
    draft !== null &&
    (draft.isNew || draft.title !== draft.originalTitle || draft.content !== draft.originalContent);
  const markdown = draft === null ? content : draft.content;
  const headings =
    draft === null && !unavailable
      ? wikiHeadings(fromMarkdown(markdown)).map(({ id, node }) => ({
          id,
          level: node.depth,
          label: headingText(node.children),
        }))
      : [];
  const routeSearch = {
    environmentId,
    projectId,
    view: "wiki" as const,
  };
  const edit = (isNew: boolean) => {
    setPreview(false);
    setDraft({
      id: isNew ? randomUUID() : pageId,
      title: isNew ? "" : title,
      content: isNew ? "" : content,
      originalTitle: title,
      originalContent: content,
      isNew,
    });
  };
  const insertMarkdown = (prefix: string, suffix: string, fallback: string, block: boolean) => {
    if (draft === null || editor.current === null) return;
    const field = editor.current;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selection = draft.content.slice(start, end) || fallback;
    const before = draft.content.slice(0, start);
    const lineBreak = block && before.length > 0 && !before.endsWith("\n") ? "\n" : "";
    const content = before + lineBreak + prefix + selection + suffix + draft.content.slice(end);
    if (
      content.length >
      (draft.id === undefined ? TASK_TEXT_LIMIT : TASK_WORKSPACE_WIKI_PAGE_MAX_CHARS)
    )
      return;
    setDraft({ ...draft, content });
    field.focus();
    const caret = start + lineBreak.length + prefix.length;
    requestAnimationFrame(() => field.setSelectionRange(caret, caret + selection.length));
  };
  const save = async () => {
    if (draft === null || !draft.title.trim() || !draftChanged || editStale || disabled) return;
    const id = draft.id;
    const saved = await onCommand(
      id === undefined
        ? { _tag: "updateProjectWiki", content: draft.content }
        : {
            _tag: "saveProjectWikiPage",
            pageId: id,
            title: draft.title.trim(),
            content: draft.content,
          },
    );
    if (!saved) return;
    setDraft(null);
    if (draft.isNew && id !== undefined) {
      setQuery("");
      setShowArchived(false);
      await navigate({ to: "/tasks", search: { ...routeSearch, wikiPageId: id } });
    }
  };
  const copyLink = async () => {
    const location = router.buildLocation({
      to: "/tasks",
      search: { ...routeSearch, ...(pageId === undefined ? {} : { wikiPageId: pageId }) },
    });
    const url = new URL(router.history.createHref(location.publicHref), window.location.href).href;
    try {
      await writeTextToClipboard(url, "wiki page link");
      toastManager.add({ type: "success", title: text("Page link copied", "Ссылка скопирована") });
    } catch {
      toastManager.add({
        type: "error",
        title: text("Could not copy the page link", "Не удалось скопировать ссылку"),
      });
    }
  };
  const setArchived = async () => {
    if (page === undefined || disabled) return;
    if (
      await onCommand({
        _tag: "setProjectWikiPageArchived",
        pageId: page.id,
        archived: !archived,
      })
    ) {
      setShowArchived(!archived);
      setQuery("");
    }
  };

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[15rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col gap-3 border-b border-border p-4 md:border-e md:border-b-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{text("Project wiki", "Вики проекта")}</h2>
          <Button
            size="icon-sm"
            variant="ghost-muted"
            aria-label={text("New page", "Новая страница")}
            title={text("New page", "Новая страница")}
            disabled={disabled || draft !== null || pages.length >= TASK_WORKSPACE_WIKI_MAX_PAGES}
            onClick={() => edit(true)}
          >
            <PlusIcon />
          </Button>
        </div>
        <Input
          size="sm"
          type="search"
          aria-label={text("Search wiki", "Поиск в вики")}
          placeholder={text("Find a page", "Найти страницу")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <nav
          aria-label={text("Wiki pages", "Страницы вики")}
          className="max-h-36 min-h-0 space-y-1 overflow-auto md:max-h-none md:flex-1"
        >
          {matchesOverview ? (
            <WikiPageLink
              title={overview}
              current={pageId === undefined}
              disabled={draft !== null}
              search={routeSearch}
            />
          ) : null}
          {matchingPages.map((entry) => (
            <WikiPageLink
              key={entry.id}
              title={entry.title}
              current={entry.id === pageId}
              disabled={draft !== null}
              search={{ ...routeSearch, wikiPageId: entry.id }}
            />
          ))}
          {!matchesOverview && matchingPages.length === 0 ? (
            <p className="px-2 py-2 text-sm text-muted-foreground">
              {searchText
                ? text("No pages found", "Ничего не найдено")
                : text("The archive is empty", "Архив пуст")}
            </p>
          ) : null}
        </nav>
        <div>
          <Button
            size="sm"
            variant={showArchived ? "secondary" : "ghost-muted"}
            aria-pressed={showArchived}
            onClick={() => setShowArchived(!showArchived)}
          >
            <ArchiveIcon />
            {text("Archived pages", "Архив страниц")}
          </Button>
        </div>
      </aside>
      <div key={pageId} className="min-h-0 overflow-auto scrollbar-gutter-both">
        <article className="mx-auto max-w-4xl space-y-6 px-5 py-6 md:px-8 md:py-8">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h2 className="text-2xl font-semibold wrap-anywhere">
                {unavailable
                  ? text("Page not found", "Страница не найдена")
                  : draft?.isNew
                    ? text("New page", "Новая страница")
                    : title}
              </h2>
              {updatedAt && !draft?.isNew ? (
                <div className="text-xs text-muted-foreground">
                  {text("Updated", "Обновлено")} <TaskTimestamp value={updatedAt} />
                </div>
              ) : null}
            </div>
            {draft === null && !unavailable ? (
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  size="icon-sm"
                  variant="ghost-muted"
                  aria-label={text("Copy page link", "Скопировать ссылку на страницу")}
                  title={text("Copy page link", "Скопировать ссылку на страницу")}
                  onClick={() => void copyLink()}
                >
                  <Link2Icon />
                </Button>
                {page !== undefined ? (
                  <Button
                    size="sm"
                    variant="ghost-muted"
                    disabled={disabled}
                    onClick={() => void setArchived()}
                  >
                    {archived ? text("Restore", "Восстановить") : text("Archive", "В архив")}
                  </Button>
                ) : null}
                {!archived ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => edit(false)}
                  >
                    <PencilIcon />
                    {text("Edit page", "Редактировать")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </header>
          {error ? (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          ) : null}
          {draft ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              {draft.id !== undefined ? (
                <label className="grid gap-1.5 text-sm">
                  {text("Page title", "Название страницы")}
                  <Input
                    required
                    value={draft.title}
                    maxLength={TASK_TITLE_LIMIT}
                    disabled={disabled}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  />
                </label>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ToggleGroup
                  value={[preview ? "preview" : "edit"]}
                  aria-label={text("Editor mode", "Режим редактора")}
                  onValueChange={([value]) => {
                    if (value !== undefined) setPreview(value === "preview");
                  }}
                >
                  <ToggleGroupItem value="edit">{text("Markdown", "Markdown")}</ToggleGroupItem>
                  <ToggleGroupItem value="preview">
                    {text("Preview", "Предпросмотр")}
                  </ToggleGroupItem>
                </ToggleGroup>
                {!preview ? (
                  <div className="flex items-center gap-1">
                    {(
                      [
                        [
                          Heading2Icon,
                          text("Heading", "Заголовок"),
                          "## ",
                          "",
                          text("Section", "Раздел"),
                          true,
                        ],
                        [
                          BoldIcon,
                          text("Bold", "Жирный"),
                          "**",
                          "**",
                          text("Text", "Текст"),
                          false,
                        ],
                        [
                          ListIcon,
                          text("Bulleted list", "Список"),
                          "- ",
                          "",
                          text("Item", "Пункт"),
                          true,
                        ],
                        [
                          Link2Icon,
                          text("Insert link", "Вставить ссылку"),
                          "[",
                          "](https://)",
                          text("Link", "Ссылка"),
                          false,
                        ],
                      ] as const
                    ).map(([Icon, label, prefix, suffix, fallback, block]) => (
                      <Button
                        key={label}
                        type="button"
                        size="icon-sm"
                        variant="ghost-muted"
                        disabled={disabled}
                        aria-label={label}
                        title={label}
                        onClick={() => insertMarkdown(prefix, suffix, fallback, block)}
                      >
                        <Icon />
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
              {preview ? (
                <ChatMarkdown
                  text={markdown}
                  cwd={workspaceRoot}
                  environmentId={environmentId}
                  headingLevelOffset={2}
                />
              ) : (
                <Textarea
                  ref={editor}
                  size="lg"
                  aria-label={text("Page content", "Текст страницы")}
                  value={draft.content}
                  maxLength={
                    draft.id === undefined ? TASK_TEXT_LIMIT : TASK_WORKSPACE_WIKI_PAGE_MAX_CHARS
                  }
                  disabled={disabled}
                  onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                />
              )}
              {editStale ? (
                <p role="alert" className="text-sm text-warning-foreground">
                  {text(
                    "The page changed elsewhere. Copy your draft before reopening the page.",
                    "Страница изменилась. Скопируйте черновик, прежде чем открыть новую версию.",
                  )}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={disabled || editStale || !draftChanged || !draft.title.trim()}
                >
                  {text("Save page", "Сохранить")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost-muted"
                  disabled={disabled}
                  onClick={() => setDraft(null)}
                >
                  {text("Cancel", "Отмена")}
                </Button>
              </div>
            </form>
          ) : unavailable ? (
            <Button size="sm" variant="outline" render={<Link to="/tasks" search={routeSearch} />}>
              {text("Open overview", "Открыть обзор")}
            </Button>
          ) : content.trim() ? (
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
              {headings.length > 0 ? (
                <nav
                  aria-label={text("On this page", "На этой странице")}
                  className="max-w-48 space-y-1 lg:order-2"
                >
                  <h3 className="text-sm font-medium">
                    {text("On this page", "На этой странице")}
                  </h3>
                  {headings.map(({ id, label, level }) => (
                    <div key={id} className={level > 2 ? "ps-3" : undefined}>
                      <Button
                        size="sm-multiline"
                        variant="ghost-muted"
                        onClick={() => {
                          const heading = contentRoot.current?.querySelector<HTMLElement>(`#${id}`);
                          heading?.focus();
                          heading?.scrollIntoView({ block: "start" });
                        }}
                      >
                        <span className="text-start wrap-anywhere">{label}</span>
                      </Button>
                    </div>
                  ))}
                </nav>
              ) : null}
              <div ref={contentRoot} className="min-w-0">
                <ChatMarkdown
                  text={content}
                  cwd={workspaceRoot}
                  environmentId={environmentId}
                  headingLevelOffset={2}
                  extraRemarkPlugins={WIKI_MARKDOWN_PLUGINS}
                />
              </div>
            </div>
          ) : (
            <div className="flex max-w-sm items-start gap-2.5 text-sm text-muted-foreground">
              <BookOpenIcon aria-hidden className="size-5 shrink-0" />
              <p>
                {text(
                  "Use this space for decisions, guides and notes you want to keep with the project.",
                  "Храните здесь решения, инструкции и заметки по проекту.",
                )}
              </p>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

function WikiPageLink({
  title,
  current,
  disabled,
  search,
}: {
  title: string;
  current: boolean;
  disabled: boolean;
  search: { environmentId: EnvironmentId; projectId: ProjectId; view: "wiki"; wikiPageId?: string };
}) {
  return (
    <div className="[&>[data-slot=button]]:w-full [&>[data-slot=button]]:justify-start">
      <Button
        variant={current ? "secondary" : "ghost-muted"}
        size="sm"
        aria-current={current ? "page" : undefined}
        title={title}
        render={<Link to="/tasks" search={search} disabled={disabled} />}
      >
        <FileTextIcon />
        <span className="min-w-0 truncate">{title}</span>
      </Button>
    </div>
  );
}
