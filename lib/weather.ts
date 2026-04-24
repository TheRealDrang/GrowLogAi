export interface WeatherData {
  temperature: number      // Celsius
  humidity: number         // percent
  windspeed: number        // km/h
  weathercode: number      // WMO code
  description: string
  mildewRisk: 'low' | 'medium' | 'high'
}

// WMO weather interpretation codes → human description
function describeWeatherCode(code: number): string {
  if (code === 0) return 'Clear sky'
  if (code === 1) return 'Mainly clear'
  if (code === 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code <= 49) return 'Foggy'
  if (code <= 59) return 'Drizzle'
  if (code <= 69) return 'Rain'
  if (code <= 79) return 'Snow'
  if (code <= 82) return 'Rain showers'
  if (code <= 84) return 'Snow showers'
  if (code <= 99) return 'Thunderstorm'
  return 'Unknown'
}

// Estimate mildew/fungal disease risk from humidity + temperature
// Claude chose this approach because: these are the two primary drivers of
// powdery mildew and downy mildew in most vegetables
function calcMildewRisk(humidity: number, tempC: number): WeatherData['mildewRisk'] {
  const inRiskTemp = tempC >= 10 && tempC <= 26
  if (humidity >= 85 && inRiskTemp) return 'high'
  if (humidity >= 70 && inRiskTemp) return 'medium'
  return 'low'
}

// Fetch current weather from Open-Meteo (free, no API key required)
export async function fetchWeather(lat: number, lon: number): Promise<WeatherData | null> {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lon))
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,windspeed_10m,weathercode')
    url.searchParams.set('forecast_days', '1')

    const res = await fetch(url.toString(), { next: { revalidate: 1800 } }) // cache 30 min
    if (!res.ok) return null

    const json = await res.json()
    const c = json.current

    const temperature = c.temperature_2m
    const humidity = c.relative_humidity_2m
    const windspeed = c.windspeed_10m
    const weathercode = c.weathercode

    return {
      temperature,
      humidity,
      windspeed,
      weathercode,
      description: describeWeatherCode(weathercode),
      mildewRisk: calcMildewRisk(humidity, temperature),
    }
  } catch {
    return null
  }
}
