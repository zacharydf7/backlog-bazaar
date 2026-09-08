import {describe,expect,it} from 'vitest';
import {cosmeticOwnershipLabel} from './cosmeticOwnership';
describe('cosmetic acquisition labels',()=>{
  it('distinguishes grants from purchases without treating off-sale items as lost',()=>{
    expect(cosmeticOwnershipLabel('event',false)).toBe('Earned · event · off sale');
    expect(cosmeticOwnershipLabel('achievement',true)).toBe('Earned · achievement');
    expect(cosmeticOwnershipLabel('purchase',true)).toBe('Purchased');
    expect(cosmeticOwnershipLabel(undefined,true)).toBe('Owned');
  });
});
