import type { GroupId, RailroadTile, StreetTile, Tile, UtilityTile } from './types';

export const GROUPS: Record<GroupId, { name: string; color: string; houseCost: number }> = {
  brown:     { name: 'Sandbar',  color: '#b8743f', houseCost: 50 },
  lightblue: { name: 'Lagoon',   color: '#4cc9f0', houseCost: 50 },
  pink:      { name: 'Blossom',  color: '#f0529c', houseCost: 100 },
  orange:    { name: 'Market',   color: '#ff8f1f', houseCost: 100 },
  red:       { name: 'Harbor',   color: '#ef3e36', houseCost: 150 },
  yellow:    { name: 'Sunrise',  color: '#f7c81e', houseCost: 150 },
  green:     { name: 'Palm',     color: '#1fb86a', houseCost: 200 },
  darkblue:  { name: 'Skyline',  color: '#3862f0', houseCost: 200 },
  railroad:  { name: 'Transit',  color: '#3d4450', houseCost: 0 },
  utility:   { name: 'Power',    color: '#5c6b7a', houseCost: 0 },
};

type StreetGroup = StreetTile['group'];

const street = (
  id: number, name: string, group: StreetGroup, price: number,
  rent: StreetTile['rent'],
): StreetTile => ({
  id, name, type: 'street', group, price, rent,
  houseCost: GROUPS[group].houseCost,
  mortgage: price / 2,
});

const rail = (id: number, name: string): RailroadTile => ({
  id, name, type: 'railroad', group: 'railroad',
  price: 200, rent: [25, 50, 100, 200], mortgage: 100,
});

const util = (id: number, name: string): UtilityTile => ({
  id, name, type: 'utility', group: 'utility',
  price: 150, multipliers: [4, 10], mortgage: 75,
});

export const BOARD: Tile[] = [
  { id: 0, name: 'Start', type: 'go' },
  street(1, 'Driftwood Lane', 'brown', 60, [2, 10, 30, 90, 160, 250]),
  { id: 2, name: 'Treasure', type: 'chest' },
  street(3, 'Shell Street', 'brown', 60, [4, 20, 60, 180, 320, 450]),
  { id: 4, name: 'City Tax', type: 'tax', amount: 200 },
  rail(5, 'North Ferry'),
  street(6, 'Kite Row', 'lightblue', 100, [6, 30, 90, 270, 400, 550]),
  { id: 7, name: 'Surprise', type: 'chance' },
  street(8, 'Breeze Way', 'lightblue', 100, [6, 30, 90, 270, 400, 550]),
  street(9, 'Lagoon Walk', 'lightblue', 120, [8, 40, 100, 300, 450, 600]),
  { id: 10, name: 'Lockup', type: 'jail' },
  street(11, 'Lotus Court', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  util(12, 'Solar Farm'),
  street(13, 'Lantern Alley', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  street(14, 'Petal Parade', 'pink', 160, [12, 60, 180, 500, 700, 900]),
  rail(15, 'Cable Car'),
  street(16, 'Pepper Market', 'orange', 180, [14, 70, 200, 550, 750, 950]),
  { id: 17, name: 'Treasure', type: 'chest' },
  street(18, 'Saffron Square', 'orange', 180, [14, 70, 200, 550, 750, 950]),
  street(19, 'Mango Avenue', 'orange', 200, [16, 80, 220, 600, 800, 1000]),
  { id: 20, name: 'Beach Break', type: 'parking' },
  street(21, 'Ruby Heights', 'red', 220, [18, 90, 250, 700, 875, 1050]),
  { id: 22, name: 'Surprise', type: 'chance' },
  street(23, 'Cherry Pier', 'red', 220, [18, 90, 250, 700, 875, 1050]),
  street(24, 'Coral Crescent', 'red', 240, [20, 100, 300, 750, 925, 1100]),
  rail(25, 'Balloon Port'),
  street(26, 'Sunflower Boulevard', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
  street(27, 'Honey Hill', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
  util(28, 'Wind Farm'),
  street(29, 'Marigold Terrace', 'yellow', 280, [24, 120, 360, 850, 1025, 1200]),
  { id: 30, name: 'Go to Lockup', type: 'gotojail' },
  street(31, 'Palm Grove', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
  street(32, 'Fern Hollow', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
  { id: 33, name: 'Treasure', type: 'chest' },
  street(34, 'Evergreen Drive', 'green', 320, [28, 150, 450, 1000, 1200, 1400]),
  rail(35, 'Sky Tram'),
  { id: 36, name: 'Surprise', type: 'chance' },
  street(37, 'Skyline Plaza', 'darkblue', 350, [35, 175, 500, 1100, 1300, 1500]),
  { id: 38, name: 'Yacht Tax', type: 'tax', amount: 100 },
  street(39, 'Crown Point', 'darkblue', 400, [50, 200, 600, 1400, 1700, 2000]),
];

export const tile = (id: number): Tile => BOARD[id]!;

export const OWNABLE_IDS: number[] = BOARD
  .filter((t) => t.type === 'street' || t.type === 'railroad' || t.type === 'utility')
  .map((t) => t.id);

export const GROUP_MEMBERS: Record<string, number[]> = OWNABLE_IDS.reduce((acc, id) => {
  const g = (BOARD[id] as { group: GroupId }).group;
  (acc[g] ||= []).push(id);
  return acc;
}, {} as Record<string, number[]>);

export const JAIL_POSITION = 10;
export const GO_TO_JAIL_POSITION = 30;
export const GO_SALARY = 200;
export const JAIL_FINE = 50;
export const TOTAL_HOUSES = 32;
export const TOTAL_HOTELS = 12;

/** Internal piece ids; players only ever see the character names. */
export const TOKENS: { id: string; label: string }[] = [
  { id: 'hat', label: 'Ace' },
  { id: 'car', label: 'Turbo' },
  { id: 'ship', label: 'Pip' },
  { id: 'dog', label: 'Scotty' },
  { id: 'boot', label: 'Trek' },
  { id: 'thimble', label: 'Pin' },
  { id: 'barrow', label: 'Sprout' },
  { id: 'iron', label: 'Nimbus' },
];

export const PLAYER_COLORS = [
  '#e8443a', '#3aa0e8', '#f0b429', '#42c26b',
  '#a86ce8', '#ef7ab5', '#33c9c1', '#f2793a',
];
