; Instalador de Windows (Inno Setup). Se compila con:
;   ISCC.exe /DVersion=1.0.0 instalador.iss
#ifndef Version
  #define Version "1.0.0"
#endif

[Setup]
AppId={{8F1A2C55-3D6B-4E8A-9C1F-5B7D2E4A6C90}
AppName=Limpia Metadatos
AppVersion={#Version}
AppPublisher=Javier
DefaultDirName={autopf}\Limpia Metadatos
DisableProgramGroupPage=yes
; Se instala solo para tu usuario: no pide permisos de administrador.
PrivilegesRequired=lowest
OutputDir=salida
OutputBaseFilename=LimpiaMetadatos-Instalador-Windows
SetupIconFile=recursos\icono.ico
UninstallDisplayIcon={app}\Limpia Metadatos.exe
UninstallDisplayName=Limpia Metadatos
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "escritorio"; Description: "Crear un icono en el escritorio"; GroupDescription: "Accesos directos:"

[Files]
Source: "dist\Limpia Metadatos\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Limpia Metadatos"; Filename: "{app}\Limpia Metadatos.exe"
Name: "{autodesktop}\Limpia Metadatos"; Filename: "{app}\Limpia Metadatos.exe"; Tasks: escritorio

[Run]
Filename: "{app}\Limpia Metadatos.exe"; Description: "Abrir Limpia Metadatos"; Flags: nowait postinstall skipifsilent
