export const VIDEO_PROJECT_PLAYERS_BY_COUNTRY = Object.freeze({
  Colombia: Object.freeze(['Luis Díaz', 'James Rodríguez', 'Luis Javier Suárez', 'Jhon Arias', 'Richard Ríos']),
  Ecuador: Object.freeze(['Moisés Caicedo', 'Willian Pacho', 'Piero Hincapié', 'Kendry Páez', 'Enner Valencia']),
  Argentina: Object.freeze(['Lionel Messi', 'Julián Álvarez', 'Alexis Mac Allister', 'Rodrigo De Paul', 'Lautaro Martínez']),
  Brasil: Object.freeze(['Neymar', 'Vinícius Júnior', 'Rodrygo', 'Raphinha', 'Casemiro']),
  Uruguay: Object.freeze(['Federico Valverde', 'Darwin Núñez', 'Ronald Araújo', 'Manuel Ugarte', 'Rodrigo Bentancur']),
  Paraguay: Object.freeze(['Miguel Almirón', 'Julio Enciso', 'Ramón Sosa', 'Gustavo Gómez', 'Diego Gómez']),
});

export function listVideoProjectCountries() {
  return Object.keys(VIDEO_PROJECT_PLAYERS_BY_COUNTRY);
}

export function listVideoProjectPlayers(country) {
  return VIDEO_PROJECT_PLAYERS_BY_COUNTRY[country] || [];
}
