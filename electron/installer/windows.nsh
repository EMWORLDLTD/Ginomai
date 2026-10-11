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

; This page runs only on an actual uninstall. Upgrades preserve all user data.
!ifdef BUILD_UNINSTALLER
  !include MUI2.nsh
  !include FileFunc.nsh
  !include nsDialogs.nsh
  Var ginomaiRemoveData
  Var ginomaiDataCheckbox
  Var ginomaiProfile
  Var ginomaiRoaming
  Var ginomaiLocal
  Var ginomaiCleanupFailed

  Function un.GinomaiDataPage
    ${If} ${isUpdated}
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "Saved data" "Choose what to keep after uninstalling Ginomai."
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 36u "Your saved data and downloads are kept unless you select the option below."
    Pop $0
    ${NSD_CreateCheckbox} 0 45u 100% 20u "Remove saved data and downloads"
    Pop $ginomaiDataCheckbox
    ${If} $ginomaiRemoveData == "1"
      ${NSD_Check} $ginomaiDataCheckbox
    ${EndIf}
    ${NSD_CreateLabel} 0 76u 100% 58u "Deletes settings, saved songs, sessions, transcripts, downloaded AI and Bible content, and uploaded media for your account. Exported files outside the app are kept."
    Pop $0
    nsDialogs::Show
  FunctionEnd

  Function un.GinomaiDataPageLeave
    ${NSD_GetState} $ginomaiDataCheckbox $ginomaiRemoveData
  FunctionEnd

  !macro customUnWelcomePage
    !insertmacro MUI_UNPAGE_WELCOME
    UninstPage custom un.GinomaiDataPage un.GinomaiDataPageLeave
  !macroend

  !macro customUnInit
    StrCpy $ginomaiRemoveData "0"
    ${GetParameters} $R0
    ClearErrors
    ${GetOptions} $R0 "--delete-app-data" $R1
    ${IfNot} ${Errors}
      StrCpy $ginomaiRemoveData "1"
    ${EndIf}
    ; Capture fixed, current-user locations before all-users shell context changes.
    SetShellVarContext current
    GetFullPathName $ginomaiProfile "$PROFILE"
    GetFullPathName $ginomaiRoaming "$APPDATA"
    GetFullPathName $ginomaiLocal "$LOCALAPPDATA"
    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
    ClearErrors
  !macroend

  !macro GinomaiRemoveData root child
    ${If} "${root}" != ""
      ${If} ${FileExists} "${root}\${child}\*.*"
      ClearErrors
      RMDir /r "${root}\${child}"
      IfErrors 0 +2
      StrCpy $ginomaiCleanupFailed "1"
      ${EndIf}
    ${EndIf}
  !macroend

  !macro customUnInstall
      ${IfNot} ${isUpdated}
      ${AndIf} $ginomaiRemoveData == "1"
        StrCpy $ginomaiCleanupFailed "0"
        !insertmacro GinomaiRemoveData "$ginomaiProfile" ".ginomai"
        !insertmacro GinomaiRemoveData "$ginomaiProfile" ".ginomai-pro"
        !insertmacro GinomaiRemoveData "$ginomaiRoaming" "${APP_FILENAME}"
        !insertmacro GinomaiRemoveData "$ginomaiRoaming" "${APP_PACKAGE_NAME}"
        !insertmacro GinomaiRemoveData "$ginomaiLocal" "${APP_PACKAGE_NAME}-updater"
        ${If} $ginomaiCleanupFailed == "1"
          SetErrorLevel 1
          MessageBox MB_OK|MB_ICONEXCLAMATION "Ginomai was uninstalled, but some saved data could not be removed. Close programs using those files and remove the remaining Ginomai data."
        ${EndIf}
      ${EndIf}
  !macroend
!endif
