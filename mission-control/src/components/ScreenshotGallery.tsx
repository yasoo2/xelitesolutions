import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Camera, Check, X, ZoomIn, Download,
    ChevronLeft, ChevronRight, Clock
} from 'lucide-react';

export interface Screenshot {
    id: string;
    url: string;
    pageName: string;
    timestamp: Date;
    status: 'success' | 'error';
    width: number;
    height: number;
}

interface ScreenshotGalleryProps {
    screenshots: Screenshot[];
    expanded: boolean;
    onToggle: () => void;
}

export const ScreenshotGallery: React.FC<ScreenshotGalleryProps> = ({
    screenshots,
    expanded,
    onToggle
}) => {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [isZoomed, setIsZoomed] = useState(false);

    const selectedScreenshot = selectedIndex !== null ? screenshots[selectedIndex] : null;

    const handlePrev = () => {
        if (selectedIndex !== null && selectedIndex > 0) {
            setSelectedIndex(selectedIndex - 1);
        }
    };

    const handleNext = () => {
        if (selectedIndex !== null && selectedIndex < screenshots.length - 1) {
            setSelectedIndex(selectedIndex + 1);
        }
    };

    const handleDownload = (screenshot: Screenshot) => {
        const link = document.createElement('a');
        link.href = screenshot.url;
        link.download = `${screenshot.pageName}-${screenshot.timestamp.getTime()}.png`;
        link.click();
    };

    return (
        <>
            <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
                <button
                    onClick={onToggle}
                    className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-all"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
                            <Camera size={20} className="text-white" />
                        </div>
                        <div className="text-right">
                            <h3 className="text-sm font-bold text-white">التحقق البصري</h3>
                            <p className="text-xs text-gray-500">Screenshot Verification</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded-full">
                            {screenshots.length} صورة
                        </span>
                        <span className="text-xs text-green-400">
                            {screenshots.filter(s => s.status === 'success').length} ناجح
                        </span>
                    </div>
                </button>

                <AnimatePresence>
                    {expanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-white/5"
                        >
                            <div className="p-4">
                                {screenshots.length === 0 ? (
                                    <div className="text-center py-8 text-gray-500">
                                        <Camera size={32} className="mx-auto mb-2 opacity-30" />
                                        <p className="text-sm">لا توجد صور بعد</p>
                                        <p className="text-xs text-gray-600 mt-1">جو سيلتقط صوراً للتحقق</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {screenshots.map((screenshot, index) => (
                                            <motion.div
                                                key={screenshot.id}
                                                className="relative group rounded-xl overflow-hidden border border-white/10 cursor-pointer"
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={() => setSelectedIndex(index)}
                                            >
                                                <img
                                                    src={screenshot.url}
                                                    alt={screenshot.pageName}
                                                    className="w-full h-24 object-cover"
                                                />

                                                <div className={`absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center ${screenshot.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                                                    }`}>
                                                    {screenshot.status === 'success' ? <Check size={12} /> : <X size={12} />}
                                                </div>

                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                    <ZoomIn size={16} className="text-white" />
                                                </div>

                                                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                                                    <p className="text-xs text-white truncate">{screenshot.pageName}</p>
                                                    <p className="text-[10px] text-gray-400 flex items-center gap-1">
                                                        <Clock size={8} />
                                                        {screenshot.timestamp.toLocaleTimeString('ar-SA')}
                                                    </p>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <AnimatePresence>
                {selectedScreenshot && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
                        onClick={() => setSelectedIndex(null)}
                    >
                        <button
                            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                            onClick={() => setSelectedIndex(null)}
                        >
                            <X size={20} />
                        </button>

                        {selectedIndex! > 0 && (
                            <button
                                className="absolute left-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                                onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                            >
                                <ChevronLeft size={24} />
                            </button>
                        )}

                        {selectedIndex! < screenshots.length - 1 && (
                            <button
                                className="absolute right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                            >
                                <ChevronRight size={24} />
                            </button>
                        )}

                        <motion.div
                            className="relative max-w-4xl max-h-[80vh]"
                            onClick={(e) => e.stopPropagation()}
                            layoutId={`screenshot-${selectedScreenshot.id}`}
                        >
                            <img
                                src={selectedScreenshot.url}
                                alt={selectedScreenshot.pageName}
                                className={`rounded-xl shadow-2xl transition-transform ${isZoomed ? 'scale-150 cursor-zoom-out' : 'cursor-zoom-in'
                                    }`}
                                onClick={() => setIsZoomed(!isZoomed)}
                            />

                            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent rounded-b-xl">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-white font-medium">{selectedScreenshot.pageName}</p>
                                        <p className="text-sm text-gray-400">
                                            {selectedScreenshot.width} × {selectedScreenshot.height}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleDownload(selectedScreenshot)}
                                        className="px-3 py-1.5 bg-white/10 rounded-lg text-white text-sm flex items-center gap-2 hover:bg-white/20 transition-colors"
                                    >
                                        <Download size={14} />
                                        تحميل
                                    </button>
                                </div>
                            </div>
                        </motion.div>

                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
                            {selectedIndex! + 1} / {screenshots.length}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default ScreenshotGallery;
