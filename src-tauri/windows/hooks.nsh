; Buddio NSIS hooks — install / uninstall VB-CABLE with the app.
; Requires installMode perMachine (admin) so the driver setup can elevate.
;
; Ownership marker: HKLM\Software\Buddio\VirtualCableOwned = 1
; Only set when we install VB-CABLE ourselves; only then do we uninstall it.

!include "LogicLib.nsh"
!include "x64.nsh"

!define BUDDIO_VBCABLE_REG "Software\Buddio"
!define BUDDIO_VBCABLE_OWNED "VirtualCableOwned"

; Prefer the x64 setup next to its .inf/.cat siblings (must run from that folder).
!macro BuddioResolveVbCableSetup outVar
  StrCpy ${outVar} ""
  ${If} ${FileExists} "$INSTDIR\resources\vbcable\pack\VBCABLE_Setup_x64.exe"
    StrCpy ${outVar} "$INSTDIR\resources\vbcable\pack\VBCABLE_Setup_x64.exe"
  ${ElseIf} ${FileExists} "$INSTDIR\vbcable\pack\VBCABLE_Setup_x64.exe"
    StrCpy ${outVar} "$INSTDIR\vbcable\pack\VBCABLE_Setup_x64.exe"
  ${ElseIf} ${FileExists} "$INSTDIR\resources\vbcable\pack\VBCABLE_Setup.exe"
    StrCpy ${outVar} "$INSTDIR\resources\vbcable\pack\VBCABLE_Setup.exe"
  ${ElseIf} ${FileExists} "$INSTDIR\vbcable\pack\VBCABLE_Setup.exe"
    StrCpy ${outVar} "$INSTDIR\vbcable\pack\VBCABLE_Setup.exe"
  ${EndIf}
!macroend

