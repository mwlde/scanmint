// folder system, named collections for saved scans, stored in localstorage

const FOLDER_KEY = 'ss_folders'

// color pairs for folder icons, cycles through these when creating new folders.
// leads with the two brand hues; the rest stay distinct so folders remain
// tellable apart at a glance. foregrounds are darkened where needed to keep
// contrast against their tint (raw brand yellow is unreadable on a light bg).
export const FOLDER_COLOR_PAIRS: { color: string; bg: string }[] = [
  { color: '#5684BC', bg: '#EBF0F7' },   // brand blue
  { color: '#357C8C', bg: '#EAF4F7' },   // brand teal, darkened for contrast
  { color: '#A08600', bg: '#FEFAE4' },   // brand yellow, darkened for contrast
  { color: '#3BB273', bg: '#E8F4EC' },
  { color: '#8B5CF6', bg: '#F3EFFE' },
  { color: '#D4183D', bg: '#FDF2F2' },
]

export interface Folder {
  id: string
  name: string
  color: string   // hex from FOLDER_COLOR_PAIRS[n].color
  bg: string      // tint hex from FOLDER_COLOR_PAIRS[n].bg
  itemIds: string[]
}

export function getFolders(): Folder[] {
  try { return JSON.parse(localStorage.getItem(FOLDER_KEY) ?? '[]') }
  catch { return [] }
}

function persist(folders: Folder[]): void {
  try { localStorage.setItem(FOLDER_KEY, JSON.stringify(folders)) }
  catch { /* quota exceeded */ }
}

// creates a new folder and automatically picks the next color from the cycle
export function createFolder(name: string): Folder {
  const folders = getFolders()
  const pair = FOLDER_COLOR_PAIRS[folders.length % FOLDER_COLOR_PAIRS.length]
  const folder: Folder = {
    id: `folder_${Date.now()}`,
    name: name.trim(),
    color: pair.color,
    bg: pair.bg,
    itemIds: [],
  }
  persist([...folders, folder])
  return folder
}

export function deleteFolder(id: string): void {
  persist(getFolders().filter(f => f.id !== id))
}

// adds an item to a folder, skips silently if its already in there
export function addItemToFolder(folderId: string, itemId: string): void {
  const folders = getFolders()
  const folder = folders.find(f => f.id === folderId)
  if (!folder || folder.itemIds.includes(itemId)) return
  folder.itemIds = [...folder.itemIds, itemId]
  persist(folders)
}

export function removeItemFromFolder(folderId: string, itemId: string): void {
  const folders = getFolders()
  const folder = folders.find(f => f.id === folderId)
  if (!folder) return
  folder.itemIds = folder.itemIds.filter(id => id !== itemId)
  persist(folders)
}

export function clearAllFolders(): void {
  try { localStorage.removeItem(FOLDER_KEY) } catch { /* ignore */ }
}
