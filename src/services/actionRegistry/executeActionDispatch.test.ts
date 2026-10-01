// @vitest-environment happy-dom
// Batch 379: executeAction used to announce every action twice, so each
// page's onAction listener ran it twice (found when a voice-confirmed
// Complete grossing ran a second time and hit a version conflict).
import { describe, it, expect } from 'vitest';
import { mockActionRegistryService } from './mockActionRegistryService';

const actions = mockActionRegistryService.getActions();

describe('executeAction announces each action once (Batch 379)', () => {
  it('an onAction listener hears a command once, on the keyboard path and the custom-event path alike', () => {
    const heard: string[] = [];
    const unsubscribe = mockActionRegistryService.onAction(id => heard.push(id));
    const complete = actions.find(a => a.id === 'GROSSING_COMPLETE')!;
    const delegate = actions.find(a => a.id === 'DELEGATE_CONFIRM')!;
    mockActionRegistryService.executeAction(complete, 'complete grossing');
    mockActionRegistryService.executeAction(delegate);
    unsubscribe();
    expect(heard).toEqual(['GROSSING_COMPLETE', 'DELEGATE_CONFIRM']);
  });
});