; Returns "1" in $R9 if a VB-Audio Cable device/service looks present.
!macro BuddioDetectVbCable
  StrCpy $R9 "0"
  ; Driver service name used by VB-CABLE on modern Windows.
  ReadRegStr $R8 HKLM "SYSTEM\CurrentControlSet\Services\VBAudioVACWDM" "ImagePath"
  ${If} $R8 != ""
    StrCpy $R9 "1"
  ${Else}
    ; Fallback: classic driver file.
    ${If} ${FileExists} "$SYSDIR\drivers\vbaudio_cable64_win7.sys"
      StrCpy $R9 "1"
    ${ElseIf} ${FileExists} "$SYSDIR\drivers\vbaudio_cable_win7.sys"
      StrCpy $R9 "1"
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; Nothing — files must land in $INSTDIR before we can run the bundled setup.
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Checking VB-CABLE (virtual audio cable)..."
  !insertmacro BuddioDetectVbCable
  ${If} $R9 == "1"
    DetailPrint "VB-CABLE already present — skipping install (will not remove on uninstall)."
    Goto buddio_vbcable_post_done
  ${EndIf}

  !insertmacro BuddioResolveVbCableSetup $R7
  ${If} $R7 == ""
    DetailPrint "VB-CABLE pack missing from installer resources — skip."
    MessageBox MB_ICONEXCLAMATION|MB_OK \
      "O pacote VB-CABLE nao veio no instalador.$\r$\n$\r$\nVoce ainda pode ativar a rota pelo Buddio (download sob demanda).$\r$\n$\r$\nVB-CABLE is VB-Audio donationware: https://vb-cable.com"
    Goto buddio_vbcable_post_done
  ${EndIf}

  DetailPrint "Installing VB-CABLE from $R7 ..."
  ; Trust publisher cert when a .cat is present (reduces Windows Security prompt).
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$$cat = Get-ChildItem -Path ''$INSTDIR\resources\vbcable\pack'',''$INSTDIR\vbcable\pack'' -Filter *.cat -ErrorAction SilentlyContinue | Select-Object -First 1; if ($$cat) { $$cer = Join-Path $$env:TEMP ''buddio-vbcable.cer''; (Get-AuthenticodeSignature -FilePath $$cat.FullName).SignerCertificate | Export-Certificate -Type CERT -FilePath $$cer | Out-Null; certutil -addstore -f TrustedPublisher $$cer | Out-Null }"'
  Pop $0

  ; Silent-ish install flags used by VB-Audio automation communities.
  ; Working directory must be the pack folder (INF/CAT siblings).
  SetOutPath "$INSTDIR\resources\vbcable\pack"
  ${IfNot} ${FileExists} "$INSTDIR\resources\vbcable\pack\VBCABLE_Setup_x64.exe"
    ${If} ${FileExists} "$INSTDIR\vbcable\pack\VBCABLE_Setup_x64.exe"
      SetOutPath "$INSTDIR\vbcable\pack"
    ${EndIf}
  ${EndIf}

  ExecWait '"$R7" -h -i -H -n' $0
  DetailPrint "VB-CABLE setup exit code: $0"

  ; Mark ownership so uninstall removes only what we installed.
  WriteRegDWORD HKLM "${BUDDIO_VBCABLE_REG}" "${BUDDIO_VBCABLE_OWNED}" 1
  DetailPrint "Marked VB-CABLE as installed by Buddio."

  MessageBox MB_ICONINFORMATION|MB_OK \
    "O Buddio instalou o VB-CABLE (cabo virtual de audio da VB-Audio).$\r$\n$\r$\nReinicie o Windows se o Discord/Zoom ainda nao listar CABLE Output.$\r$\n$\r$\nVB-CABLE e donationware: https://vb-cable.com"

  buddio_vbcable_post_done:
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Checking whether Buddio owns the VB-CABLE install..."
  ReadRegDWORD $R6 HKLM "${BUDDIO_VBCABLE_REG}" "${BUDDIO_VBCABLE_OWNED}"
  ${If} $R6 != 1
    DetailPrint "VB-CABLE was not installed by Buddio — leaving it alone."
    Goto buddio_vbcable_preun_done
  ${EndIf}

  !insertmacro BuddioResolveVbCableSetup $R7
  ${If} $R7 == ""
    DetailPrint "Bundled VB-CABLE setup missing — cannot auto-uninstall the driver."
    MessageBox MB_ICONEXCLAMATION|MB_OK \
      "O Buddio nao encontrou o desinstalador do VB-CABLE.$\r$\nRemova o driver manualmente em Configuracoes de Som / Gerenciador de Dispositivos se quiser."
    Goto buddio_vbcable_clear_owned
  ${EndIf}

  DetailPrint "Uninstalling VB-CABLE (owned by Buddio) from $R7 ..."
  SetOutPath "$INSTDIR\resources\vbcable\pack"
  ${IfNot} ${FileExists} "$INSTDIR\resources\vbcable\pack\VBCABLE_Setup_x64.exe"
    ${If} ${FileExists} "$INSTDIR\vbcable\pack\VBCABLE_Setup_x64.exe"
      SetOutPath "$INSTDIR\vbcable\pack"
    ${EndIf}
  ${EndIf}

  ; Mirror install flags with -u (remove) instead of -i (install).
  ExecWait '"$R7" -h -u -H -n' $0
  DetailPrint "VB-CABLE uninstall exit code: $0"

  MessageBox MB_ICONINFORMATION|MB_OK \
    "O VB-CABLE instalado pelo Buddio foi removido.$\r$\nReinicie o Windows para concluir a remocao do driver."

  buddio_vbcable_clear_owned:
  DeleteRegValue HKLM "${BUDDIO_VBCABLE_REG}" "${BUDDIO_VBCABLE_OWNED}"
  DeleteRegKey /ifempty HKLM "${BUDDIO_VBCABLE_REG}"

  buddio_vbcable_preun_done:
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Ownership already cleared in PREUNINSTALL.
!macroend
