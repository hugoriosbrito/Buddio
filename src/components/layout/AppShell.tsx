import type { ReactNode } from "react";
import { Inspector } from "./Inspector";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { Titlebar } from "./Titlebar";
import { ToastViewport } from "../ui/Toast";
import { useUiStore } from "../../stores/uiStore";

type Props = {
  children: ReactNode;
  showInspector?: boolean;
};

export function AppShell({ children, showInspector = true }: Props) {
  const inspectorOpen = useUiStore((s) => s.inspectorOpen);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--buddio-window)] text-[var(--buddio-text)]">
      <Titlebar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
            {showInspector && inspectorOpen ? <Inspector /> : null}
          </div>
          <StatusBar />
        </div>
      </div>
      <ToastViewport />
    </div>
  );
}
