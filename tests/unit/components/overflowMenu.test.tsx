import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OverflowMenu } from '../../../src/components/common/OverflowMenu';
beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('toolbar overflow menu', () => {
  it('portals outside the toolbar and navigates enabled actions, then restores focus', () => {
    const { container } = render(<div style={{ overflow: 'hidden' }}><OverflowMenu label="More">
      <button role="menuitem">First</button><button role="menuitem" disabled>Unavailable</button><button role="menuitem">Last</button>
    </OverflowMenu></div>);
    const trigger = screen.getByRole('button', { name: 'More' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(container.contains(screen.getByRole('menu'))).toBe(false);
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Last' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Home' });
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });
  it('dismisses on action, outside press and Tab', () => {
    render(<OverflowMenu label="More"><button role="menuitem">Action</button></OverflowMenu>);
    const trigger = screen.getByRole('button', { name: 'More' });
    fireEvent.click(trigger);fireEvent.click(screen.getByRole('menuitem'));
    expect(screen.queryByRole('menu')).toBeNull();expect(trigger).toHaveFocus();
    fireEvent.click(trigger);fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(trigger);fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
  it('remains keyboard-dismissible when every action is disabled', () => {
    render(<OverflowMenu label="More"><button role="menuitem" disabled>Unavailable</button></OverflowMenu>);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menu')).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
