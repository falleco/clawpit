import { invoke } from '@tauri-apps/api/core';
import { Terminal as TerminalIcon } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import cliCommands from '@/data/openclaw-cli-commands.json';
import { useConfigStore } from '@/stores';

interface InstanceTerminalProps {
  instanceId: string;
  instanceName: string;
  clawpitDir: string;
}

interface TerminalLine {
  id: number;
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
  timestamp: Date;
}

interface Suggestion {
  command: string;
  description: string;
  fullPath: string;
  type: 'command' | 'option' | 'global-flag';
}

interface OptionDef {
  flag: string;
  description?: string;
}

interface CommandDef {
  command: string;
  description?: string;
  options?: OptionDef[];
  subcommands?: CommandDef[];
}

// Build a map of command paths to their definitions for quick lookup
function buildCommandMap(): Map<string, CommandDef> {
  const commandMap = new Map<string, CommandDef>();

  const processCommand = (cmd: CommandDef, parentPath = '') => {
    const fullPath = parentPath ? `${parentPath} ${cmd.command}` : cmd.command;
    commandMap.set(fullPath.toLowerCase(), cmd);

    if (cmd.subcommands) {
      for (const sub of cmd.subcommands) {
        processCommand(sub as CommandDef, fullPath);
      }
    }
  };

  for (const cmd of cliCommands.commands) {
    processCommand(cmd as CommandDef);
  }

  return commandMap;
}

// Build flat list of all commands with their full paths for autocomplete
function buildSuggestionsList(): Suggestion[] {
  const suggestions: Suggestion[] = [];

  const processCommand = (cmd: CommandDef, parentPath = '') => {
    const fullPath = parentPath ? `${parentPath} ${cmd.command}` : cmd.command;
    suggestions.push({
      command: cmd.command,
      description: cmd.description || '',
      fullPath,
      type: 'command',
    });

    if (cmd.subcommands) {
      for (const sub of cmd.subcommands) {
        processCommand(sub as CommandDef, fullPath);
      }
    }
  };

  for (const cmd of cliCommands.commands) {
    processCommand(cmd as CommandDef);
  }

  return suggestions;
}

const allSuggestions = buildSuggestionsList();
const commandMap = buildCommandMap();

// Get the global flags
const globalFlags: OptionDef[] = cliCommands.globalFlags as OptionDef[];

// Find the matching command for a given input
function findMatchingCommand(input: string): CommandDef | null {
  const parts = input.toLowerCase().trim().split(/\s+/);

  // Try to find the longest matching command path
  for (let i = parts.length; i > 0; i--) {
    const path = parts.slice(0, i).join(' ');
    const cmd = commandMap.get(path);
    if (cmd) {
      return cmd;
    }
  }

  return null;
}

// Check if input ends with a complete command (followed by space)
function getCommandContext(input: string): {
  command: CommandDef | null;
  isTypingOption: boolean;
  currentOptionPrefix: string;
} {
  const trimmed = input.trim();
  const endsWithSpace = input.endsWith(' ');
  const parts = trimmed.split(/\s+/);

  // Check if the last part looks like an option being typed
  const lastPart = parts[parts.length - 1] || '';
  const isTypingOption = lastPart.startsWith('-');

  if (endsWithSpace || isTypingOption) {
    // Find the command without the current option being typed
    const commandParts = isTypingOption ? parts.slice(0, -1) : parts;
    const commandPath = commandParts.join(' ');
    const command = findMatchingCommand(commandPath);

    return {
      command,
      isTypingOption,
      currentOptionPrefix: isTypingOption ? lastPart : '',
    };
  }

  return {
    command: null,
    isTypingOption: false,
    currentOptionPrefix: '',
  };
}

// ANSI color code to Tailwind CSS class mapping
const ANSI_COLORS: Record<number, string> = {
  // Standard colors (foreground)
  30: 'text-black',
  31: 'text-red-500',
  32: 'text-green-500',
  33: 'text-yellow-500',
  34: 'text-blue-500',
  35: 'text-purple-500',
  36: 'text-cyan-500',
  37: 'text-white',
  // Bright colors (foreground)
  90: 'text-gray-500',
  91: 'text-red-400',
  92: 'text-green-400',
  93: 'text-yellow-400',
  94: 'text-blue-400',
  95: 'text-purple-400',
  96: 'text-cyan-400',
  97: 'text-gray-100',
  // Default
  39: 'text-gray-200',
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: 'bg-black',
  41: 'bg-red-500',
  42: 'bg-green-500',
  43: 'bg-yellow-500',
  44: 'bg-blue-500',
  45: 'bg-purple-500',
  46: 'bg-cyan-500',
  47: 'bg-white',
  // Bright backgrounds
  100: 'bg-gray-500',
  101: 'bg-red-400',
  102: 'bg-green-400',
  103: 'bg-yellow-400',
  104: 'bg-blue-400',
  105: 'bg-purple-400',
  106: 'bg-cyan-400',
  107: 'bg-gray-100',
  49: '',
};

