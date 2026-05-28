import { fetchWithTimeout } from './fetch-timeout'

export interface WeatherData {
  temperature: number      // Celsius
  humidity: number         // percent
  windspeed: number        // km/h
  weathercode: number      // WeatherAPI condition code
  description: string
  mildewRisk: 'low' | 'medium' | 'high'
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

export interface ForecastData {
  dailyRainMm: number[]         // [today, +1, +2] precipitation total mm
  dailyMinTemp: number[]        // min temp per day
  dailyMaxTemp: number[]        // max temp per day
  dailyMaxHumidity: number[]    // max hourly humidity per day
  dailyMaxWindKph: number[]     // max wind speed per day
}

export async function fetchForecast(lat: number, lon: number): Promise<ForecastData | null> {
  try {
    const key = process.env.WEATHERAPI_KEY
    if (!key) return null
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${key}&q=${lat},${lon}&days=3&aqi=no&alerts=yes`
    const res = await fetchWithTimeout(url, { next: { revalidate: 1800 } }, 6000)
    if (!res.ok) return null
    const json = await res.json()
    const days = json.forecast.forecastday
    return {
      dailyRainMm:      days.map((d: { day: { totalprecip_mm: number } }) => d.day.totalprecip_mm),
      dailyMinTemp:     days.map((d: { day: { mintemp_c: number } }) => d.day.mintemp_c),
      dailyMaxTemp:     days.map((d: { day: { maxtemp_c: number } }) => d.day.maxtemp_c),
      dailyMaxHumidity: days.map((d: { hour: { humidity: number }[] }) => Math.max(...d.hour.map(h => h.humidity))),
      dailyMaxWindKph:  days.map((d: { day: { maxwind_kph: number } }) => d.day.maxwind_kph),
    }
  } catch { return null }
}

// Fetch current weather from WeatherAPI.com (uses real station observations)
export async function fetchWeather(lat: number, lon: number): Promise<WeatherData | null> {
  try {
    const key = process.env.WEATHERAPI_KEY
    if (!key) return null

    const url = `https://api.weatherapi.com/v1/current.json?key=${key}&q=${lat},${lon}&aqi=no`

    const res = await fetchWithTimeout(url, { next: { revalidate: 1800 } }, 6000) // cache 30 min
    if (!res.ok) return null

    const json = await res.json()
    const c = json.current

    const temperature: number = c.temp_c
    const humidity: number = c.humidity
    const windspeed: number = c.wind_kph
    const weathercode: number = c.condition.code
    const description: string = c.condition.text

    return {
      temperature,
      humidity,
      windspeed,
      weathercode,
      description,
      mildewRisk: calcMildewRisk(humidity, temperature),
    }
  } catch {
    return null
  }
}
