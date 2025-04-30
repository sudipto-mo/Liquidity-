import { FormValues } from '@/app/liquidity-form'

const STORAGE_KEY = 'liquidity_data'

export function saveToLocalStorage(data: FormValues) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save data to localStorage:', error)
    }
  }
}

export function loadFromLocalStorage(): FormValues | null {
  if (typeof window !== 'undefined') {
    try {
      const savedData = localStorage.getItem(STORAGE_KEY)
      if (savedData) {
        return JSON.parse(savedData)
      }
    } catch (error) {
      console.error('Failed to load data from localStorage:', error)
    }
  }
  return null
} 