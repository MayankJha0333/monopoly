/**
 * Card effects are data rather than closures so a drawn card can be logged,
 * animated on the client and replayed to a reconnecting player.
 */

export type CardAction =
  | { type: 'move'; to: number }
  | { type: 'moveBack'; spaces: number }
  | { type: 'nearest'; kind: 'railroad' | 'utility' }
  | { type: 'collect'; amount: number }
  | { type: 'pay'; amount: number }
  | { type: 'collectEach'; amount: number }
  | { type: 'payEach'; amount: number }
  | { type: 'repairs'; house: number; hotel: number }
  | { type: 'jailcard' }
  | { type: 'gotojail' };

export interface Card {
  id: string;
  text: string;
  action: CardAction;
}

/** "Surprise" deck. */
export const CHANCE: Card[] = [
  { id: 'ch1', text: 'Take the express tram to Crown Point.', action: { type: 'move', to: 39 } },
  { id: 'ch2', text: 'Back to Start. Collect $200.', action: { type: 'move', to: 0 } },
  { id: 'ch3', text: 'Sunset show on Coral Crescent! Head there — collect $200 if you pass Start.', action: { type: 'move', to: 24 } },
  { id: 'ch4', text: 'Tea party at Lotus Court. Head there — collect $200 if you pass Start.', action: { type: 'move', to: 11 } },
  { id: 'ch5', text: 'Hop on the nearest transit stop and pay the owner double the fare.', action: { type: 'nearest', kind: 'railroad' } },
  { id: 'ch6', text: 'Running late! Ride to the nearest transit stop and pay the owner double.', action: { type: 'nearest', kind: 'railroad' } },
  { id: 'ch7', text: 'Visit the nearest power farm. If it is owned, roll and pay ten times the throw.', action: { type: 'nearest', kind: 'utility' } },
  { id: 'ch8', text: 'Your lemonade stand made a profit. Collect $50.', action: { type: 'collect', amount: 50 } },
  { id: 'ch9', text: 'Free Pass — keep this to walk out of Lockup.', action: { type: 'jailcard' } },
  { id: 'ch10', text: 'Forgot your sunglasses. Go back three spaces.', action: { type: 'moveBack', spaces: 3 } },
  { id: 'ch11', text: 'Caught surfing in a no-swim zone. Go to Lockup — do not pass Start.', action: { type: 'gotojail' } },
  { id: 'ch12', text: 'Storm season: pay $25 per house and $100 per hotel for repairs.', action: { type: 'repairs', house: 25, hotel: 100 } },
  { id: 'ch13', text: 'Scooter parking ticket. Pay $15.', action: { type: 'pay', amount: 15 } },
  { id: 'ch14', text: 'Catch the North Ferry. Collect $200 if you pass Start.', action: { type: 'move', to: 5 } },
  { id: 'ch15', text: 'You threw a beach party for everyone. Pay each player $50.', action: { type: 'payEach', amount: 50 } },
  { id: 'ch16', text: 'Your kite design won a prize. Collect $150.', action: { type: 'collect', amount: 150 } },
];

/** "Treasure" deck. */
export const CHEST: Card[] = [
  { id: 'cc1', text: 'Back to Start. Collect $200.', action: { type: 'move', to: 0 } },
  { id: 'cc2', text: 'You dug up a pirate chest on the beach. Collect $200.', action: { type: 'collect', amount: 200 } },
  { id: 'cc3', text: 'Stung by a jellyfish — clinic visit. Pay $50.', action: { type: 'pay', amount: 50 } },
  { id: 'cc4', text: 'Sold your seashell art. Collect $50.', action: { type: 'collect', amount: 50 } },
  { id: 'cc5', text: 'Free Pass — keep this to walk out of Lockup.', action: { type: 'jailcard' } },
  { id: 'cc6', text: 'Fed the seagulls on the pier. Go to Lockup — do not pass Start.', action: { type: 'gotojail' } },
  { id: 'cc7', text: 'Your holiday savings paid off. Collect $100.', action: { type: 'collect', amount: 100 } },
  { id: 'cc8', text: 'Found coins in the sand. Collect $20.', action: { type: 'collect', amount: 20 } },
  { id: 'cc9', text: 'It is your birthday! Collect $10 from every player.', action: { type: 'collectEach', amount: 10 } },
  { id: 'cc10', text: 'Fishing contest winner. Collect $100.', action: { type: 'collect', amount: 100 } },
  { id: 'cc11', text: 'Surfboard repair. Pay $50.', action: { type: 'pay', amount: 50 } },
  { id: 'cc12', text: 'Sailing lessons. Pay $50.', action: { type: 'pay', amount: 50 } },
  { id: 'cc13', text: 'You helped the lighthouse keeper. Collect $25.', action: { type: 'collect', amount: 25 } },
  { id: 'cc14', text: 'Sea-salt damage: pay $40 per house and $115 per hotel.', action: { type: 'repairs', house: 40, hotel: 115 } },
  { id: 'cc15', text: 'Second place in the sandcastle contest. Collect $10.', action: { type: 'collect', amount: 10 } },
  { id: 'cc16', text: 'A distant aunt left you her beach hut savings. Collect $100.', action: { type: 'collect', amount: 100 } },
];

const BY_ID = new Map<string, Card>([...CHANCE, ...CHEST].map((c) => [c.id, c]));
export const card = (id: string): Card => BY_ID.get(id)!;

export function shuffledIds(deck: Card[]): string[] {
  const ids = deck.map((c) => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  return ids;
}
