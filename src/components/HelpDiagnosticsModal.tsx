import { useEffect, useMemo, useState } from "react";
import type { DiagnosticsDto } from "../lib/api";
import * as api from "../lib/api";
import { useT, type MessageKey } from "../i18n";
import { classifyRouteHealth, sanitizeDiagnostics, type RouteProblemId } from "../lib/routeHealth";
import { useHelpStore } from "../stores/helpStore";
import { useToastStore } from "../stores/toastStore";
import { useUiStore } from "../stores/uiStore";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";

const problemKeys: Record<RouteProblemId, { title: MessageKey; detail: MessageKey; action?: MessageKey }> = {
  "virtual-mic-missing": { title: "help.problem.virtualMicMissing.title", detail: "help.problem.virtualMicMissing.detail", action: "help.problem.virtualMicMissing.action" },
  "device-changed": { title: "help.problem.deviceChanged.title", detail: "help.problem.deviceChanged.detail", action: "help.problem.deviceChanged.action" },
  "monitor-disabled": { title: "help.problem.monitorDisabled.title", detail: "help.problem.monitorDisabled.detail", action: "help.problem.monitorDisabled.action" },
  "monitor-missing": { title: "help.problem.monitorMissing.title", detail: "help.problem.monitorMissing.detail", action: "help.problem.monitorMissing.action" },
  "route-ready": { title: "help.problem.routeReady.title", detail: "help.problem.routeReady.detail" },
};

export function HelpDiagnosticsModal() {
  const t = useT();
  const isOpen = useHelpStore((state) => state.isOpen);
  const close = useHelpStore((state) => state.close);
  const push = useToastStore((state) => state.push);
  const [snapshot, setSnapshot] = useState<DiagnosticsDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const health = useMemo(() => snapshot && classifyRouteHealth(snapshot), [snapshot]);
  const problem = health?.problem;

  const refresh = async () => {
    const next = await api.getDiagnostics();
    setSnapshot(next);
    setError(null);
    return next;
  };

  useEffect(() => {
    if (!isOpen) return;
    setSnapshot(null);
    setVerified(false);
    void refresh().catch((reason) => setError(String(reason)));
  }, [isOpen]);

  const repair = async () => {
    setBusy(true);
    try {
      await api.ensureVirtualCable();
      const next = await refresh();
      setVerified(classifyRouteHealth(next).problem.id === "route-ready");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const openRouting = () => {
    close();
    useUiStore.getState().setView("routing");
  };

  const copyReport = async () => {
    if (!snapshot || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(sanitizeDiagnostics(snapshot));
      push({ kind: "success", message: t("help.copySuccess") });
    } catch {
      push({ kind: "error", message: t("help.copyError") });
    }
  };

  const keys = problem ? problemKeys[problem.id] : null;
  const repairKind = problem?.repair;
  return <Modal open={isOpen} title={t("help.title")} description={t("help.description")} onClose={close} footer={<Button variant="secondary" onClick={close}>{t("common.close")}</Button>}>
    <div className="flex flex-col gap-4 text-[13px]" aria-live="polite">
      {error ? <p role="alert" className="text-[var(--buddio-danger)]">{error}</p> : null}
      {!snapshot ? <p className="text-[var(--buddio-text-secondary)]">{t("help.checking")}</p> : null}
      {snapshot && health && keys ? <>
        <div className="rounded-[var(--radius-control)] border border-[var(--buddio-border)] p-3">
          <p className="font-semibold">{t(health.level === "ready" ? "help.ready" : health.level === "blocked" ? "help.blocked" : "help.attention")}</p>
          <p className="mt-2 text-[16px] font-bold">{t(keys.title)}</p>
          <p className="mt-1 text-[var(--buddio-text-secondary)]">{t(keys.detail)}</p>
        </div>
        {verified ? <p className="font-semibold text-[var(--buddio-success)]">{t("help.resolved")}</p> : null}
        {repairKind === "ensure-virtual-cable" ? <Button variant="primary" loading={busy} onClick={() => void repair()}>{busy ? t("help.repairing") : t(keys.action!)}</Button> : null}
        {repairKind === "open-routing" ? <Button variant="primary" onClick={openRouting}>{t(keys.action!)}</Button> : null}
        {repairKind === "none" ? <div><p className="font-semibold">{t("help.whatHappening")}</p><p className="mt-1 text-[var(--buddio-text-secondary)]">{t("help.guide.generic")}</p></div> : null}
        <details><summary className="cursor-pointer font-semibold">{t("help.technicalDetails")}</summary><pre className="mt-2 whitespace-pre-wrap text-[11px] text-[var(--buddio-text-secondary)]">{sanitizeDiagnostics(snapshot)}</pre><Button className="mt-2" variant="ghost" onClick={() => void copyReport()}>{t("common.copy")}</Button></details>
      </> : null}
    </div>
  </Modal>;
}
