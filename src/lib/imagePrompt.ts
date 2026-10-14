/** Turns a short idea into a detailed prompt for an image generator, so non-experts get better photos. */
export type PromptStyle = "realista" | "cartel" | "cercano";
export type PromptFormat = "vertical" | "story" | "cuadrado";

export const PROMPT_STYLES: Record<PromptStyle, { label: string; look: string }> = {
  realista: {
    label: "Realista",
    look: "fotografía profesional realista, luz natural suave, colores naturales, profundidad de campo, detalle nítido",
  },
  cartel: {
    label: "Cartel",
    look: "diseño de cartel limpio y moderno, composición centrada con espacio libre para texto, colores planos y atractivos, alto contraste",
  },
  cercano: {
    label: "Cercano",
    look: "fotografía espontánea y cálida, ambiente cercano y humano, luz natural, gente real sonriendo con naturalidad",
  },
};

export const PROMPT_FORMATS: Record<PromptFormat, { label: string; ratio: string }> = {
  vertical: { label: "Vertical (4:5)", ratio: "4:5" },
  story: { label: "Historia (9:16)", ratio: "9:16" },
  cuadrado: { label: "Cuadrado (1:1)", ratio: "1:1" },
};

const AVOID = "sin texto en la imagen, sin marcas de agua, sin logotipos, sin manos ni caras deformadas, sin elementos duplicados";

export function buildImagePrompt(args: { idea: string; style: PromptStyle; format: PromptFormat }): string {
  const idea = args.idea.replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
  if (!idea) return "";
  const { look } = PROMPT_STYLES[args.style];
  const { ratio } = PROMPT_FORMATS[args.format];
  return `${idea}. Estilo: ${look}. Composición: un único sujeto principal bien definido y fondo ordenado. Formato ${ratio}, alta resolución. Evitar: ${AVOID}.`;
}
