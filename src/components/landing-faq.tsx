"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const FAQ_COLUMNS = [
  [
    {
      question: "¿Qué es un lector de facturas con IA?",
      answer:
        "Es una herramienta que analiza automáticamente tus facturas (en PDF o foto) y extrae los datos clave — proveedor, CUIT, fecha e importes — sin que tengas que cargarlos a mano.",
    },
    {
      question: "¿Cómo digitalizar facturas de proveedores?",
      answer:
        "Con AgileScan alcanza con subir el archivo PDF o una foto desde tu celular. La IA procesa el documento y te muestra los datos listos para revisar y guardar.",
    },
    {
      question: "¿Sirve para cargar facturas en mi sistema de gestión?",
      answer:
        "AgileScan extrae los datos que necesitás (CUIT, importe, fecha) para agilizar la carga manual en tu sistema de gestión.",
    },
  ],
  [
    {
      question: "¿Funciona con facturas en papel?",
      answer:
        "Sí. Podés sacarle una foto con el celular y subirla como JPG o PNG. La IA usa visión artificial para leer el texto aunque sea una imagen.",
    },
    {
      question: "¿Mis facturas son privadas?",
      answer:
        "Sí. Cada usuario tiene un historial propio y solo puede ver sus propios documentos.",
    },
    {
      question: "¿Cómo puedo contactarme con AgileScan?",
      answer:
        "Nos pueden contactar vía correo electrónico a la dirección info@agilescan.com.ar",
    },
  ],
] as const;

function FaqItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
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
            {question}
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
          {answer}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function LandingFaq() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-16 sm:py-20">
      <h2 className="mb-8 text-2xl font-semibold text-brand-subsection">
        Preguntas frecuentes
      </h2>
      <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 md:gap-x-8">
        {FAQ_COLUMNS.map((column, columnIndex) => (
          <ul
            key={columnIndex}
            className="flex w-full min-w-0 flex-col gap-3"
          >
            {column.map((item) => (
              <li key={item.question} className="w-full min-w-0">
                <FaqItem question={item.question} answer={item.answer} />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  );
}
