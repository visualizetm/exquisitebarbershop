import { describe, expect, it } from 'vitest';
import { DEMO_PIN, pinProblem } from '../../shared/lib/pin';

describe('the PIN policy', () => {
  it('rejects the obvious ones', () => {
    for (const pin of ['000000', '111111', '999999', '123456', '654321']) {
      expect(pinProblem(pin), pin).not.toBeNull();
    }
  });

  it('rejects any straight run, up or down, wrapping past 9', () => {
    for (const pin of [
      '234567',
      '345678',
      '456789',
      '567890',
      '012345',
      '987654',
      '876543',
      '109876',
    ]) {
      expect(pinProblem(pin), pin).not.toBeNull();
    }
  });

  it('rejects a short block repeated', () => {
    for (const pin of ['121212', '123123', '454545', '909090']) {
      expect(pinProblem(pin), pin).not.toBeNull();
    }
  });

  it('accepts a PIN that is not a pattern, including the demo PIN', () => {
    for (const pin of ['482915', '135792', '290417', DEMO_PIN]) {
      expect(pinProblem(pin), pin).toBeNull();
    }
  });

  it('wants exactly six digits', () => {
    for (const pin of ['', '12345', '1234567', 'abcdef', '12 456', '１２３４５６']) {
      expect(pinProblem(pin), pin).toMatch(/exactly 6 digits/);
    }
  });
});
