/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import { generateEditedImage, generateFilteredImage, generateAdjustedImage, generateFusedImage, generateTexturedImage, removeBackgroundImage } from './services/geminiService';
import Header from './components/Header';
import Spinner from './components/Spinner';
import FilterPanel from './components/FilterPanel';
import AdjustmentPanel from './components/AdjustmentPanel';
import CropPanel from './components/CropPanel';
import FusionPanel from './components/FusionPanel';
import TexturePanel from './components/TexturePanel';
import ErasePanel from './components/ErasePanel';
import { UndoIcon, RedoIcon, EyeIcon, BullseyeIcon, DownloadIcon, RefreshIcon, NewFileIcon } from './components/icons';
import SettingsModal from './components/SettingsModal';
import HelpModal from './components/HelpModal';
import StartScreen from './components/StartScreen';
import PastForwardPage from './components/PastForwardPage';
import BeatSyncPage from './components/BeatSyncPage';
import TemplateLibraryPage from './components/TemplateLibraryPage';
import TemplateDisplayPage from './components/TemplateDisplayPage';
import { Analytics } from '@vercel/analytics/react';

// Helper to convert a data URL string to a File object
const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");

    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type:mime});
}

// Helper for cropping
function getCroppedImg(
  image: HTMLImageElement,
  pixelCrop: PixelCrop,
  fileName: string,
): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return Promise.reject(new Error('Failed to get canvas context'));
  }

  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  ctx.drawImage(
    image,
    pixelCrop.x * scaleX,
    pixelCrop.y * scaleY,
    pixelCrop.width * scaleX,
    pixelCrop.height * scaleY,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        return;
      }
      resolve(new File([blob], fileName, { type: 'image/png' }));
    }, 'image/png');
  });
}

const MAX_FILE_SIZE_MB = 15;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

type Tab = 'retouch' | 'adjust' | 'filters' | 'crop' | 'fusion' | 'texture' | 'erase';

const tabNames: Record<Tab, string> = {
  adjust: '调整',
  filters: '滤镜',
  texture: '纹理',
  erase: '抠图',
  crop: '裁剪',
  fusion: '合成',
  retouch: '修饰',
};

const TABS: Tab[] = ['adjust', 'filters', 'texture', 'erase', 'crop', 'fusion', 'retouch'];

type LastAction = 
  | { type: 'retouch', prompt: string, hotspot: { x: number, y: number } }
  | { type: 'adjust', prompt: string }
  | { type: 'filters', prompt: string }
  | { type: 'fusion', prompt: string, sourceImages: File[] }
  | { type: 'texture', prompt: string }
  | { type: 'erase' };

export type View = 'editor' | 'past-forward' | 'beatsync' | 'template-library' | 'template-display';
export type EditorInitialState = { baseImageUrl: string; prompt: string };
export interface Template {
  id: string;
  name: string;
  iconUrl: string;
  baseUrl: string;
  description: string;
  prompt: string;
}


