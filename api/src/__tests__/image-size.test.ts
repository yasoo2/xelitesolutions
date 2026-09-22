import { imageSize } from '../shared/image-size';

describe('intrinsic frame dimensions', () => {
    it.each([0xc0, 0xc2])('reads a JPEG frame marker %i after metadata', marker => {
        const bytes = Buffer.from([
            0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0,
            0xff, marker, 0, 11, 8, 3, 132, 1, 134, 1, 1, 0, 0,
        ]);
        expect(imageSize(bytes)).toEqual({ width: 390, height: 900 });
    });
    it('preserves PNG and GIF dimensions', () => {
        const png = Buffer.alloc(25);
        png.writeUInt32BE(0x89504e47, 0);
        png.writeUInt32BE(820, 16);
        png.writeUInt32BE(900, 20);
        expect(imageSize(png)).toEqual({ width: 820, height: 900 });
        const gif = Buffer.alloc(11);
        gif.write('GIF89a');
        gif.writeUInt16LE(390, 6);
        gif.writeUInt16LE(844, 8);
        expect(imageSize(gif)).toEqual({ width: 390, height: 844 });
    });
    it('does not invent dimensions for missing or truncated frames', () => {
        for (const bytes of [Buffer.alloc(0), Buffer.from([0xff, 0xd8, 0xff, 0xc0]), Buffer.from('not an image')]) {
            expect(imageSize(bytes)).toBeNull();
        }
    });
});
