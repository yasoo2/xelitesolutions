import { verifiedRepairServeUrl } from '../modules/tools/definitions/ProjectRepairTool';

describe('project repair live URL recovery', () => {
    test('drops a stale live URL so audit can use a verified preview', async () => {
        const answers = jest.fn(async () => false);
        await expect(verifiedRepairServeUrl('http://127.0.0.1:4306/', answers)).resolves.toBe('');
        expect(answers).toHaveBeenCalledWith('http://127.0.0.1:4306/');
    });

    test('keeps a URL only after it answers successfully', async () => {
        await expect(verifiedRepairServeUrl(' http://127.0.0.1:4306/ ', async () => true))
            .resolves.toBe('http://127.0.0.1:4306/');
    });
});
