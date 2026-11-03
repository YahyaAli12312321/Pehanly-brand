import { create } from 'zustand';

interface UIState {
  sidebarOpenMobile: boolean;
  setSidebarOpenMobile: (open: boolean) => void;
  toggleSidebarMobile: () => void;
  
  // Quick Global Drawers
  inventoryAlertsOpen: boolean;
  setInventoryAlertsOpen: (open: boolean) => void;
  
  b2bPipelineOpen: boolean;
  setB2bPipelineOpen: (open: boolean) => void;
  
  attentionQueueOpen: boolean;
  setAttentionQueueOpen: (open: boolean) => void;
  
  notificationsDrawerOpen: boolean;
  setNotificationsDrawerOpen: (open: boolean) => void;
  
  // Quick Search Command Palette (Cmd+K or '/')
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  
  // New Quote Modal
  newQuoteModalOpen: boolean;
  setNewQuoteModalOpen: (open: boolean) => void;

}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpenMobile: false,
  setSidebarOpenMobile: (open) => set({ sidebarOpenMobile: open }),
  toggleSidebarMobile: () => set((state) => ({ sidebarOpenMobile: !state.sidebarOpenMobile })),
  
  inventoryAlertsOpen: false,
  setInventoryAlertsOpen: (open) => set({ inventoryAlertsOpen: open }),
  
  b2bPipelineOpen: false,
  setB2bPipelineOpen: (open) => set({ b2bPipelineOpen: open }),
  
  attentionQueueOpen: false,
  setAttentionQueueOpen: (open) => set({ attentionQueueOpen: open }),
  
  notificationsDrawerOpen: false,
  setNotificationsDrawerOpen: (open) => set({ notificationsDrawerOpen: open }),
  
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  
  newQuoteModalOpen: false,
  setNewQuoteModalOpen: (open) => set({ newQuoteModalOpen: open }),

}));
