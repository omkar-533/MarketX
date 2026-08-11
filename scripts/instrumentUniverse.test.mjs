/**
 * Unit tests — instrument universe classification (no network).
 */
import assert from 'node:assert/strict';
import { rebuildInstrumentUniverses, resolveUniverseSymbols } from '../server/marketData/instrumentUniverse.mjs';

function testFnoUnderlyingsDedupedNotContracts() {
  const stats = rebuildInstrumentUniverses({
    equity: [
      { EXCH: 'NSE', SERIES: 'EQ', SYMBOL_NAME: 'RELIANCE', SECURITY_ID: '2885' },
      { EXCH: 'NSE', SERIES: 'EQ', SYMBOL_NAME: 'INFY', SECURITY_ID: '1594' },
      { EXCH: 'BSE', SERIES: 'A', SYMBOL_NAME: 'RELIANCE', SECURITY_ID: '500325' },
    ],
    index: [{ EXCH: 'NSE', SYMBOL_NAME: 'NIFTY', SECURITY_ID: '26000' }],
    fno: [
      {
        EXCH: 'NSE',
        INSTRUMENT_NAME: 'FUTSTK',
        SYMBOL_NAME: 'RELIANCE',
        TRADING_SYMBOL: 'RELIANCE25APRFUT',
        SECURITY_ID: '1',
      },
      {
        EXCH: 'NSE',
        INSTRUMENT_NAME: 'OPTSTK',
        SYMBOL_NAME: 'RELIANCE',
        TRADING_SYMBOL: 'RELIANCE25APR2500CE',
        SECURITY_ID: '2',
      },
      {
        EXCH: 'NSE',
        INSTRUMENT_NAME: 'FUTSTK',
        SYMBOL_NAME: 'INFY',
        TRADING_SYMBOL: 'INFY25APRFUT',
        SECURITY_ID: '3',
      },
      {
        EXCH: 'NSE',
        INSTRUMENT_NAME: 'FUTIDX',
        SYMBOL_NAME: 'NIFTY',
        TRADING_SYMBOL: 'NIFTY25APRFUT',
        SECURITY_ID: '4',
      },
    ],
  });

  assert.equal(stats.nseEquity, 2);
  assert.equal(stats.bseEquity, 1);
  assert.equal(stats.fnoUnderlyings, 2, 'RELIANCE counted once despite FUT+OPT');
  assert.ok(stats.indices >= 1);

  const fno = resolveUniverseSymbols('F&O');
  assert.deepEqual(fno, ['INFY', 'RELIANCE']);
  const nse = resolveUniverseSymbols('NSE');
  assert.ok(nse.includes('RELIANCE') && nse.includes('INFY'));
}

testFnoUnderlyingsDedupedNotContracts();
console.log('instrumentUniverse.test.mjs OK');
