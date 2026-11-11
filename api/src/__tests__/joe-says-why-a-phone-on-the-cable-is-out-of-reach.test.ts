/**
 * A PHONE ON THE CABLE THAT JOE CANNOT REACH, AND WHY.
 *
 * The owner, 2026-11-08: his Samsung Galaxy Z Fold 6 on the cable, and Joe
 * said «no phone». Windows saw it, with its debugging part «SAMSUNG_Android»
 * in Error: no driver. «Why doesn't Joe work with every phone?»
 *
 * Pinned on the laptop's own Get-PnpDevice lines of that moment: the phone is
 * found by its name, its maker and why it is out of reach; the answer leads
 * with the way that works for every Android 11+ phone (Wireless debugging,
 * six digits) and offers the driver only with his yes; a reachable phone, a
 * phone with debugging off, and the laptop's own camera and card reader are
 * told apart.
 */
import { describeUnreachablePhones, parseUsbPhones, usbDevicesScript } from '../core/devices/phone-usb';

const FOLD = [
    "USB\tOK\tWPD\tyounes's Z Fold 6\tUSB\\VID_04E8&PID_6860&MI_00\\6&396274C5&0&0000",
    'USB\tOK\tUSB\tUSB Composite Device\tUSB\\VID_2A94&PID_464D\\5&1AA452E9&0&10',
    'USB\tOK\tUSB\tUSB Composite Device\tUSB\\VID_04F2&PID_B604\\0001',
    'USB\tOK\tPorts\tUSB Serial Device (COM4)\tUSB\\VID_04E8&PID_6860&MI_01\\6&396274C5&0&0001',
    'USB\tOK\tCamera\tIntegrated Camera\tUSB\\VID_04F2&PID_B604&MI_00\\6&31E07F50&0&0000',
    'USB\tOK\tUSB\tRealtek USB 3.0 Card Reader\tUSB\\VID_0BDA&PID_0316\\20120501030900000',
    'USB\tOK\tUSB\tUSB Composite Device\tUSB\\VID_04E8&PID_6860\\R3CR80KHC3Z',
    'USB\tError\t\tSAMSUNG_Android\tUSB\\VID_04E8&PID_6860&MI_03\\6&396274C5&0&0003',
].join('\r\n');

describe('the phones on the cable, as Windows sees them', () => {
    test('the Fold is found by its name and maker, with its debugging part lacking a driver; the camera and card reader are not phones', () => {
        expect(parseUsbPhones(FOLD)).toEqual([{ name: "younes's Z Fold 6", maker: 'Samsung', vid: '04E8', state: 'no_driver' }]);
    });

    test('a phone whose debugging part has its driver is reachable; one with only its files has debugging off', () => {
        const reachable = 'USB\tOK\tAndroidUsbDeviceClass\tAndroid Composite ADB Interface\tUSB\\VID_0E8D&PID_201C&MI_01\\7&1&0&0001\nUSB\tOK\tWPD\tTECNO KI7\tUSB\\VID_0E8D&PID_201C&MI_00\\7&1&0&0000';
        expect(parseUsbPhones(reachable)).toEqual([{ name: 'TECNO KI7', maker: 'MediaTek-based (TECNO, Infinix, itel…)', vid: '0E8D', state: 'reachable' }]);
        const off = "USB\tOK\tWPD\tAhmad's Pixel 8\tUSB\\VID_18D1&PID_4EE1\\ABC123";
        expect(parseUsbPhones(off)).toEqual([{ name: "Ahmad's Pixel 8", maker: 'Google', vid: '18D1', state: 'debugging_off' }]);
        expect(describeUnreachablePhones(parseUsbPhones(reachable))).toBe('');
    });

    test('what Joe says leads with the way that needs nothing installed, and asks before any driver', () => {
        const text = describeUnreachablePhones(parseUsbPhones(FOLD));
        expect(text).toContain("«younes's Z Fold 6» (Samsung) is on the cable with USB debugging ON, but Windows has no driver");
        expect(text.indexOf('Wireless debugging')).toBeLessThan(text.indexOf('USB driver installed'));
        expect(text).toContain('every Android 11+ phone of every maker');
        expect(text).toContain('only with his clear yes');
    });

    test('the read changes nothing: it only lists present devices', () => {
        const script = usbDevicesScript();
        expect(script).toContain('Get-PnpDevice -PresentOnly');
        expect(script).not.toMatch(/Remove-|Disable-|Enable-|Set-|Install|pnputil/iu);
    });
});
