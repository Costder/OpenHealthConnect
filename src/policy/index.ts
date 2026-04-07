import type { AppConfig } from '../config/schema.js';

export interface EventView {
  source_event_id: string;
  category: string;
  ts: string;
  payload_json: string;
}

export function applySensitivityPolicy(events: EventView[], config: AppConfig): EventView[] {
  const hidden = new Set(config.hiddenCategoriesByDefault);
  return events.filter((e) => !hidden.has(e.category as never));
}
