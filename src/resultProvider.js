import { fetchTab } from './sheetClient.js';

// Facitkälla. I v1 läses facit ur Resultat-fliken; i framtiden kan en
// API-baserad provider (football-data.org etc.) implementera samma interface:
//   getFacit(): Promise<{ matches, rounds }>
export function createSheetResultProvider({ sheetId, tabName = 'Resultat' }) {
  return {
    async getFacit() {
      return fetchTab(sheetId, tabName);
    },
  };
}
