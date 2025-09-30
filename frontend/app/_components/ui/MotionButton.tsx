"use client";

import { motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";

type Props = React.ComponentProps<"a"> & {
  variant?: "primary" | "ghost";
};

export default function MotionButton({ className, variant = "primary", ...rest }: Props) {
  const prefersReduced = useReducedMotion();

  return (
    <motion.a
      whileHover={prefersReduced ? undefined : { y: -2, boxShadow: "0 10px 18px rgba(0,0,0,0.25)" }}
      whileTap={prefersReduced ? undefined : { scale: 0.98, y: 0 }}
      transition={{ type: "spring", stiffness: 360, damping: 24 }}
      className={clsx(
        "inline-flex items-center justify-center rounded-xl px-5 py-3 font-semibold focus:outline-none focus-visible:ring-2 transition",
        variant === "primary"
          ? "text-white bg-indigo-600/90 hover:bg-indigo-500 focus-visible:ring-indigo-400/60"
          : "text-white/90 ring-1 ring-white/40 hover:bg-white/10 focus-visible:ring-white/60",
        className
      )}
      {...rest}
    />
  );
}
