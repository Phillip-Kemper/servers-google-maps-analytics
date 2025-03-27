#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpAnalytics } from 'mcp-analytics-middleware';
import fetch from "node-fetch";
import { z } from 'zod';

interface GoogleMapsResponse {
  status: string;
  error_message?: string;
}

interface GeocodeResponse extends GoogleMapsResponse {
  results: Array<{
    place_id: string;
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      }
    };
    address_components: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
  }>;
}

interface PlacesSearchResponse extends GoogleMapsResponse {
  results: Array<{
    name: string;
    place_id: string;
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      }
    };
    rating?: number;
    types: string[];
  }>;
}

interface PlaceDetailsResponse extends GoogleMapsResponse {
  result: {
    name: string;
    place_id: string;
    formatted_address: string;
    formatted_phone_number?: string;
    website?: string;
    rating?: number;
    reviews?: Array<{
      author_name: string;
      rating: number;
      text: string;
      time: number;
    }>;
    opening_hours?: {
      weekday_text: string[];
      open_now: boolean;
    };
    geometry: {
      location: {
        lat: number;
        lng: number;
      }
    };
  };
}

interface DistanceMatrixResponse extends GoogleMapsResponse {
  origin_addresses: string[];
  destination_addresses: string[];
  rows: Array<{
    elements: Array<{
      status: string;
      duration: {
        text: string;
        value: number;
      };
      distance: {
        text: string;
        value: number;
      };
    }>;
  }>;
}

interface ElevationResponse extends GoogleMapsResponse {
  results: Array<{
    elevation: number;
    location: {
      lat: number;
      lng: number;
    };
    resolution: number;
  }>;
}

interface DirectionsResponse extends GoogleMapsResponse {
  routes: Array<{
    summary: string;
    legs: Array<{
      distance: {
        text: string;
        value: number;
      };
      duration: {
        text: string;
        value: number;
      };
      steps: Array<{
        html_instructions: string;
        distance: {
          text: string;
          value: number;
        };
        duration: {
          text: string;
          value: number;
        };
        travel_mode: string;
      }>;
    }>;
  }>;
}

function getApiKey(): string {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("GOOGLE_MAPS_API_KEY environment variable is not set");
      process.exit(1);
    }
    return apiKey;
  }

const GOOGLE_MAPS_API_KEY = getApiKey();

async function handleGeocode(address: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.append("address", address);
  url.searchParams.append("key", GOOGLE_MAPS_API_KEY);

  const response = await fetch(url.toString());
  const data = await response.json() as GeocodeResponse;

  if (data.status !== "OK") {
    return {
      content: [{
        type: "text" as const,
        text: `Geocoding failed: ${data.error_message || data.status}`
      }]
    };
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        location: data.results[0].geometry.location,
        formatted_address: data.results[0].formatted_address,
        place_id: data.results[0].place_id
      }, null, 2)
    }]
  };
}

async function handleReverseGeocode(latitude: number, longitude: number) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.append("latlng", `${latitude},${longitude}`);
  url.searchParams.append("key", GOOGLE_MAPS_API_KEY);

  const response = await fetch(url.toString());
  const data = await response.json() as GeocodeResponse;

  if (data.status !== "OK") {
    return {
      content: [{
        type: "text" as const,
        text: `Reverse geocoding failed: ${data.error_message || data.status}`
      }]
    };
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        formatted_address: data.results[0].formatted_address,
        place_id: data.results[0].place_id,
        address_components: data.results[0].address_components
      }, null, 2)
    }]
  };
}

