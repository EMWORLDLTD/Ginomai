; Preserve electron-builder's install/upgrade/uninstall implementation.
!macro customInstall
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/no-desktop-shortcut" $R1
  ${IfNot} ${Errors}
    Delete "$newDesktopLink"
  ${Else}
    ClearErrors
    ${GetOptions} $R0 "/desktop-shortcut" $R1
    ${IfNot} ${Errors}
      CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    ${EndIf}
  ${EndIf}
  ClearErrors
!macroend
