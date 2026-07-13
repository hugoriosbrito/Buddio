import { useEffect, useState } from "react";
import type { DiagnosticsDto } from "../lib/api";
import * as api from "../lib/api";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { useToastStore } from "../stores/toastStore";
import { useUiStore } from "../stores/uiStore";

export function DiagnosticsModal() {
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
      title="Diagnóstico de áudio"
      description="Estado atual dos dispositivos e avisos do engine."
      onClose={() => setOpen(false)}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            loading={playing}
            onClick={() => void playSample()}
          >
            Reproduzir sample de teste
          </Button>
          <Button variant="primary" onClick={() => setOpen(false)}>
            Fechar
          </Button>
        </div>
      }
    >
      {error ? (
        <p className="text-[13px] text-[var(--buddio-danger)]">{error}</p>
      ) : !data ? (
        <p className="text-[13px] text-[var(--buddio-text-secondary)]">Carregando…</p>
      ) : (
        <div className="flex flex-col gap-4 text-[13px]">
          <div>
            <p className="font-semibold">Monitor</p>
            <p className="text-[var(--buddio-text-secondary)]">
              {data.monitorEnabled
                ? data.monitorDevice ?? "Padrão do sistema"
                : "Desligado"}
            </p>
          </div>
          <div>
            <p className="font-semibold">Saída secundária</p>
            <p className="text-[var(--buddio-text-secondary)]">
              {data.secondaryDevice ?? "Não configurada"}
            </p>
          </div>
          <div>
            <p className="font-semibold">Sample rate</p>
            <p className="text-[var(--buddio-text-secondary)]">
              {data.sampleRate ? `${data.sampleRate} Hz` : "-"}
            </p>
          </div>
          <div>
            <p className="mb-1 font-semibold">Dispositivos detectados</p>
            <ul className="max-h-40 overflow-y-auto rounded-[12px] border border-[var(--buddio-border)] p-2">
              {data.devices.map((d) => (
                <li key={d.name} className="px-1 py-1 text-[var(--buddio-text-secondary)]">
                  {d.name}
                  {d.isDefault ? " (padrão)" : ""}
                </li>
              ))}
            </ul>
          </div>
          {data.warnings.length > 0 ? (
            <div>
              <p className="mb-1 font-semibold text-[var(--buddio-warning)]">Avisos</p>
              <ul className="list-disc space-y-1 pl-5 text-[var(--buddio-text-secondary)]">
                {data.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[var(--buddio-success)]">Nenhum aviso no momento.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
