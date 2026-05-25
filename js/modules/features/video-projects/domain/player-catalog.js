export const VIDEO_PROJECT_PLAYERS_BY_COUNTRY = Object.freeze({
  Ecuador: Object.freeze(['Moisés Caicedo', 'Piero Hincapié', 'Willian Pacho', 'Gonzalo Plata', 'Kendry Páez', 'Enner Valencia']),
  Colombia: Object.freeze(['James Rodríguez', 'Luis Díaz', 'Juan Fernando Quintero', 'Jhon Arias']),
  Argentina: Object.freeze(['Lionel Messi', 'Julián Álvarez', 'Emiliano Martínez']),
  Uruguay: Object.freeze(['Federico Valverde']),
  Paraguay: Object.freeze(['Julio Enciso', 'Miguel Almirón']),
});

export function listVideoProjectCountries() {
  return Object.keys(VIDEO_PROJECT_PLAYERS_BY_COUNTRY);
}

export function listVideoProjectPlayers(country) {
  return VIDEO_PROJECT_PLAYERS_BY_COUNTRY[country] || [];
}
