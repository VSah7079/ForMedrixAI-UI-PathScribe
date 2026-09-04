import { IVoiceMacroService } from './IVoiceMacroService';
import { VoiceMacro, applyVoiceMacroSubstitutions } from '../../types/voiceMacros';
import { PATHOLOGY_DEFAULTS } from '../../constants/defaultMacros';

export class MockVoiceMacroService implements IVoiceMacroService {
  private STORAGE_KEY = 'pathscribe_voice_macros';

  private getStoredMacros(): VoiceMacro[] {
    const data = localStorage.getItem(this.STORAGE_KEY);
    
    if (!data) {
      // Seed defaults using the correct 'spoken' and 'written' keys
      const seededMacros: VoiceMacro[] = PATHOLOGY_DEFAULTS.map((m: any) => ({
        id: Math.random().toString(36).substring(2, 11),
        spoken: m.spoken || m.name || '',
        written: m.written || m.replacement || '',
        isActive: m.isActive ?? true
      }));
      this.saveToStorage(seededMacros);
      return seededMacros;
    }
    
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error("Failed to parse stored macros, resetting to defaults.");
      return [];
    }
  }

  private saveToStorage(macros: VoiceMacro[]) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(macros));
  }

  // --- Public API Methods ---

  async getMacros(): Promise<VoiceMacro[]> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(this.getStoredMacros()), 300);
    });
  }

  async addMacro(macro: Omit<VoiceMacro, 'id'>): Promise<string> {
    const macros = this.getStoredMacros();
    const newId = Math.random().toString(36).substring(2, 11);
    const newMacro: VoiceMacro = { ...macro, id: newId };
    this.saveToStorage([newMacro, ...macros]);
    return newId;
  }

  async updateMacro(id: string, updates: Partial<VoiceMacro>): Promise<void> {
    const macros = this.getStoredMacros();
    const updated = macros.map(m => (m.id === id ? { ...m, ...updates } : m));
    this.saveToStorage(updated);
  }

  async deleteMacro(id: string): Promise<void> {
    const macros = this.getStoredMacros();
    const filtered = macros.filter(m => m.id !== id);
    this.saveToStorage(filtered);
  }

  async bulkImport(macros: Omit<VoiceMacro, 'id'>[]): Promise<void> {
    const existing = this.getStoredMacros();
    const newEntries = macros.map(m => ({
      ...m,
      id: Math.random().toString(36).substring(2, 11)
    }));
    this.saveToStorage([...newEntries, ...existing]);
  }

  /**
   * Real, per direct guidance: delegates to applyVoiceMacroSubstitutions
   * (types/voiceMacros.ts) — the same pure algorithm the real, live
   * dictation pipeline (contexts/VoiceProvider.tsx) now calls directly,
   * kept as a single implementation so this async wrapper and that
   * real-time path can never disagree on what counts as a match.
   */
  async refineTranscript(
    transcript: string, 
    _options?: { context?: string }
  ): Promise<{ success: boolean; data: string }> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const macros = this.getStoredMacros();
        resolve({
          success: true,
          data: applyVoiceMacroSubstitutions(transcript, macros),
        });
      }, 200);
    });
  }
}
