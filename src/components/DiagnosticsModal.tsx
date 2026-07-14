import { useEffect, useState } from "react";
import type { DiagnosticsDto } from "../lib/api";
import * as api from "../lib/api";
import { useT } from "../i18n";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { useToastStore } from "../stores/toastStore";
import { useUiStore } from "../stores/uiStore";

export function DiagnosticsModal() {
  const t = useT();
  const open = useUiStore((s) => s.diagnosticsOpen);
  const setOpen = useUiStore((s) => s.setDiagnosticsOpen);
  const pushToast = useToastStore((s) => s.push);
  const [data, setData] = useState<DiagnosticsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!open) return;
    void api
      .getDiagnostics()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(String(err)));
  }, [open]);

  const playSample = async () => {
    setPlaying(true);
    try {
      await api.playTestSample();
    } catch (err) {
      pushToast({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setPlaying(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t("diag.title")}
      description={t("diag.description")}
      onClose={() => setOpen(false)}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            loading={playing}
            onClick={() => void playSample()}
          >
            {t("diag.playSample")}
          </Button>
          <Button variant="primary" onClick={() => setOpen(false)}>
            {t("common.close")}
          </Button>
        </div>
      }
    >
      {error ? (
        <p className="text-[13px] text-[var(--buddio-danger)]">{error}</p>
      ) : !data ? (
        <p className="text-[13px] text-[var(--buddio-text-secondary)]">
          {t("common.loading")}
        </p>
      ) : (
        <div className="flex flex-col gap-4 text-[13px]">
          <div>
            <p className="font-semibold">{t("diag.monitor")}</p>
            <p className="text-[var(--buddio-text-secondary)]">
              {data.monitorEnabled
                ? (data.monitorDevice ?? t("common.systemDefault"))
                : t("common.off")}
            </p>
          </div>
          <div>
            <p className="font-semibold">{t("diag.secondary")}</p>
            <p className="text-[var(--buddio-text-secondary)]">
              {data.secondaryDevice ?? t("common.notConfigured")}
            </p>
          </div>
          <div>
            <p className="font-semibold">{t("diag.sampleRate")}</p>
            <p className="text-[var(--buddio-text-secondary)]">
              {data.sampleRate ? `${data.sampleRate} Hz` : "-"}
            </p>
          </div>
          <div>
            <p className="mb-1 font-semibold">{t("diag.devicesDetected")}</p>
            <ul className="max-h-40 overflow-y-auto rounded-[12px] border border-[var(--buddio-border)] p-2">
              {data.devices.map((d) => (
                <li
                  key={d.name}
                  className="px-1 py-1 text-[var(--buddio-text-secondary)]"
                >
                  {d.isDefault
                    ? t("common.deviceDefaultSuffix", { name: d.name })
                    : d.name}
                </li>
              ))}
            </ul>
          </div>
          {data.warnings.length > 0 ? (
            <div>
              <p className="mb-1 font-semibold text-[var(--buddio-warning)]">
                {t("diag.warnings")}
              </p>
              <ul className="list-disc space-y-1 pl-5 text-[var(--buddio-text-secondary)]">
                {data.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[var(--buddio-success)]">{t("diag.noWarnings")}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
