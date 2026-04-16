/**
 * Database Initialization Script
 *
 * Creates the default admin account and seeds sample data
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');

const db = require('../database');

async function initialize() {
    console.log('Initializing MalkaVRS Database...\n');

    try {
        // Initialize database tables
        await db.initialize();
        console.log('Database tables created\n');

        const pool = db.pool();
        const runQuery = (sql, params = []) => pool.query(sql, params);

        // Create optional admin account from environment
        const seedAdminUsername = process.env.VRS_DEFAULT_ADMIN_USERNAME;
        const seedAdminPassword = process.env.VRS_DEFAULT_ADMIN_PASSWORD;
        const existingAdmin = seedAdminUsername ? await db.getAdminByUsername(seedAdminUsername) : null;

        if (seedAdminUsername && seedAdminPassword && !existingAdmin) {
            const { v4: uuidv4 } = require('uuid');
            const adminId = uuidv4();
            const passwordHash = await bcrypt.hash(seedAdminPassword, 10);

            await runQuery(
                'INSERT INTO admins (id, username, password_hash, name) VALUES ($1, $2, $3, $4)',
                [adminId, seedAdminUsername, passwordHash, 'System Administrator']
            );

            console.log('Admin account created from environment configuration.\n');
        } else if (!seedAdminUsername || !seedAdminPassword) {
            console.log('No default admin seeded. Set VRS_DEFAULT_ADMIN_USERNAME and VRS_DEFAULT_ADMIN_PASSWORD to create one.\n');
        } else {
            console.log('Admin account already exists\n');
        }

        if (process.env.SEED_SAMPLE_VRS_DATA !== 'true') {
            console.log('Sample interpreters/clients not seeded. Set SEED_SAMPLE_VRS_DATA=true to enable sample data.\n');
            process.exit(0);
        }

        // Seed sample interpreters
        const interpreters = [
            { name: 'Sarah Johnson', email: 'sarah.j@example.com', languages: ['ASL', 'LSQ'] },
            { name: 'Michael Chen', email: 'mchen@example.com', languages: ['ASL'] },
            { name: 'Aisha Rahman', email: 'arahman@example.com', languages: ['ASL', 'BSL'] },
            { name: 'David Wilson', email: 'dwilson@example.com', languages: ['ASL'] },
            { name: 'Emma Garcia', email: 'egarcia@example.com', languages: ['ASL', 'LSQ'] },
            { name: 'James Brown', email: 'jbrown@example.com', languages: ['ASL'] },
            { name: 'Lisa Anderson', email: 'landerson@example.com', languages: ['ASL', 'BSL'] },
            { name: 'Robert Kim', email: 'rkim@example.com', languages: ['ASL'] }
        ];

        const { v4: uuidv4 } = require('uuid');

        for (const interp of interpreters) {
            // Check if already exists
            const existing = await runQuery(
                'SELECT id FROM interpreters WHERE email = $1',
                [interp.email]
            );

            if (existing.rows.length === 0) {
                const interpId = uuidv4();
                const passwordHash = await bcrypt.hash('interpreter123', 10);

                await runQuery(
                    'INSERT INTO interpreters (id, name, email, password_hash, languages) VALUES ($1, $2, $3, $4, $5)',
                    [interpId, interp.name, interp.email, passwordHash, JSON.stringify(interp.languages)]
                );

                console.log(`Created interpreter: ${interp.name}`);
            }
        }

        console.log('');

        // Seed sample clients
        const clients = [
            { name: 'John Doe', email: 'john.doe@gmail.com', organization: 'ABC Corp' },
            { name: 'Jane Smith', email: 'jane.smith@yahoo.com', organization: 'Personal' },
            { name: 'Robert Johnson', email: 'rjohnson@company.com', organization: 'XYZ Inc' },
            { name: 'Mary Williams', email: 'mwilliams@hospital.org', organization: 'City Hospital' },
            { name: 'Ahmed Hassan', email: 'ahmed.h@example.com', organization: 'Personal' }
        ];

        for (const client of clients) {
            const existing = await runQuery(
                'SELECT id FROM clients WHERE email = $1',
                [client.email]
            );

            if (existing.rows.length === 0) {
                const clientId = uuidv4();

                await runQuery(
                    'INSERT INTO clients (id, name, email, organization) VALUES ($1, $2, $3, $4)',
                    [clientId, client.name, client.email, client.organization]
                );

                console.log(`Created client: ${client.name}`);
            }
        }

        console.log('\nDatabase initialization complete!\n');
        console.log('You can now start the server with: npm start');

        process.exit(0);

    } catch (error) {
        console.error('Initialization failed:', error);
        process.exit(1);
    }
}

initialize();
