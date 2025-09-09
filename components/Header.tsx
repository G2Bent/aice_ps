/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
import { SparkleIcon, GitHubIcon, ClockIcon, FilmIcon, CogIcon, QuestionMarkCircleIcon, TemplateLibraryIcon } from './icons';
import { type View } from '../App';

interface HeaderProps {
  activeView: View;
  onViewChange: (view: View) => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
}

const Header: React.FC<HeaderProps> = ({ activeView, onViewChange, onOpenSettings, onOpenHelp }) => {
  return (
    <header className="w-full py-4 px-4 sm:px-8 border-b border-gray-700 bg-gray-800/30 backdrop-blur-sm sticky top-0 z-50">
      <div className="w-full max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
              <button onClick={() => onViewChange('editor')} className={`flex items-center gap-3 transition-colors p-2 -m-2 rounded-lg ${activeView === 'editor' ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}>
                <SparkleIcon className="w-6 h-6 text-blue-400" />
                <h1 className="text-xl font-bold tracking-tight">
                  Image AI
                </h1>
              </button>

              {/* <div className="h-6 w-px bg-gray-600"></div>

              <button onClick={() => onViewChange('past-forward')} className={`flex items-center gap-3 transition-colors p-2 -m-2 rounded-lg ${activeView === 'past-forward' ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}>
                <ClockIcon className="w-6 h-6 text-yellow-400" />
                <h1 className="text-xl font-bold tracking-tight font-['Caveat']">
                  Past Forward
                </h1>
              </button>

              <div className="h-6 w-px bg-gray-600"></div>

              <button onClick={() => onViewChange('beatsync')} className={`flex items-center gap-3 transition-colors p-2 -m-2 rounded-lg ${activeView === 'beatsync' ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}>
                <FilmIcon className="w-6 h-6 text-purple-400" />
                <h1 className="text-xl font-bold tracking-tight">
                  音画志
                </h1>
              </button>
              
              <div className="h-6 w-px bg-gray-600"></div>

              <button onClick={() => onViewChange('template-library')} className={`flex items-center gap-3 transition-colors p-2 -m-2 rounded-lg ${activeView === 'template-library' ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}>
                <TemplateLibraryIcon className="w-6 h-6 text-green-400" />
                <h1 className="text-xl font-bold tracking-tight font-['Permanent_Marker']">
                  NB 提示词库
                </h1>
              </button>

              <div className="h-6 w-px bg-gray-600"></div>
              
              <a href="https://nb.kuai.host/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 transition-colors p-2 -m-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10">
                <h1 className="text-xl font-bold tracking-tight">
                  【自部署版本APP】国内可用
                </h1>
              </a> */}

          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenHelp}
              className="p-2 text-gray-400 rounded-full hover:bg-white/10 hover:text-white transition-colors"
              aria-label="帮助"
              title="帮助"
            >
              <QuestionMarkCircleIcon className="w-6 h-6" />
            </button>
            {/* <button
              onClick={onOpenSettings}
              className="p-2 text-gray-400 rounded-full hover:bg-white/10 hover:text-white transition-colors"
              aria-label="API 设置"
              title="API 设置"
            > */}
              {/* <CogIcon className="w-6 h-6" />
            </button> */}
            {/* <a
              href="https://github.com/aigem/aice_ps"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-gray-400 rounded-full hover:bg-white/10 hover:text-white transition-colors"
              aria-label="GitHub Repository"
              title="GitHub Repository"
            >
              <GitHubIcon className="w-6 h-6" />
            </a> */}
          </div>
      </div>
    </header>
  );
};

export default Header;