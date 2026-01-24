import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
    Monitor, RefreshCw, Maximize2, Minimize2, ExternalLink,
    Smartphone, Tablet, Laptop, Globe, Eye
} from 'lucide-react';

interface LivePreviewProps {
    url: string;
    isLoading?: boolean;
    onRefresh?: () => void;
    lastUpdate?: Date;
}

type DeviceMode = 'desktop' | 'tablet' | 'mobile';

const deviceSizes: Record<DeviceMode, { width: number; height: number }> = {
    desktop: { width: 1280, height: 800 },
    tablet: { width: 768, height: 1024 },
    mobile: { width: 375, height: 667 }
};

export const LivePreview: React.FC<LivePreviewProps> = ({
    url,
    isLoading,
    onRefresh,
    lastUpdate
}) => {
    const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [iframeKey, setIframeKey] = useState(0);

    const handleRefresh = () => {
        setIframeKey(prev => prev + 1);
        onRefresh?.();
    };

    const handleOpenExternal = () => {
        window.open(url, '_blank');
    };

    const getDeviceIcon = (mode: DeviceMode) => {
        switch (mode) {
            case 'mobile': return <Smartphone size={14} />;
            case 'tablet': return <Tablet size={14} />;
            default: return <Laptop size={14} />;
        }
    };

    return (
        <motion.div
            className={`bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden flex flex-col
        ${isFullscreen ? 'fixed inset-4 z-50' : ''}`}
            layout
        >
            {/* Header */}
            <div className="p-3 border-b border-white/5 flex items-center justify-between bg-gray-900/50">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                        <Monitor size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            معاينة مباشرة
                            {isLoading && (
                                <span className="text-xs text-cyan-400 animate-pulse">جاري التحميل...</span>
                            )}
                        </h3>
                        <p className="text-xs text-gray-500 truncate max-w-[200px]">{url}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Device Switcher */}
                    <div className="flex items-center bg-gray-800 rounded-lg p-0.5">
                        {(['mobile', 'tablet', 'desktop'] as DeviceMode[]).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setDeviceMode(mode)}
                                className={`p-1.5 rounded-md transition-all ${deviceMode === mode
                                    ? 'bg-cyan-500 text-white'
                                    : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                {getDeviceIcon(mode)}
                            </button>
                        ))}
                    </div>

                    {/* Actions */}
                    <button
                        onClick={handleRefresh}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    >
                        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                    </button>

                    <button
                        onClick={handleOpenExternal}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    >
                        <ExternalLink size={14} />
                    </button>

                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    >
                        {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                </div>
            </div>

            {/* Preview Area */}
            <div className="flex-1 bg-gray-950 flex items-center justify-center p-4 min-h-[400px]">
                {url ? (
                    <motion.div
                        className="relative bg-white rounded-lg shadow-2xl overflow-hidden"
                        animate={{
                            width: deviceMode === 'desktop' ? '100%' : deviceSizes[deviceMode].width,
                            maxWidth: '100%'
                        }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    >
                        {/* Device Frame */}
                        {deviceMode !== 'desktop' && (
                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-16 h-1 bg-gray-800 rounded-full" />
                        )}

                        <iframe
                            key={iframeKey}
                            ref={iframeRef}
                            src={url}
                            className="w-full border-0"
                            style={{
                                height: isFullscreen
                                    ? 'calc(100vh - 150px)'
                                    : deviceMode === 'desktop' ? 400 : deviceSizes[deviceMode].height * 0.5,
                                maxHeight: isFullscreen ? 'none' : 500
                            }}
                            title="Live Preview"
                        />

                        {/* Loading Overlay */}
                        {isLoading && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <div className="flex flex-col items-center gap-2 text-white">
                                    <RefreshCw size={24} className="animate-spin" />
                                    <span className="text-sm">جاري بناء الصفحة...</span>
                                </div>
                            </div>
                        )}
                    </motion.div>
                ) : (
                    <div className="text-center text-gray-500 py-12">
                        <Globe size={48} className="mx-auto mb-4 opacity-30" />
                        <p className="text-sm">لا توجد معاينة متاحة</p>
                        <p className="text-xs text-gray-600 mt-1">اطلب من جو بناء صفحة لرؤية المعاينة</p>
                    </div>
                )}
            </div>

            {/* Footer */}
            {lastUpdate && (
                <div className="p-2 border-t border-white/5 flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                        <Eye size={10} />
                        <span>معاينة مباشرة</span>
                    </div>
                    <span>آخر تحديث: {lastUpdate.toLocaleTimeString('ar-SA')}</span>
                </div>
            )}
        </motion.div>
    );
};

export default LivePreview;
