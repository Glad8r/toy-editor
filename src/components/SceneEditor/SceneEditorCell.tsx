import React, { useState, useRef, useEffect } from 'react';
import { useCanvas } from '../../contexts/TimelineContext';
import { SceneEditorCell as SceneEditorCellType, Node, NodeType, MediaNode } from '../../types/timeline';
import { RemoveSceneEditorCellOperation, AddSceneEditorCellOperation, MoveSceneEditorCellOperation } from '../../operations/SceneEditorOperations';
import { Plus, X } from 'lucide-react';
import mediaService from '../../services/mediaService';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu';

interface SceneEditorCellProps {
    cell?: SceneEditorCellType;
    isAddCell?: boolean;
    width: number;
    availableMediaNodes?: Node[];
}

const SceneEditorCell: React.FC<SceneEditorCellProps> = ({
    cell,
    isAddCell = false,
    width,
    availableMediaNodes = []
}) => {
    const { nodes, stateManager } = useCanvas();
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [showDropIndicator, setShowDropIndicator] = useState(false);
    const [dropPosition, setDropPosition] = useState<'before' | 'after'>('after');
    const cellRef = useRef<HTMLDivElement>(null);

    // Find the media node for this cell
    const mediaNode = cell
        ? nodes.find(node => node.id === cell.mediaNodeId && (node.type === NodeType.IMAGE || node.type === NodeType.VIDEO)) as MediaNode | undefined
        : null;

    // Load the thumbnail URL
    useEffect(() => {
        if (!mediaNode || !mediaNode.data.url) return;

        let isCancelled = false;

        const loadThumbnail = async () => {
            try {
                const url = await mediaService.getMediaUrl(mediaNode.data.url);
                if (!isCancelled) {
                    setThumbnailUrl(url);
                }
            } catch (error) {
                console.error('Error loading thumbnail:', error);
            }
        };

        loadThumbnail();

        // FIX: Don't revoke blob URLs in cleanup - they're stored in node data and should persist
        // Blob URLs should only be revoked when nodes are deleted, not on component re-render
        return () => {
            isCancelled = true;
        };
    }, [mediaNode?.id, mediaNode?.data.url]); // Only depend on node ID and URL, not entire node object

    // Handle cell deletion
    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (cell) {
            const operation = new RemoveSceneEditorCellOperation(cell.id);
            stateManager.getOperationManager().executeWithContext(operation, stateManager);
        }
    };

    // Handle adding a media node to the sceneEditor
    const handleAddMedia = (mediaNodeId: string) => {
        const operation = new AddSceneEditorCellOperation(mediaNodeId);
        stateManager.getOperationManager().executeWithContext(operation, stateManager);
    };

    // Handle drag start
    const handleDragStart = (e: React.DragEvent) => {
        if (!cell) return;

        setIsDragging(true);
        e.dataTransfer.setData('application/sceneEditor-cell', JSON.stringify({
            cellId: cell.id,
            mediaNodeId: cell.mediaNodeId,
            position: cell.position
        }));

        // Set a ghost image
        if (cellRef.current) {
            const rect = cellRef.current.getBoundingClientRect();
            e.dataTransfer.setDragImage(cellRef.current, rect.width / 2, rect.height / 2);
        }
    };

    // Handle drag end
    const handleDragEnd = () => {
        setIsDragging(false);
    };

    // Handle drag over
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();

        if (isAddCell) return; // Don't show drop indicator on add cell

        setShowDropIndicator(true);

        // Determine if we're dropping before or after this cell
        if (cellRef.current) {
            const rect = cellRef.current.getBoundingClientRect();
            const mouseX = e.clientX;
            const cellCenterX = rect.left + rect.width / 2;

            setDropPosition(mouseX < cellCenterX ? 'before' : 'after');
        }
    };

    // Handle drag leave
    const handleDragLeave = () => {
        setShowDropIndicator(false);
    };

    // Handle drop
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setShowDropIndicator(false);

        // Check if this is a sceneEditor cell being reordered
        const sceneEditorCellData = e.dataTransfer.getData('application/sceneEditor-cell');
        if (sceneEditorCellData) {
            try {
                const draggedCell = JSON.parse(sceneEditorCellData);

                if (!cell) return; // Don't handle drops on the add cell

                // Calculate the new position based on the drop position
                const newPosition = dropPosition === 'before' ? cell.position : cell.position + 1;

                // Move the cell to the new position using new operation
                const operation = new MoveSceneEditorCellOperation(draggedCell.cellId, newPosition);
                stateManager.getOperationManager().executeWithContext(operation, stateManager);
            } catch (error) {
                console.error('Error parsing dragged cell data:', error);
            }
            return;
        }

        // Check if this is a media node being dropped
        const mediaNodeData = e.dataTransfer.getData('application/media-node');
        if (mediaNodeData && cell) {
            try {
                const { nodeId } = JSON.parse(mediaNodeData);

                // Calculate the position based on the drop position
                const position = dropPosition === 'before' ? cell.position : cell.position + 1;

                // Add the media node to the sceneEditor at the calculated position using new operation
                const operation = new AddSceneEditorCellOperation(nodeId, position);
                stateManager.getOperationManager().executeWithContext(operation, stateManager);
            } catch (error) {
                console.error('Error parsing media node data:', error);
            }
        }
    };

    return (
        <div
            ref={cellRef}
            className={`sceneEditor-cell relative flex-shrink-0 mx-1 rounded-md overflow-hidden border ${isDragging
                ? 'border-filmforge-primary'
                : showDropIndicator
                    ? 'border-filmforge-primary'
                    : 'border-filmforge-border'
                }`}
            style={{
                width: `${width}px`,
                height: '80px',
                minHeight: '80px',
                maxHeight: '80px',
                cursor: isAddCell ? 'pointer' : 'grab'
            }}
            draggable={!isAddCell}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Drop indicator */}
            {showDropIndicator && (
                <div
                    className="absolute top-0 bottom-0 w-1 bg-filmforge-primary z-10 sceneEditor-drop-indicator"
                    style={{
                        left: dropPosition === 'before' ? 0 : 'auto',
                        right: dropPosition === 'after' ? 0 : 'auto'
                    }}
                />
            )}

            {isAddCell ? (
                // Add cell with plus button
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <div className="w-full h-full flex items-center justify-center bg-filmforge-background hover:bg-filmforge-background-hover">
                            <Plus className="h-6 w-6 text-filmforge-text-light" />
                        </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center">
                        {availableMediaNodes.length > 0 ? (
                            availableMediaNodes.map(node => (
                                <DropdownMenuItem
                                    key={node.id}
                                    onClick={() => handleAddMedia(node.id)}
                                >
                                    {node.type === NodeType.IMAGE ? 'Image: ' : 'Video: '}
                                    {node.label}
                                </DropdownMenuItem>
                            ))
                        ) : (
                            <DropdownMenuItem disabled>
                                No media nodes available
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : (
                // Media cell with thumbnail
                <>
                    {thumbnailUrl ? (
                        mediaNode?.type === NodeType.VIDEO ? (
                            <video
                                src={thumbnailUrl}
                                className="w-full h-full object-cover"
                                muted
                                loop
                                onMouseOver={e => e.currentTarget.play()}
                                onMouseOut={e => {
                                    e.currentTarget.pause();
                                    e.currentTarget.currentTime = 0;
                                }}
                            />
                        ) : (
                            <img
                                src={thumbnailUrl}
                                alt="Media thumbnail"
                                className="w-full h-full object-cover"
                            />
                        )
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-filmforge-background-hover">
                            <span className="text-xs text-filmforge-text-light">Loading...</span>
                        </div>
                    )}

                    {/* Delete button */}
                    <button
                        className="absolute top-1 right-1 p-1 rounded-full bg-red-500/80 hover:bg-red-600 text-white"
                        onClick={handleDelete}
                    >
                        <X className="h-3 w-3" />
                    </button>
                </>
            )}
        </div>
    );
};

export default SceneEditorCell; 