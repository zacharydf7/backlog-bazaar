import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./lib/supabase', async original => ({...await original<typeof import('./lib/supabase')>(), supabase: {rpc: mocks.rpc}}));
import {useStore} from './store';
beforeEach(() => {vi.clearAllMocks(); useStore.setState({userId:'buyer',cloud:true,coins:500,shopOwnedIds:[],shopItems:[],error:null});});
describe('cosmetic checkout', () => {
  it('uses the confirmed price and server balance', async () => {
    mocks.rpc.mockResolvedValue({data:400,error:null});
    expect(await useStore.getState().buyShopItem('item',100)).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('buy_shop_item_at_price',{p_item:'item',p_expected_price:100});
    expect(useStore.getState().coins).toBe(400);
    expect(useStore.getState().shopOwnedIds).toEqual(['item']);
  });
  it('leaves coins and holdings untouched on price conflict', async () => {
    mocks.rpc.mockResolvedValue({data:null,error:{message:'PRICE_CHANGED'}});
    expect(await useStore.getState().buyShopItem('item',100)).toBe(false);
    expect(useStore.getState().coins).toBe(500);
    expect(useStore.getState().shopOwnedIds).toEqual([]);
  });
  it('does not apply a purchase response to another account', async () => {
    mocks.rpc.mockImplementation(async () => {useStore.setState({userId:'other',coins:900});return {data:400,error:null};});
    expect(await useStore.getState().buyShopItem('item',100)).toBe(false);
    expect(useStore.getState().coins).toBe(900);
    expect(useStore.getState().shopOwnedIds).toEqual([]);
  });
});
