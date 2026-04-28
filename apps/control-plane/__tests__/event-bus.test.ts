import { describe, it, expect, vi } from 'vitest';
import { EventBus, eventBus, type BusEvent } from '../src/lib/event-bus';

// ─── subscribe / emit ─────────────────────────────────────────────────────────

describe('EventBus — subscribe / emit', () => {
  it('delivers an emitted event to a subscriber', () => {
    const bus = new EventBus();
    const received: BusEvent[] = [];
    bus.subscribe(e => received.push(e));

    bus.emit('attestation-changed', { frameHash: 'abc' });

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('attestation-changed');
    expect(received[0].payload).toEqual({ frameHash: 'abc' });
  });

  it('emits without payload (payload is undefined)', () => {
    const bus = new EventBus();
    const received: BusEvent[] = [];
    bus.subscribe(e => received.push(e));

    bus.emit('integration-changed');

    expect(received[0].payload).toBeUndefined();
  });
});

// ─── multiple listeners ───────────────────────────────────────────────────────

describe('EventBus — multiple listeners', () => {
  it('delivers the same event to all subscribers', () => {
    const bus = new EventBus();
    const calls: string[] = [];
    bus.subscribe(() => calls.push('a'));
    bus.subscribe(() => calls.push('b'));
    bus.subscribe(() => calls.push('c'));

    bus.emit('proposal-added');

    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('tracks listenerCount correctly', () => {
    const bus = new EventBus();
    expect(bus.listenerCount).toBe(0);
    const unsub1 = bus.subscribe(() => {});
    const unsub2 = bus.subscribe(() => {});
    expect(bus.listenerCount).toBe(2);
    unsub1();
    expect(bus.listenerCount).toBe(1);
    unsub2();
    expect(bus.listenerCount).toBe(0);
  });
});

// ─── unsubscribe ──────────────────────────────────────────────────────────────

describe('EventBus — unsubscribe', () => {
  it('does not call handler after unsubscribe', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe(handler);

    bus.emit('proposal-added');
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    bus.emit('proposal-added');
    expect(handler).toHaveBeenCalledTimes(1); // still 1
  });

  it('calling unsubscribe twice is safe (idempotent)', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe(handler);
    unsubscribe();
    expect(() => unsubscribe()).not.toThrow();
    expect(bus.listenerCount).toBe(0);
  });
});

// ─── error isolation ──────────────────────────────────────────────────────────

describe('EventBus — error isolation', () => {
  it('continues delivering to other subscribers even if one throws', () => {
    const bus = new EventBus();
    const good = vi.fn();
    bus.subscribe(() => { throw new Error('bad subscriber'); });
    bus.subscribe(good);

    // Should not throw at the call site
    expect(() => bus.emit('integration-changed')).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
});

// ─── shared singleton ─────────────────────────────────────────────────────────

describe('eventBus singleton', () => {
  it('is an EventBus instance', () => {
    expect(eventBus).toBeInstanceOf(EventBus);
  });
});

// ─── all EventType values round-trip ─────────────────────────────────────────

describe('EventBus — all registered event types', () => {
  const allTypes = [
    'integration-changed',
    'attestation-changed',
    'proposal-added',
    'proposal-resolved',
    'team-membership-changed',
    'action-approval-needed',
    'action-resolved',
  ] as const;

  for (const type of allTypes) {
    it(`delivers type "${type}"`, () => {
      const bus = new EventBus();
      const received: BusEvent[] = [];
      bus.subscribe(e => received.push(e));
      bus.emit(type);
      expect(received[0].type).toBe(type);
    });
  }
});
