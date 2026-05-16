export type FlightStatus = "En Route" | "Climbing" | "Descending" | "On Ground";

export interface Flight {
  id: string;
  squawk: string;
  callsign: string;
  airline: string;
  origin: string;
  destination: string;
  lat: number;
  lng: number;
  altitude: number;
  speed: number;
  heading: number;
  status: FlightStatus;
  progress: number;
}

export interface FlightUpdate {
  type: "update";
  flights: Flight[];
  time: string;
}
