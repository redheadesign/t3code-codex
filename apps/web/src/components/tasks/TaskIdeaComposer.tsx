import {
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
  type EnvironmentId,
  type ModelSelection,
  type ProjectId,
  type ThreadId,
} from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { Link } from "@tanstack/react-router";
import { ArrowUpIcon, MessageSquareIcon } from "lucide-react";
import { useRef, useState } from "react";

import { useEnvironmentSettings } from "~/hooks/useSettings";
import { useUiText } from "~/i18n";
import { randomUUID } from "~/lib/utils";
import { getAppModelOptionsForInstance } from "~/modelSelection";
import {
  NO_PROVIDER_MODEL_SELECTION,
  isProviderInstancePickerReady,
  providerInstanceEntriesFor,
  resolveProjectDefaultProviderModelSelection,
} from "~/providerInstances";
import { useEnvironmentProviders } from "~/state/environments";
import {
  ComposerPromptEditorTiptap,
  type ComposerPromptEditorHandle,
} from "../ComposerPromptEditorTiptap";
import { ComposerSurface } from "../chat/ComposerSurface";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import type { ComposerDraftContextRecords } from "../composerContextPresentation";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";

const EMPTY_CONTEXT: ComposerDraftContextRecords = new Map();
const EMPTY_SKILLS = [] as const;

export function TaskIdeaComposer({
  environmentId,
  projectId,
  threadId,
  disabled,
  onSend,
}: {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  threadId: ThreadId | undefined;
  disabled: boolean;
  onSend: (submission: {
    submissionId: string;
    prompt: string;
    modelSelection: ModelSelection;
  }) => Promise<boolean>;
}) {
  const text = useUiText();
  const settings = useEnvironmentSettings(environmentId);
  const providers = useEnvironmentProviders().get(environmentId) ?? [];
  const providerEntries = providerInstanceEntriesFor(providers, settings, projectId);
  const [choice, setChoice] = useState<ModelSelection | null>(null);
  const [draft, setDraft] = useState({ value: "", cursor: 0 });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const editor = useRef<ComposerPromptEditorHandle | null>(null);
  const submission = useRef<{ key: string; id: string } | null>(null);
  const projectDefault = resolveProjectSettings(settings, projectId).settings.defaultModelSelection;
  const defaultChoice =
    projectDefault ?? resolveProjectDefaultProviderModelSelection(providers, settings, projectId);
  const selection = choice ?? defaultChoice ?? NO_PROVIDER_MODEL_SELECTION;
  const ready = providerEntries.some(
    (entry) => entry.instanceId === selection.instanceId && isProviderInstancePickerReady(entry),
  );
  const prompt = draft.value.trim();
  const tooLong = prompt.length > PROVIDER_SEND_TURN_MAX_INPUT_CHARS;
  const canSend = ready && !disabled && !sending && !tooLong && prompt.length > 0;
  const modelOptionsByInstance = new Map(
    providerEntries.map((entry) => [
      entry.instanceId,
      getAppModelOptionsForInstance(
        settings,
        entry,
        entry.instanceId === selection.instanceId ? selection.model : null,
      ),
    ]),
  );
  const send = async () => {
    if (!canSend) return;
    const key = JSON.stringify([prompt, selection]);
    const submissionId = submission.current?.key === key ? submission.current.id : randomUUID();
    submission.current = { key, id: submissionId };
    setSending(true);
    setSent(false);
    const accepted = await onSend({ submissionId, prompt, modelSelection: selection });
    setSending(false);
    if (!accepted) return;
    submission.current = null;
    setDraft({ value: "", cursor: 0 });
    setSent(true);
  };

  return (
    <form
      className="px-4 pt-4 md:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <ComposerSurface.Shell>
        <ComposerSurface.Host>
          <div className="max-h-32 overflow-auto px-3 pt-2">
            <ComposerPromptEditorTiptap
              ariaLabel={text("Project idea", "Идея для проекта")}
              placeholder={text("Share your ideas here", "Предложите свои идеи здесь")}
              value={draft.value}
              cursor={draft.cursor}
              richTextEnabled={settings.composerRichTextEnabled}
              contextRecords={EMPTY_CONTEXT}
              skills={EMPTY_SKILLS}
              editorRef={editor}
              disabled={sending || disabled}
              onChange={(value, cursor) => setDraft({ value, cursor })}
              onPaste={() => {}}
              onCommandKeyDown={(key, event) => {
                if (key !== "Enter" || (!event.ctrlKey && !event.metaKey) || event.isComposing)
                  return false;
                event.preventDefault();
                void send();
                return true;
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 px-2 pb-2">
            <ProviderModelPicker
              environmentId={environmentId}
              activeInstanceId={selection.instanceId}
              model={selection.model}
              modelOptionsByInstance={modelOptionsByInstance}
              instanceEntries={providerEntries}
              lockedProvider={null}
              disabled={sending || disabled}
              triggerAriaLabel={text("Choose an agent", "Выбрать агента")}
              onInstanceModelChange={(instanceId, model) => setChoice({ instanceId, model })}
            />
            {threadId ? (
              <Button
                size="xs"
                variant="ghost-muted"
                render={
                  <Link to="/$environmentId/$threadId" params={{ environmentId, threadId }} />
                }
              >
                <MessageSquareIcon />
                {text("Ideas chat", "Чат с идеями")}
              </Button>
            ) : null}
            <div className="ms-auto">
              <Button
                type="submit"
                size="icon-sm"
                aria-label={text("Send idea", "Отправить идею")}
                disabled={!canSend}
              >
                {sending ? <Spinner /> : <ArrowUpIcon />}
              </Button>
            </div>
          </div>
        </ComposerSurface.Host>
        <p className="mt-1.5 px-2 text-xs text-muted-foreground" role="status">
          {tooLong
            ? text(
                "This idea exceeds the message limit.",
                "Идея превышает допустимую длину сообщения.",
              )
            : sent
              ? text("Sent to the ideas chat.", "Идея отправлена в чат.")
              : !ready
                ? text(
                    "Choose an available agent to send ideas.",
                    "Выберите доступного агента, чтобы отправить идею.",
                  )
                : text(
                    "Type or use system dictation.",
                    "Можно напечатать текст или продиктовать его.",
                  )}
        </p>
      </ComposerSurface.Shell>
    </form>
  );
}
