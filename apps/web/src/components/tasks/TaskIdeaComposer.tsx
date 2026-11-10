import { useAtomValue } from "@effect/atom-react";
import {
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
  type EnvironmentId,
  type ModelSelection,
  type ProjectId,
  type ThreadId,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { Link } from "@tanstack/react-router";
import { MessageSquareIcon } from "lucide-react";
import { useRef, useState } from "react";

import { composerSubmissionIntentForKey } from "~/composer-logic";
import { useEnvironmentSettings } from "~/hooks/useSettings";
import { useSoftwareKeyboardOpen } from "~/hooks/useSoftwareKeyboardOpen";
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
import { primaryServerKeybindingsAtom } from "~/state/server";
import {
  ComposerPromptEditorTiptap,
  type ComposerPromptEditorHandle,
} from "../ComposerPromptEditorTiptap";
import {
  ComposerEffortColumn,
  ComposerPickerFooter,
  describeComposerEffort,
} from "../chat/ComposerModelEffort";
import { getComposerProviderState } from "../chat/composerProviderState";
import { ComposerSubmitButton } from "../chat/ComposerSubmitButton";
import { ComposerSurface } from "../chat/ComposerSurface";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { readPromptUltrathink, type TraitsSelectionInput } from "../chat/TraitsPicker";
import type { ComposerDraftContextRecords } from "../composerContextPresentation";
import { Button } from "../ui/button";

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
  const isSoftwareKeyboardOpen = useSoftwareKeyboardOpen();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
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
  const activeEntry = providerEntries.find((entry) => entry.instanceId === selection.instanceId);
  const ready = activeEntry !== undefined && isProviderInstancePickerReady(activeEntry);
  const prompt = draft.value.trim();
  const tooLong = prompt.length > PROVIDER_SEND_TURN_MAX_INPUT_CHARS;
  const canSend = ready && !disabled && !sending && !tooLong && prompt.length > 0;
  const status = tooLong
    ? text("This idea exceeds the message limit.", "Идея превышает допустимую длину сообщения.")
    : !ready
      ? text("Choose an available agent to send ideas.", "Выберите доступного агента.")
      : null;
  const traits: TraitsSelectionInput | null = activeEntry
    ? {
        provider: activeEntry.driverKind,
        instanceId: selection.instanceId,
        model: selection.model,
        models: activeEntry.models,
        modelOptions: selection.options,
        planModeEnabled: false,
        promptUltrathink: readPromptUltrathink(draft.value),
        onPromptEdit: (edit) => {
          setDraft((previous) => {
            const value = edit(previous.value);
            return {
              value,
              cursor: Math.max(0, previous.cursor + value.length - previous.value.length),
            };
          });
        },
        onModelOptionsChange: (options) => {
          setChoice(createModelSelection(selection.instanceId, selection.model, options));
        },
      }
    : null;
  const effort = describeComposerEffort(traits, settings.effortDisplay, "sm");
  const useSubscriptionPicker = providerEntries.every(
    (entry) => !entry.enabled || entry.driverKind === "codex" || entry.driverKind === "claudeAgent",
  );
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
    if (!canSend || !activeEntry) return;
    const { modelOptionsForDispatch } = getComposerProviderState({
      provider: activeEntry.driverKind,
      model: selection.model,
      models: activeEntry.models,
      modelOptions: selection.options,
      planModeEnabled: false,
    });
    const modelSelection = createModelSelection(
      selection.instanceId,
      selection.model,
      modelOptionsForDispatch,
    );
    const key = JSON.stringify([prompt, modelSelection]);
    const submissionId = submission.current?.key === key ? submission.current.id : randomUUID();
    submission.current = { key, id: submissionId };
    setSending(true);
    setSent(false);
    const accepted = await onSend({ submissionId, prompt, modelSelection });
    setSending(false);
    if (!accepted) return;
    submission.current = null;
    setDraft({ value: "", cursor: 0 });
    setSent(true);
  };

  return (
    <form
      className="shrink-0 px-4 pt-2 pb-3 md:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <ComposerSurface.Shell>
        <ComposerSurface.Host>
          <div className="px-3 pt-2.5">
            {status ? (
              <p className="mb-1.5 text-xs text-muted-foreground" role="status">
                {status}
              </p>
            ) : null}
            <ComposerPromptEditorTiptap
              ariaLabel={text("Project idea", "Идея для проекта")}
              placeholder={text("Share your ideas here", "Предложите свои идеи здесь")}
              value={draft.value}
              cursor={draft.cursor}
              richTextEnabled={settings.composerRichTextEnabled}
              contextRecords={EMPTY_CONTEXT}
              skills={EMPTY_SKILLS}
              editorRef={editor}
              className="max-h-[min(13rem,30dvh)] overscroll-contain"
              disabled={sending || disabled}
              onChange={(value, cursor) => {
                setDraft({ value, cursor });
                setSent(false);
              }}
              onPaste={() => {}}
              onCommandKeyDown={(_, event) => {
                const intent = composerSubmissionIntentForKey({
                  event,
                  keybindings,
                  isSoftwareKeyboardOpen,
                  isDraftThread: false,
                  sendShortcut: settings.sendShortcut,
                  prompt: draft.value,
                });
                if (intent === null) return false;
                event.preventDefault();
                void send();
                return true;
              }}
            />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1 px-2 pb-2">
            <ProviderModelPicker
              environmentId={environmentId}
              activeInstanceId={selection.instanceId}
              model={selection.model}
              modelOptionsByInstance={modelOptionsByInstance}
              instanceEntries={providerEntries}
              keybindings={keybindings}
              lockedProvider={null}
              isComposerOwned={useSubscriptionPicker}
              disabled={sending || disabled}
              triggerAriaLabel={text("Choose an agent", "Выбрать агента")}
              triggerClassName="group/model-trigger"
              triggerSuffix={effort.suffix}
              triggerDetail={effort.detail}
              effortColumn={<ComposerEffortColumn traits={traits} />}
              footer={<ComposerPickerFooter traits={traits} />}
              onInstanceModelChange={(instanceId, model) => {
                if (instanceId !== selection.instanceId || model !== selection.model) {
                  setChoice(createModelSelection(instanceId, model));
                }
              }}
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
              <ComposerSubmitButton
                busy={sending}
                aria-label={text("Send idea", "Отправить идею")}
                disabled={!canSend}
              />
            </div>
          </div>
        </ComposerSurface.Host>
      </ComposerSurface.Shell>
      <p className="sr-only" role="status">
        {sent ? text("Sent to the ideas chat.", "Идея отправлена в чат.") : null}
      </p>
    </form>
  );
}
