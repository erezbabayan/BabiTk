import { useEffect, useState } from "react";
import {
  DATE_DISPLAY_PLACEHOLDER,
  ddMmYyyyToIsoDate,
  isoDateToDdMmYyyy,
} from "../lib/date-display";
import { NotebookIcon } from "./NotebookIcons";

interface DateDdMmYyyyInputProps {
  value: string;
  onChange: (isoDate: string) => void;
  min?: string;
  className: string;
}

export function DateDdMmYyyyInput({
  value,
  onChange,
  min,
  className,
}: DateDdMmYyyyInputProps) {
  const [text, setText] = useState(() => isoDateToDdMmYyyy(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(isoDateToDdMmYyyy(value));
    setInvalid(false);
  }, [value]);

  function commitText(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      setInvalid(false);
      setText("");
      onChange("");
      return;
    }
    const iso = ddMmYyyyToIsoDate(trimmed);
    if (!iso) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onChange(iso);
    setText(isoDateToDdMmYyyy(iso));
  }

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        dir="ltr"
        lang="he-IL"
        placeholder={DATE_DISPLAY_PLACEHOLDER}
        value={text}
        aria-label="תאריך יום/חודש/שנה"
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setText(event.target.value);
          setInvalid(false);
        }}
        onBlur={() => commitText(text)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitText(text);
          }
        }}
        className={`${className} !ps-8 ${invalid ? "!border-red-400" : ""}`}
      />
      <label className="absolute inset-y-0 left-0 z-10 flex w-8 cursor-pointer items-center justify-center text-slate-500 hover:text-slate-700">
        <NotebookIcon name="calendar" size={14} className="pointer-events-none" />
        <input
          type="date"
          lang="he-IL"
          value={value}
          min={min}
          aria-label="בחירה מיומן"
          onChange={(event) => {
            setInvalid(false);
            onChange(event.target.value);
          }}
          className="absolute inset-0 cursor-pointer !border-0 !bg-transparent !p-0 opacity-0"
        />
      </label>
    </div>
  );
}
