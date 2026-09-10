"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

type OTPContextValue = {
  value: string;
  maxLength: number;
  focused: boolean;
  inputId: string;
  focusInput: () => void;
};

const OTPContext = createContext<OTPContextValue | null>(null);

function useOTP() {
  const ctx = useContext(OTPContext);
  if (!ctx) {
    throw new Error("InputOTPSlot must be used inside InputOTP");
  }
  return ctx;
}

const slotChrome =
  "bg-muted/70 data-[active=true]:ring-primary/20 data-[active=true]:border-primary/50 h-8 w-8 rounded-lg border text-sm font-medium shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,1),inset_0px_-1px_0px_0px_rgba(0,0,0,0.05),0px_2px_4px_0px_rgba(0,0,0,0.05)] transition-all data-[active=true]:ring-2 dark:shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.25),inset_0px_-1px_0px_0px_rgba(0,0,0,0.7),0px_2px_4px_0px_rgba(0,0,0,0.3)]";

export function InputOTP({
  id,
  maxLength = 6,
  value,
  onChange,
  disabled = false,
  children,
  autoComplete = "one-time-code",
  name = "one-time-code",
  autoFocus = false,
}: {
  id?: string;
  maxLength?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
  autoComplete?: string;
  name?: string;
  autoFocus?: boolean;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.replace(/\D/g, "").slice(0, maxLength);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const ctx = useMemo<OTPContextValue>(
    () => ({
      value: digits,
      maxLength,
      focused,
      inputId,
      focusInput,
    }),
    [digits, focusInput, focused, inputId, maxLength],
  );

  return (
    <OTPContext.Provider value={ctx}>
      <div className="relative" onClick={focusInput}>
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          inputMode="numeric"
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          pattern="[0-9]*"
          maxLength={maxLength}
          disabled={disabled}
          value={digits}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) =>
            onChange(event.target.value.replace(/\D/g, "").slice(0, maxLength))
          }
          autoFocus={autoFocus}
          className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
        />
        {children}
      </div>
    </OTPContext.Provider>
  );
}

export function InputOTPGroup({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("flex gap-1.5", className)}>{children}</div>;
}

export function InputOTPSeparator({
  className,
  children = "—",
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={cn("text-muted-foreground text-lg", className)}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

export function InputOTPSlot({
  index,
  className,
}: {
  index: number;
  className?: string;
}) {
  const { value, maxLength, focused, focusInput } = useOTP();
  const char = value[index] ?? "";
  const filled = value.length;
  const active =
    focused &&
    (filled === maxLength ? index === maxLength - 1 : index === filled);

  return (
    <div
      data-active={active ? "true" : undefined}
      onClick={focusInput}
      className={cn(
        "flex items-center justify-center text-foreground",
        slotChrome,
        className,
      )}
      aria-hidden="true"
    >
      {char}
    </div>
  );
}
