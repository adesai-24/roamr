/**
 * A small hardcoded list of real cities backing the "search or create" city
 * picker. Real geocoding (Mapbox) is out of scope for the demo -- this list
 * plus resolveCity()'s dedupe-by-name+country is enough to prove the
 * UserCity/Moment loop end to end. Picking one still round-trips through
 * resolveCity() and the `cities` table rather than being used directly.
 */
export interface CatalogCity {
  name: string;
  region: string | null;
  country: string;
  lat: number;
  lng: number;
}

export const CITY_CATALOG: CatalogCity[] = [
  { name: "Chicago", region: "IL", country: "USA", lat: 41.8781, lng: -87.6298 },
  { name: "New York", region: "NY", country: "USA", lat: 40.7128, lng: -74.006 },
  { name: "Los Angeles", region: "CA", country: "USA", lat: 34.0522, lng: -118.2437 },
  { name: "San Francisco", region: "CA", country: "USA", lat: 37.7749, lng: -122.4194 },
  { name: "Austin", region: "TX", country: "USA", lat: 30.2672, lng: -97.7431 },
  { name: "Seattle", region: "WA", country: "USA", lat: 47.6062, lng: -122.3321 },
  { name: "Denver", region: "CO", country: "USA", lat: 39.7392, lng: -104.9903 },
  { name: "Miami", region: "FL", country: "USA", lat: 25.7617, lng: -80.1918 },
  { name: "Boston", region: "MA", country: "USA", lat: 42.3601, lng: -71.0589 },
  { name: "New Orleans", region: "LA", country: "USA", lat: 29.9511, lng: -90.0715 },
  { name: "Toronto", region: "ON", country: "Canada", lat: 43.6532, lng: -79.3832 },
  { name: "Vancouver", region: "BC", country: "Canada", lat: 49.2827, lng: -123.1207 },
  { name: "Mexico City", region: null, country: "Mexico", lat: 19.4326, lng: -99.1332 },
  { name: "London", region: null, country: "UK", lat: 51.5072, lng: -0.1276 },
  { name: "Paris", region: null, country: "France", lat: 48.8566, lng: 2.3522 },
  { name: "Barcelona", region: null, country: "Spain", lat: 41.3874, lng: 2.1686 },
  { name: "Lisbon", region: null, country: "Portugal", lat: 38.7223, lng: -9.1393 },
  { name: "Rome", region: null, country: "Italy", lat: 41.9028, lng: 12.4964 },
  { name: "Amsterdam", region: null, country: "Netherlands", lat: 52.3676, lng: 4.9041 },
  { name: "Tokyo", region: null, country: "Japan", lat: 35.6762, lng: 139.6503 },
];
