package simulation

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"sync"
	"time"
)

type Status string

const (
	StatusEnRoute   Status = "En Route"
	StatusClimbing  Status = "Climbing"
	StatusDescending Status = "Descending"
	StatusOnGround  Status = "On Ground"
)

type Flight struct {
	ID          string  `json:"id"`
	Squawk      string  `json:"squawk"`
	Callsign    string  `json:"callsign"`
	Airline     string  `json:"airline"`
	Origin      string  `json:"origin"`
	Destination string  `json:"destination"`
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
	Altitude    int     `json:"altitude"`
	Speed       int     `json:"speed"`
	Heading     float64 `json:"heading"`
	Status      Status  `json:"status"`
	Progress    float64 `json:"progress"` // 0.0 - 1.0
}

type Update struct {
	Type    string    `json:"type"`
	Flights []*Flight `json:"flights"`
	Time    string    `json:"time"`
}

type airport struct {
	code string
	name string
	lat  float64
	lng  float64
}

var airports = []airport{
	{"ATL", "Atlanta", 33.6407, -84.4277},
	{"LAX", "Los Angeles", 33.9425, -118.4081},
	{"ORD", "Chicago O'Hare", 41.9742, -87.9073},
	{"DFW", "Dallas/Fort Worth", 32.8998, -97.0403},
	{"DEN", "Denver", 39.8561, -104.6737},
	{"JFK", "New York JFK", 40.6413, -73.7781},
	{"SFO", "San Francisco", 37.6213, -122.3790},
	{"SEA", "Seattle", 47.4502, -122.3088},
	{"LAS", "Las Vegas", 36.0840, -115.1537},
	{"MCO", "Orlando", 28.4294, -81.3089},
	{"MIA", "Miami", 25.7959, -80.2870},
	{"CLT", "Charlotte", 35.2140, -80.9431},
	{"PHX", "Phoenix", 33.4373, -112.0078},
	{"EWR", "Newark", 40.6895, -74.1745},
	{"IAH", "Houston Bush", 29.9902, -95.3368},
	{"MSP", "Minneapolis", 44.8848, -93.2223},
	{"BOS", "Boston", 42.3656, -71.0096},
	{"DTW", "Detroit", 42.2162, -83.3554},
	{"FLL", "Fort Lauderdale", 26.0742, -80.1506},
	{"PHL", "Philadelphia", 39.8729, -75.2437},
	{"LGA", "New York LaGuardia", 40.7769, -73.8740},
	{"BWI", "Baltimore", 39.1754, -76.6682},
	{"SLC", "Salt Lake City", 40.7884, -111.9778},
	{"IAD", "Washington Dulles", 38.9531, -77.4565},
	{"MDW", "Chicago Midway", 41.7868, -87.7522},
	{"HNL", "Honolulu", 21.3245, -157.9251},
	{"ANC", "Anchorage", 61.1743, -149.9963},
	{"PDX", "Portland", 45.5898, -122.5951},
	{"STL", "St. Louis", 38.7487, -90.3700},
	{"MCI", "Kansas City", 39.2976, -94.7139},
}

var airlines = []struct {
	code string
	name string
}{
	{"AAL", "American Airlines"},
	{"UAL", "United Airlines"},
	{"DAL", "Delta Air Lines"},
	{"SWA", "Southwest Airlines"},
	{"ASA", "Alaska Airlines"},
	{"JBU", "JetBlue Airways"},
	{"FFT", "Frontier Airlines"},
	{"NKS", "Spirit Airlines"},
	{"SKW", "SkyWest Airlines"},
	{"HAL", "Hawaiian Airlines"},
}

type flightState struct {
	flight   *Flight
	originAP airport
	destAP   airport
	// great-circle interpolation state
	mu sync.Mutex
}

type Simulator struct {
	flights []*flightState
	mu      sync.RWMutex
	ticker  *time.Ticker
	updates chan []byte
}

func NewSimulator(count int) *Simulator {
	s := &Simulator{
		updates: make(chan []byte, 64),
	}
	s.spawnFlights(count)
	return s
}

func (s *Simulator) spawnFlights(count int) {
	for i := 0; i < count; i++ {
		s.flights = append(s.flights, s.newFlightState(i))
	}
}

func (s *Simulator) newFlightState(idx int) *flightState {
	orig := airports[rand.Intn(len(airports))]
	dest := airports[rand.Intn(len(airports))]
	for dest.code == orig.code {
		dest = airports[rand.Intn(len(airports))]
	}

	al := airlines[rand.Intn(len(airlines))]
	squawk := fmt.Sprintf("%04d", rand.Intn(7778)+1)
	callsign := fmt.Sprintf("%s%d", al.code, rand.Intn(9000)+1000)

	progress := rand.Float64()
	lat, lng := interpolate(orig.lat, orig.lng, dest.lat, dest.lng, progress)
	heading := bearing(orig.lat, orig.lng, dest.lat, dest.lng)

	alt, speed, status := flightParams(progress)

	f := &Flight{
		ID:          fmt.Sprintf("SQ%04d", idx+1),
		Squawk:      squawk,
		Callsign:    callsign,
		Airline:     al.name,
		Origin:      orig.code,
		Destination: dest.code,
		Lat:         lat,
		Lng:         lng,
		Altitude:    alt,
		Speed:       speed,
		Heading:     heading,
		Status:      status,
		Progress:    progress,
	}

	return &flightState{flight: f, originAP: orig, destAP: dest}
}

