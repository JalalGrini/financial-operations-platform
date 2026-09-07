"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuContent = React.forwardRef(
  (
    {
      className,
      sideOffset = 4,
      ...props
    }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>,
    ref: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.Content>>,
  ) => (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "efop-pop z-50 min-w-[8rem] overflow-hidden rounded-xl border border-border/80 bg-popover/98 text-popover-foreground shadow-[0_20px_48px_hsl(var(--foreground)/0.16)] backdrop-blur-xl",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  ),
);
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef(
  (
    {
      className,
      inset,
      ...props
    }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
      inset?: boolean;
    },
    ref: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.Item>>,
  ) => (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        "efop-hover-lift relative flex cursor-default select-none items-center rounded-lg px-2.5 py-2 text-sm outline-none transition-[background-color,color,box-shadow,transform] duration-200 focus:bg-accent focus:text-accent-foreground focus:shadow-[0_10px_24px_hsl(var(--foreground)/0.08)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        inset && "ps-8",
        className,
      )}
      {...props}
    >
      {props.children}
    </DropdownMenuPrimitive.Item>
  ),
);
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuCheckboxItem = React.forwardRef(
  (
    {
      className,
      children,
      checked,
      ...props
    }: React.ComponentPropsWithoutRef<
      typeof DropdownMenuPrimitive.CheckboxItem
    >,
    ref: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>>,
  ) => (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        "efop-hover-lift relative flex cursor-default select-none items-center rounded-lg py-2 ps-8 pe-2.5 text-sm outline-none transition-[background-color,color,box-shadow,transform] duration-200 focus:bg-accent focus:text-accent-foreground focus:shadow-[0_10px_24px_hsl(var(--foreground)/0.08)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="absolute start-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  ),
);
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuRadioItem = React.forwardRef(
  (
    {
      className,
      children,
      ...props
    }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>,
    ref: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>>,
  ) => (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      className={cn(
        "efop-hover-lift relative flex cursor-default select-none items-center rounded-lg py-2 ps-8 pe-2.5 text-sm outline-none transition-[background-color,color,box-shadow,transform] duration-200 focus:bg-accent focus:text-accent-foreground focus:shadow-[0_10px_24px_hsl(var(--foreground)/0.08)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute start-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  ),
);
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const DropdownMenuLabel = React.forwardRef(
  (
    {
      className,
      ...props
    }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>,
    ref: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.Label>>,
  ) => (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cn("px-2 py-1.5 text-sm font-semibold", className)}
      {...props}
    />
  ),
);
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef(
  (
    {
      className,
      ...props
    }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>,
    ref: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.Separator>>,
  ) => (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  ),
);
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn("ms-auto text-xs tracking-widest opacity-60", className)}
    {...props}
  />
);
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuRadioGroup,
};
