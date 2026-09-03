import { describe, it, expect } from 'vitest';
import { normalizeSymbol, canonicalSymbol } from '../normalize';
import { matchNetworks, networkMatches } from '../networks';
import type { NetworkDescriptor } from '../../types';

const trc20: NetworkDescriptor = { id: 'TRC20', chain: 'Tron', withdrawalFee: '1', depositEnabled: 'open', withdrawalEnabled: 'open', source: 'default' };
const erc20: NetworkDescriptor = { id: 'ERC20', chain: 'Ethereum', withdrawalFee: '6', depositEnabled: 'open', withdrawalEnabled: 'open', source: 'default' };
const bep20: NetworkDescriptor = { id: 'BEP20', chain: 'BNB Smart Chain', withdrawalFee: '0.5', depositEnabled: 'open', withdrawalEnabled: 'open', source: 'default' };

describe('symbol normalization', () => {
  it('normalizes all common formats', () => {
    expect(canonicalSymbol('BTCUSDT')).toBe('BTC/USDT');
    expect(canonicalSymbol('BTC-USDT')).toBe('BTC/USDT');
    expect(canonicalSymbol('BTC_USDT')).toBe('BTC/USDT');
    expect(canonicalSymbol('btc/usdt')).toBe('BTC/USDT');
    expect(canonicalSymbol('ETHBTC')).toBe('ETH/BTC');
    expect(canonicalSymbol('1000SHIBUSDT')).toBe('1000SHIB/USDT');
  });

  it('asset matching finds the same canonical asset', () => {
    const a = normalizeSymbol('BTC/USDT');
    const b = normalizeSymbol('BTCUSDT');
    expect(a?.canonical).toBe(b?.canonical);
  });

  it('rejects garbage', () => {
    expect(canonicalSymbol('')).toBeNull();
    expect(canonicalSymbol('!!!')).toBeNull();
  });
});

describe('one-sided network match (known on one exchange only)', () => {
  it('returns the BUY side networks when sell has no data', () => {
    const net = matchNetworks({ from: [erc20, bep20], to: [] });
    expect(net.oneSided).toBe('buy');
    expect(net.status).not.toBe('ok');
    expect(net.recommended?.id).toBe('BEP20'); // cheapest fee wins
    // sell-side deposit status is unknown; buy-side withdrawal stays real
    expect(net.matched[0].depositEnabled).toBe('unknown');
    expect(net.matched.every((n) => n.withdrawalEnabled === 'open')).toBe(true);
  });

  it('returns the SELL side networks when buy has no data', () => {
    const net = matchNetworks({ from: [], to: [trc20] });
    expect(net.oneSided).toBe('sell');
    expect(net.recommended?.id).toBe('TRC20');
    expect(net.matched[0].withdrawalEnabled).toBe('unknown');
    expect(net.matched[0].depositEnabled).toBe('open');
  });

  it('returns plain UNKNOWN when neither side has data', () => {
    const net = matchNetworks({ from: [], to: [] });
    expect(net.oneSided).toBeUndefined();
    expect(net.matched).toHaveLength(0);
    expect(net.recommended).toBeUndefined();
  });

  it('a one-sided match can never be fully verified (never READY)', () => {
    const openNet: NetworkDescriptor = { ...erc20, depositEnabled: 'open', withdrawalEnabled: 'open' };
    const net = matchNetworks({ from: [openNet], to: [] });
    expect(net.status).toBe('unknown');
  });

  it('keeps real chain + fee on the known side so the route is priced', () => {
    const net = matchNetworks({ from: [erc20], to: [], price: 2 });
    expect(net.matched[0].chain).toBe('Ethereum');
    expect(net.matched[0].withdrawalFee).toBe('6');
  });
});

describe('network matching', () => {
  it('picks the cheapest compatible network (TRC20)', () => {
    const res = matchNetworks({ from: [trc20, erc20, bep20], to: [trc20, erc20], price: 1 });
    expect(res.status).toBe('ok');
    expect(res.recommended?.id).toBe('TRC20');
    expect(res.matched.map((n) => n.id)).toEqual(['TRC20', 'ERC20']);
  });

  it('ignores networks only supported on one side', () => {
    const res = matchNetworks({ from: [trc20, bep20], to: [erc20] });
    expect(res.status).toBe('no-common');
    expect(res.matched).toHaveLength(0);
  });

  it('disabled withdrawal blocks the transfer', () => {
    const closed = { ...trc20, withdrawalEnabled: 'closed' as const };
    // only the closed TRC20 route exists on the from side
    const res = matchNetworks({ from: [closed], to: [trc20] });
    expect(res.status).toBe('blocked');
  });

  it('disabled deposit blocks the transfer', () => {
    const closed = { ...trc20, depositEnabled: 'closed' as const };
    const res = matchNetworks({ from: [trc20], to: [closed, erc20] });
    expect(res.status).toBe('blocked');
  });

  it('unknown network info lowers status to unknown', () => {
    const res = matchNetworks({ from: [], to: [erc20] });
    expect(res.status).toBe('unknown');
  });

  it('networkMatches detects overlap', () => {
    expect(networkMatches([trc20], [trc20, erc20])).toBe(true);
    expect(networkMatches([bep20], [trc20, erc20])).toBe(false);
  });

  it('cheapest valid route is selected when fees differ per network', () => {
    const res = matchNetworks({ from: [trc20, erc20, bep20], to: [trc20, bep20, erc20], price: 1 });
    expect(res.status).toBe('ok');
    expect(res.recommended?.id).toBe('BEP20');
    expect(res.matched[0].id).toBe('BEP20');
    expect(res.matched.map((m) => m.id)).toEqual(['BEP20', 'TRC20', 'ERC20']);
  });

  it('a network without a set fee ranks below priced compatible networks', () => {
    const noFee: NetworkDescriptor = { ...trc20, withdrawalFee: undefined };
    const res = matchNetworks({ from: [noFee, erc20], to: [trc20, erc20], price: 1 });
    expect(res.recommended?.id).toBe('ERC20');
  });

  it('all fee-less networks still report a match so the fee stays unique', () => {
    const noFeeTrc: NetworkDescriptor = { ...trc20, withdrawalFee: undefined };
    const res = matchNetworks({ from: [noFeeTrc], to: [noFeeTrc], price: 1 });
    expect(res.status).toBe('ok');
    expect(res.matched).toHaveLength(1);
  });

  it('keeps a route with unknown deposit status but lowers status to unknown', () => {
    const unknownDeposit: NetworkDescriptor = { ...trc20, depositEnabled: 'unknown' as const };
    const res = matchNetworks({ from: [trc20, erc20], to: [unknownDeposit, erc20], price: 1 });
    // ERC20 is fully open and verified; TRC20 has unknown deposit.
    expect(res.status).toBe('ok');
    expect(res.recommended?.id).toBe('ERC20');
    expect(res.matched.map((n) => n.id)).toEqual(['ERC20', 'TRC20']);
  });

  it('only unknown-status routes produce status unknown but still surface the route and fee', () => {
    const unknownDeposit: NetworkDescriptor = { ...trc20, depositEnabled: 'unknown' as const };
    const res = matchNetworks({ from: [trc20], to: [unknownDeposit], price: 1 });
    expect(res.status).toBe('unknown');
    expect(res.recommended?.id).toBe('TRC20');
    expect(res.recommended?.withdrawalFee).toBe('1');
    expect(res.matched).toHaveLength(1);
  });
});
