import { create } from 'zustand';

interface UiChromeState {
  commandPaletteOpen: boolean;
  shortcutsHelpOpen: boolean;
  mobileNavOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setShortcutsHelpOpen: (open: boolean) => void;
  toggleShortcutsHelp: () => void;
  setMobileNavOpen: (open: boolean) => void;
}

export const useUiChromeStore = create<UiChromeState>((set) => ({
  commandPaletteOpen: false,
  shortcutsHelpOpen: false,
  mobileNavOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen, shortcutsHelpOpen: false })),
  setShortcutsHelpOpen: (open) => set({ shortcutsHelpOpen: open }),
  toggleShortcutsHelp: () => set((s) => ({ shortcutsHelpOpen: !s.shortcutsHelpOpen, commandPaletteOpen: false })),
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
}));
