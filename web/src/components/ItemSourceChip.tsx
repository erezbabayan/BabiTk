import babitkLogo from "../assets/babitk-logo.webp";
import whatsappLogo from "../assets/whatsapp-logo.svg";
import {
  BABITK_CHIP_LABEL,
  WHATSAPP_CHIP_LABEL,
  itemSourceChip,
} from "../lib/item-source-chip";
import { DeviceVoiceChip } from "./DeviceVoiceChip";

const CHIP_CLASS =
  "inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-slate-500";

function SourceChip({ logo, label, round }: { logo: string; label: string; round: boolean }) {
  return (
    <span dir="ltr" className={CHIP_CLASS} data-babitk-source-chip={label}>
      <img
        src={logo}
        alt=""
        width={16}
        height={16}
        className={`h-4 w-4 ${round ? "rounded-full" : ""}`}
      />
      {label}
    </span>
  );
}

/** Source chip shown top-left on item cards: BabiSnap, WhatsApp or BabiTk. */
export function ItemSourceChip({
  item,
}: {
  item: { metadata?: unknown; source_materials?: unknown };
}) {
  const kind = itemSourceChip(item);
  if (kind === "babisnap") return <DeviceVoiceChip />;
  if (kind === "whatsapp") {
    return <SourceChip logo={whatsappLogo} label={WHATSAPP_CHIP_LABEL} round={false} />;
  }
  if (kind === "babitk") {
    return <SourceChip logo={babitkLogo} label={BABITK_CHIP_LABEL} round />;
  }
  return null;
}
