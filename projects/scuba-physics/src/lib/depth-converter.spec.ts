import { DepthConverter } from './depth-converter';

describe('Depth Converter', () => {
  describe('Fress water', () => {
    it('22m converts to 3.157 bar', () => {
      const result = DepthConverter.toBar(22, true);
      expect(result).toBeCloseTo(3.157, 3);
    });

    it('3.2 converts to 22.43 m', () => {
      const result = DepthConverter.fromBar(3.2, true);
      expect(result).toBeCloseTo(22.43, 2);
    });
  });
});