const EditorView: React.FC<{
    onFileSelect: (files: FileList | null) => void;
    onImageGenerated: (dataUrl: string) => void;
    initialState?: EditorInitialState | null;
    onTemplateLoaded: () => void;
    onTemplateSelect: (template: Template) => void;
    onShowTemplateLibrary: () => void;
}> = ({ onFileSelect, onImageGenerated, initialState, onTemplateLoaded, onTemplateSelect, onShowTemplateLibrary }) => {
  const [history, setHistory] = useState<File[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isTemplateLoading, setIsTemplateLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('adjust');
  const [isComparing, setIsComparing] = useState(false);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [initialAdjustPrompt, setInitialAdjustPrompt] = useState<string | undefined>();

  // Cropping state
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>();

  // Retouch state
  const [retouchPrompt, setRetouchPrompt] = useState('');
  const [retouchHotspot, setRetouchHotspot] = useState<{ x: number, y: number } | null>(null);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);

  const currentImageFile = history[historyIndex];
  const originalImageFile = history[0];
  
  useEffect(() => {
    if (currentImageFile) {
        const url = URL.createObjectURL(currentImageFile);
        setImageSrc(url);
        return () => URL.revokeObjectURL(url);
    }
    setImageSrc(null);
  }, [currentImageFile]);
  
  useEffect(() => {
    if (originalImageFile) {
        const url = URL.createObjectURL(originalImageFile);
        setOriginalImageSrc(url);
        return () => URL.revokeObjectURL(url);
    }
    setOriginalImageSrc(null);
  }, [originalImageFile]);

  // Effect to START processing an initial state from a template
  useEffect(() => {
    if (!initialState) {
        return;
    }

    const processInitialState = async () => {
        // Reset state for new template loading sequence
        setHistory([]);
        setHistoryIndex(-1);
        setLastAction(null);
        setError(null);
        
        // Set loading flags
        setIsTemplateLoading(true);
        setIsLoading(true);

        try {
            // Perform the async operation
            const response = await fetch(initialState.baseImageUrl);
            if (!response.ok) {
                throw new Error(`无法加载模板图片 (status: ${response.status})`);
            }
            const blob = await response.blob();
            const fileName = initialState.baseImageUrl.split('/').pop() || 'template.png';
            const file = new File([blob], fileName, { type: blob.type });

            // Update state with the result. This will trigger the second useEffect.
            setHistory([file]);
            setHistoryIndex(0);
            setActiveTab('adjust');
            setInitialAdjustPrompt(initialState.prompt);
        } catch (e) {
            // Update state with the error. This will also trigger the second useEffect.
            const errorMessage = e instanceof Error ? e.message : '加载模板时出错。';
            setError(errorMessage);
        }
    };

    processInitialState();
  }, [initialState]); // This effect is the "trigger"

  // Effect to handle the COMPLETION of the loading process
  useEffect(() => {
    // Guard: only run if we are in the template loading process
    if (!isTemplateLoading) {
        return;
    }

    // Check for completion conditions (either success or failure)
    const isSuccess = history.length > 0;
    const isFailure = !!error;

    if (isSuccess || isFailure) {
        // If the process is complete, clean up
        onTemplateLoaded();          // Tell the parent to clear the initialState trigger
        setIsTemplateLoading(false); // Turn off the template loading UI
        setIsLoading(false);         // Re-enable general UI controls
    }
  }, [isTemplateLoading, history, error, onTemplateLoaded]); // This effect is the "listener/cleaner"


  const displaySrc = isComparing ? originalImageSrc : imageSrc;

  const updateHistory = (newFile: File) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newFile);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    // Reset any single-use state
    setCrop(undefined);
    setCompletedCrop(undefined);
    setRetouchHotspot(null);
  };
  
  const handleLocalFileSelect = (files: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(`图片文件大小不能超过 ${MAX_FILE_SIZE_MB}MB。请选择一个较小的文件。`);
        return;
      }
      setHistory([file]);
      setHistoryIndex(0);
      setActiveTab('adjust');
      setError(null);
      setLastAction(null);
      onFileSelect(files);
    }
  };

  const handleLocalImageGenerated = (dataUrl: string) => {
    setIsLoading(true); // show spinner while converting
    try {
        const newFile = dataURLtoFile(dataUrl, `generated-${Date.now()}.png`);
        setHistory([newFile]);
        setHistoryIndex(0);
        setActiveTab('adjust'); // or another default
        setError(null);
        setLastAction(null);
        onImageGenerated(dataUrl);
    } catch(e) {
        console.error("Failed to process generated image", e);
        setError(e instanceof Error ? e.message : '处理生成图像时出错');
    } finally {
        setIsLoading(false);
    }
  }

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
    }
  }, [historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
    }
  }, [historyIndex, history.length]);

  const handleStartOver = useCallback(() => {
    setHistory([]);
    setHistoryIndex(-1);
    setLastAction(null);
    setCrop(undefined);
    setCompletedCrop(undefined);
    setRetouchHotspot(null);
    setRetouchPrompt('');
  }, []);
  
  const handleSaveImage = useCallback(() => {
    if (currentImageFile) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(currentImageFile);
        const originalName = currentImageFile.name.substring(0, currentImageFile.name.lastIndexOf('.')) || 'image';
        link.download = `${originalName}-edited.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }
  }, [currentImageFile]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (isLoading || !currentImageFile) return;

        if (e.ctrlKey || e.metaKey) { // Meta for Mac
            if (e.key === 'z') {
                e.preventDefault();
                handleUndo();
            } else if (e.key === 'y') {
                e.preventDefault();
                handleRedo();
            } else if (e.key === 's') {
                e.preventDefault();
                handleSaveImage();
            }
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLoading, currentImageFile, handleUndo, handleRedo, handleSaveImage]);

  const runGenerativeTask = async (task: () => Promise<string>) => {
    setIsLoading(true);
    setError(null);
    setRetouchHotspot(null);
    try {
      const resultDataUrl = await task();
      const newFile = dataURLtoFile(resultDataUrl, `edit-${Date.now()}.png`);
      updateHistory(newFile);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : '发生了未知错误');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleApplyFilter = (prompt: string) => {
    setLastAction({ type: 'filters', prompt });
    runGenerativeTask(() => generateFilteredImage(currentImageFile, prompt));
  };
  
  const handleApplyAdjustment = (prompt: string) => {
    setLastAction({ type: 'adjust', prompt });
    runGenerativeTask(() => generateAdjustedImage(currentImageFile, prompt));
  };
  
  const handleApplyFusion = (sourceImages: File[], prompt: string) => {
    setLastAction({ type: 'fusion', prompt, sourceImages });
    runGenerativeTask(() => generateFusedImage(currentImageFile, sourceImages, prompt));
  };

  const handleApplyTexture = (prompt: string) => {
    setLastAction({ type: 'texture', prompt });
    runGenerativeTask(() => generateTexturedImage(currentImageFile, prompt));
  };

  const handleRemoveBackground = () => {
    setLastAction({ type: 'erase' });
    runGenerativeTask(() => removeBackgroundImage(currentImageFile));
  };

  const handleApplyCrop = async () => {
    if (completedCrop?.width && completedCrop?.height && imgRef.current) {
        setIsLoading(true);
        setError(null);
        try {
            const croppedImageFile = await getCroppedImg(
                imgRef.current,
                completedCrop,
                `crop-${Date.now()}.png`
            );
            updateHistory(croppedImageFile);
            setLastAction(null); // Crop is not a generative action we can re-run
        } catch(e) {
            console.error("Cropping failed", e);
            setError(e instanceof Error ? e.message : '裁剪图片时出错');
        } finally {
            setIsLoading(false);
        }
    }
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (activeTab !== 'retouch' || !imgRef.current) return;
    
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = imgRef.current.naturalWidth / rect.width;
    const scaleY = imgRef.current.naturalHeight / rect.height;

    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    setRetouchHotspot({ x, y });
  };

  const handleApplyRetouch = () => {
    if (retouchPrompt && retouchHotspot) {
      setLastAction({ type: 'retouch', prompt: retouchPrompt, hotspot: retouchHotspot });
      runGenerativeTask(() => generateEditedImage(currentImageFile, retouchPrompt, retouchHotspot));
      setRetouchPrompt('');
    }
  };

  const handleRegenerate = useCallback(() => {
    if (!lastAction || historyIndex < 1 || isLoading) return;

    // The image state *before* the last action was applied
    const imageToEdit = history[historyIndex - 1];

    let task: (() => Promise<string>) | null = null;
    switch (lastAction.type) {
      case 'retouch':
        task = () => generateEditedImage(imageToEdit, lastAction.prompt, lastAction.hotspot);
        break;
      case 'adjust':
        task = () => generateAdjustedImage(imageToEdit, lastAction.prompt);
        break;
      case 'filters':
        task = () => generateFilteredImage(imageToEdit, lastAction.prompt);
        break;
      case 'texture':
        task = () => generateTexturedImage(imageToEdit, lastAction.prompt);
        break;
      case 'erase':
        task = () => removeBackgroundImage(imageToEdit);
        break;
      case 'fusion':
        task = () => generateFusedImage(imageToEdit, lastAction.sourceImages, lastAction.prompt);
        break;
    }

    if (task) {
      // Set the history index back by one. The `runGenerativeTask` will then
      // overwrite the last state with the new regenerated one.
      setHistoryIndex(historyIndex - 1);
      runGenerativeTask(task);
    }
  }, [lastAction, history, historyIndex, isLoading]);
  
  const ActionButtons = () => (
    <>
      <button
        onClick={handleStartOver}
        disabled={isLoading}
        className="p-3 bg-white/10 rounded-full text-gray-300 hover:bg-white/20 transition-all active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="新图片"
        title="新图片"
      >
        <NewFileIcon className="w-6 h-6" />
      </button>
      <button
        onClick={handleUndo}
        disabled={historyIndex <= 0 || isLoading}
        className="p-3 bg-white/10 rounded-full text-gray-300 hover:bg-white/20 transition-all active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="撤销"
        title="撤销 (Ctrl+Z)"
      >
        <UndoIcon className="w-6 h-6" />
      </button>
      <button
        onClick={handleRedo}
        disabled={historyIndex >= history.length - 1 || isLoading}
        className="p-3 bg-white/10 rounded-full text-gray-300 hover:bg-white/20 transition-all active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="重做"
        title="重做 (Ctrl+Y)"
      >
        <RedoIcon className="w-6 h-6" />
      </button>
       <button
        onClick={handleRegenerate}
        disabled={!lastAction || historyIndex < 1 || isLoading}
        className="p-3 bg-white/10 rounded-full text-gray-300 hover:bg-white/20 transition-all active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="重新生成"
        title="重新生成"
      >
        <RefreshIcon className="w-6 h-6" />
      </button>
      <button
        onMouseDown={() => setIsComparing(true)}
        onMouseUp={() => setIsComparing(false)}
        onMouseLeave={() => setIsComparing(false)}
        onTouchStart={() => setIsComparing(true)}
        onTouchEnd={() => setIsComparing(false)}
        disabled={isLoading || history.length < 2}
        className="p-3 bg-white/10 rounded-full text-gray-300 hover:bg-white/20 transition-all active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="按住对比原图"
        title="按住对比原图"
      >
        <EyeIcon className="w-6 h-6" />
      </button>
      <button
        onClick={handleSaveImage}
        disabled={isLoading || !currentImageFile}
        className="p-3 bg-white/10 rounded-full text-gray-300 hover:bg-white/20 transition-all active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="保存图片"
        title="保存图片 (Ctrl+S)"
      >
        <DownloadIcon className="w-6 h-6" />
      </button>
    </>
  );

  if (isTemplateLoading) {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4 animate-fade-in">
            <Spinner className="h-16 w-16 text-blue-400" />
            <p className="mt-4 text-lg text-gray-300 font-semibold">正在加载模板...</p>
        </div>
    );
  }

  return (
    <>
      {error && !currentImageFile && (
        <div className="w-full max-w-4xl mx-auto bg-red-500/20 border border-red-500 text-red-300 px-4 py-3 rounded-lg relative text-center mb-4 animate-fade-in" role="alert">
          <strong className="font-bold">错误：</strong>
          <span className="block sm:inline ml-2">{error}</span>
        </div>
      )}
      {!currentImageFile ? (
        <StartScreen 
            onFileSelect={handleLocalFileSelect} 
            onImageGenerated={handleLocalImageGenerated}
            onTemplateSelect={onTemplateSelect}
            onShowTemplateLibrary={onShowTemplateLibrary}
        />
      ) : (
        <div className="w-full max-w-7xl flex flex-col items-center gap-6 animate-fade-in">
          {error && (
            <div className="w-full max-w-4xl mx-auto bg-red-500/20 border border-red-500 text-red-300 px-4 py-3 rounded-lg relative text-center mb-0 animate-fade-in" role="alert">
              <strong className="font-bold">错误：</strong>
              <span className="block sm:inline ml-2">{error}</span>
            </div>
           )}
          <div className="w-full max-w-4xl relative">
            <div className="bg-black rounded-lg shadow-2xl shadow-blue-500/10 overflow-hidden border border-gray-700">
                {isLoading && (
                  <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                    <Spinner className="h-16 w-16 text-blue-400" />
                    <p className="mt-4 text-lg text-gray-300 font-semibold animate-pulse">AI 正在创作中...</p>
                  </div>
                )}
                
                {displaySrc ? (
                  <div className="relative">
                    <ReactCrop
                      crop={crop}
                      onChange={c => setCrop(c)}
                      onComplete={c => setCompletedCrop(c)}
                      aspect={aspect}
                      disabled={isLoading || activeTab !== 'crop'}
                      ruleOfThirds
                    >
                      <img
                        ref={imgRef}
                        src={displaySrc}
                        alt="用户上传的内容"
                        className={`max-w-full max-h-[65vh] w-auto h-auto mx-auto block transition-opacity duration-300 ${isComparing ? 'opacity-80' : ''}`}
                        onClick={handleImageClick}
                        style={{ cursor: activeTab === 'retouch' ? 'crosshair' : 'default' }}
                      />
                    </ReactCrop>
                    {retouchHotspot && !isLoading && activeTab === 'retouch' && (
                        <div
                            className="absolute z-10 pointer-events-none"
                            style={{
                                left: `calc(${(retouchHotspot.x / (imgRef.current?.naturalWidth ?? 1)) * 100}% - 12px)`,
                                top: `calc(${(retouchHotspot.y / (imgRef.current?.naturalHeight ?? 1)) * 100}% - 12px)`,
                            }}
                        >
                            <BullseyeIcon className="w-6 h-6 text-blue-400 drop-shadow-[0_0_3px_rgba(0,0,0,0.7)]" />
                        </div>
                    )}
                  </div>
                ) : !isLoading && <div className="h-[65vh] flex items-center justify-center"><Spinner/></div>}
                {isComparing && (
                    <div className="absolute bottom-4 right-4 bg-black/50 text-white px-3 py-1 rounded-md text-sm font-semibold z-10">
                        正在对比原图
                    </div>
                )}
            </div>
            
            <div className="absolute top-1/2 -translate-y-1/2 left-[calc(100%+1rem)] 
                            flex-col gap-4 p-3 bg-gray-800/50 backdrop-blur-md rounded-2xl border border-gray-700/50
                            hidden md:flex">
              <ActionButtons />
            </div>
          </div>

          <div className="flex md:hidden justify-center items-center gap-4">
              <ActionButtons />
          </div>
          
          <div className="w-full max-w-4xl">
            <div className="flex justify-center border-b border-gray-700 mb-4 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => { if (!isLoading) { setActiveTab(tab); setRetouchHotspot(null); } }}
                  className={`px-4 md:px-6 py-3 text-lg font-semibold border-b-2 transition-colors duration-200 ease-in-out focus:outline-none disabled:cursor-not-allowed whitespace-nowrap ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-gray-400 hover:text-white hover:border-gray-500'
                  }`}
                  disabled={isLoading}
                >
                  {tabNames[tab]}
                </button>
              ))}
            </div>

            <div className="w-full">
              {activeTab === 'retouch' && (
                  <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col items-center gap-4 animate-fade-in backdrop-blur-sm">
                      <h3 className="text-lg font-semibold text-gray-300">智能修饰</h3>
                      <p className="text-sm text-gray-400 -mt-2">在图像上点击一个点，然后描述您想做的更改。</p>
                      <div className="w-full flex gap-2">
                         <input
                              type="text"
                              value={retouchPrompt}
                              onChange={(e) => setRetouchPrompt(e.target.value)}
                              placeholder="例如，“移除这个物体”或“把衬衫改成红色”"
                              className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-base"
                              disabled={isLoading}
                          />
                          <button
                              onClick={handleApplyRetouch}
                              className="bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                              disabled={isLoading || !retouchPrompt.trim() || !retouchHotspot}
                          >
                              应用
                          </button>
                      </div>
                  </div>
              )}
              {activeTab === 'adjust' && <AdjustmentPanel onApplyAdjustment={handleApplyAdjustment} isLoading={isLoading} currentImage={currentImageFile} onError={setError} initialPrompt={initialAdjustPrompt} />}
              {activeTab === 'filters' && <FilterPanel onApplyFilter={handleApplyFilter} isLoading={isLoading} currentImage={currentImageFile} onError={setError} />}
              {activeTab === 'texture' && <TexturePanel onApplyTexture={handleApplyTexture} isLoading={isLoading} currentImage={currentImageFile} onError={setError} />}
              {activeTab === 'erase' && <ErasePanel onRemoveBackground={handleRemoveBackground} isLoading={isLoading} />}
              {activeTab === 'crop' && (
                <CropPanel
                  onApplyCrop={handleApplyCrop}
                  onSetAspect={setAspect}
                  isLoading={isLoading}
                  isCropping={!!completedCrop?.width && !!completedCrop?.height}
                />
              )}
              {activeTab === 'fusion' && <FusionPanel onApplyFusion={handleApplyFusion} isLoading={isLoading} onError={setError} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}


const App: React.FC = () => {
  const [activeView, setActiveView] = useState<View>('editor');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [editorInitialState, setEditorInitialState] = useState<EditorInitialState | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  // --- Simple hash-based navigation helpers to enable browser back/forward ---
  const HASH_PREFIX = '#/';
  const parseHash = (): { view: View; id?: string } => {
    const hash = window.location.hash || '';
    if (hash.startsWith(HASH_PREFIX)) {
      const path = hash.slice(HASH_PREFIX.length); // e.g. template-display/xyz
      const [viewPart, id] = path.split('/');
      const view = (viewPart as View) || 'editor';
      if (view === 'editor' || view === 'past-forward' || view === 'beatsync' || view === 'template-library' || view === 'template-display') {
        return { view, id };
      }
    }
    return { view: 'editor' };
  };
  const navigateToView = (view: View, params?: { id?: string }) => {
    const targetHash = `${HASH_PREFIX}${view}${params?.id ? `/${encodeURIComponent(params.id)}` : ''}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash; // triggers hashchange
    }
    setActiveView(view);
  };
  const loadTemplateById = async (id: string): Promise<Template | null> => {
    try {
      const res = await fetch('/templates.json');
      if (!res.ok) return null;
      const list: Template[] = await res.json();
      return list.find(t => t.id === id) || null;
    } catch {
      return null;
    }
  };
  useEffect(() => {
    const applyFromHash = async () => {
      const { view, id } = parseHash();
      setActiveView(view);
      if (view === 'template-display') {
        if (id) {
          // If deep-linked with id, ensure selectedTemplate is loaded
          if (!selectedTemplate || selectedTemplate.id !== id) {
            const t = await loadTemplateById(id);
            if (t) {
              setSelectedTemplate(t);
            } else {
              navigateToView('template-library');
            }
          }
        } else {
          // No id provided, go to library
          navigateToView('template-library');
        }
      } else {
        setSelectedTemplate(null);
        if (view !== 'editor') {
          setEditorInitialState(null);
        }
      }
    };
    // initialize from current hash
    applyFromHash();
    const handler = () => { applyFromHash(); };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, [selectedTemplate]);

  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template);
    navigateToView('template-display', { id: template.id });
  };
  
  const handleShowTemplateLibrary = () => {
    navigateToView('template-library');
  };

  const handleTemplateLoaded = useCallback(() => {
    setEditorInitialState(null);
  }, []);

  const handleUseTemplateInEditor = (template: Template) => {
    setEditorInitialState({ baseImageUrl: template.baseUrl, prompt: template.prompt });
    setSelectedTemplate(null);
    navigateToView('editor');
  };
  
  // Dummy handlers to satisfy the EditorView props, as its internal state is now self-contained.
  const handleFileSelect = () => {};
  const handleImageGenerated = () => {};

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000); // 3 seconds
      return () => clearTimeout(timer);
    }
  }, [notification]);
  
  const MainContent: React.FC = () => {
    switch (activeView) {
        case 'past-forward': return <PastForwardPage />;
        case 'beatsync': return <BeatSyncPage />;
        case 'template-library': return <TemplateLibraryPage onTemplateSelect={handleTemplateSelect} />;
        case 'template-display': 
            return selectedTemplate ? (
                <TemplateDisplayPage
                    template={selectedTemplate}
                    onBack={() => {
                        setSelectedTemplate(null);
                        navigateToView('template-library');
                    }}
                    onUseInEditor={handleUseTemplateInEditor}
                />
            ) : null;
        case 'editor':
        default:
          return <EditorView 
              onFileSelect={handleFileSelect} 
              onImageGenerated={handleImageGenerated}
              initialState={editorInitialState}
              onTemplateLoaded={handleTemplateLoaded}
              onTemplateSelect={handleTemplateSelect}
              onShowTemplateLibrary={handleShowTemplateLibrary}
          />;
    }
  };


  return (
    <div className="flex flex-col min-h-screen bg-gray-900 text-white">
      <Header 
        activeView={activeView} 
        onViewChange={(view) => {
            // Reset template state if user navigates away
            if (view !== 'editor' && view !== 'template-display') {
                setEditorInitialState(null);
                setSelectedTemplate(null);
            }
            navigateToView(view);
        }} 
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenHelp={() => setIsHelpModalOpen(true)}
      />
      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8">
        <MainContent />
      </main>
      <Analytics />
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSave={() => setNotification("设置已成功保存！")}
      />
      <HelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
      />
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.3 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="fixed bottom-6 right-6 z-50 bg-green-500/90 text-white px-5 py-3 rounded-lg shadow-2xl backdrop-blur-sm"
          >
            <p className="font-semibold">{notification}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;