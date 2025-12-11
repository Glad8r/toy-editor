import React, { useState } from 'react';
import { useSceneEditorPanel } from '../../contexts/SceneEditorPanelContext';
import { useCanvas } from '../../contexts/TimelineContext';
import { videoExportService } from '../../services/videoExportService';

const SceneEditorHeader: React.FC = () => {
    const { panelVisibility, togglePanel } = useSceneEditorPanel();
    const { stateManager } = useCanvas();
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        try {
            setIsExporting(true);

            // Get current canvas data
            const canvas = stateManager.getCanvas();

            // FUTURE: When server-side export is implemented, this will:
            // 1. Call videoExportService.exportVideo() which will send data to server
            // 2. Show progress dialog with export status
            // 3. Poll server for completion: GET /api/export/status/:jobId
            // 4. Download final video when ready: GET /api/export/download/:jobId
            // 5. Handle errors and show user feedback
            //
            // Example future implementation:
            // const jobId = await videoExportService.exportVideo(canvas);
            // showExportProgressDialog(jobId);
            // await pollExportStatus(jobId);
            // downloadFinalVideo(jobId);

            // CURRENT: Generate and download JSON file
            await videoExportService.exportVideo(canvas);

            // Show success message (optional)
            console.log('✅ Export JSON generated successfully');
        } catch (error) {
            console.error('Export failed:', error);
            alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="h-12 bg-white border-b border-filmforge-border-light flex items-center justify-between px-4 flex-shrink-0">
            {/* Left Section */}
            <div className="flex items-center gap-4">
                <h1 className="text-lg font-semibold text-filmforge-text">Timeline Editor</h1>
            </div>


            {/* Right Section */}
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                    <button
                        className={`px-2 py-1 text-xs border border-filmforge-border-light rounded hover:bg-gray-50 ${
                            panelVisibility.left ? 'bg-gray-100' : 'bg-white'
                        }`}
                        onClick={() => togglePanel('left')}
                    >
                        Left
                    </button>
                    <button
                        className={`px-2 py-1 text-xs border border-filmforge-border-light rounded hover:bg-gray-50 ${
                            panelVisibility.right ? 'bg-gray-100' : 'bg-white'
                        }`}
                        onClick={() => togglePanel('right')}
                    >
                        Right
                    </button>
                </div>

                <div className="h-6 w-px bg-filmforge-border-light"></div>

                <button
                    className="bg-[#1C0F09] text-white px-4 py-2 hover:bg-[#1C0F09]/90 transition-all duration-200 text-sm rounded-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleExport}
                    disabled={isExporting}
                >
                    {isExporting ? 'Exporting...' : 'Export'}
                </button>
            </div>
        </div>
    );
};

export default SceneEditorHeader;
