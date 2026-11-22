# With a width and height: sets the screen to that size.
# With nothing: prints where the mouse pointer is, as "pointer X Y".
param([int]$width = 0, [int]$height = 0)
Add-Type -AssemblyName System.Windows.Forms
if ($width -eq 0) {
	$at = [System.Windows.Forms.Cursor]::Position
	"pointer $($at.X) $($at.Y)"
	exit
}
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Display {
	[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
	public struct DEVMODE {
		[MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
		public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra;
		public int dmFields, dmPositionX, dmPositionY, dmDisplayOrientation, dmDisplayFixedOutput;
		public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
		[MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
		public short dmLogPixels;
		public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
		public int a, b, c, d, e, f, g, h;
	}
	[DllImport("user32.dll")] public static extern int EnumDisplaySettings(string device, int mode, ref DEVMODE settings);
	[DllImport("user32.dll")] public static extern int ChangeDisplaySettings(ref DEVMODE settings, int flags);
	public static int Set(int width, int height) {
		DEVMODE mode = new DEVMODE();
		mode.dmSize = (short)Marshal.SizeOf(mode);
		EnumDisplaySettings(null, -1, ref mode);
		mode.dmPelsWidth = width;
		mode.dmPelsHeight = height;
		mode.dmFields = 0x80000 | 0x100000; // width and height
		return ChangeDisplaySettings(ref mode, 1); // 1: remember it
	}
}
"@
"result $([Display]::Set($width, $height))"
