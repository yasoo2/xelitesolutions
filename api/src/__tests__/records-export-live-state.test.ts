import { fileAppStoreJs, fileRecordsAppJsx } from '../modules/tools/definitions/react-app-templates';

type Row = { qelvani: string; zqvorn: string };

function generatedToCsv(): (fields: any[], rows: Row[]) => string {
    const source = fileAppStoreJs().replace(/\bexport\s+(?=(?:async\s+)?function|const)/g, '');
    return new Function(`${source}; return toCsv;`)();
}

describe('records export reads the visible rows at click time', () => {
    test('the generated UI guards export with the same visible rows it exports', () => {
        const jsx = fileRecordsAppJsx(false);
        expect(jsx).toContain('disabled={!visible.length}');
        expect(jsx).toContain("toCsv(fields.filter(f => f.type !== 'image'), visible)");
        expect(jsx).not.toContain('disabled={!rows.length}');
    });

    test('two consecutive exports preserve state updates and omit a hidden row', () => {
        const toCsv = generatedToCsv();
        const fields = [
            { key: 'qelvani', label: 'Qelvani item' },
            { key: 'zqvorn', label: 'Zqvorn state' },
        ];
        const firstRow = { qelvani: 'first invented item', zqvorn: 'draft' };
        const secondRow = { qelvani: 'second invented item', zqvorn: 'done' };
        let visible: Row[] = [firstRow];

        const firstExport = toCsv(fields, visible);
        visible = [secondRow, firstRow];
        const secondExport = toCsv(fields, visible);

        expect(firstExport.split('\n')).toHaveLength(2);
        expect(secondExport.split('\n')).toHaveLength(3);
        expect(secondExport).toContain('first invented item');
        expect(secondExport).toContain('second invented item');

        visible = [firstRow];
        const filteredExport = toCsv(fields, visible);
        expect(filteredExport).toContain('first invented item');
        expect(filteredExport).not.toContain('second invented item');
    });
});
