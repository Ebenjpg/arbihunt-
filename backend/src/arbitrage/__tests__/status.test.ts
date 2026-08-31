import { describe, it, expect } from 'vitest';
import { computeTransferStatus, recommendedNetwork, transferTimeEstimate } from '../status';
import type { NetworkDescriptor } from '@arbihunt/shared';

const base = {
  networkStatus: 'ok' as const,
  assetStatus: 'verified' as const,
  executable: true,
  executableFlag: 'EXECUTABLE',
};

const net = (id: string, fee?: string): NetworkDescriptor => ({
  id,
  chain: id,
  withdrawalFee: fee,
  depositEnabled: 'open',
  withdrawalEnabled: 'open',
  source: 'default',
});

describe('computeTransferStatus', () => {
  it('READY when network matched and withdrawal fee is known', () => {
    expect(computeTransferStatus({ ...base, withdrawalFeeKnown: true })).toBe('READY');
  });

  it('TRANSFER COST UNKNOWN when fee is missing (not READY)', () => {
    expect(computeTransferStatus({ ...base, withdrawalFeeKnown: false })).toBe('TRANSFER COST UNKNOWN');
  });

  it('NO COMMON NETWORK when no compatible network', () => {
    expect(computeTransferStatus({ ...base, networkStatus: 'no-common', withdrawalFeeKnown: true })).toBe('NO COMMON NETWORK');
  });

  it('NETWORK UNKNOWN when network info is unavailable', () => {
    expect(computeTransferStatus({ ...base, networkStatus: 'unknown', withdrawalFeeKnown: false })).toBe('NETWORK UNKNOWN');
  });

  it('ASSET UNVERIFIED only on a positive identity conflict', () => {
    expect(computeTransferStatus({ ...base, assetStatus: 'unverified', withdrawalFeeKnown: true })).toBe('ASSET UNVERIFIED');
  });

  it('unknown identity does NOT block the transfer status', () => {
    expect(computeTransferStatus({ ...base, assetStatus: 'unknown', withdrawalFeeKnown: true })).toBe('READY');
  });

  it('negative profit is not READY', () => {
    expect(computeTransferStatus({ ...base, withdrawalFeeKnown: true, executable: false, executableFlag: 'NEGATIVE PROFIT' })).toBe('NEGATIVE PROFIT');
  });
});

describe('recommendedNetwork', () => {
  it('selects the cheapest valid network by USD fee', () => {
    const res = recommendedNetwork([net('ERC20', '6'), net('TRC20', '1'), net('BEP20', '0.5')], 1);
    expect(res?.id).toBe('BEP20');
  });

  it('ranks unknown-fee networks below priced ones', () => {
    const res = recommendedNetwork([net('ERC20', '6'), net('OP', undefined)], 1);
    expect(res?.id).toBe('ERC20');
  });

  it('returns undefined for empty input', () => {
    expect(recommendedNetwork([], 1)).toBeUndefined();
  });
});

describe('transferTimeEstimate', () => {
  it('returns UNKNOWN for empty input', () => {
    expect(transferTimeEstimate()).toBe('UNKNOWN');
    expect(transferTimeEstimate('NOPE')).toBe('UNKNOWN');
  });
  it('returns a known estimate', () => {
    expect(transferTimeEstimate('ERC20')).not.toBe('UNKNOWN');
  });
});