async function handlePlaceSearch(
  query: string,
  location?: { latitude: number; longitude: number },
  radius?: number
) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.append("query", query);
  url.searchParams.append("key", GOOGLE_MAPS_API_KEY);

  if (location) {
    url.searchParams.append("location", `${location.latitude},${location.longitude}`);
  }
  if (radius) {
    url.searchParams.append("radius", radius.toString());
  }

  const response = await fetch(url.toString());
  const data = await response.json() as PlacesSearchResponse;

  if (data.status !== "OK") {
    return {
      content: [{
        type: "text" as const,
        text: `Place search failed: ${data.error_message || data.status}`
      }]
    };
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        places: data.results.map((place) => ({
          name: place.name,
          formatted_address: place.formatted_address,
          location: place.geometry.location,
          place_id: place.place_id,
          rating: place.rating,
          types: place.types
        }))
      }, null, 2)
    }]
  };
}

async function handlePlaceDetails(place_id: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.append("place_id", place_id);
  url.searchParams.append("key", GOOGLE_MAPS_API_KEY);

  const response = await fetch(url.toString());
  const data = await response.json() as PlaceDetailsResponse;

  if (data.status !== "OK") {
    return {
      content: [{
        type: "text" as const,
        text: `Place details request failed: ${data.error_message || data.status}`
      }]
    };
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        name: data.result.name,
        formatted_address: data.result.formatted_address,
        location: data.result.geometry.location,
        formatted_phone_number: data.result.formatted_phone_number,
        website: data.result.website,
        rating: data.result.rating,
        reviews: data.result.reviews,
        opening_hours: data.result.opening_hours
      }, null, 2)
    }]
  };
}

async function handleDistanceMatrix(
  origins: string[],
  destinations: string[],
  mode?: "driving" | "walking" | "bicycling" | "transit"
) {
  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.append("origins", origins.join("|"));
  url.searchParams.append("destinations", destinations.join("|"));
  if (mode) {
    url.searchParams.append("mode", mode);
  }
  url.searchParams.append("key", GOOGLE_MAPS_API_KEY);

  const response = await fetch(url.toString());
  const data = await response.json() as DistanceMatrixResponse;

  if (data.status !== "OK") {
    return {
      content: [{
        type: "text" as const,
        text: `Distance matrix request failed: ${data.error_message || data.status}`
      }]
    };
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        origin_addresses: data.origin_addresses,
        destination_addresses: data.destination_addresses,
        results: data.rows.map((row) => ({
          elements: row.elements.map((element) => ({
            status: element.status,
            duration: element.duration,
            distance: element.distance
          }))
        }))
      }, null, 2)
    }]
  };
}

async function handleElevation(locations: Array<{ latitude: number; longitude: number }>) {
  const url = new URL("https://maps.googleapis.com/maps/api/elevation/json");
  const locationString = locations
    .map((loc) => `${loc.latitude},${loc.longitude}`)
    .join("|");
  url.searchParams.append("locations", locationString);
  url.searchParams.append("key", GOOGLE_MAPS_API_KEY);

  const response = await fetch(url.toString());
  const data = await response.json() as ElevationResponse;

  if (data.status !== "OK") {
    return {
      content: [{
        type: "text" as const,
        text: `Elevation request failed: ${data.error_message || data.status}`
      }]
    };
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        results: data.results.map((result) => ({
          elevation: result.elevation,
          location: result.location,
          resolution: result.resolution
        }))
      }, null, 2)
    }]
  };
}

async function handleDirections(
  origin: string,
  destination: string,
  mode?: "driving" | "walking" | "bicycling" | "transit"
) {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.append("origin", origin);
  url.searchParams.append("destination", destination);
  if (mode) {
    url.searchParams.append("mode", mode);
  }
  url.searchParams.append("key", GOOGLE_MAPS_API_KEY);

  const response = await fetch(url.toString());
  const data = await response.json() as DirectionsResponse;

  if (data.status !== "OK") {
    return {
      content: [{
        type: "text" as const,
        text: `Directions request failed: ${data.error_message || data.status}`
      }]
    };
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        routes: data.routes.map((route) => ({
          summary: route.summary,
          distance: route.legs[0].distance,
          duration: route.legs[0].duration,
          steps: route.legs[0].steps.map((step) => ({
            instructions: step.html_instructions,
            distance: step.distance,
            duration: step.duration,
            travel_mode: step.travel_mode
          }))
        }))
      }, null, 2)
    }]
  };
}

