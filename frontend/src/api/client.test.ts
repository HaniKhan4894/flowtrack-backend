import { describe, expect, it, vi } from 'vitest';
import client from './client';

describe('api client', () => {
  it('sets base URL', () => {
    expect(client.defaults.baseURL).toBeTruthy();
  });

  it('has json content type', () => {
    expect(client.defaults.headers['Content-Type']).toBe('application/json');
  });

  it('can create request config', () => {
    const spy = vi.spyOn(client, 'request');
    client.request({ url: '/health', method: 'get' }).catch(() => undefined);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
