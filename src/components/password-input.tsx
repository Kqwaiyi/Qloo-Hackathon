"use client";

import { type InputHTMLAttributes, useState } from "react";

import { input } from "@/components/ui";

/** A password field with a show/hide toggle. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`${input} pr-16`} />
      <button
        type="button"
        onClick={() => setVisible((shown) => !shown)}
        aria-controls={props.id}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-stone-600 hover:text-stone-900"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
