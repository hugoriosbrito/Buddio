//! User-facing strings for commands / hotkeys / virtual cable (en | pt).

pub fn t(locale: &str, key: &str) -> String {
    let pt = locale == "pt";
    match key {
        "err.test_sample_missing" => {
            if pt {
                "Amostra de teste não encontrada (resources/samples). Recompile o app com resources/samples."
            } else {
                "Test sample not found (resources/samples). Rebuild the app with resources/samples."
            }
        }
        .into(),
        "err.no_folder" => {
            if pt {
                "nenhuma pasta selecionada"
            } else {
                "no folder selected"
            }
        }
        .into(),
        "err.virtual_busy" => {
            if pt {
                "Já existe uma verificação/instalação do cabo virtual em andamento. Aguarde terminar."
            } else {
                "A virtual cable check/install is already running. Wait for it to finish."
            }
        }
        .into(),
        "err.virtual_interrupted" => {
            if pt {
                "instalação do cabo virtual interrompida"
            } else {
                "virtual cable installation interrupted"
            }
        }
        .into(),
        "err.virtual_missing_after_install" => {
            if pt {
                "cabo virtual não encontrado após a instalação"
            } else {
                "virtual cable not found after installation"
            }
        }
        .into(),
        "msg.virtual_reboot" => {
            if pt {
                "VB-CABLE instalado. Reinicie o Windows e abra o Buddio de novo para concluir a rota."
            } else {
                "VB-CABLE installed. Restart Windows and open Buddio again to finish the route."
            }
        }
        .into(),
        "msg.virtual_ready_prefix" => {
            if pt {
                "Rota pronta: voz + sons vão para"
            } else {
                "Route ready: voice + sounds go to"
            }
        }
        .into(),
        "msg.virtual_ready_suffix" => {
            if pt {
                "No Discord/Zoom, escolha {capture} como microfone. Dica: desative a supressão de ruído do Discord para músicas longas."
            } else {
                "In Discord/Zoom, pick {capture} as the microphone. Tip: disable Discord noise suppression for long music."
            }
        }
        .into(),
        "err.vbcable_setup_missing" => {
            if pt {
                "VBCABLE_Setup_x64.exe não encontrado no pacote"
            } else {
                "VBCABLE_Setup_x64.exe not found in the package"
            }
        }
        .into(),
        "err.vbcable_uac_cancelled" => {
            if pt {
                "instalação do VB-CABLE cancelada no UAC. Aceite a permissão de administrador e tente de novo."
            } else {
                "VB-CABLE install cancelled at UAC. Accept the administrator prompt and try again."
            }
        }
        .into(),
        "err.hotkey_bare_keys" => {
            if pt {
                "Atalhos sem Ctrl/Alt/Shift não funcionam bem no Windows (ex.: F12). Use Ctrl+Shift+1."
            } else {
                "Hotkeys without Ctrl/Alt/Shift work poorly on Windows (e.g. F12). Use Ctrl+Shift+1."
            }
        }
        .into(),
        "err.hotkey_removed_bare" => {
            if pt {
                "Atalho '{hotkey}' foi removido: teclas sozinhas não registram no Windows. Capture Ctrl+Shift+1 (ou similar)."
            } else {
                "Hotkey '{hotkey}' was cleared: bare keys do not register on Windows. Capture Ctrl+Shift+1 (or similar)."
            }
        }
        .into(),
        "err.hotkey_conflict" => {
            if pt {
                "Atalho '{hotkey}' indisponível (outro app já usa). Foi limpo — capture outro com Ctrl/Alt/Shift."
            } else {
                "Hotkey '{hotkey}' unavailable (another app owns it). Cleared — capture another with Ctrl/Alt/Shift."
            }
        }
        .into(),
        "err.stop_all_conflict" => {
            if pt {
                "Atalho de Parar tudo '{stop}' indisponível. Vá em Configurações e escolha outro (ex.: Ctrl+Shift+Backspace)."
            } else {
                "Stop-all hotkey '{stop}' unavailable. Go to Settings and pick another (e.g. Ctrl+Shift+Backspace)."
            }
        }
        .into(),
        "err.hotkey_unsupported" => {
            if pt {
                "Atalho '{normalized}' não é suportado pelo sistema e não foi registrado."
            } else {
                "Hotkey '{normalized}' is not supported by the system and was not registered."
            }
        }
        .into(),
        "capture.hint_generic" => {
            if pt {
                "a entrada correspondente do cabo virtual"
            } else {
                "the matching virtual cable input"
            }
        }
        .into(),
        "tray.show_mini" => {
            if pt {
                "Abrir Buddio Mini"
            } else {
                "Open Buddio Mini"
            }
        }
        .into(),
        "tray.show_main" => {
            if pt {
                "Abrir Buddio"
            } else {
                "Open Buddio"
            }
        }
        .into(),
        "tray.stop_all" => {
            if pt {
                "Parar tudo"
            } else {
                "Stop all"
            }
        }
        .into(),
        "tray.quit" => {
            if pt {
                "Sair"
            } else {
                "Quit"
            }
        }
        .into(),
        other => other.to_string(),
    }
}

pub fn tf(locale: &str, key: &str, vars: &[(&str, &str)]) -> String {
    let mut out = t(locale, key);
    for (name, value) in vars {
        out = out.replace(&format!("{{{name}}}"), value);
    }
    out
}
