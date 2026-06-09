"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  LANDING_FAQ_COLUMNS,
  type LandingFaqItem,
} from "@/lib/landing-faq-data";
import { cn } from "@/lib/utils";

const FAQ_SECTION_ID = "preguntas-frecuentes";

function FaqAnswer({ item }: { item: LandingFaqItem }) {
  if (item.linkEmail) {
    return (
      <>
        {item.answer}
        <a
          href={`mailto:${item.linkEmail}`}
          className="text-brand-logo underline underline-offset-2 hover:text-brand-subsection"
        >
          {item.linkEmail}
        </a>
        .
      </>
    );
  }

  return <>{item.answer}</>;
}

function FaqItem({ item }: { item: LandingFaqItem }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full min-w-0">
      <div
        className={cn(
          "w-full min-w-0 rounded-2xl border border-border bg-card transition-shadow",
          open && "shadow-sm",
        )}
      >
        <CollapsibleTrigger className="flex w-full min-w-0 items-start justify-between gap-4 rounded-2xl px-5 py-4 text-left sm:px-6 sm:py-5">
          <span className="min-w-0 flex-1 font-medium text-brand-subsection">
            {item.question}
          </span>
          <span className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden>
            {open ? (
              <Minus className="size-5 stroke-[1.5]" />
            ) : (
              <Plus className="size-5 stroke-[1.5]" />
            )}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="w-full min-w-0 overflow-hidden px-5 pb-4 text-sm leading-relaxed text-muted-foreground sm:px-6 sm:pb-5">
          <FaqAnswer item={item} />
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function LandingFaq() {
  return (
    <section
      aria-labelledby={FAQ_SECTION_ID}
      className="mx-auto w-full max-w-5xl px-4 py-16 sm:py-20"
    >
      <h2
        id={FAQ_SECTION_ID}
        className="mb-8 text-2xl font-semibold text-brand-subsection"
      >
        Preguntas frecuentes
      </h2>
      <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 md:gap-x-8">
        {LANDING_FAQ_COLUMNS.map((column, columnIndex) => (
          <ul key={columnIndex} className="flex w-full min-w-0 flex-col gap-3">
            {column.map((item) => (
              <li key={item.question} className="w-full min-w-0">
                <FaqItem item={item} />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  );
}
