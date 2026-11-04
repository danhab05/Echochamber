"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, "aria-label": label, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "group relative flex h-6 w-full touch-none select-none items-center data-[disabled]:opacity-40",
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-white/10">
      <SliderPrimitive.Range className="absolute h-full rounded-full bg-gradient-to-r from-primary to-accent" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb aria-label={label} className="block h-4 w-4 rounded-full border-2 border-white bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.8)] transition-transform hover:scale-125 focus-visible:scale-125 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30" />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
