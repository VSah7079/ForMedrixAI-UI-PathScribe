import { IAIIntegrationService, AIProcessingOptions, AiFieldSuggestionResult, SynopticEvaluationInput, SynopticEvaluationResult } from './IAIIntegrationService';
import type { VoiceMacro } from '../../types';
// PS-67 (Batch 348): the app's one result shape, { ok, data } | { ok: false, error }.
import type { ServiceResult } from '../types';

export class MockAIIntegrationService implements IAIIntegrationService {
  /**
   * Mock implementation of transcript refinement.
   * Simulates AI logic using Regex to provide immediate feedback during dev.
   */
  async refineTranscript(
    text: string, 
    options?: AIProcessingOptions
  ): Promise<ServiceResult<string>> {
    // Simulate the "Thinking" time of a real LLM
    return new Promise((resolve) => {
      setTimeout(() => {
        let refined = text;

        // Mock "Intelligence": Fixes common phonetic/formatting errors
        refined = refined
          .replace(/^rose\b/i, "Gross")
          .replace(/\*/g, 'x')
          .replace(/\bpt(\d+)\b/gi, 'pT$1')
          .replace(/\bpn(\d+)\b/gi, 'pN$1')
          .replace(/and no carcinoma/gi, "adenocarcinoma");

        // Apply context-aware formatting
        if (options?.context === 'gross' && !refined.toLowerCase().startsWith('gross')) {
          refined = `Gross Description: ${refined}`;
        }

        resolve({
          ok: true,
          data: refined.trim()
        });
      }, 600); 
    });
  }

  /**
   * Mock implementation of macro suggestions.
   * Matches the new Interface signature: Promise<ServiceResult<Partial<VoiceMacro>[]>>
   */
  async suggestMacros(text: string): Promise<ServiceResult<Partial<VoiceMacro>[]>> {
    console.log("Mock identifying macro suggestions for:", text);
    return {
      ok: true,
      data: [
        { id: 'm1', keyword: 'GG', expansion: 'Gleason Grade' },
        { id: 'm2', keyword: 'LVI', expansion: 'Lymphovascular Invasion' },
        { id: 'm3', keyword: 'MS', expansion: 'Margin Status' }
      ]
    };
  }

  /**
   * Mock synoptic field suggestions — returns plausible static values
   * so the UI can be developed without a live AI call.
   */
  async suggestSynopticFields(
    _caseText: { gross: string; microscopic: string; ancillary: string },
    fields: Array<{ id: string; label: string; options?: Array<{ id: string; label: string }> }>
  ): Promise<ServiceResult<Record<string, AiFieldSuggestionResult>>> {
    await new Promise(r => setTimeout(r, 400)); // simulate latency
    const result: Record<string, AiFieldSuggestionResult> = {};
    fields.forEach(f => {
      if (f.options?.length) {
        result[f.id] = {
          value:      f.options[0].id,
          confidence: Math.floor(Math.random() * 30) + 65, // 65–95
          source:     'Mock: first available option',
        };
      }
    });
    return { ok: true, data: result };
  }

  /**
   * Mock narrative generation — returns a placeholder report.
   */
  async generateNarrative(_system: string, _prompt: string): Promise<ServiceResult<string>> {
    await new Promise(r => setTimeout(r, 800));
    return {
      ok: true,
      data: '[Mock narrative] The specimen is consistent with the provided synoptic data. Final diagnosis pending pathologist review.',
    };
  }

  /**
   * Mock implementation of synoptic assignment evaluation.
   * Deliberately returns an EMPTY changes array rather than canned demo
   * data — the "Sim Microscopic" dev button in SynopticReportPage.tsx
   * already serves the demo/UI-testing purpose with its own static
   * payload. Having this mock also return fake proposals would create two
   * different fake-data sources for the same UI surface (the Protocol
   * Change Review modal), which could conflict or confuse rather than
   * help. This mock exists only to satisfy the interface for dev/testing
   * without a live API key — not to power demos.
   */
  async evaluateSynopticAssignment(
    _input: SynopticEvaluationInput
  ): Promise<ServiceResult<SynopticEvaluationResult>> {
    await new Promise(r => setTimeout(r, 500)); // simulate latency
    return {
      ok: true,
      data: { changes: [], warnings: [] },
    };
  }
}
