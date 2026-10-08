import { useLayoutEffect, useRef } from "react";
import { cn } from "../utils/cn";

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  singleLine?: boolean;
}

/** Uncontrolled contentEditable text – keeps the caret stable while typing and commits on blur. */
export function Editable({ value, onChange, className, singleLine }: Props) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (ref.current) ref.current.innerText = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onBlur={(e) => onChange(e.currentTarget.innerText.replace(/\n+$/, ""))}
      onKeyDown={(e) => {
        if (singleLine && e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
      }}
      className={cn(
        "whitespace-pre-wrap rounded-[2px] outline-none transition-colors hover:bg-brand/5 focus:bg-brand/10 print:bg-transparent",
        className,
      )}
    />
  );
}
