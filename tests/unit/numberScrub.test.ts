import {expect,it} from 'vitest';
import {scrubNumber} from '../../src/lib/numberScrub';
it('keeps short drags precise and speeds up long drags symmetrically',()=>{expect(scrubNumber(1,7,.1)).toBe(1);expect(scrubNumber(1,40,.1)).toBe(1.5);expect(scrubNumber(1,120,.1)).toBe(4.6);expect(scrubNumber(1,-120,.1)).toBe(-2.6);});
it('clamps endpoints and rejects invalid scheduling values',()=>{expect(scrubNumber(1,200,.1,0,2)).toBe(2);expect(scrubNumber(1,-200,.1,0,2)).toBe(0);expect(scrubNumber(1,100,NaN)).toBe(1);});
it('keeps decimal touch values free from floating point noise',()=>{expect(scrubNumber(.1,40,.01)).toBe(.15);});
