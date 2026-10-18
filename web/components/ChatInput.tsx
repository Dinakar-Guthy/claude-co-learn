"use client";

import { useEffect, useId, useRef, useState } from "react";
import { focusRing } from "./ui";

const MAX_HEIGHT = 200;

export interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  maxLength?: number;
}

/** Auto-growing textarea. Enter sends, Shift+Enter adds a newline. */
export function ChatInput({ onSend, disabled = false, placeholder = "Message Claude…", autoFocus = false, maxLength = 4000 }: ChatInputProps) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  function send() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); send(); }}
      className="flex items-end gap-2 rounded-card border border-border bg-surface p-2 shadow-soft focus-within:border-primary"
    >
      <label htmlFor={id} className="sr-only">Message</label>
      <textarea
        id={id}
        ref={ref}
        rows={1}
        value={value}
        maxLength={maxLength}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        className="max-h-[200px] flex-1 resize-none bg-transparent px-3 py-2 leading-relaxed outline-none placeholder:text-muted disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="Send"
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition disabled:opacity-40 ${focusRing}`}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="currentColor">
          <path d="M8 2.5a.75.75 0 0 1 .53.22l4.5 4.5a.75.75 0 1 1-1.06 1.06L8.75 5.06v8.19a.75.75 0 0 1-1.5 0V5.06L4.03 8.28a.75.75 0 0 1-1.06-1.06l4.5-4.5A.75.75 0 0 1 8 2.5Z" />
        </svg>
      </button>
    </form>
  );
}
