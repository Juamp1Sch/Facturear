export const CONTACT_EMAIL = "info@agilescan.com.ar";

export type LandingFaqItem = {
  question: string;
  answer: string;
  linkEmail?: string;
};

export const LANDING_FAQ_COLUMNS: LandingFaqItem[][] = [
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
      answer: "Podés contactarnos por correo electrónico a ",
      linkEmail: CONTACT_EMAIL,
    },
  ],
];

export const LANDING_FAQ_ITEMS = LANDING_FAQ_COLUMNS.flat();

export function landingFaqAnswerText(item: LandingFaqItem): string {
  return item.linkEmail ? `${item.answer}${item.linkEmail}` : item.answer;
}

export function landingFaqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: LANDING_FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: landingFaqAnswerText(item),
      },
    })),
  };
}