// Parse ANSI escape codes and return React elements
function parseAnsi(text: string): ReactNode[] {
  const result: ReactNode[] = [];
  // Match ANSI escape sequences: ESC[ followed by params and ending with 'm'
  // Using String.fromCharCode(27) to avoid lint error about control characters
  const escChar = String.fromCharCode(27);
  const ansiRegex = new RegExp(`${escChar}\\[([0-9;]*)m`, 'g');

  let lastIndex = 0;
  let currentClasses: string[] = [];
  let keyCounter = 0;

  // Use matchAll instead of exec in a while loop to avoid lint error
  const matches = Array.from(text.matchAll(ansiRegex));

  for (const match of matches) {
    const matchIndex = match.index ?? 0;

    // Add text before this escape sequence
    if (matchIndex > lastIndex) {
      const textContent = text.slice(lastIndex, matchIndex);
      if (textContent) {
        result.push(
          <span key={keyCounter++} className={currentClasses.join(' ')}>
            {textContent}
          </span>,
        );
      }
    }

    // Parse the escape sequence codes
    const codes = match[1].split(';').map((c) => Number.parseInt(c, 10) || 0);

    for (const code of codes) {
      if (code === 0) {
        // Reset all attributes
        currentClasses = [];
      } else if (code === 1) {
        // Bold
        currentClasses.push('font-bold');
      } else if (code === 2) {
        // Dim
        currentClasses.push('opacity-60');
      } else if (code === 3) {
        // Italic
        currentClasses.push('italic');
      } else if (code === 4) {
        // Underline
        currentClasses.push('underline');
      } else if (ANSI_COLORS[code]) {
        // Remove existing text color classes
        currentClasses = currentClasses.filter((c) => !c.startsWith('text-'));
        currentClasses.push(ANSI_COLORS[code]);
      } else if (ANSI_BG_COLORS[code] !== undefined) {
        // Remove existing bg color classes
        currentClasses = currentClasses.filter((c) => !c.startsWith('bg-'));
        if (ANSI_BG_COLORS[code]) {
          currentClasses.push(ANSI_BG_COLORS[code]);
        }
      }
    }

    lastIndex = matchIndex + match[0].length;
  }

  // Add remaining text after last escape sequence
  if (lastIndex < text.length) {
    const textContent = text.slice(lastIndex);
    if (textContent) {
      result.push(
        <span key={keyCounter++} className={currentClasses.join(' ')}>
          {textContent}
        </span>,
      );
    }
  }

  // If no ANSI codes found, return the original text
  if (result.length === 0) {
    return [<span key={0}>{text}</span>];
  }

  return result;
}

