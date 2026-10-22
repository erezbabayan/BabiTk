import { DEVICE_VOICE_CHIP_LABEL } from "../lib/device-voice-chip";
import logo from "../assets/babisnap-logo.webp";

export function DeviceVoiceChip() {
  return (
    <span
      dir="ltr"
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-slate-500"
    >
      <img src={logo} alt="" width={16} height={16} className="h-4 w-4 rounded-full" />
      {DEVICE_VOICE_CHIP_LABEL}
    </span>
  );
}
