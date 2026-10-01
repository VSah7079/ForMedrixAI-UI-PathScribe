// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { resetConfigScroll } from './resetConfigScroll';

describe('resetConfigScroll', () => {
  it('scrolls the real .ps-cfgpage-scroll container to the top when it exists', () => {
    const container = document.createElement('div');
    container.className = 'ps-cfgpage-scroll';
    container.scrollTo = vi.fn();
    document.body.appendChild(container);

    resetConfigScroll();

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 0 });
    document.body.removeChild(container);
  });

  it('does not throw when the container is not present', () => {
    expect(() => resetConfigScroll()).not.toThrow();
  });
});
