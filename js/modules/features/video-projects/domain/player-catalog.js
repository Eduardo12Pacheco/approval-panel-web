export const VIDEO_PROJECT_PLAYERS_BY_COUNTRY = Object.freeze({
  Ecuador: Object.freeze({
    players: Object.freeze(['Moisés Caicedo', 'Piero Hincapié', 'Willian Pacho', 'Gonzalo Plata', 'Kendry Páez', 'Enner Valencia']),
    nicknames: Object.freeze(['La Tri']),
  }),
  Colombia: Object.freeze({
    players: Object.freeze(['James Rodríguez', 'Luis Díaz', 'Juan Fernando Quintero', 'Jhon Arias']),
    nicknames: Object.freeze(['Los Cafeteros']),
  }),
  Argentina: Object.freeze({
    players: Object.freeze(['Lionel Messi', 'Julián Álvarez', 'Emiliano Martínez']),
    nicknames: Object.freeze(['La Albiceleste']),
  }),
  Uruguay: Object.freeze({
    players: Object.freeze(['Federico Valverde']),
    nicknames: Object.freeze(['La Celeste']),
  }),
  Paraguay: Object.freeze({
    players: Object.freeze(['Julio Enciso', 'Miguel Almirón']),
    nicknames: Object.freeze(['La Albirroja']),
  }),
  México: Object.freeze({
    players: Object.freeze(['Santiago Giménez', 'Guillermo Ochoa', 'Edson Álvarez']),
    nicknames: Object.freeze(['El Tri']),
  }),
});

export function listVideoProjectCountries() {
  return Object.keys(VIDEO_PROJECT_PLAYERS_BY_COUNTRY);
}

export function listVideoProjectPlayers(country) {
  const entry = VIDEO_PROJECT_PLAYERS_BY_COUNTRY[country];
  if (!entry) return [];
  return [...(entry.players || []), ...(entry.nicknames || [])];
}
