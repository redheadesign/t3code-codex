import type { ComponentProps } from "react";

import { useEnvironmentIdentificationMode } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import { StageBackdropButtonArt, useSidebarStageBackdropVariant } from "../SidebarStageBackdrop";
import { Spinner } from "../ui/spinner";

export function ComposerSubmitButton({
  children,
  busy,
  type = "submit",
  ...props
}: Pick<
  ComponentProps<"button">,
  "aria-label" | "children" | "disabled" | "onClick" | "onPointerDown" | "type"
> & {
  busy: boolean;
}) {
  const stageBackdropVariant = useSidebarStageBackdropVariant(useEnvironmentIdentificationMode());
  return (
    <button
      type={type}
      className={cn(
        "relative isolate flex h-9 w-9 items-center justify-center overflow-hidden rounded-full shadow-xs transition-all duration-150 enabled:cursor-pointer enabled:inset-shadow-control-highlight hover:scale-105 active:inset-shadow-control-pressed active:shadow-none disabled:pointer-events-none disabled:shadow-none disabled:hover:scale-100 sm:h-8 sm:w-8 [&_svg]:pointer-events-none",
        stageBackdropVariant
          ? "bg-white text-black enabled:shadow-black/24 enabled:hover:brightness-110 disabled:bg-white disabled:text-black"
          : "bg-white text-black enabled:shadow-black/12 hover:bg-white disabled:bg-white disabled:text-black",
      )}
      {...props}
    >
      {stageBackdropVariant ? (
        <span className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
          <StageBackdropButtonArt variant={stageBackdropVariant} />
        </span>
      ) : null}
      {busy ? (
        <Spinner size="sm" aria-hidden="true" />
      ) : (
        (children ?? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ))
      )}
    </button>
  );
}
