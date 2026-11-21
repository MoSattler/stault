// A stand-in Windows game for the test server: adds a line to save.txt beside
// itself, then shows a message box and runs until that is dismissed.
#include <windows.h>
#include <stdio.h>
#include <string.h>

int WINAPI WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR args, int show) {
	char path[MAX_PATH];
	GetModuleFileNameA(NULL, path, MAX_PATH);
	char *slash = strrchr(path, '\\');
	if (slash) {
		strcpy(slash + 1, "save.txt");
		FILE *save = fopen(path, "a");
		if (save) {
			fprintf(save, "played, arguments: %s\n", args);
			fclose(save);
		}
	}
	MessageBoxA(NULL, "The sample game is running. Close this to end the session.", "Stault Sample", MB_OK);
	return 0;
}
