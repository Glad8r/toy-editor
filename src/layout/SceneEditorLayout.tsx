import React, { ReactNode } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { SceneEditorInspector, SceneEditorRightPanel, SceneEditorHeader } from '../components/SceneEditor';
import { SceneEditorPanelProvider, useSceneEditorPanel } from '../contexts/SceneEditorPanelContext';
import { ClipSelectionProvider } from '../contexts/ClipSelectionContext';

interface SceneEditorLayoutProps {
    children: ReactNode; // SceneEditor content
}

const SceneEditorLayoutContent: React.FC<SceneEditorLayoutProps> = ({ children }) => {
    const { panelVisibility } = useSceneEditorPanel();

    // Calculate grid columns based on panel visibility
    const getGridColumns = () => {
        if (panelVisibility.left && panelVisibility.right) {
            return 'clamp(14rem, 15%, 16rem) 1fr clamp(14rem, 15%, 16rem)';
        } else if (panelVisibility.left && !panelVisibility.right) {
            return 'clamp(14rem, 15%, 16rem) 1fr';
        } else if (!panelVisibility.left && panelVisibility.right) {
            return '1fr clamp(14rem, 15%, 16rem)';
        } else {
            return '1fr';
        }
    };

    return (
        <ReactFlowProvider>
            <div className="h-screen w-full bg-filmforge-background text-filmforge-text overflow-hidden relative flex flex-col">
                {/* Top Header */}
                <SceneEditorHeader />

                {/* Main Content Area */}
                <div className="flex-1 flex">
                    {/* Dynamic Layout based on panel visibility */}
                    <div className="grid h-full w-full" style={{ gridTemplateColumns: getGridColumns() }}>
                        {/* Left Panel - SceneEditor Inspector */}
                        {panelVisibility.left && (
                            <div className="h-full border-r border-filmforge-border-light bg-white flex flex-col">
                                <SceneEditorInspector />
                            </div>
                        )}

                        {/* SceneEditor Area - Center - Always present */}
                        <div className="h-full bg-filmforge-background overflow-hidden">
                            {children}
                        </div>

                        {/* Right Panel - Properties */}
                        {panelVisibility.right && (
                            <div className="h-full border-l border-filmforge-border-light bg-white flex flex-col">
                                <SceneEditorRightPanel />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </ReactFlowProvider>
    );
};

const SceneEditorLayout: React.FC<SceneEditorLayoutProps> = ({ children }) => {
    return (
        <SceneEditorPanelProvider>
            <ClipSelectionProvider>
                <SceneEditorLayoutContent>{children}</SceneEditorLayoutContent>
            </ClipSelectionProvider>
        </SceneEditorPanelProvider>
    );
};

export default SceneEditorLayout; 