// Server setup
let server = new McpServer({
  name: "mcp-server/google-maps",
  version: "1.0.0"
});

const enableAnalytics = process.argv.includes('--analytics');

let dbPath: string | undefined = undefined;
for (let i = 0; i < process.argv.length; i++) {
  const arg = process.argv[i];
  
  if (arg.startsWith('--db-path=')) {
    dbPath = arg.substring('--db-path='.length);
    break;
  }
  
  if (arg === '--db-path' && i < process.argv.length - 1) {
    dbPath = process.argv[i + 1];
    break;
  }
}

if (enableAnalytics) {
  let analytics = new McpAnalytics(dbPath);
  console.error("Analytics enabled");
  server = analytics.enhance(server);
} 

// Tool registrations
server.tool(
  'maps_geocode',
  'Geocode an address to get its coordinates',
  {
    address: z.string().describe('The address to geocode')
  },
  async ({ address }) => handleGeocode(address)
);

server.tool(
  'maps_reverse_geocode',
  'Reverse geocode coordinates to get an address',
  {
    latitude: z.number().describe('Latitude coordinate'),
    longitude: z.number().describe('Longitude coordinate')
  },
  async ({ latitude, longitude }) => handleReverseGeocode(latitude, longitude)
);

server.tool(
  'maps_search_places',
  'Search for places using text query',
  {
    query: z.string().describe('Search query'),
    latitude: z.number().optional().describe('Optional latitude for search center'),
    longitude: z.number().optional().describe('Optional longitude for search center'),
    radius: z.number().optional().describe('Search radius in meters (max 50000)')
  },
  async ({ query, latitude, longitude, radius }) => {
    const location = latitude && longitude ? { latitude, longitude } : undefined;
    return handlePlaceSearch(query, location, radius);
  }
);

server.tool(
  'maps_place_details',
  'Get detailed information about a place',
  {
    place_id: z.string().describe('The place ID to get details for')
  },
  async ({ place_id }) => handlePlaceDetails(place_id)
);

server.tool(
  'maps_distance_matrix',
  'Calculate distances between multiple origins and destinations',
  {
    origins: z.array(z.string()).describe('Array of origin addresses or coordinates'),
    destinations: z.array(z.string()).describe('Array of destination addresses or coordinates'),
    mode: z.enum(['driving', 'walking', 'bicycling', 'transit']).optional()
      .describe('Travel mode (driving, walking, bicycling, transit)')
  },
  async ({ origins, destinations, mode }) => handleDistanceMatrix(origins, destinations, mode)
);

server.tool(
  'maps_elevation',
  'Get elevation data for locations',
  {
    locations: z.array(
      z.object({
        latitude: z.number(),
        longitude: z.number()
      })
    ).describe('Array of locations to get elevation for')
  },
  async ({ locations }) => handleElevation(locations)
);

server.tool(
  'maps_directions',
  'Get directions between two points',
  {
    origin: z.string().describe('Starting point address or coordinates'),
    destination: z.string().describe('Ending point address or coordinates'),
    mode: z.enum(['driving', 'walking', 'bicycling', 'transit']).optional()
      .describe('Travel mode (driving, walking, bicycling, transit)')
  },
  async ({ origin, destination, mode }) => handleDirections(origin, destination, mode)
);

server.resource(
  "maps_info",
  "text://maps_info",
  async (uri, extra) => {
    return {
      contents: [{
        uri: uri.href,
        text: `Google Maps API Information - Integrates with Google Maps services like geocoding, places search, and directions.`
      }]
    };
  }
);

server.resource(
  "test_info",
  "text://test_info",
  async (uri, extra) => {
    return {
      contents: [{
        uri: uri.href,
        text: `Test`
      }]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Google Maps MCP Server running on stdio");
