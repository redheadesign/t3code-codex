import type { ScopedThreadRef } from "@t3tools/contracts";
import { foldSearchQuery, scoreThreadSearch } from "@t3tools/shared/paletteSearch";
import { MessageSquareIcon } from "lucide-react";
import { useDeferredValue } from "react";

import { useCommandPaletteThreadItems } from "../CommandPaletteThreadItems";
import { SearchMatchHintLine, ThreadSearchMatchExcerpt } from "../ThreadSearchMatch";
import { SidebarGroup, SidebarMenuButton } from "../ui/sidebar";
import { toastManager } from "../ui/toast";

const RESULT_LIMIT = 16;

export function SidebarThreadSearch(props: {
  query: string;
  activeThreadRef: ScopedThreadRef | null;
  onPick: () => void;
}) {
  const query = useDeferredValue(props.query);
  const { threadItems, threadMessageItems, isSearchPending, now } = useCommandPaletteThreadItems({
    activeThread: props.activeThreadRef
      ? { environmentId: props.activeThreadRef.environmentId, id: props.activeThreadRef.threadId }
      : null,
    threadSearchQuery: query,
  });
  const foldedQuery = foldSearchQuery(query);
  const titleMatches = threadItems
    .flatMap((item) => {
      const match = item.threadSearch
        ? scoreThreadSearch(foldedQuery, item.threadSearch, now, { picks: false })
        : null;
      return match ? [{ item, match }] : [];
    })
    .sort((left, right) => right.match.score - left.match.score)
    .slice(0, RESULT_LIMIT)
    .map(({ item, match }) => {
      const matchHint = match.explain?.();
      return matchHint ? { ...item, matchHint } : item;
    });
  const results = [...titleMatches, ...threadMessageItems].slice(0, RESULT_LIMIT);

  return (
    <SidebarGroup>
      {results.length === 0 ? (
        <p role="status" className="px-2 py-3 text-xs text-muted-foreground">
          {isSearchPending || query !== props.query ? "Searching threads…" : "No matching threads"}
        </p>
      ) : (
        <ul aria-label="Thread search results" className="flex flex-col gap-px">
          {results.map((item) => (
            <li key={item.value}>
              <SidebarMenuButton
                size="lg"
                onClick={() => {
                  void item.run().then(props.onPick, () => {
                    toastManager.add({ type: "error", title: "Could not open thread" });
                  });
                }}
              >
                <MessageSquareIcon aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{item.title}</span>
                  {item.threadContentMatch ? (
                    <ThreadSearchMatchExcerpt match={item.threadContentMatch} />
                  ) : item.matchHint ? (
                    <SearchMatchHintLine hint={item.matchHint} />
                  ) : (
                    <span className="truncate text-xs text-muted-foreground">
                      {item.threadSearch?.projectTitle}
                    </span>
                  )}
                </span>
              </SidebarMenuButton>
            </li>
          ))}
        </ul>
      )}
    </SidebarGroup>
  );
}
