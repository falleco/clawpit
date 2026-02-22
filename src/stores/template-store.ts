import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import type { Template, TemplateSummary } from '@/types';

interface TemplateStore {
  templates: TemplateSummary[];
  selectedTemplate: Template | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadTemplates: () => Promise<void>;
  selectTemplate: (id: string) => Promise<void>;
  clearSelection: () => void;
}

export const useTemplateStore = create<TemplateStore>((set) => ({
  templates: [],
  selectedTemplate: null,
  isLoading: false,
  error: null,

  loadTemplates: async () => {
    set({ isLoading: true, error: null });
    try {
      const templates = await invoke<TemplateSummary[]>('list_templates');
      set({ templates, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
    }
  },

  selectTemplate: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const template = await invoke<Template>('get_template', { id });
      set({ selectedTemplate: template, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
    }
  },

  clearSelection: () => {
    set({ selectedTemplate: null });
  },
}));

// Re-export types
export type { Template, TemplateSummary };
