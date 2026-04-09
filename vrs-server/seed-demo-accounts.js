/**
 * Seed Demo Accounts
 *
 * Creates demo client and interpreter accounts for development/testing.
 * Idempotent: skips accounts that already exist (matched by email).
 *
 * Can be run standalone:  node seed-demo-accounts.js
 * Also called automatically on server startup via seedDemoAccounts().
 */

const bcrypt = require('bcryptjs');
const db = require('./database');

const BCRYPT_ROUNDS = 10;

const DEMO_CLIENTS = [
    {
        name: 'Nataly Malka',
        email: 'nataly.malka@gmail.com',
        password: 'demo123',
        organization: 'Personal',
        phone: '+1-855-652-0100'
    },
    {
        name: 'Devin Currie',
        email: 'devin.currie@gmail.com',
        password: 'demo123',
        organization: 'Personal',
        phone: '+1-855-652-0200'
    }
];

const DEMO_INTERPRETERS = [
    {
        name: 'Interpreter One',
        email: 'interpreter1@malka-vrs.com',
        password: 'interp123',
        languages: ['ASL', 'English']
    },
    {
        name: 'Interpreter Two',
        email: 'interpreter2@malka-vrs.com',
        password: 'interp123',
        languages: ['ASL', 'English', 'Spanish']
    }
];

/**
 * Seed all demo accounts. Safe to call repeatedly -- existing accounts are skipped.
 * Expects db.initialize() to have been called already.
 */
async function seedDemoAccounts() {
    console.log('[Seed] Seeding demo accounts...');

    // --- Clients ---
    for (const clientData of DEMO_CLIENTS) {
        const existing = await db.getClientByEmail(clientData.email);
        if (existing) {
            console.log(`[Seed] Client already exists: ${clientData.email} -- skipped`);
            continue;
        }

        const hashedPw = await bcrypt.hash(clientData.password, BCRYPT_ROUNDS);
        const client = await db.createClient({
            name: clientData.name,
            email: clientData.email,
            passwordHash: hashedPw,
            organization: clientData.organization
        });

        await db.assignClientPhoneNumber({
            clientId: client.id,
            phoneNumber: clientData.phone,
            isPrimary: true
        });

        console.log(`[Seed] Created client: ${clientData.name} (${clientData.email}), phone: ${clientData.phone}`);
    }

    // --- Interpreters ---
    const allInterpreters = await db.getAllInterpreters();

    for (const interpData of DEMO_INTERPRETERS) {
        const existing = allInterpreters.find(i => i.email === interpData.email);
        if (existing) {
            console.log(`[Seed] Interpreter already exists: ${interpData.email} -- skipped`);
            continue;
        }

        const hashedPw = await bcrypt.hash(interpData.password, BCRYPT_ROUNDS);
        const interpreter = await db.createInterpreter({
            name: interpData.name,
            email: interpData.email,
            password: hashedPw,
            languages: interpData.languages
        });

        // active defaults to 1 in the schema, but set it explicitly to be safe
        await db.updateInterpreter(interpreter.id, { active: true });

        console.log(`[Seed] Created interpreter: ${interpData.name} (${interpData.email}), languages: ${interpData.languages.join(', ')}`);
    }

    console.log('[Seed] Demo account seeding complete.');
}

module.exports = { seedDemoAccounts };

// Allow standalone execution: node seed-demo-accounts.js
if (require.main === module) {
    db.initialize()
        .then(() => seedDemoAccounts())
        .then(() => {
            console.log('[Seed] Done.');
            process.exit(0);
        })
        .catch(err => {
            console.error('[Seed] Fatal error:', err);
            process.exit(1);
        });
}
