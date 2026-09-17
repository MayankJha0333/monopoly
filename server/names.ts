/**
 * Seat-filler names. They read like handles people pick for themselves, so a
 * quick match with an empty seat still feels like a full table.
 */
const FIRST = [
  'Aarav', 'Mira', 'Kabir', 'Zoya', 'Leo', 'Nina', 'Ishaan', 'Tara', 'Omar', 'Luna',
  'Arjun', 'Sana', 'Ravi', 'Ellie', 'Kai', 'Anya', 'Dev', 'Maya', 'Noah', 'Riya',
  'Yusuf', 'Priya', 'Theo', 'Aisha', 'Vikram', 'Ivy', 'Rohan', 'Zara', 'Sam', 'Neha',
];
const HANDLES = [
  'sunnyday', 'dicequeen', 'tycoonkid', 'beachbum', 'lucky_seven', 'coralkid', 'mangoboss',
  'kiteflyer', 'harborhero', 'palmtree', 'rollmaster', 'skyline', 'islandboy', 'pepperjack',
  'wavechaser', 'sandcastle', 'saltydog', 'pixelpanda', 'moonpie', 'rocketman',
];

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

export function fillerName(taken: Set<string>): string {
  for (let i = 0; i < 40; i++) {
    const roll = Math.random();
    let name: string;
    if (roll < 0.35) name = pick(FIRST);
    else if (roll < 0.6) name = `${pick(FIRST)}${Math.floor(Math.random() * 90 + 10)}`;
    else if (roll < 0.8) name = `${pick(FIRST).toLowerCase()}_${pick(['x', 'yt', 'pro', 'gg', 'z'])}`;
    else name = `${pick(HANDLES)}${Math.random() < 0.5 ? Math.floor(Math.random() * 99) : ''}`;
    name = name.slice(0, 16);
    if (!taken.has(name.toLowerCase())) return name;
  }
  return `Player${Math.floor(Math.random() * 9000 + 1000)}`;
}
