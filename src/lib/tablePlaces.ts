// Los n?meros 6 a 9 identifican las barras en los pedidos existentes.
export const tablePlaces = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const placeLabel = (place: number | string) => Number(place) <= 5 ? `Mesa ${place}` : `Barra ${Number(place) - 5}`;
