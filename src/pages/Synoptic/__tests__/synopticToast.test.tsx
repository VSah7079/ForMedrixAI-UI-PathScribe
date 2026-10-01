// @vitest-environment happy-dom
//
// src/pages/Synoptic/__tests__/synopticToast.test.tsx
// Batch 349 (PS-100): the report page's toast. Warnings stay until closed;
// short confirmations fade after their reading time; the toast shows its
// kind and can be closed.
import '@/i18n/config';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, renderHook, act } from '@testing-library/react';
import { useSynopticToast } from '../useSynopticToast';
import { SaveToast } from '../UI/SaveToast';

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useSynopticToast', () => {
  it('a warning stays up until it is dismissed', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSynopticToast());
    act(() => result.current.showToast('Specimen B has no grossing entered yet', 'warning'));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current.toastVisible).toBe(true);
    expect(result.current.toastKind).toBe('warning');

    act(() => result.current.dismissToast());
    expect(result.current.toastVisible).toBe(false);
  });

  it('a short confirmation fades by itself, after at least 4 seconds (it used to be 2.2)', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSynopticToast());
    act(() => result.current.showToast('Draft saved'));
    act(() => { vi.advanceTimersByTime(3_900); });
    expect(result.current.toastVisible).toBe(true);
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.toastVisible).toBe(false);
  });

  it('a new message replaces the old one and cancels its timer', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSynopticToast());
    act(() => result.current.showToast('Draft saved'));
    act(() => result.current.showToast('LIS rejected the order', 'error'));
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(result.current.toastVisible).toBe(true);
    expect(result.current.toastMsg).toBe('LIS rejected the order');
  });
});

describe('SaveToast', () => {
  it('a warning is announced as an alert with a warning icon and a close button', () => {
    const onDismiss = vi.fn();
    const { container } = render(<SaveToast message="Printer jammed" visible kind="warning" onDismiss={onDismiss} />);
    expect(screen.getByRole('alert').textContent).toContain('Printer jammed');
    expect(container.querySelector('.ps-save-toast--warning')).not.toBeNull();
    expect(container.querySelector('.ps-save-toast-check')?.textContent).toBe('⚠');

    fireEvent.click(screen.getByRole('button', { name: 'Close message' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('a confirmation is a status, not an alert, and has no close button while hidden', () => {
    render(<SaveToast message="Draft saved" visible={false} kind="success" onDismiss={vi.fn()} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('patient data in the report toast (Batch 363, PS-72)', () => {
  it('a message marked containsPhi is tagged for screenshot redaction; others are not', () => {
    const { result } = renderHook(() => useSynopticToast());
    act(() => result.current.showToast('Printing cassette S26-4403 A1', 'info', { containsPhi: true }));
    expect(result.current.toastContainsPhi).toBe(true);
    act(() => result.current.showToast('Draft saved', 'success'));
    expect(result.current.toastContainsPhi).toBe(false);

    const { container, rerender } = render(<SaveToast message="Printing cassette S26-4403 A1" visible kind="info" containsPhi />);
    expect(container.querySelector('.ps-save-toast-text')?.getAttribute('data-phi')).toBe('true');
    rerender(<SaveToast message="Draft saved" visible kind="success" />);
    expect(container.querySelector('.ps-save-toast-text')?.hasAttribute('data-phi')).toBe(false);
  });
});
