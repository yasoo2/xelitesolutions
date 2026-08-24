import fs from 'fs';
import path from 'path';

export class JsonStore<T extends { id?: string; _id?: any }> {
    private filePath: string;

    constructor(collectionName: string, directory?: string) {
        /**
         *  A STORE THAT CANNOT BE POINTED ELSEWHERE CANNOT BE TESTED
         *  WITHOUT WRITING ON THE MACHINE THAT RUNS THE TEST.
         *
         *  The guard written for this file put its rows in the REAL
         *  data/db, because that was the only place a store could live.
         *  It then raced the suites that read that directory, and the
         *  gate came back with two failures that had nothing to do with
         *  either change — including the new guard failing itself.
         *
         *  Same knob the chat and page stores already use, so a test can
         *  hand it a temporary directory and leave nothing behind.
         */
        //  AN ENVIRONMENT VARIABLE IS GLOBAL TO THE WORKER, NOT TO THE FILE.
        //
        //  The first version of this took the directory from an env var so a
        //  test could point it at a temporary folder. Jest gives each test
        //  FILE its own module registry and the same worker PROCESS, so that
        //  variable leaked into every other suite sharing the worker — and
        //  the guard that set it took write-tools-contract down with it in
        //  the full gate while passing perfectly on its own.
        //
        //  A parameter cannot leak. It travels with the store that was asked
        //  for, and every other store keeps the real directory.
        const dataDir = String(directory || '').trim() || path.join(process.cwd(), 'data', 'db');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        this.filePath = path.join(dataDir, `${collectionName}.json`);
        if (!fs.existsSync(this.filePath)) {
            fs.writeFileSync(this.filePath, JSON.stringify([]));
        }
    }

    /**
     *  A FILE THAT CANNOT BE PARSED MUST NOT TAKE THE READER DOWN WITH IT.
     *
     *  Found on his machine, not imagined:
     *
     *      node -e JSON.parse(readFileSync('run-evidence.json'))
     *      → Unexpected non-whitespace character after JSON at position 769746
     *
     *  A complete document, and then a second copy of its own tail after
     *  the closing bracket. Every read of that store threw, so every
     *  question asked of it — including «what did this session do» —
     *  answered with an exception instead of an answer.
     *
     *  The bad file is moved aside rather than deleted: it is the only
     *  evidence of how it got that way, and an empty store is recoverable
     *  while a destroyed one is not.
     */
    private async read(): Promise<T[]> {
        const data = await fs.promises.readFile(this.filePath, 'utf-8');
        let items: any;
        try {
            items = JSON.parse(data);
        } catch (e: any) {
            const aside = this.filePath + '.corrupt-' + Date.now();
            //  Both steps SYNCHRONOUS on purpose. An async recovery write is
            //  not in the write queue below, so it can land after a create
            //  that followed it and erase the row that was just added — the
            //  guard for this file caught exactly that on its first run.
            try { fs.renameSync(this.filePath, aside); } catch { /* keep going regardless */ }
            try { fs.writeFileSync(this.filePath, JSON.stringify([])); } catch { /* next write will retry */ }
            console.warn('[JsonStore] ' + this.filePath + ' was unparseable (' + String(e?.message || e).slice(0, 80) + '); moved to ' + aside);
            return [];
        }
        if (!Array.isArray(items)) return [];
        return items.map((item: any) => {
            if (item.id && !item._id) item._id = item.id;
            if (item._id && !item.id) item.id = item._id;
            return item;
        });
    }

    /**
     *  A WRITE IN PLACE, WITH NO LOCK, CAN LEAVE TWO DOCUMENTS IN ONE FILE.
     *
     *  writeFile truncates and then streams. Two of them overlapping — and
     *  nothing here stopped them overlapping — leaves the shorter payload
     *  followed by whatever of the longer one landed after it. That is
     *  exactly the shape of the damage found on his disk: a valid document
     *  and then a fragment of another.
     *
     *  Two changes, and each alone would have prevented it: writes on one
     *  store are serialized, and each write lands in a temporary file that
     *  is RENAMED over the target. A rename is the closest a filesystem
     *  comes to all-or-nothing, so a reader sees the old file or the new
     *  one and never half of each.
     */
    private writeQueue: Promise<void> = Promise.resolve();
    private writeSeq = 0;

    private async write(items: T[]): Promise<void> {
        const run = async () => {
            //  Unique per write, not per process: two stores on one file, or
            //  a retry, would otherwise rename the same temporary twice.
            this.writeSeq += 1;
            const temp = this.filePath + '.tmp-' + process.pid + '-' + this.writeSeq;
            await fs.promises.writeFile(temp, JSON.stringify(items, null, 2));
            await fs.promises.rename(temp, this.filePath);
        };
        this.writeQueue = this.writeQueue.then(run, run);
        return this.writeQueue;
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
