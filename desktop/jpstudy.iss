; Inno Setup 6 安装包定义。用法见 desktop/package.sh：
;   "{ISCC}" /DAppVersion=0.3.0 desktop/jpstudy.iss
; 产物：desktop/dist/jpstudy-setup-<version>.exe
#define AppName "日本語 · 学习站"
#define AppExe "jpstudy.exe"
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
; AppId 决定升级/卸载能否认成同一个应用——发布后不要再改。
AppId={{8F3A2C1E-6B4D-4A2F-9C7E-1D5B8A3F0C22}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=jpstudy contributors
AppPublisherURL=https://github.com/melodytown/jpstudy-zh
DefaultDirName={autopf}\jpstudy
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=jpstudy-setup-{#AppVersion}
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
; 不需要管理员权限：默认装到当前用户的 Programs 下，避免 UAC 和“装到 Program Files 后
; WebView2 用户数据目录权限出问题”这一整类麻烦。
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#AppExe}
AllowNoIcons=yes

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加快捷方式："; Flags: unchecked

[Files]
; --onedir：整个 dist\jpstudy 目录（exe + _internal/ 里的 site/ 与运行库）
Source: "dist\jpstudy\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\THIRD-PARTY-NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{group}\数据来源与许可"; Filename: "{app}\THIRD-PARTY-NOTICES.md"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "启动 {#AppName}"; Flags: nowait postinstall skipifsilent
