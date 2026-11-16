import { describe, expect, it } from 'vitest';
import { codeFromPath, inviteLink, whatsappUrl } from '../inviteLink';

describe('invite link', () => {
  it('reads the code from a join link', () => {
    expect(codeFromPath('/travel.spd/join/ab12cd')).toBe('AB12CD');
    expect(codeFromPath('/join/AB12CD/')).toBe('AB12CD');
    expect(codeFromPath('/travel.spd/expenses')).toBeNull();
  });
  it('builds the link and the WhatsApp message', () => {
    expect(inviteLink('ab12cd')).toMatch(/\/join\/AB12CD$/);
    expect(whatsappUrl('Hi\nhttps://x/join/A')).toBe('https://wa.me/?text=Hi%0Ahttps%3A%2F%2Fx%2Fjoin%2FA');
  });
});
