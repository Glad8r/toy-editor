import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ClipSelectionContextType {
  selectedClipId: string | null;
  setSelectedClipId: (clipId: string | null) => void;
}

const ClipSelectionContext = createContext<ClipSelectionContextType | undefined>(undefined);

export const ClipSelectionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  return (
    <ClipSelectionContext.Provider value={{ selectedClipId, setSelectedClipId }}>
      {children}
    </ClipSelectionContext.Provider>
  );
};

export const useClipSelection = (): ClipSelectionContextType => {
  const context = useContext(ClipSelectionContext);
  if (context === undefined) {
    throw new Error('useClipSelection must be used within a ClipSelectionProvider');
  }
  return context;
};

