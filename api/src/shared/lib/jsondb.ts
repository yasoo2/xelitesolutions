import fs from 'fs';
import path from 'path';

export class JsonStore<T extends { id?: string; _id?: any }> {
    private filePath: string;

    constructor(collectionName: string) {
        const dataDir = path.join(process.cwd(), 'data', 'db');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        this.filePath = path.join(dataDir, `${collectionName}.json`);
        if (!fs.existsSync(this.filePath)) {
            fs.writeFileSync(this.filePath, JSON.stringify([]));
        }
    }

    private async read(): Promise<T[]> {
        const data = await fs.promises.readFile(this.filePath, 'utf-8');
        const items = JSON.parse(data);
        return items.map((item: any) => {
            if (item.id && !item._id) item._id = item.id;
            if (item._id && !item.id) item.id = item._id;
            return item;
        });
    }

    private async write(items: T[]): Promise<void> {
        await fs.promises.writeFile(this.filePath, JSON.stringify(items, null, 2));
    }

    async find(query: any = {}): Promise<T[]> {
        const items = await this.read();
        return items.filter(item => {
            const match = (q: any, data: any): boolean => {
                for (const key in q) {
                    const condition = q[key];
                    if (key === '$or' && Array.isArray(condition)) {
                        if (!condition.some(subQuery => match(subQuery, data))) return false;
                        continue;
                    }
                    if (key === '$and' && Array.isArray(condition)) {
                        if (!condition.every(subQuery => match(subQuery, data))) return false;
                        continue;
                    }

                    const value = data[key];
                    if (condition && typeof condition === 'object' && condition.$regex) {
                        try {
                            const regex = condition.$regex instanceof RegExp 
                                ? condition.$regex 
                                : new RegExp(condition.$regex, condition.$options || 'i');
                            if (!regex.test(String(value || ''))) return false;
                        } catch (e) {
                            console.error('JsonStore Regex Error', e);
                            return false;
                        }
                    } else if (condition !== data[key]) {
                        return false;
                    }
                }
                return true;
            };
            return match(query, item);
        });
    }

    async findOne(query: any): Promise<T | null> {
        const items = await this.find(query);
        return items.length > 0 ? items[0] : null;
    }

    async create(item: T): Promise<T> {
        const items = await this.read();
        const newItem = { ...item, id: item.id || Math.random().toString(36).substr(2, 9) };
        items.push(newItem);
        await this.write(items);
        return newItem;
    }

    async updateOne(query: Partial<T>, update: Partial<T>): Promise<void> {
        const items = await this.read();
        const index = items.findIndex(item => {
            for (const key in query) {
                if (item[key] !== query[key]) return false;
            }
            return true;
        });
        if (index !== -1) {
            items[index] = { ...items[index], ...update };
            await this.write(items);
        }
    }

    async deleteOne(query: Partial<T>): Promise<void> {
        const items = await this.read();
        const index = items.findIndex(item => {
            for (const key in query) {
                if (item[key] !== query[key]) return false;
            }
            return true;
        });
        if (index !== -1) {
            items.splice(index, 1);
            await this.write(items);
        }
    }
}
