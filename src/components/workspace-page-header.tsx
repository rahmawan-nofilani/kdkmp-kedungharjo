import type { ReactNode } from "react";

type WorkspacePageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  aside?: ReactNode;
};

export function WorkspacePageHeader({ eyebrow, title, description, aside }: WorkspacePageHeaderProps) {
  return (
    <header className="workspace-header unified-workspace-header">
      <div>
        <p className="workspace-kicker">{eyebrow}</p>
        <h1>{title}</h1>
        {description ? <p className="unified-workspace-description">{description}</p> : null}
      </div>
      {aside ? <div className="unified-workspace-aside">{aside}</div> : null}
    </header>
  );
}
