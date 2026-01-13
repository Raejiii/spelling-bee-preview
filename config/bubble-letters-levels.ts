export interface LevelData {
  id: number
  word: string
  image: string
}

export const GENRE_LEVELS: Record<string, LevelData[]> = {
  animals: [
    { id: 1, word: "CAT", image: "./cat life.svg" },
    { id: 2, word: "DOG", image: "./dog.svg" },
    { id: 3, word: "LION", image: "./lion.svg" },
    { id: 4, word: "BEAR", image: "./bear.svg" },
    { id: 5, word: "WOLF", image: "./wolf.svg" },
    { id: 6, word: "FISH", image: "./fish.svg" },
    { id: 7, word: "BIRD", image: "./bird.svg" },
  ],
  food: [
    { id: 1, word: "CAKE", image: "./cake.svg" },
    { id: 2, word: "PIZZA", image: "./pizza.svg" },
    { id: 3, word: "SOUP", image: "./soup.svg" },
    { id: 4, word: "EGG", image: "./egg.svg" },
    { id: 5, word: "JAM", image: "./jam.svg" },
    { id: 6, word: "NUT", image: "./nut.svg" },
    { id: 7, word: "PIE", image: "./pie.svg" },
  ],
  jobs: [
    { id: 1, word: "DOC", image: "./doc.svg" },
    { id: 2, word: "VET", image: "./vet.svg" },
    { id: 3, word: "COOK", image: "./cook.svg" },
    { id: 4, word: "COP", image: "./cop.svg" },
    { id: 5, word: "PILOT", image: "./pilot.svg" },
    { id: 6, word: "NURSE", image: "./nurse.svg" },
    { id: 7, word: "ART", image: "./art.svg" },
  ],
  sports: [
    { id: 1, word: "GOLF", image: "./golf.svg" },
    { id: 2, word: "RUN", image: "./run.svg" },
    { id: 3, word: "SWIM", image: "./swim.svg" },
    { id: 4, word: "JUDO", image: "./judo.svg" },
    { id: 5, word: "POLO", image: "./polo.svg" },
    { id: 6, word: "SURF", image: "./surf.svg" },
    { id: 7, word: "SKI", image: "./ski.svg" },
  ],
  transport: [
    { id: 1, word: "BUS", image: "./bus.svg" },
    { id: 2, word: "CAR", image: "./car.svg" },
    { id: 3, word: "TAXI", image: "./taxi.svg" },
    { id: 4, word: "JET", image: "./jet.svg" },
    { id: 5, word: "BIKE", image: "./bike.svg" },
    { id: 6, word: "SHIP", image: "./ship.svg" },
    { id: 7, word: "VAN", image: "./van.svg" },
  ],
  cloth: [
    { id: 1, word: "HAT", image: "./hat.svg" },
    { id: 2, word: "TIE", image: "./tie.svg" },
    { id: 3, word: "CAP", image: "./cap.svg" },
    { id: 4, word: "VEST", image: "./vest.svg" },
    { id: 5, word: "SOCK", image: "./sock.svg" },
    { id: 6, word: "BELT", image: "./belt.svg" },
    { id: 7, word: "COAT", image: "./coat.svg" },
  ],
}

// Default export for backward compatibility
export const LEVELS = GENRE_LEVELS['animals']
