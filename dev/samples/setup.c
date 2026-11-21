// A stand-in Windows installer for the test server. Copies game.exe from its
// own folder into the folder named by /DIR="..." (as Inno Setup takes it), or
// into C:\Games\Setup Quest when no folder is given. No window, no questions.
#include <windows.h>
#include <shlobj.h>
#include <stdio.h>
#include <string.h>

int WINAPI WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR args, int show) {
	char target[MAX_PATH] = "C:\\Games\\Setup Quest";
	for (int i = 1; i < __argc; i++) {
		if (_strnicmp(__argv[i], "/DIR=", 5) == 0) strncpy(target, __argv[i] + 5, MAX_PATH - 1);
	}

	char source[MAX_PATH];
	GetModuleFileNameA(NULL, source, MAX_PATH);
	char *slash = strrchr(source, '\\');
	if (!slash) return 2;
	strcpy(slash + 1, "game.exe");

	char destination[MAX_PATH];
	snprintf(destination, MAX_PATH, "%s\\Quest.exe", target);
	SHCreateDirectoryExA(NULL, target, NULL);
	return CopyFileA(source, destination, FALSE) ? 0 : 1;
}
