
import jwt from 'jsonwebtoken';
import { config } from 'dotenv';
import path from 'path';

// Load env from one level up (since scripts is in src/scripts)
config({ path: path.join(__dirname, '../../.env') });

const secret = process.env.JWT_SECRET || 'prod_secret_73821038_secure_key';

const user = {
    sub: '1234567890',
    role: 'USER',
    email: 'testverified@example.com',
    name: 'Verified User',
    picture: 'https://ui-avatars.com/api/?name=Verified+User&background=random'
};

const token = jwt.sign(user, secret, { expiresIn: '1h' });
console.log('TOKEN_START');
console.log(token);
console.log('TOKEN_END');