// Run starts the simulation loop, broadcasting updates on the returned channel.
func (s *Simulator) Run() <-chan []byte {
	s.ticker = time.NewTicker(time.Second)
	go func() {
		for range s.ticker.C {
			s.tick()
		}
	}()
	return s.updates
}

func (s *Simulator) Stop() {
	if s.ticker != nil {
		s.ticker.Stop()
	}
}

func (s *Simulator) Snapshot() []*Flight {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Flight, len(s.flights))
	for i, fs := range s.flights {
		cp := *fs.flight
		out[i] = &cp
	}
	return out
}

func (s *Simulator) tick() {
	s.mu.Lock()
	for i, fs := range s.flights {
		fs.mu.Lock()
		f := fs.flight
		// Advance progress; speed in knots → degrees/sec ≈ speed/3600/60
		distDeg := haversineDistance(fs.originAP.lat, fs.originAP.lng, fs.destAP.lat, fs.destAP.lng)
		stepFraction := (float64(f.Speed) / 3600.0) / (distDeg * 60.0)
		f.Progress += stepFraction

		if f.Progress >= 1.0 {
			// Respawn as a new flight
			*fs = *s.newFlightState(i)
		} else {
			f.Lat, f.Lng = interpolate(fs.originAP.lat, fs.originAP.lng, fs.destAP.lat, fs.destAP.lng, f.Progress)
			f.Heading = bearing(fs.originAP.lat, fs.originAP.lng, fs.destAP.lat, fs.destAP.lng)
			f.Altitude, f.Speed, f.Status = flightParams(f.Progress)
		}
		fs.mu.Unlock()
	}
	s.mu.Unlock()

	snapshot := s.Snapshot()
	u := Update{
		Type:    "update",
		Flights: snapshot,
		Time:    time.Now().UTC().Format(time.RFC3339),
	}
	b, err := json.Marshal(u)
	if err != nil {
		return
	}
	select {
	case s.updates <- b:
	default:
		// drop if nobody is reading
	}
}

// flightParams returns altitude, speed, and status based on progress through route.
func flightParams(progress float64) (int, int, Status) {
	switch {
	case progress < 0.10:
		// climbing
		alt := int(progress/0.10*35000) + 1000
		spd := int(progress/0.10*150) + 150
		return alt, spd, StatusClimbing
	case progress > 0.90:
		// descending
		remaining := 1.0 - progress
		alt := int(remaining/0.10*35000) + 1000
		spd := int(remaining/0.10*150) + 150
		return alt, spd, StatusDescending
	default:
		// cruise with slight variation
		alt := 35000 + rand.Intn(4)*1000
		spd := 480 + rand.Intn(60)
		return alt, spd, StatusEnRoute
	}
}

// interpolate computes a point at fraction t along the great circle between two lat/lng pairs.
func interpolate(lat1, lng1, lat2, lng2, t float64) (float64, float64) {
	// Simple linear interpolation — accurate enough for continental distances in a demo.
	lat := lat1 + (lat2-lat1)*t
	lng := lng1 + (lng2-lng1)*t
	return lat, lng
}

// bearing returns the initial compass bearing from point 1 to point 2 in degrees.
func bearing(lat1, lng1, lat2, lng2 float64) float64 {
	dLng := toRad(lng2 - lng1)
	rlat1 := toRad(lat1)
	rlat2 := toRad(lat2)
	y := math.Sin(dLng) * math.Cos(rlat2)
	x := math.Cos(rlat1)*math.Sin(rlat2) - math.Sin(rlat1)*math.Cos(rlat2)*math.Cos(dLng)
	b := math.Atan2(y, x)
	return math.Mod(toDeg(b)+360, 360)
}

// haversineDistance returns the great-circle distance in degrees.
func haversineDistance(lat1, lng1, lat2, lng2 float64) float64 {
	rlat1, rlng1 := toRad(lat1), toRad(lng1)
	rlat2, rlng2 := toRad(lat2), toRad(lng2)
	dLat := rlat2 - rlat1
	dLng := rlng2 - rlng1
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(rlat1)*math.Cos(rlat2)*math.Sin(dLng/2)*math.Sin(dLng/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return toDeg(c)
}

func toRad(d float64) float64 { return d * math.Pi / 180 }
func toDeg(r float64) float64 { return r * 180 / math.Pi }
