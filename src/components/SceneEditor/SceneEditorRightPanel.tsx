import React, { useMemo } from 'react';
import { useCanvas } from '../../contexts/TimelineContext';
import { useClipSelection } from '../../contexts/ClipSelectionContext';
import { MediaNode } from '../../types/timeline';

const SceneEditorRightPanel: React.FC = () => {
    const { canvas, updateClip, nodes } = useCanvas();
    const { selectedClipId } = useClipSelection();

    // Get selected clip from canvas (reactive to canvas changes)
    const selectedClip = useMemo(() => {
        if (!selectedClipId) return null;
        const cells = canvas.sceneEditor?.cells || [];
        return cells.find(cell => cell.id === selectedClipId) || null;
    }, [selectedClipId, canvas]);

    // Get media node and filename for selected clip
    const clipFilename = useMemo(() => {
        if (!selectedClip) return null;
        const mediaNode = nodes.find(node => node.id === selectedClip.mediaNodeId) as MediaNode | undefined;
        if (!mediaNode) return null;
        
        // Try to get filename from file object first, then fall back to label
        if (mediaNode.data.file?.name) {
            return mediaNode.data.file.name;
        }
        return mediaNode.label || 'Unknown';
    }, [selectedClip, nodes]);

    // Handle opacity change
    const handleOpacityChange = (value: number) => {
        if (!selectedClipId) return;
        // Update clip opacity using updateClip from context
        updateClip(selectedClipId, { opacity: value });
    };

    // If no clip is selected, show empty state
    if (!selectedClip) {
        return (
            <div className="h-full flex flex-col bg-white">
                <div className="flex-1 p-4 overflow-y-auto">
                    <div className="text-center text-filmforge-text-secondary mt-8">
                        <p className="text-xs opacity-60">
                            Select a clip on the timeline to edit its properties
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Get current opacity value (default to 100 if not set)
    const opacity = selectedClip.opacity !== undefined ? selectedClip.opacity : 100;

    return (
        <div className="h-full flex flex-col bg-white">
            <div className="flex-1 p-4 overflow-y-auto">
                <div className="space-y-4">
                    {/* Clip Info */}
                    <div>
                        <h3 className="text-sm font-medium text-filmforge-text mb-2">
                            Clip Properties
                        </h3>
                        <p className="text-xs text-filmforge-text-secondary">
                            Clip Name: {clipFilename || 'Unknown'}
                        </p>
                    </div>

                    {/* Compositing Section */}
                    <div>
                        <label className="block text-xs font-medium text-filmforge-text-secondary mb-2">
                            Compositing
                        </label>
                        <div className="space-y-2">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-xs text-filmforge-text-secondary">
                                        Opacity
                                    </label>
                                    <span className="text-xs text-filmforge-text-secondary">
                                        {opacity}%
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={opacity}
                                    onChange={(e) => handleOpacityChange(Number(e.target.value))}
                                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                    style={{
                                        background: `linear-gradient(to right, #e5e7eb 0%, #e5e7eb ${opacity}%, #e5e7eb ${opacity}%, #e5e7eb 100%)`
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Future properties will be added here */}
                    <div className="text-center text-filmforge-text-secondary mt-8">
                        <p className="text-xs opacity-60">
                            Additional properties will appear here
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SceneEditorRightPanel;
