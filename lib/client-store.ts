import { FormValues } from '@/app/liquidity-form'

const CLIENT_STORE_KEY = 'liquidity_client_store'

export type SavedClient = {
  name: string
  data: FormValues
  savedAt: string
}

export type ClientStore = {
  clients: SavedClient[]
}

export function saveToClientStore(clientName: string, data: FormValues) {
  if (typeof window !== 'undefined') {
    try {
      const store = getClientStore()
      const existingClientIndex = store.clients.findIndex(c => c.name === clientName)
      
      const savedClient: SavedClient = {
        name: clientName,
        data,
        savedAt: new Date().toISOString()
      }

      if (existingClientIndex >= 0) {
        store.clients[existingClientIndex] = savedClient
      } else {
        store.clients.push(savedClient)
      }

      localStorage.setItem(CLIENT_STORE_KEY, JSON.stringify(store))
      return true
    } catch (error) {
      console.error('Failed to save to client store:', error)
      return false
    }
  }
  return false
}

export function getClientStore(): ClientStore {
  if (typeof window !== 'undefined') {
    try {
      const store = localStorage.getItem(CLIENT_STORE_KEY)
      if (store) {
        return JSON.parse(store)
      }
    } catch (error) {
      console.error('Failed to load client store:', error)
    }
  }
  return { clients: [] }
}

export function deleteFromClientStore(clientName: string) {
  if (typeof window !== 'undefined') {
    try {
      const store = getClientStore()
      store.clients = store.clients.filter(c => c.name !== clientName)
      localStorage.setItem(CLIENT_STORE_KEY, JSON.stringify(store))
      return true
    } catch (error) {
      console.error('Failed to delete from client store:', error)
      return false
    }
  }
  return false
} 