export const animalScenes = [
  { id: "fox", label: "Fox", swatch: "#fa8744" },
  { id: "manta", label: "Manta ray", swatch: "#69e8d4" },
  { id: "sea-turtle", label: "Sea turtle", swatch: "#60dda1" },
  { id: "octopus", label: "Octopus", swatch: "#ff7964" },
  { id: "goldfish", label: "Goldfish", swatch: "#ffa94a" },
  { id: "dolphin", label: "Dolphin", swatch: "#79befe" },
] as const;

export type AnimalSceneId = (typeof animalScenes)[number]["id"];

export const russianAnimalSceneLabels = {
  fox: "Лиса",
  manta: "Манта",
  "sea-turtle": "Морская черепаха",
  octopus: "Осьминог",
  goldfish: "Золотая рыбка",
  dolphin: "Дельфин",
} satisfies Record<AnimalSceneId, string>;
