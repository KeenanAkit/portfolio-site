import { describe, it, expect } from 'vitest';
import { classifyKey } from './useKeyboardShortcuts';

function ev(
  key: string,
  mods: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}
) {
  return {
    key,
    altKey: mods.altKey ?? false,
    ctrlKey: mods.ctrlKey ?? false,
    metaKey: mods.metaKey ?? false,
    shiftKey: mods.shiftKey ?? false,
  };
}

describe('classifyKey', () => {
  it('Alt+F4 -> close', () => {
    expect(classifyKey(ev('F4', { altKey: true }))).toBe('close');
  });

  it('Cmd+W -> close', () => {
    expect(classifyKey(ev('w', { metaKey: true }))).toBe('close');
    expect(classifyKey(ev('W', { metaKey: true }))).toBe('close');
  });

  it('Ctrl+W -> close', () => {
    expect(classifyKey(ev('w', { ctrlKey: true }))).toBe('close');
  });

  it('Escape -> close', () => {
    expect(classifyKey(ev('Escape'))).toBe('close');
  });

  it('Alt+Space -> system-menu (reserved)', () => {
    expect(classifyKey(ev(' ', { altKey: true }))).toBe('system-menu');
  });

  it('plain Escape with modifiers does NOT trigger close', () => {
    expect(classifyKey(ev('Escape', { altKey: true }))).toBe(null);
    expect(classifyKey(ev('Escape', { ctrlKey: true }))).toBe(null);
  });

  it('typing letters and arrows is ignored', () => {
    expect(classifyKey(ev('a'))).toBe(null);
    expect(classifyKey(ev('ArrowUp'))).toBe(null);
    expect(classifyKey(ev('Enter'))).toBe(null);
  });

  it('F4 without Alt is ignored', () => {
    expect(classifyKey(ev('F4'))).toBe(null);
  });

  it('w without modifier is ignored', () => {
    expect(classifyKey(ev('w'))).toBe(null);
  });
});
