export type GeneratedSlot = { start: Date; end: Date; capacity: number };

export function generateSlots(start: Date, end: Date, intervalMinutes: 15 | 30 | 60, capacity: number): GeneratedSlot[] {
  const slots: GeneratedSlot[] = [];
  const interval = intervalMinutes * 60_000;
  for (let cursor = start.getTime(); cursor + interval <= end.getTime(); cursor += interval) {
    slots.push({ start: new Date(cursor), end: new Date(cursor + interval), capacity });
  }
  return slots;
}
