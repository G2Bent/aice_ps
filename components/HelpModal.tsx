/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { XMarkIcon } from './icons';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in" onClick={onClose} aria-modal="true" role="dialog">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl shadow-blue-500/10 w-full max-w-lg m-4 p-6 text-gray-200 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors" aria-label="关闭帮助">
          <XMarkIcon className="w-6 h-6" />
        </button>

        <h2 className="text-2xl font-bold mb-4">帮助</h2>
        
        {/* <p className="text-gray-300">
            有任何建议及疑问 <a href="https://github.com/aigem/aice_ps/issues/new/choose" target="_blank" rel="noopener noreferrer" className="font-bold underline text-blue-400 hover:text-blue-300">[ 请提ISSUE ]</a>
        </p> */}
        <p className="text-gray-300">
          注意：如果使用官方Gemini API，是会产生费用的。请谨慎使用。
        </p>
        {/* <p className="text-gray-300">
           <a href="https://cnb.build/no.1/api/-/issues/2" target="_blank" rel="noopener noreferrer" className="font-bold underline hover:text-cyan-200">极具性价比API平台</a>。
        </p>
        <p className="text-gray-300">
           <a href="https://cnb.build/no.1/api/-/issues/1" target="_blank" rel="noopener noreferrer" className="font-bold underline hover:text-cyan-200">欢迎交流及定制</a>。
        </p> */}
      </div>
    </div>
  );
};

export default HelpModal;
