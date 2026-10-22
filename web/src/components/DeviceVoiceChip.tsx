import { DEVICE_VOICE_CHIP_LABEL } from "../lib/device-voice-chip";

export function DeviceVoiceChip() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-slate-500">
      {DEVICE_VOICE_CHIP_LABEL}
    </span>
  );
}
