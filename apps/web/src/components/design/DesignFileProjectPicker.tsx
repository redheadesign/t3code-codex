import { useUiText } from "~/i18n";
import { useEnvironments } from "../../state/environments";
import { useProjects } from "../../state/entities";
import { ProjectFavicon } from "../ProjectFavicon";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import type { DesignProjectConnection } from "./designDocumentStore";

export function designFileProjectKey(
  project: Pick<DesignProjectConnection, "environmentId" | "cwd">,
) {
  return JSON.stringify([project.environmentId, project.cwd]);
}

export function useDesignFileProjects() {
  const projects = useProjects();
  const { environments } = useEnvironments();
  const names = new Map(
    environments.map((environment) => [environment.environmentId, environment.label]),
  );
  return new Map(
    projects.map((project) => [
      designFileProjectKey({ environmentId: project.environmentId, cwd: project.workspaceRoot }),
      {
        project,
        connection: { environmentId: project.environmentId, cwd: project.workspaceRoot },
        label: `${project.title} · ${names.get(project.environmentId) ?? project.environmentId}`,
      },
    ]),
  );
}

export function DesignFileProjectPicker({
  projects,
  value,
  onChange,
}: {
  readonly projects: ReturnType<typeof useDesignFileProjects>;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const ui = useUiText();
  return (
    <Select value={value} onValueChange={(next) => onChange(next ?? "local")}>
      <SelectTrigger aria-label={ui("Design project", "Проект макета")}>
        <SelectValue>
          {value === "local"
            ? ui("No project", "Без проекта")
            : (projects.get(value)?.label ?? "Unavailable project")}
        </SelectValue>
      </SelectTrigger>
      <SelectPopup alignItemWithTrigger={false}>
        <SelectItem value="local">{ui("No project", "Без проекта")}</SelectItem>
        {[...projects].map(([key, { project, label }]) => (
          <SelectItem key={key} value={key} label={label}>
            <span className="flex items-center gap-2">
              <ProjectFavicon project={project} />
              {label}
            </span>
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