export function InstanceTerminal({
  instanceId,
  instanceName,
  clawpitDir,
}: InstanceTerminalProps) {
  const { config } = useConfigStore();
  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: 0,
      type: 'system',
      content: `Connected to ${instanceName} (openclaw-cli)`,
      timestamp: new Date(),
    },
    {
      id: 1,
      type: 'system',
      content:
        'Type a command and press Enter to execute. Use Tab for autocomplete.',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const outputRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const lineIdRef = useRef(2);

  // Filter suggestions based on input
  const filteredSuggestions = useMemo(() => {
    if (!inputValue.trim()) return [];

    const input = inputValue.toLowerCase().trim();
    const inputParts = input.split(/\s+/);

    // Check if we should show options for a command
    const context = getCommandContext(inputValue);

    if (context.command) {
      const suggestions: Suggestion[] = [];
      const commandOptions = context.command.options || [];
      const commandSubcommands = context.command.subcommands || [];
      const optionPrefix = context.currentOptionPrefix.toLowerCase();

      // Add subcommands if available
      for (const sub of commandSubcommands) {
        const subCmd = sub as CommandDef;
        if (
          !optionPrefix ||
          subCmd.command.toLowerCase().startsWith(optionPrefix)
        ) {
          suggestions.push({
            command: subCmd.command,
            description: subCmd.description || '',
            fullPath: subCmd.command,
            type: 'command',
          });
        }
      }

      // Add command-specific options
      for (const opt of commandOptions) {
        const flagName = opt.flag.split(/\s+/)[0]; // Get just the flag part (e.g., "--workspace" from "--workspace <dir>")
        if (!optionPrefix || flagName.toLowerCase().startsWith(optionPrefix)) {
          suggestions.push({
            command: opt.flag,
            description: opt.description || '',
            fullPath: opt.flag,
            type: 'option',
          });
        }
      }

      // Add global flags
      for (const flag of globalFlags) {
        const flagName = flag.flag.split(/\s+/)[0];
        if (!optionPrefix || flagName.toLowerCase().startsWith(optionPrefix)) {
          suggestions.push({
            command: flag.flag,
            description: flag.description || '',
            fullPath: flag.flag,
            type: 'global-flag',
          });
        }
      }

      return suggestions.slice(0, 12);
    }

    // Default: filter commands that match the input
    return allSuggestions
      .filter((s) => {
        const fullPathLower = s.fullPath.toLowerCase();
        // Check if the full path starts with the input or contains all input parts
        if (fullPathLower.startsWith(input)) return true;

        // Check if all input parts are in the full path (for partial matches)
        const pathParts = fullPathLower.split(/\s+/);
        if (inputParts.length <= pathParts.length) {
          let matches = true;
          for (let i = 0; i < inputParts.length; i++) {
            if (!pathParts[i].startsWith(inputParts[i])) {
              matches = false;
              break;
            }
          }
          if (matches) return true;
        }

        return false;
      })
      .slice(0, 10);
  }, [inputValue]);

  // Auto-scroll to bottom when new lines are added
  useEffect(() => {
    if (outputRef.current && lines.length > 0) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines.length]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const addLine = useCallback((type: TerminalLine['type'], content: string) => {
    const newLine: TerminalLine = {
      id: lineIdRef.current++,
      type,
      content,
      timestamp: new Date(),
    };
    setLines((prev) => [...prev, newLine]);
  }, []);

  const executeCommand = useCallback(
    async (command: string) => {
      if (!command.trim()) return;

      // Add the command to history
      setCommandHistory((prev) => [...prev, command]);
      setHistoryIndex(-1);

      // Show the command in the terminal
      addLine('input', `$ ${command}`);

      setIsExecuting(true);

      try {
        const result = await invoke<string>('execute_instance_cli_command', {
          clawpitDir,
          instanceId,
          command,
          wslDistro: config?.wslDistro ?? null,
        });

        // Add the entire output as one block to preserve spacing
        if (result.trim()) {
          addLine('output', result);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        addLine('error', `Error: ${errorMessage}`);
      } finally {
        setIsExecuting(false);
        inputRef.current?.focus();
      }
    },
    [clawpitDir, instanceId, config?.wslDistro, addLine],
  );

  // Select a suggestion
  const selectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      if (suggestion.type === 'option' || suggestion.type === 'global-flag') {
        // For options, append to the current input (remove any partial option being typed)
        const parts = inputValue.trim().split(/\s+/);
        const lastPart = parts[parts.length - 1] || '';

        // If the last part is an option being typed, replace it
        if (lastPart.startsWith('-')) {
          parts.pop();
        }

        // Get just the flag name without the argument placeholder
        const flagName = suggestion.fullPath.split(/\s+/)[0];
        const newValue = `${[...parts, flagName].join(' ')} `;
        setInputValue(newValue);
      } else {
        // For commands, set the full path
        setInputValue(`${suggestion.fullPath} `);
      }
      setShowSuggestions(false);
      setSelectedSuggestionIndex(0);
      inputRef.current?.focus();
    },
    [inputValue],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      // Handle autocomplete navigation
      if (showSuggestions && filteredSuggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedSuggestionIndex((prev) =>
            prev < filteredSuggestions.length - 1 ? prev + 1 : 0,
          );
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedSuggestionIndex((prev) =>
            prev > 0 ? prev - 1 : filteredSuggestions.length - 1,
          );
          return;
        }
        if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault();
          selectSuggestion(filteredSuggestions[selectedSuggestionIndex]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowSuggestions(false);
          return;
        }
      }

      // Tab to show/cycle suggestions
      if (e.key === 'Tab' && !isExecuting) {
        e.preventDefault();
        if (filteredSuggestions.length > 0) {
          if (!showSuggestions) {
            setShowSuggestions(true);
            setSelectedSuggestionIndex(0);
          } else {
            // Tab cycles through suggestions
            setSelectedSuggestionIndex((prev) =>
              prev < filteredSuggestions.length - 1 ? prev + 1 : 0,
            );
          }
        }
        return;
      }

      if (e.key === 'Enter' && !isExecuting) {
        e.preventDefault();
        const command = inputValue.trim();
        setInputValue('');
        setShowSuggestions(false);
        void executeCommand(command);
      } else if (e.key === 'ArrowUp' && !showSuggestions) {
        e.preventDefault();
        if (commandHistory.length > 0) {
          const newIndex =
            historyIndex === -1
              ? commandHistory.length - 1
              : Math.max(0, historyIndex - 1);
          setHistoryIndex(newIndex);
          setInputValue(commandHistory[newIndex]);
        }
      } else if (e.key === 'ArrowDown' && !showSuggestions) {
        e.preventDefault();
        if (historyIndex !== -1) {
          const newIndex = historyIndex + 1;
          if (newIndex >= commandHistory.length) {
            setHistoryIndex(-1);
            setInputValue('');
          } else {
            setHistoryIndex(newIndex);
            setInputValue(commandHistory[newIndex]);
          }
        }
      } else if (e.key === 'c' && e.ctrlKey) {
        if (isExecuting) {
          addLine('system', '^C');
          setIsExecuting(false);
        }
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    },
    [
      inputValue,
      isExecuting,
      executeCommand,
      commandHistory,
      historyIndex,
      addLine,
      showSuggestions,
      filteredSuggestions,
      selectedSuggestionIndex,
      selectSuggestion,
    ],
  );

  // Show suggestions when typing
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputValue(value);
      setHistoryIndex(-1);

      // Show suggestions if there's input
      if (value.trim()) {
        setShowSuggestions(true);
        setSelectedSuggestionIndex(0);
      } else {
        setShowSuggestions(false);
      }
    },
    [],
  );

  // Scroll selected suggestion into view
  useEffect(() => {
    if (showSuggestions && suggestionsRef.current) {
      const selectedEl = suggestionsRef.current.children[
        selectedSuggestionIndex
      ] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedSuggestionIndex, showSuggestions]);

  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const getLineColor = (type: TerminalLine['type']): string => {
    switch (type) {
      case 'input':
        return 'text-green-400';
      case 'output':
        return 'text-gray-200';
      case 'error':
        return 'text-red-400';
      case 'system':
        return 'text-blue-400';
      default:
        return 'text-gray-200';
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900">
      {/* Terminal header */}
      <div className="flex items-center gap-2 border-b border-zinc-700 bg-zinc-800 px-4 py-2">
        <TerminalIcon className="h-4 w-4 text-zinc-400" />
        <span className="font-mono text-sm text-zinc-300">
          {instanceName} - openclaw-cli
        </span>
      </div>

      {/* Terminal output */}
      <button
        ref={outputRef}
        type="button"
        className="flex-1 overflow-y-auto p-4 font-mono text-sm text-left w-full cursor-text block"
        onClick={handleContainerClick}
      >
        {lines.map((line) => (
          <div
            key={line.id}
            className={`${getLineColor(line.type)} whitespace-pre-wrap break-words`}
          >
            {line.type === 'output' ? parseAnsi(line.content) : line.content}
          </div>
        ))}
        {isExecuting && (
          <div className="text-yellow-400 animate-pulse">Executing...</div>
        )}
      </button>

      {/* Terminal input */}
      <div className="relative border-t border-zinc-700 bg-zinc-800">
        {/* Autocomplete suggestions */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute bottom-full left-0 right-0 max-h-64 overflow-y-auto border border-zinc-600 bg-zinc-800 shadow-lg"
          >
            {filteredSuggestions.map((suggestion, index) => {
              // Different colors for different suggestion types
              const typeColor =
                suggestion.type === 'command'
                  ? 'text-green-400'
                  : suggestion.type === 'option'
                    ? 'text-cyan-400'
                    : 'text-yellow-400'; // global-flag

              const typeLabel =
                suggestion.type === 'command'
                  ? null
                  : suggestion.type === 'option'
                    ? 'opt'
                    : 'global';

              return (
                <button
                  key={`${suggestion.type}-${suggestion.fullPath}`}
                  type="button"
                  className={`w-full px-4 py-2 text-left font-mono text-sm hover:bg-zinc-700 ${
                    index === selectedSuggestionIndex
                      ? 'bg-zinc-700 text-white'
                      : 'text-gray-300'
                  }`}
                  onClick={() => selectSuggestion(suggestion)}
                  onMouseEnter={() => setSelectedSuggestionIndex(index)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      {typeLabel && (
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            suggestion.type === 'option'
                              ? 'bg-cyan-900/50 text-cyan-400'
                              : 'bg-yellow-900/50 text-yellow-400'
                          }`}
                        >
                          {typeLabel}
                        </span>
                      )}
                      <span className={`${typeColor} font-medium`}>
                        {suggestion.fullPath}
                      </span>
                    </div>
                    {suggestion.description && (
                      <span className="text-zinc-500 text-xs truncate max-w-[50%]">
                        {suggestion.description}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center px-4 py-2">
          <span className="font-mono text-sm text-green-400 mr-2">$</span>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              // Delay hiding to allow click on suggestion
              setTimeout(() => setShowSuggestions(false), 150);
            }}
            onFocus={() => {
              if (inputValue.trim() && filteredSuggestions.length > 0) {
                setShowSuggestions(true);
              }
            }}
            disabled={isExecuting}
            className="flex-1 bg-transparent font-mono text-sm text-gray-200 outline-none placeholder:text-zinc-600"
            placeholder={
              isExecuting
                ? 'Executing...'
                : 'Enter command... (Tab for autocomplete)'
            }
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}

export default InstanceTerminal;
